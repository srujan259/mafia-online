import type { AuthConfig } from "convex/server";

// Public half of the key stored as MAFIA_AUTH_PRIVATE_KEY on the deployment.
// WorkOS session tokens omit the JWT `typ` header required by Convex, so
// authBridge.exchange verifies WorkOS and signs a short-lived token for Convex.
export const bridgeIssuer = "https://mafia-online-pearl.vercel.app/convex-auth";
export const bridgeAudience = "mafia-convex";
export const bridgeKeyId = "mafia-bridge-2026-10";
const bridgeJwks = "eyJrZXlzIjpbeyJrdHkiOiJSU0EiLCJuIjoia214bXRINTN2RVNQSkR4eWFZejZHZVZPS3A4SDZxZW5FLVROUF9fTDFNOXZscl9DU0FQbUtfMFRPUDZzTDdhUU1nRVBxNF9La21LUG9tMGtsVzhhcGRSc2k5bkIxM2JxSTQ3dlI2NV9CX3NrUWVfYWZENkppMUp0T0VYTktQeThZeUtWLWd2YkNJYlNZel9SQ01BVjkxUkhtY1VXX25nTllQMEx6ZlN3TEtZUC0tQzZIU0FVRkczdnpIZFA2ZmZTdmV5N0VmV3lnRmRqYWFlUXJUR0M1cXRaWXN1RFlvQUVnQlNMOUFkdHdzaV9FNEZpRFljUWhEQ3E1MmxwakFhMlNUVHpFWTN3ZjNPNUxDb2NydFVEVnZtbUhxMWlHY3c4NW9raGVKa19nNG13LVJmUXVyZlFCMDc5c3ZMbEhwVVQxVUpRWVhoTWJENFF3SmF0elpmaTVRIiwiZSI6IkFRQUIiLCJraWQiOiJtYWZpYS1icmlkZ2UtMjAyNi0xMCIsImFsZyI6IlJTMjU2IiwidXNlIjoic2lnIn1dfQ==";

export default {
  providers: [{
    type: "customJwt",
    issuer: bridgeIssuer,
    applicationID: bridgeAudience,
    algorithm: "RS256",
    jwks: `data:text/plain;charset=utf-8;base64,${bridgeJwks}`,
  }],
} satisfies AuthConfig;
