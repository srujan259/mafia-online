import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";

const callback = handleAuth();

export async function GET(request: NextRequest) {
  if (!(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_COOKIE_PASSWORD && process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI)) return new Response("Sign-in is not configured.", { status: 404 });
  return callback(request);
}
