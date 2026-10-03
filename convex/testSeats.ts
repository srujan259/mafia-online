import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";

const names = ["Test Meera", "Test Aarav", "Test Isha", "Test Kabir", "Test Tara", "Test Rohan"];

// Admin CLI only. These seats let one person inspect a hosted lobby and game flow;
// they have no WorkOS account and cannot join LiveKit or take game actions.
export const fill = internalMutation({
  args: { code: v.string(), count: v.number() },
  handler: async (ctx, { code, count }) => {
    if (count !== 5 && count !== 6) throw new ConvexError("Choose five or six test seats.");
    const game = await ctx.db.query("games").withIndex("by_code", q => q.eq("code", code.trim().toUpperCase())).first();
    if (!game) throw new ConvexError("That room wasn’t found on this Convex deployment.");
    if (game.phase !== "lobby") throw new ConvexError("Test seats can only be added before the game starts.");

    const players = await ctx.db.query("players").withIndex("by_game", q => q.eq("gameId", game._id)).collect();
    const seats = names.slice(0, count).map((name, index) => ({ name, hash: `test-seat:${game._id}:${index}` }));
    const missing = seats.filter(seat => !players.some(player => player.sessionHash === seat.hash));
    if (players.length + missing.length > (game.narrationMode === "volunteer" ? 13 : 12)) throw new ConvexError("The room has too many players for these test seats.");
    if (missing.some(seat => players.some(player => player.name.toLowerCase() === seat.name.toLowerCase()))) throw new ConvexError("A player already uses a test-seat name.");

    const now = Date.now();
    for (const seat of seats) {
      const existing = players.find(player => player.sessionHash === seat.hash);
      const playerId = existing?._id ?? await ctx.db.insert("players", {
        gameId: game._id, sessionHash: seat.hash, name: seat.name,
        alive: true, ready: true, lastSeen: now, joinedAt: now,
      });
      if (existing && !existing.ready) await ctx.db.patch(existing._id, { ready: true });
      const presence = await ctx.db.query("presence").withIndex("by_player", q => q.eq("playerId", playerId)).first();
      if (presence) await ctx.db.patch(presence._id, { lastSeen: now });
      else await ctx.db.insert("presence", { gameId: game._id, playerId, lastSeen: now });
    }
    return { added: missing.length, refreshed: count - missing.length, totalPlayers: players.length + missing.length };
  },
});
