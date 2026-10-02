import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const authkitRequired = () => process.env.AUTHKIT_AUTH_REQUIRED === "true";

export async function requireWorkosSubject(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to play.");
  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId || identity["client_id"] !== clientId) throw new ConvexError("This account is not signed in to the Mafia application.");
  return identity.subject;
}

export async function sessionHash(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new ConvexError("Invalid guest session. Please reload.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
export async function requireInvitation(ctx: QueryCtx | MutationCtx, secret: string) {
  if (authkitRequired()) {
    return `workos:${await requireWorkosSubject(ctx)}`;
  }
  const hash = await sessionHash(secret);
  if (!await hasInvitation(ctx, hash)) throw new ConvexError("An invitation is required to play.");
  return hash;
}
export async function hasInvitation(ctx: QueryCtx | MutationCtx, hash: string) {
  const invitations = await ctx.db.query("invitations").withIndex("by_claimed_by", q => q.eq("claimedBy", hash)).collect();
  if (invitations.some(invitation => invitation.revokedAt === undefined)) return true;
  const claims = await ctx.db.query("invitationClaims").withIndex("by_claimed_by", q => q.eq("claimedBy", hash)).collect();
  for (const claim of claims) {
    const invitation = await ctx.db.get(claim.invitationId);
    if (invitation && invitation.revokedAt === undefined) return true;
  }
  return false;
}
export async function authorize(ctx: QueryCtx | MutationCtx, gameId: Id<"games">, secret: string, trustedSubject?: string) {
  const hash = authkitRequired() && trustedSubject
    ? `workos:${trustedSubject}`
    : await requireInvitation(ctx, secret);
  const player = await ctx.db.query("players").withIndex("by_session", q => q.eq("sessionHash", hash)).filter(q => q.eq(q.field("gameId"), gameId)).first();
  const game = await ctx.db.get(gameId);
  if (!game || !player) throw new ConvexError("This seat is not available. Join the room again.");
  return { game, player };
}
export function cleanName(name: string, max = 24) {
  const result = name.trim().replace(/\s+/g, " ");
  if (result.length < 2 || result.length > max) throw new ConvexError(`Use between 2 and ${max} characters.`);
  if (/[\u0000-\u001f\u007f]/.test(result)) throw new ConvexError("Please use a normal display name.");
  return result;
}
