import { describe, expect, it } from "vitest";
import { canChoose, mediaAccess, nightStageSeconds, resolveNight, resolveVote, roleDeck, winner, type Person } from "./rules";

const players: Person[] = [
  { _id: "m1", alive: true, role: "mafia" },
  { _id: "m2", alive: true, role: "mafia" },
  { _id: "doc", alive: true, role: "doctor" },
  { _id: "det", alive: true, role: "detective" },
  { _id: "a", alive: true, role: "villager" },
  { _id: "b", alive: true, role: "villager" },
  { _id: "c", alive: true, role: "villager" },
  { _id: "d", alive: true, role: "villager" },
];

describe("round rules", () => {
  it("scales the Mafia team across supported player counts", () => {
    expect([6, 7, 8, 10, 11, 12].map(n => roleDeck(n).filter(r => r === "mafia").length)).toEqual([1, 1, 2, 2, 3, 3]);
    expect([6, 7].map(n => roleDeck(n, 2).filter(r => r === "mafia").length)).toEqual([2, 2]);
    expect(roleDeck(6, 2).filter(r => r === "villager")).toHaveLength(2);
    expect(() => roleDeck(5)).toThrow(); expect(() => roleDeck(13)).toThrow();
  });
  it("blocks a kill when living Mafia disagree or one is missing", () => {
    expect(resolveNight(players, [{ playerId: "m1", targetId: "a" }, { playerId: "m2", targetId: "b" }]).eliminatedId).toBeNull();
    expect(resolveNight(players, [{ playerId: "m1", targetId: "a" }]).eliminatedId).toBeNull();
    expect(resolveNight(players, [{ playerId: "m1", targetId: "a" }, { playerId: "m2", targetId: "a" }]).eliminatedId).toBe("a");
  });
  it("lets the Doctor save a victim without blocking an investigation", () => {
    const result = resolveNight(players, [
      { playerId: "m1", targetId: "a" }, { playerId: "m2", targetId: "a" },
      { playerId: "doc", targetId: "a" }, { playerId: "det", targetId: "m1" },
    ]);
    expect(result).toEqual({ eliminatedId: null, saved: true, investigation: { playerId: "det", targetId: "m1", isMafia: true } });
  });
  it("counts missing votes as skip and ties as no elimination", () => {
    expect(resolveVote(players, [{ playerId: "m1", targetId: "a" }]).eliminatedId).toBeNull();
    const all = players.map(p => ({ playerId: p._id, targetId: p._id === "a" ? "b" : "a" }));
    expect(resolveVote(players, all).eliminatedId).toBe("a");
    const tied = players.map((p, i) => ({ playerId: p._id, targetId: i === 0 || i >= 5 ? "m2" : "m1" }));
    expect(resolveVote(players, tied).eliminatedId).toBeNull();
  });
  it("ends when all Mafia are gone or living Mafia reach parity", () => {
    expect(winner(players)).toBeNull();
    expect(winner(players.map(p => p.role === "mafia" ? { ...p, alive: false } : p))).toBe("town");
    expect(winner(players.map(p => ["a", "b", "c", "d"].includes(p._id) ? { ...p, alive: false } : p))).toBe("mafia");
  });
  it("limits night actions and media to the correct audience", () => {
    expect(canChoose("night", players[0], players[1])).toBe(false);
    expect(canChoose("night", players[2], players[2])).toBe(true);
    expect(canChoose("night", players[3], players[3])).toBe(false);
    expect(canChoose("vote", players[4], players[4])).toBe(false);
    expect(canChoose("night", players[2], players[4], "mafia")).toBe(false);
    expect(canChoose("night", players[2], players[4], "doctor")).toBe(true);
    expect(mediaAccess("night", players[0])).toEqual({ channel: "private", publish: true });
    expect(mediaAccess("night", players[0], "detective")).toBeNull();
    expect(mediaAccess("night", players[4])).toBeNull();
    expect(mediaAccess("day", { ...players[0], alive: false })).toEqual({ channel: "table", publish: true });
  });
  it("keeps short night turns within the configured night duration", () => {
    for (const seconds of [30, 45, 60, 90]) {
      expect(["mafia", "detective", "doctor"].map(stage => nightStageSeconds(seconds, stage as "mafia" | "detective" | "doctor")).reduce((a, b) => a + b)).toBe(seconds);
    }
  });
});
