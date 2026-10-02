import { query } from "./_generated/server";
import { authkitRequired } from "./lib/auth";

export const mode = query({
  args: {},
  handler: () => authkitRequired() ? "authkit" as const : "guest" as const,
});
