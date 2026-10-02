import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize, cleanName, sessionHash } from "./lib/auth";
import { canChoose, mediaAccess, nightStageSeconds, resolveNight, resolveVote, roleDeck, winner, type NightStage, type Phase } from "./lib/rules";
import { narrationMode } from "./schema";

const credentials = { gameId: v.id("games"), secret: v.string() };
const playersIn = (ctx: Parameters<typeof authorize>[0], gameId: Id<"games">) => ctx.db.query("players").withIndex("by_game", q => q.eq("gameId", gameId)).collect();
async function event(ctx: MutationCtx, game: Doc<"games">, text: string, kind = "announcement") {
  await ctx.db.insert("events", { gameId: game._id, round: game.round, text, kind });
}
async function transition(ctx: MutationCtx, game: Doc<"games">, nextPhase: Phase, nextNightStage?: NightStage): Promise<void> {
  const epoch = game.epoch + 1;
  await ctx.db.patch(game._id, { phase: "transition", nextPhase, nextNightStage, epoch, deadline: undefined, mediaError: undefined });
  await ctx.scheduler.runAfter(0, internal.media.closeAndAdvance, { gameId: game._id, epoch, oldRoom: game.mediaRoom, attempt: 0 });
}

export const create = mutation({
  args: { secret: v.string(), name: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    const hash = await sessionHash(args.secret);
    const recent = await ctx.db.query("players").withIndex("by_session", q => q.eq("sessionHash", hash)).collect();
    if (recent.filter(p => p.joinedAt > Date.now() - 60_000).length >= 5) throw new ConvexError("Please wait a minute before opening another room.");
    const name = cleanName(args.name); const title = cleanName(args.title, 40);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
      if (!(await ctx.db.query("games").withIndex("by_code", q => q.eq("code", code)).first())) break;
      if (attempt === 9) throw new ConvexError("Could not create a room. Please try again.");
    }
    const gameId = await ctx.db.insert("games", { code, title, phase: "lobby", round: 0, epoch: 0, narrationMode: "automatic", daySeconds: 180, nightSeconds: 60, voteSeconds: 30, createdAt: Date.now() });
    const playerId = await ctx.db.insert("players", { gameId, sessionHash: hash, name, alive: true, ready: false, lastSeen: Date.now(), joinedAt: Date.now() });
    await ctx.db.patch(gameId, { hostId: playerId, mediaRoom: `mafia-${gameId}-0-table` });
    return { gameId, code };
  },
});

export const join = mutation({
  args: { code: v.string(), name: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    const hash = await sessionHash(args.secret);
    const code = args.code.trim().toUpperCase();
    const game = await ctx.db.query("games").withIndex("by_code", q => q.eq("code", code)).first();
    if (!game) throw new ConvexError("That room wasn’t found. Check the invitation code.");
    const players = await playersIn(ctx, game._id);
    const existing = players.find(p => p.sessionHash === hash);
    if (existing) { await ctx.db.patch(existing._id, { lastSeen: Date.now() }); return { gameId: game._id, code }; }
    if (game.phase !== "lobby") throw new ConvexError("This game has started. Only existing players can rejoin.");
    if (players.length >= (game.narrationMode === "volunteer" ? 13 : 12)) throw new ConvexError("This room is full.");
    const name = cleanName(args.name);
    if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new ConvexError("Someone already uses that name. Choose another.");
    await ctx.db.insert("players", { gameId: game._id, sessionHash: hash, name, alive: true, ready: false, lastSeen: Date.now(), joinedAt: Date.now() });
    return { gameId: game._id, code };
  },
});

