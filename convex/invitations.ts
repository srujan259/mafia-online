import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { cleanName, sessionHash } from "./lib/auth";

function normalizeCode(code: string) {
  if (code.length > 64) throw new ConvexError("Enter a valid invitation code.");
  const normalized = code.replace(/[\s-]/g, "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(normalized)) throw new ConvexError("Enter a valid invitation code.");
  return normalized;
}

async function codeHash(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

// Only a deployment administrator can run internal functions via the Convex CLI/dashboard.
export const issue = internalMutation({
  args: { codeHash: v.string(), label: v.string() },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.codeHash)) throw new ConvexError("Invalid invitation hash.");
    const label = cleanName(args.label, 40);
    const existing = await ctx.db.query("invitations").withIndex("by_code_hash", q => q.eq("codeHash", args.codeHash)).first();
    if (existing) throw new ConvexError("This invitation already exists.");
    const now = Date.now();
    return await ctx.db.insert("invitations", { codeHash: args.codeHash, label, createdAt: now, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
  },
});

export const issueBatch = internalMutation({
  args: { codes: v.array(v.object({ codeHash: v.string(), label: v.string() })) },
  handler: async (ctx, args) => {
    if (args.codes.length < 1 || args.codes.length > 6) throw new ConvexError("Issue between one and six test invitations.");
    const now = Date.now();
    for (const item of args.codes) {
      if (!/^[a-f0-9]{64}$/.test(item.codeHash)) throw new ConvexError("Invalid invitation hash.");
      const existing = await ctx.db.query("invitations").withIndex("by_code_hash", q => q.eq("codeHash", item.codeHash)).first();
      if (existing) throw new ConvexError("This invitation already exists.");
      await ctx.db.insert("invitations", { codeHash: item.codeHash, label: cleanName(item.label, 40), createdAt: now, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
    }
  },
});

export const revoke = internalMutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) throw new ConvexError("Invitation not found.");
    if (invitation.revokedAt === undefined) await ctx.db.patch(invitation._id, { revokedAt: Date.now() });
  },
});

export const status = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    const hash = await sessionHash(args.secret);
    const invitations = await ctx.db.query("invitations").withIndex("by_claimed_by", q => q.eq("claimedBy", hash)).collect();
    return invitations.some(invitation => invitation.revokedAt === undefined);
  },
});

export const redeem = mutation({
  args: { secret: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const hash = await sessionHash(args.secret);
    const normalized = normalizeCode(args.code);
    const digest = await codeHash(normalized);
    const invitation = await ctx.db.query("invitations").withIndex("by_code_hash", q => q.eq("codeHash", digest)).first();
    if (!invitation || invitation.revokedAt !== undefined || invitation.expiresAt <= Date.now()) throw new ConvexError("This invitation is invalid or has expired.");
    if (invitation.claimedBy && invitation.claimedBy !== hash) throw new ConvexError("This invitation has already been used.");
    const existing = await ctx.db.query("invitations").withIndex("by_claimed_by", q => q.eq("claimedBy", hash)).collect();
    if (existing.some(item => item.revokedAt === undefined && item._id !== invitation._id)) throw new ConvexError("This browser already has access.");
    if (!invitation.claimedBy) await ctx.db.patch(invitation._id, { claimedBy: hash, claimedAt: Date.now() });
  },
});
