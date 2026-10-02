import { describe, expect, it } from "vitest";
import { createLocalJWKSet, decodeProtectedHeader, exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { bridgeWorkosToken } from "./bridge";
import { bridgeAudience, bridgeIssuer } from "../auth.config";

describe("WorkOS token bridge", () => {
  it("accepts a signed WorkOS token without typ and issues a scoped Convex token", async () => {
    const workos = await generateKeyPair("RS256", { extractable: true });
    const bridge = await generateKeyPair("RS256", { extractable: true });
    const workosJwk = { ...await exportJWK(workos.publicKey), kid: "workos-test", alg: "RS256" };
    const workosToken = await new SignJWT({ client_id: "client_game" })
      .setProtectedHeader({ alg: "RS256", kid: "workos-test" })
      .setIssuer("https://api.workos.com/user_management/client_default")
      .setSubject("user_test")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(workos.privateKey);
    expect(decodeProtectedHeader(workosToken).typ).toBeUndefined();

    const token = await bridgeWorkosToken(workosToken, createLocalJWKSet({ keys: [workosJwk] }), {
      clientId: "client_game",
      issuerClientId: "client_default",
      privateKey: await exportPKCS8(bridge.privateKey),
    });
    expect(decodeProtectedHeader(token).typ).toBe("JWT");
    const { payload } = await jwtVerify(token, bridge.publicKey, { issuer: bridgeIssuer, audience: bridgeAudience });
    expect(payload.sub).toBe("user_test");
    expect(payload.client_id).toBe("client_game");
    expect(payload.exp! - payload.iat!).toBe(300);
  });

  it("rejects a token from another WorkOS application", async () => {
    const workos = await generateKeyPair("RS256", { extractable: true });
    const bridge = await generateKeyPair("RS256", { extractable: true });
    const workosJwk = { ...await exportJWK(workos.publicKey), kid: "workos-test", alg: "RS256" };
    const workosToken = await new SignJWT({ client_id: "client_other" })
      .setProtectedHeader({ alg: "RS256", kid: "workos-test" })
      .setIssuer("https://api.workos.com/user_management/client_default")
      .setSubject("user_test")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(workos.privateKey);
    await expect(bridgeWorkosToken(workosToken, createLocalJWKSet({ keys: [workosJwk] }), {
      clientId: "client_game",
      issuerClientId: "client_default",
      privateKey: await exportPKCS8(bridge.privateKey),
    })).rejects.toThrow("Incorrect WorkOS application");
  });
});
