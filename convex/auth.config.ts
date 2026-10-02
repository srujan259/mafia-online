import type { AuthConfig } from "convex/server";

const clientId = process.env.WORKOS_CLIENT_ID!;
// In a WorkOS environment with multiple applications, session tokens use the
// default application's client ID in their issuer, not this application's ID.
const issuerClientId = process.env.WORKOS_ISSUER_CLIENT_ID || clientId;

export default {
  providers: [
    { type: "customJwt", issuer: "https://api.workos.com/", algorithm: "RS256", jwks: `https://api.workos.com/sso/jwks/${clientId}`, applicationID: clientId },
    { type: "customJwt", issuer: `https://api.workos.com/user_management/${issuerClientId}`, algorithm: "RS256", jwks: `https://api.workos.com/sso/jwks/${issuerClientId}` },
  ],
} satisfies AuthConfig;