export const state = query({
  args: credentials,
  handler: async (ctx, args) => {
    const { game, player } = await authorize(ctx, args.gameId, args.secret);
    const players = await playersIn(ctx, game._id);
    const choices = await ctx.db.query("choices").withIndex("by_game_epoch", q => q.eq("gameId", game._id).eq("epoch", game.epoch)).collect();
    const investigations = player.role === "detective" ? await ctx.db.query("investigations").withIndex("by_player", q => q.eq("playerId", player._id)).collect() : [];
    const events = await ctx.db.query("events").withIndex("by_game", q => q.eq("gameId", game._id)).order("desc").take(20);
    const teammates = player.role === "mafia" ? players.filter(p => p.role === "mafia" && p._id !== player._id).map(p => p._id) : [];
    const isNarrator = game.narrationMode === "volunteer" && game.narratorId === player._id;
    const activeRole = game.phase === "night" ? game.nightStage : undefined;
    const expected = game.phase === "vote" ? players.filter(p => p.alive).length : activeRole ? players.filter(p => p.alive && p.role === activeRole).length : 0;
    return {
      game: { _id: game._id, code: game.code, title: game.title, phase: game.phase, nightStage: game.phase === "night" ? game.nightStage : undefined, round: game.round, epoch: game.epoch, deadline: game.deadline, winner: game.winner, hostId: game.hostId, narratorId: game.narratorId, narrationMode: game.narrationMode ?? "automatic", daySeconds: game.daySeconds, nightSeconds: game.nightSeconds, voteSeconds: game.voteSeconds, mediaError: game.mediaError },
      me: { id: player._id, role: player.role, alive: player.alive, ready: player.ready, isNarrator },
      players: players.map(p => ({ id: p._id, name: p.name, alive: p.alive, ready: p.ready, isNarrator: game.narrationMode === "volunteer" && game.narratorId === p._id, lastSeen: p.lastSeen, role: game.phase === "ended" ? p.role : undefined })),
      teammates,
      myChoice: choices.find(c => c.playerId === player._id) ? { targetId: choices.find(c => c.playerId === player._id)!.targetId, skip: choices.find(c => c.playerId === player._id)!.skip } : null,
      mafiaChoices: game.phase === "night" && (!game.nightStage || game.nightStage === "mafia") && player.alive && player.role === "mafia" ? choices.filter(c => teammates.includes(c.playerId)).map(c => ({ playerId: c.playerId, targetId: c.targetId, skip: c.skip })) : [],
      investigations: investigations.map(i => ({ targetId: i.targetId, round: i.round, isMafia: i.isMafia })),
      events: events.map(e => ({ id: e._id, text: e.text, round: e.round, kind: e.kind })),
      mediaAllowed: !!mediaAccess(game.phase, player, game.nightStage, isNarrator),
      narratorProgress: isNarrator && (activeRole || game.phase === "vote") ? { submitted: choices.filter(c => players.some(p => p._id === c.playerId && p.alive && (game.phase === "vote" || p.role === activeRole))).length, expected } : null,
    };
  },
});

