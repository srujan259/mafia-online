import { MafiaApp } from "@/components/mafia-app";
import { withAuth } from "@workos-inc/authkit-nextjs";

export default async function Page() {
  const authkitConfigured = Boolean(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_COOKIE_PASSWORD && process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
  if (!authkitConfigured) return <MafiaApp />;
  const { accessToken: _accessToken, ...initialAuth } = await withAuth();
  return <MafiaApp authkitConfigured initialAuth={initialAuth} />;
}
