"use node";

import { v, ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { createRemoteJWKSet } from "jose";
import { bridgeWorkosToken } from "./lib/bridge";

const workosKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function workosKeys(clientId: string) {
  let keys = workosKeySets.get(clientId);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}`));
    workosKeySets.set(clientId, keys);
  }
  return keys;
}

export const exchange = action({
  args: { workosToken: v.string() },
  handler: async (_ctx, { workosToken }) => {
    const clientId = process.env.WORKOS_CLIENT_ID;
    const issuerClientId = process.env.WORKOS_ISSUER_CLIENT_ID || clientId;
    const privateKey = process.env.MAFIA_AUTH_PRIVATE_KEY;
    if (process.env.AUTHKIT_AUTH_REQUIRED !== "true" || !clientId || !issuerClientId || !privateKey) {
      throw new ConvexError("Account verification is not configured.");
    }
    if (workosToken.length > 10000) throw new ConvexError("Invalid sign-in token.");

    try {
      return await bridgeWorkosToken(workosToken, workosKeys(issuerClientId), { clientId, issuerClientId, privateKey });
    } catch {
      throw new ConvexError("Your sign-in could not be verified. Please sign in again.");
    }
  },
});
