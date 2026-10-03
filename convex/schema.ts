import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const phase = v.union(v.literal("lobby"), v.literal("reveal"), v.literal("transition"), v.literal("night"), v.literal("day"), v.literal("vote"), v.literal("ended"));
export const role = v.union(v.literal("mafia"), v.literal("doctor"), v.literal("detective"), v.literal("villager"));
export const nightStage = v.union(v.literal("mafia"), v.literal("detective"), v.literal("doctor"));
export const narrationMode = v.union(v.literal("automatic"), v.literal("volunteer"));
export default defineSchema({
  invitations: defineTable({
    codeHash: v.string(), label: v.string(), createdAt: v.number(), expiresAt: v.number(),
    claimedBy: v.optional(v.string()), claimedAt: v.optional(v.number()), revokedAt: v.optional(v.number()),
    maxClaims: v.optional(v.number()), claimCount: v.optional(v.number()),
  }).index("by_code_hash", ["codeHash"]).index("by_claimed_by", ["claimedBy"]),
  invitationClaims: defineTable({
    invitationId: v.id("invitations"), claimedBy: v.string(), claimedAt: v.number(),
  }).index("by_invitation", ["invitationId"]).index("by_claimed_by", ["claimedBy"]),
  games: defineTable({
    code: v.string(), title: v.string(), hostId: v.optional(v.id("players")), phase,
    round: v.number(), epoch: v.number(), deadline: v.optional(v.number()),
    nextPhase: v.optional(phase), nightStage: v.optional(nightStage), nextNightStage: v.optional(nightStage), mediaRoom: v.optional(v.string()),
    winner: v.optional(v.union(v.literal("town"), v.literal("mafia"))),
    daySeconds: v.number(), nightSeconds: v.number(), voteSeconds: v.number(),
    narrationMode: v.optional(narrationMode), narratorId: v.optional(v.id("players")),
    watchRoom: v.optional(v.string()),
    mediaError: v.optional(v.string()), createdAt: v.number(),
  }).index("by_code", ["code"]),
  players: defineTable({
    gameId: v.id("games"), sessionHash: v.string(), name: v.string(), role: v.optional(role),
    alive: v.boolean(), ready: v.boolean(), lastSeen: v.number(), joinedAt: v.number(),
  }).index("by_game", ["gameId"]).index("by_session", ["sessionHash"]),
  presence: defineTable({
    gameId: v.id("games"), playerId: v.id("players"), lastSeen: v.number(),
  }).index("by_game", ["gameId"]).index("by_player", ["playerId"]),
  choices: defineTable({
    gameId: v.id("games"), playerId: v.id("players"), epoch: v.number(),
    targetId: v.optional(v.id("players")), skip: v.boolean(),
  }).index("by_game_epoch", ["gameId", "epoch"]),
  mafiaMessages: defineTable({
    gameId: v.id("games"), epoch: v.number(), playerId: v.id("players"), text: v.string(), createdAt: v.number(),
  }).index("by_game", ["gameId"]).index("by_game_epoch", ["gameId", "epoch"]),
  investigations: defineTable({
    gameId: v.id("games"), playerId: v.id("players"), targetId: v.id("players"), round: v.number(), isMafia: v.boolean(),
  }).index("by_player", ["playerId"]),
  events: defineTable({
    gameId: v.id("games"), text: v.string(), round: v.number(), kind: v.string(),
  }).index("by_game", ["gameId"]),
});
