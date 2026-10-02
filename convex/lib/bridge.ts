import { importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { bridgeAudience, bridgeIssuer, bridgeKeyId } from "../auth.config";

export async function bridgeWorkosToken(
  workosToken: string,
  keys: JWTVerifyGetKey,
  options: { clientId: string; issuerClientId: string; privateKey: string },
) {
  const { payload } = await jwtVerify(workosToken, keys, {
    issuer: `https://api.workos.com/user_management/${options.issuerClientId}`,
    algorithms: ["RS256"],
    clockTolerance: 5,
  });
  if (payload.client_id !== options.clientId || typeof payload.sub !== "string" || !payload.sub.startsWith("user_")) {
    throw new Error("Incorrect WorkOS application or subject");
  }

  const key = await importPKCS8(options.privateKey, "RS256");
  return await new SignJWT({ client_id: options.clientId })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: bridgeKeyId })
    .setIssuer(bridgeIssuer)
    .setAudience(bridgeAudience)
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}
