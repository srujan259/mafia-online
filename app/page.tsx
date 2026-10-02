import { MafiaApp } from "@/components/mafia-app";

export default function Page() {
  const authkitConfigured = Boolean(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_COOKIE_PASSWORD && process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI);
  return <MafiaApp authkitConfigured={authkitConfigured} />;
}