export const heartbeat = mutation({ args: credentials, handler: async (ctx, args) => {
  const { player } = await authorize(ctx, args.gameId, args.secret);
  if (Date.now() - player.lastSeen > 10_000) await ctx.db.patch(player._id, { lastSeen: Date.now() });
} });
export const ready = mutation({ args: { ...credentials, ready: v.boolean() }, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if (game.phase !== "lobby") throw new ConvexError("The game has already started.");
  await ctx.db.patch(player._id, { ready: args.ready, lastSeen: Date.now() });
} });
export const settings = mutation({ args: { ...credentials, daySeconds: v.number(), nightSeconds: v.number() }, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if (game.hostId !== player._id || game.phase !== "lobby") throw new ConvexError("Only the host can change lobby settings.");
  if (![60, 120, 180, 300].includes(args.daySeconds) || ![30, 45, 60, 90].includes(args.nightSeconds)) throw new ConvexError("Choose a supported timer.");
  await ctx.db.patch(game._id, { daySeconds: args.daySeconds, nightSeconds: args.nightSeconds });
  for (const p of await playersIn(ctx, game._id)) await ctx.db.patch(p._id, { ready: false });
} });
export const setNarrationMode = mutation({ args: { ...credentials, mode: narrationMode }, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if (game.hostId !== player._id || game.phase !== "lobby") throw new ConvexError("Only the room organizer can change narration.");
  if (game.narrationMode === args.mode) return;
  if (args.mode === "automatic" && (await playersIn(ctx, game._id)).length > 12) throw new ConvexError("Automatic rooms hold up to 12 players. Remove one guest first.");
  if (game.narratorId) await ctx.db.patch(game.narratorId, { alive: true, role: undefined });
  await ctx.db.patch(game._id, { narrationMode: args.mode, narratorId: undefined });
  for (const p of await playersIn(ctx, game._id)) await ctx.db.patch(p._id, { ready: false });
} });
export const volunteerNarrator = mutation({ args: { ...credentials, volunteer: v.boolean() }, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if (game.phase !== "lobby" || game.narrationMode !== "volunteer") throw new ConvexError("Choose a volunteer host in the lobby.");
  if (args.volunteer && game.narratorId && game.narratorId !== player._id) throw new ConvexError("Someone has already volunteered.");
  if (!args.volunteer && game.narratorId !== player._id) throw new ConvexError("Only the volunteer can step down.");
  await ctx.db.patch(game._id, { narratorId: args.volunteer ? player._id : undefined });
  await ctx.db.patch(player._id, { alive: !args.volunteer, ready: false, role: undefined });
  for (const p of await playersIn(ctx, game._id)) await ctx.db.patch(p._id, { ready: false });
} });
export const reclaimHost = mutation({ args: credentials, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  const host = game.hostId ? await ctx.db.get(game.hostId) : null;
  if (host && Date.now() - host.lastSeen < 60_000) throw new ConvexError("The current host is still connected.");
  await ctx.db.patch(game._id, { hostId: player._id });
} });
export const removePlayer = mutation({ args: { ...credentials, playerId: v.id("players") }, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  const target = await ctx.db.get(args.playerId);
  if (game.phase !== "lobby" || game.hostId !== player._id || target?.gameId !== game._id || target._id === player._id) throw new ConvexError("You cannot remove this player.");
  await ctx.db.delete(target._id);
  if (game.narratorId === target._id) await ctx.db.patch(game._id, { narratorId: undefined });
  // Retire the entire lobby media epoch so a removed guest cannot reuse its token.
  await transition(ctx, game, "lobby");
} });
export const start = mutation({ args: credentials, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if ((game.hostId !== player._id && game.narratorId !== player._id) || game.phase !== "lobby") throw new ConvexError("Only the organizer or volunteer moderator can start from the lobby.");
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    if (process.env.ALLOW_NO_MEDIA !== "true") throw new ConvexError("LiveKit is not connected yet. Finish the video setup before starting.");
  }
  const players = await playersIn(ctx, game._id);
  const playing = players.filter(p => p._id !== game.narratorId);
  if (game.narrationMode === "volunteer" && !game.narratorId) throw new ConvexError("A volunteer moderator needs to join before starting.");
  if (playing.length < 6 || playing.length > 12) throw new ConvexError("You need 6–12 playing friends.");
  if (players.some(p => !p.ready || Date.now() - p.lastSeen > 60_000)) throw new ConvexError("Everyone must be connected and ready.");
  const deck = roleDeck(playing.length);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  for (let i = 0; i < playing.length; i++) await ctx.db.patch(playing[i]._id, { role: deck[i], alive: true });
  if (game.narratorId) await ctx.db.patch(game.narratorId, { role: undefined, alive: false });
  await ctx.db.patch(game._id, { round: 1 });
  await event(ctx, { ...game, round: 1 }, "Roles are dealt. Your secret is yours to keep.");
  await transition(ctx, game, "reveal");
} });

export const choose = mutation({ args: { ...credentials, epoch: v.number(), targetId: v.optional(v.id("players")), skip: v.boolean() }, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if (!player.alive || !["night", "vote"].includes(game.phase) || game.epoch !== args.epoch || game.narrationMode !== "volunteer" && (!game.deadline || Date.now() >= game.deadline)) throw new ConvexError("This action is no longer available.");
  if (game.phase === "night" && (player.role === "villager" || game.nightStage && player.role !== game.nightStage)) throw new ConvexError("It is not your turn to act.");
  if (args.skip && args.targetId) throw new ConvexError("Choose a player or skip, not both.");
  const target = args.targetId ? await ctx.db.get(args.targetId) : undefined;
  if (!args.skip && (!target || target.gameId !== game._id || !canChoose(game.phase, player, target, game.nightStage))) throw new ConvexError("Choose an eligible living player.");
  const previous = await ctx.db.query("choices").withIndex("by_game_epoch", q => q.eq("gameId", game._id).eq("epoch", game.epoch)).filter(q => q.eq(q.field("playerId"), player._id)).first();
  const choice = { gameId: game._id, playerId: player._id, epoch: game.epoch, targetId: args.targetId, skip: args.skip };
  if (previous) await ctx.db.replace(previous._id, choice); else await ctx.db.insert("choices", choice);
} });

