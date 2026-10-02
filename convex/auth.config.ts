import type { AuthConfig } from "convex/server";

// Set WORKOS_CLIENT_ID on the target Convex deployment before copying this
// file to convex/auth.config.ts. Convex requires referenced env vars at deploy.
const clientId = process.env.WORKOS_CLIENT_ID!;

export default {
  providers: [
    { type: "customJwt", issuer: "https://api.workos.com/", algorithm: "RS256", jwks: `https://api.workos.com/sso/jwks/${clientId}`, applicationID: clientId },
    { type: "customJwt", issuer: `https://api.workos.com/user_management/${clientId}`, algorithm: "RS256", jwks: `https://api.workos.com/sso/jwks/${clientId}` },
  ],
} satisfies AuthConfig;
