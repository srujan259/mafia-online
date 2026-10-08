"use node";
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authkitRequired, requireWorkosSubject } from "./lib/auth";

function config() {
  const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
  return url && key && secret ? { url, key, secret } : null;
}
export const token = action({
  args: { gameId: v.id("games"), secret: v.string(), epoch: v.number() },
  handler: async (ctx, args): Promise<{ token: string; url: string; epoch: number } | { unavailable: true } | null> => {
    const subject = authkitRequired() ? await requireWorkosSubject(ctx) : undefined;
    const grant = await ctx.runQuery(internal.games.mediaGrant, { gameId: args.gameId, secret: args.secret, trustedSubject: subject });
    if (!grant || grant.epoch !== args.epoch) return null;
    const settings = config();
    if (!settings) return { unavailable: true };
    const access = new AccessToken(settings.key, settings.secret, { identity: grant.identity, name: grant.name, ttl: 30 });
    access.addGrant({ room: grant.room, roomJoin: true, canPublish: grant.publish, canPublishSources: grant.publish ? [TrackSource.CAMERA, TrackSource.MICROPHONE] : [], canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false });
    return { token: await access.toJwt(), url: settings.url, epoch: grant.epoch };
  },
});

export const moderatorToken = action({
  args: { gameId: v.id("games"), secret: v.string(), round: v.number() },
  handler: async (ctx, args): Promise<{ token: string; url: string; round: number } | { unavailable: true } | null> => {
    const subject = authkitRequired() ? await requireWorkosSubject(ctx) : undefined;
    const grant = await ctx.runQuery(internal.games.moderatorGrant, { gameId: args.gameId, secret: args.secret, trustedSubject: subject });
    if (!grant || grant.round !== args.round) return null;
    const settings = config();
    if (!settings) return { unavailable: true };
    const access = new AccessToken(settings.key, settings.secret, { identity: grant.identity, name: grant.name, ttl: 30 });
    access.addGrant({ room: grant.room, roomJoin: true, canPublish: grant.publish, canPublishSources: grant.publish ? [TrackSource.MICROPHONE] : [], canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false });
    return { token: await access.toJwt(), url: settings.url, round: grant.round };
  },
});

export const watchToken = action({
  args: { gameId: v.id("games"), secret: v.string(), round: v.number() },
  handler: async (ctx, args): Promise<{ token: string; url: string; round: number } | { unavailable: true } | null> => {
    const subject = authkitRequired() ? await requireWorkosSubject(ctx) : undefined;
    const grant = await ctx.runQuery(internal.games.watchGrant, { gameId: args.gameId, secret: args.secret, trustedSubject: subject });
    if (!grant || grant.round !== args.round) return null;
    const settings = config();
    if (!settings) return { unavailable: true };
    const access = new AccessToken(settings.key, settings.secret, { identity: grant.identity, name: grant.name, ttl: 30 });
    access.addGrant({ room: grant.room, roomJoin: true, canPublish: grant.publish, canPublishSources: grant.publish ? [TrackSource.CAMERA] : [], canSubscribe: grant.subscribe, canPublishData: false, canUpdateOwnMetadata: false });
    return { token: await access.toJwt(), url: settings.url, round: grant.round };
  },
});

export const closeAndAdvance = internalAction({
  args: { gameId: v.id("games"), epoch: v.number(), oldRoom: v.optional(v.string()), attempt: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const game = await ctx.runQuery(internal.games.transitionState, { gameId: args.gameId });
    if (!game || game.phase !== "transition" || game.epoch !== args.epoch) return null;
    try {
      const settings = config();
      if (!settings && process.env.ALLOW_NO_MEDIA !== "true") throw new ConvexError("Video service is not configured.");
      if (settings && args.oldRoom) {
        const rooms = new RoomServiceClient(settings.url.replace(/^ws/, "http"), settings.key, settings.secret);
        try { await rooms.deleteRoom(args.oldRoom); }
        catch (error) {
          // LiveKit returns Twirp not_found if the empty room has already expired.
          if (!(error && typeof error === "object" && "code" in error && error.code === "not_found")) throw error;
        }
      }
      await ctx.runMutation(internal.games.finishTransition, { gameId: args.gameId, epoch: args.epoch });
    } catch {
      await ctx.runMutation(internal.games.transitionError, { gameId: args.gameId, epoch: args.epoch });
      if (args.attempt < 5) await ctx.scheduler.runAfter(Math.min(30_000, 2000 * 2 ** args.attempt), internal.media.closeAndAdvance, { ...args, attempt: args.attempt + 1 });
    }
    return null;
  },
});

export const closeRoom = internalAction({
  args: { room: v.string(), attempt: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const settings = config();
    if (!settings) return null;
    try {
      const rooms = new RoomServiceClient(settings.url.replace(/^ws/, "http"), settings.key, settings.secret);
      await rooms.deleteRoom(args.room);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "not_found") return null;
      if (args.attempt < 5) await ctx.scheduler.runAfter(Math.min(30_000, 2000 * 2 ** args.attempt), internal.media.closeRoom, { room: args.room, attempt: args.attempt + 1 });
    }
    return null;
  },
});
