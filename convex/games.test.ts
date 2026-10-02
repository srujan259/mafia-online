import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const secret = (n: number) => n.toString(16).padStart(64, "0");
async function admit(t: ReturnType<typeof convexTest>, n: number) {
  const code = n.toString(16).padStart(32, "0");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const invitationId = await t.mutation(internal.invitations.issue, { codeHash, label: `Guest ${n}` });
  await t.mutation(api.invitations.redeem, { secret: secret(n), code });
  return invitationId;
}
afterEach(() => vi.unstubAllEnvs());

describe("rooms and private game state", () => {
  it("admits one guest per invite and revocation immediately removes access", async () => {
    const t = convexTest(schema, modules);
    const invitationId = await admit(t, 1);
    expect(await t.query(api.invitations.status, { secret: secret(1) })).toBe(true);
    await expect(t.mutation(api.invitations.redeem, { secret: secret(2), code: "1".padStart(32, "0") })).rejects.toThrow(/already been used/i);
    const room = await t.mutation(api.games.create, { name: "Host", title: "Private room", secret: secret(1) });
    await expect(t.mutation(api.games.join, { name: "Uninvited", code: room.code, secret: secret(2) })).rejects.toThrow(/invitation/i);
    await t.mutation(internal.invitations.revoke, { invitationId });
    expect(await t.query(api.invitations.status, { secret: secret(1) })).toBe(false);
    await expect(t.query(api.games.state, { gameId: room.gameId, secret: secret(1) })).rejects.toThrow(/invitation/i);
  });
  it("keeps a reconnecting guest in the same seat and rejects another secret", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.games.create, { name: "Host", title: "Friday Mafia", secret: secret(1) })).rejects.toThrow(/invitation/i);
    await admit(t, 1);
    const room = await t.mutation(api.games.create, { name: "Host", title: "Friday Mafia", secret: secret(1) });
    const first = await t.query(api.games.state, { gameId: room.gameId, secret: secret(1) });
    const restored = await t.mutation(api.games.join, { name: "Host renamed", code: room.code, secret: secret(1) });
    const again = await t.query(api.games.state, { gameId: restored.gameId, secret: secret(1) });
    expect(again.me.id).toBe(first.me.id);
    expect(again.players).toHaveLength(1);
    await expect(t.query(api.games.state, { gameId: room.gameId, secret: secret(2) })).rejects.toThrow();
  });
  it("never includes another player's role or investigation in their private view", async () => {
    const t = convexTest(schema, modules);
    await admit(t, 1); await admit(t, 2);
    const room = await t.mutation(api.games.create, { name: "Host", title: "Friday Mafia", secret: secret(1) });
    await t.mutation(api.games.join, { name: "Friend", code: room.code, secret: secret(2) });
    const host = await t.query(api.games.state, { gameId: room.gameId, secret: secret(1) });
    const guest = await t.query(api.games.state, { gameId: room.gameId, secret: secret(2) });
    await t.run(async ctx => {
      await ctx.db.patch(host.me.id, { role: "detective" });
      await ctx.db.patch(guest.me.id, { role: "mafia" });
      await ctx.db.patch(room.gameId, { phase: "night", epoch: 1, round: 1, deadline: Date.now() + 50_000, mediaRoom: "private" });
      await ctx.db.insert("investigations", { gameId: room.gameId, playerId: host.me.id, targetId: guest.me.id, round: 1, isMafia: true });
    });
    const detective = await t.query(api.games.state, { gameId: room.gameId, secret: secret(1) });
    const mafia = await t.query(api.games.state, { gameId: room.gameId, secret: secret(2) });
    expect(detective.players.every(p => p.role === undefined)).toBe(true);
    expect(mafia.players.every(p => p.role === undefined)).toBe(true);
    expect(detective.investigations).toEqual([{ round: 1, targetId: guest.me.id, isMafia: true }]);
    expect(mafia.investigations).toEqual([]);
    expect(detective.mediaAllowed).toBe(false);
    expect(mafia.mediaAllowed).toBe(true);
  });
  it("rejects forged night choices and stale phase actions", async () => {
    const t = convexTest(schema, modules);
    await admit(t, 1); await admit(t, 2);
    const room = await t.mutation(api.games.create, { name: "Host", title: "Friday Mafia", secret: secret(1) });
    await t.mutation(api.games.join, { name: "Friend", code: room.code, secret: secret(2) });
    const host = await t.query(api.games.state, { gameId: room.gameId, secret: secret(1) });
    const guest = await t.query(api.games.state, { gameId: room.gameId, secret: secret(2) });
    await t.run(async ctx => {
      await ctx.db.patch(host.me.id, { role: "villager" });
      await ctx.db.patch(guest.me.id, { role: "mafia" });
      await ctx.db.patch(room.gameId, { phase: "night", epoch: 2, round: 1, deadline: Date.now() + 50_000 });
    });
    await expect(t.mutation(api.games.choose, { gameId: room.gameId, secret: secret(1), epoch: 2, targetId: guest.me.id, skip: false })).rejects.toThrow();
    await expect(t.mutation(api.games.choose, { gameId: room.gameId, secret: secret(2), epoch: 1, targetId: host.me.id, skip: false })).rejects.toThrow();
    await t.mutation(api.games.choose, { gameId: room.gameId, secret: secret(2), epoch: 2, targetId: host.me.id, skip: false });
    const saved = await t.query(api.games.state, { gameId: room.gameId, secret: secret(2) });
    expect(saved.myChoice?.targetId).toBe(host.me.id);
  });
  it("runs each narrated night turn, blocks out-of-turn actions, and reaches victory", async () => {
    vi.stubEnv("ALLOW_NO_MEDIA", "true");
    const t = convexTest(schema, modules);
    for (let i = 1; i <= 6; i++) await admit(t, i);
    const seats: { gameId: Awaited<ReturnType<typeof t.mutation<typeof api.games.create>>>["gameId"]; secret: string }[] = [];
    const room = await t.mutation(api.games.create, { name: "Player 1", title: "Full game", secret: secret(1) });
    seats.push({ gameId: room.gameId, secret: secret(1) });
    for (let i = 2; i <= 6; i++) {
      await t.mutation(api.games.join, { name: `Player ${i}`, code: room.code, secret: secret(i) });
      seats.push({ gameId: room.gameId, secret: secret(i) });
    }
    for (const s of seats) await t.mutation(api.games.ready, { ...s, ready: true });
    await t.mutation(api.games.start, seats[0]);
    let state = await t.query(api.games.state, seats[0]);
    expect(state.game.phase).toBe("transition");
    await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    expect(state.game.phase).toBe("reveal");
    await t.run(async ctx => { await ctx.db.patch(room.gameId, { deadline: Date.now() - 1 }); });
    await t.mutation(internal.games.advance, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    expect(state.game.phase).toBe("night");
    expect(state.game.nightStage).toBe("mafia");
    const roles = await t.run(ctx => ctx.db.query("players").withIndex("by_game", q => q.eq("gameId", room.gameId)).collect());
    const mafia = roles.find(p => p.role === "mafia")!;
    const detective = roles.find(p => p.role === "detective")!;
    const doctor = roles.find(p => p.role === "doctor")!;
    const victim = roles.find(p => p.role === "villager")!;
    const views = await Promise.all(seats.map(s => t.query(api.games.state, s)));
    const seatFor = (id: typeof mafia._id) => seats[views.findIndex(v => v.me.id === id)];
    expect(await t.query(internal.games.mediaGrant, seatFor(mafia._id))).toMatchObject({ publish: true });
    expect(await t.query(internal.games.mediaGrant, seatFor(detective._id))).toBeNull();
    await t.mutation(api.games.choose, { ...seatFor(mafia._id), epoch: state.game.epoch, targetId: victim._id, skip: false });
    await expect(t.mutation(api.games.choose, { ...seatFor(doctor._id), epoch: state.game.epoch, targetId: victim._id, skip: false })).rejects.toThrow();
    for (const stage of ["detective", "doctor"] as const) {
      await t.run(async ctx => { await ctx.db.patch(room.gameId, { deadline: Date.now() - 1 }); });
      await t.mutation(internal.games.advance, { gameId: room.gameId, epoch: state.game.epoch });
      state = await t.query(api.games.state, seats[0]);
      await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
      state = await t.query(api.games.state, seats[0]);
      expect(state.game.nightStage).toBe(stage);
      expect(await t.query(internal.games.mediaGrant, seatFor(mafia._id))).toBeNull();
      await expect(t.mutation(api.games.choose, { ...seatFor(mafia._id), epoch: state.game.epoch, targetId: victim._id, skip: false })).rejects.toThrow();
      if (stage === "detective") await t.mutation(api.games.choose, { ...seatFor(detective._id), epoch: state.game.epoch, targetId: mafia._id, skip: false });
      else await t.mutation(api.games.choose, { ...seatFor(doctor._id), epoch: state.game.epoch, targetId: victim._id, skip: false });
    }
    await t.run(async ctx => { await ctx.db.patch(room.gameId, { deadline: Date.now() - 1 }); });
    await t.mutation(internal.games.advance, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    expect(state.game.phase).toBe("day");
    expect(state.events[0].text).toMatch(/Everyone survived/);
    expect((await t.query(api.games.state, seatFor(detective._id))).investigations).toMatchObject([{ isMafia: true, targetId: mafia._id }]);
    await t.run(async ctx => { await ctx.db.patch(room.gameId, { deadline: Date.now() - 1 }); });
    await t.mutation(internal.games.advance, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    expect(state.game.phase).toBe("vote");
    for (const s of seats) {
      const view = await t.query(api.games.state, s);
      if (view.me.id !== mafia._id) await t.mutation(api.games.choose, { ...s, epoch: state.game.epoch, targetId: mafia._id, skip: false });
    }
    await t.run(async ctx => { await ctx.db.patch(room.gameId, { deadline: Date.now() - 1 }); });
    await t.mutation(internal.games.advance, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, seats[0]);
    expect(state.game.phase).toBe("ended");
    expect(state.game.winner).toBe("town");
    expect(state.players.every(p => p.role)).toBe(true);
  });
  it("lets a non-playing volunteer moderate the phases without hearing Mafia's private call", async () => {
    vi.stubEnv("ALLOW_NO_MEDIA", "true");
    const t = convexTest(schema, modules);
    for (let i = 1; i <= 7; i++) await admit(t, i);
    const room = await t.mutation(api.games.create, { name: "Organizer", title: "Hosted game", secret: secret(1) });
    const organizer = { gameId: room.gameId, secret: secret(1) };
    const moderator = { gameId: room.gameId, secret: secret(2) };
    await t.mutation(api.games.setNarrationMode, { ...organizer, mode: "volunteer" });
    await t.mutation(api.games.join, { code: room.code, name: "Moderator", secret: secret(2) });
    await t.mutation(api.games.volunteerNarrator, { ...moderator, volunteer: true });
    const seats = [organizer, moderator];
    for (let i = 3; i <= 7; i++) {
      await t.mutation(api.games.join, { code: room.code, name: `Player ${i}`, secret: secret(i) });
      seats.push({ gameId: room.gameId, secret: secret(i) });
    }
    for (const seat of seats) await t.mutation(api.games.ready, { ...seat, ready: true });
    await t.mutation(api.games.start, moderator);
    let state = await t.query(api.games.state, moderator);
    await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, moderator);
    expect(state.game.phase).toBe("reveal");
    expect(state.game.deadline).toBeUndefined();
    expect(state.me).toMatchObject({ isNarrator: true, alive: false });
    expect(state.me.role).toBeUndefined();
    expect(state.players.filter(p => p.isNarrator)).toHaveLength(1);
    expect(await t.query(internal.games.moderatorGrant, moderator)).toMatchObject({ publish: true });
    expect(await t.query(internal.games.moderatorGrant, organizer)).toMatchObject({ publish: false });
    await expect(t.mutation(api.games.advanceAsNarrator, { ...organizer, epoch: state.game.epoch })).rejects.toThrow();
    await t.mutation(api.games.advanceAsNarrator, { ...moderator, epoch: state.game.epoch });
    state = await t.query(api.games.state, moderator);
    await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, moderator);
    expect(state.game.nightStage).toBe("mafia");
    expect(state.game.deadline).toBeUndefined();
    expect(await t.query(internal.games.mediaGrant, moderator)).toBeNull();
    const roles = await t.run(ctx => ctx.db.query("players").withIndex("by_game", q => q.eq("gameId", room.gameId)).collect());
    const mafia = roles.find(p => p.role === "mafia")!;
    const victim = roles.find(p => p.role === "villager")!;
    const views = await Promise.all(seats.map(seat => t.query(api.games.state, seat)));
    const mafiaSeat = seats[views.findIndex(view => view.me.id === mafia._id)];
    expect(await t.query(internal.games.mediaGrant, mafiaSeat)).toMatchObject({ publish: true });
    await expect(t.mutation(api.games.choose, { ...moderator, epoch: state.game.epoch, targetId: victim._id, skip: false })).rejects.toThrow();
    await t.mutation(api.games.choose, { ...mafiaSeat, epoch: state.game.epoch, targetId: victim._id, skip: false });
    expect((await t.query(api.games.state, moderator)).narratorProgress).toEqual({ submitted: 1, expected: 1 });
    for (const stage of ["detective", "doctor"] as const) {
      await t.mutation(api.games.advanceAsNarrator, { ...moderator, epoch: state.game.epoch });
      state = await t.query(api.games.state, moderator);
      await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
      state = await t.query(api.games.state, moderator);
      expect(state.game.nightStage).toBe(stage);
      expect(state.game.deadline).toBeUndefined();
      expect(await t.query(internal.games.mediaGrant, mafiaSeat)).toBeNull();
    }
    await t.mutation(api.games.advanceAsNarrator, { ...moderator, epoch: state.game.epoch });
    state = await t.query(api.games.state, moderator);
    await t.mutation(internal.games.finishTransition, { gameId: room.gameId, epoch: state.game.epoch });
    state = await t.query(api.games.state, moderator);
    expect(state.game.phase).toBe("day");
    expect(state.events[0].text).toContain(victim.name);
    expect(state.players.find(p => p.id === victim._id)?.alive).toBe(false);
    expect(await t.query(internal.games.mediaGrant, moderator)).toMatchObject({ publish: true });
  });
});
