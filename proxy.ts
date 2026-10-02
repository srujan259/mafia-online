import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const withAuthKit = authkitProxy({ eagerAuth: true });

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_COOKIE_PASSWORD && process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI)) return NextResponse.next();
  return withAuthKit(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