export const finishTransition = internalMutation({ args: { gameId: v.id("games"), epoch: v.number() }, handler: async (ctx, args): Promise<null> => {
  const game = await ctx.db.get(args.gameId);
  if (!game || game.phase !== "transition" || game.epoch !== args.epoch || !game.nextPhase) return null;
  const next = game.nextPhase;
  const stage = next === "night" ? game.nextNightStage ?? "mafia" : undefined;
  const seconds = next === "reveal" ? 12 : next === "night" ? nightStageSeconds(game.nightSeconds, stage!) : next === "day" ? game.daySeconds : next === "vote" ? game.voteSeconds : 0;
  const deadline = game.narrationMode === "volunteer" ? undefined : seconds ? Date.now() + seconds * 1000 : undefined;
  const channel = next === "night" && stage === "mafia" ? "private" : ["day", "lobby", "ended"].includes(next) ? "table" : null;
  await ctx.db.patch(game._id, { phase: next, nextPhase: undefined, nightStage: stage, nextNightStage: undefined, deadline, mediaError: undefined, mediaRoom: channel ? `mafia-${game._id}-${game.epoch}-${channel}` : undefined });
  if (deadline) await ctx.scheduler.runAt(deadline, internal.games.advance, { gameId: game._id, epoch: game.epoch });
  return null;
} });

async function advanceGame(ctx: MutationCtx, game: Doc<"games">): Promise<void> {
  let next: Phase;
  if (game.phase === "reveal") next = "night";
  else if (game.phase === "day") next = "vote";
  else if (game.phase === "night" && game.nightStage === "mafia") { await transition(ctx, game, "night", "detective"); return; }
  else if (game.phase === "night" && game.nightStage === "detective") { await transition(ctx, game, "night", "doctor"); return; }
  else {
    const players = await playersIn(ctx, game._id);
    const epochs = game.phase === "night" && game.nightStage === "doctor" ? [game.epoch - 2, game.epoch - 1, game.epoch] : [game.epoch];
    const choices = (await Promise.all(epochs.map(epoch => ctx.db.query("choices").withIndex("by_game_epoch", q => q.eq("gameId", game._id).eq("epoch", epoch)).collect()))).flat();
    let eliminated: string | null = null;
    if (game.phase === "night") {
      const outcome = resolveNight(players, choices); eliminated = outcome.eliminatedId;
      if (outcome.investigation) await ctx.db.insert("investigations", { gameId: game._id, round: game.round, playerId: outcome.investigation.playerId as Id<"players">, targetId: outcome.investigation.targetId as Id<"players">, isMafia: outcome.investigation.isMafia });
      await event(ctx, game, eliminated ? `Morning arrives. ${players.find(p => p._id === eliminated)!.name} did not survive the night.` : "Morning arrives. Everyone survived the night.", "dawn");
      next = "day";
    } else if (game.phase === "vote") {
      const outcome = resolveVote(players, choices); eliminated = outcome.eliminatedId;
      await event(ctx, game, eliminated ? `The town voted out ${players.find(p => p._id === eliminated)!.name}. Their role stays secret.` : "The vote ends without an elimination.", "vote");
      const tally = Object.entries(outcome.counts).map(([id, n]) => `${id === "skip" ? "Skip" : players.find(p => p._id === id)?.name}: ${n}`).join(" · ");
      await event(ctx, game, tally, "tally");
      next = "night";
    } else return;
    if (eliminated) await ctx.db.patch(eliminated as Id<"players">, { alive: false });
    const won = winner(players.map(p => p._id === eliminated ? { ...p, alive: false } : p));
    if (won) { await ctx.db.patch(game._id, { winner: won }); next = "ended"; await event(ctx, game, won === "town" ? "The town wins. Every Mafia member has been eliminated." : "The Mafia wins. They now equal or outnumber the town.", "victory"); }
    else if (game.phase === "vote") await ctx.db.patch(game._id, { round: game.round + 1 });
  }
  await transition(ctx, game, next);
}

export const advance = internalMutation({ args: { gameId: v.id("games"), epoch: v.number() }, handler: async (ctx, args): Promise<null> => {
  const game = await ctx.db.get(args.gameId);
  if (!game || game.narrationMode === "volunteer" || game.epoch !== args.epoch || !game.deadline || Date.now() < game.deadline || game.phase === "transition") return null;
  await advanceGame(ctx, game);
  return null;
} });

export const advanceAsNarrator = mutation({ args: { ...credentials, epoch: v.number() }, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if (game.narrationMode !== "volunteer" || game.epoch !== args.epoch || !["reveal", "night", "day", "vote"].includes(game.phase)) throw new ConvexError("This scene has already changed.");
  const narrator = game.narratorId ? await ctx.db.get(game.narratorId) : null;
  const narratorAbsent = !narrator || Date.now() - narrator.lastSeen > 60_000;
  if (game.narratorId !== player._id && !(game.hostId === player._id && narratorAbsent)) throw new ConvexError("Only the volunteer moderator can advance the scene.");
  await advanceGame(ctx, game);
} });

export const transitionState = internalQuery({ args: { gameId: v.id("games") }, handler: (ctx, args) => ctx.db.get(args.gameId) });
export const transitionError = internalMutation({ args: { gameId: v.id("games"), epoch: v.number() }, handler: async (ctx, args) => {
  const game = await ctx.db.get(args.gameId);
  if (game?.epoch === args.epoch && game.phase === "transition") await ctx.db.patch(game._id, { mediaError: "Reconnecting the table safely. Retrying the video service…" });
} });
export const retryTransition = mutation({ args: credentials, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if ((game.hostId !== player._id && game.narratorId !== player._id) || game.phase !== "transition" || !game.mediaError) throw new ConvexError("A retry is not available.");
  await ctx.db.patch(game._id, { mediaError: undefined });
  await ctx.scheduler.runAfter(0, internal.media.closeAndAdvance, { gameId: game._id, epoch: game.epoch, oldRoom: game.mediaRoom, attempt: 0 });
} });
export const mediaGrant = internalQuery({ args: credentials, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  const access = mediaAccess(game.phase, player, game.nightStage, game.narrationMode === "volunteer" && game.narratorId === player._id);
  if (!access || !game.mediaRoom || (game.deadline && Date.now() >= game.deadline)) return null;
  return { room: game.mediaRoom, identity: player._id, name: player.name, publish: access.publish, epoch: game.epoch };
} });
export const moderatorGrant = internalQuery({ args: credentials, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if (game.narrationMode !== "volunteer" || !game.narratorId || !["transition", "reveal", "night", "vote"].includes(game.phase) || game.round < 1) return null;
  return { room: `mafia-${game._id}-${game.round}-moderator`, identity: player._id, name: player.name, publish: player._id === game.narratorId, round: game.round };
} });
export const rematch = mutation({ args: credentials, handler: async (ctx, args) => {
  const { game, player } = await authorize(ctx, args.gameId, args.secret);
  if ((game.hostId !== player._id && game.narratorId !== player._id) || game.phase !== "ended") throw new ConvexError("Only the organizer or volunteer moderator can open a new game.");
  const players = await playersIn(ctx, game._id);
  for (const p of players) {
    await ctx.db.patch(p._id, { alive: p._id !== game.narratorId, ready: false, role: undefined });
    for (const i of await ctx.db.query("investigations").withIndex("by_player", q => q.eq("playerId", p._id)).collect()) await ctx.db.delete(i._id);
  }
  for (const e of await ctx.db.query("events").withIndex("by_game", q => q.eq("gameId", game._id)).collect()) await ctx.db.delete(e._id);
  await ctx.db.patch(game._id, { winner: undefined, round: 0 });
  await transition(ctx, game, "lobby");
} });
