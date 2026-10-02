// Add ready test guests to a lobby on the exact Convex URL selected below.
// Run: node scripts/fill-local-room.mjs ROOM_CODE [5|6]
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const code = process.argv[2]?.toUpperCase();
if (!/^[A-Z2-9]{6}$/.test(code ?? "")) throw new Error("Pass a six-character room code.");
const count = Number(process.argv[3] ?? 5);
if (![5, 6].includes(count)) throw new Error("Choose five guests, or six when the room organizer sits out as moderator.");
const targetUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
const client = new ConvexHttpClient(targetUrl);
const hostname = new URL(targetUrl).hostname;
const local = hostname === "127.0.0.1" || hostname === "localhost";
const deployment = local ? "local" : hostname.endsWith(".convex.cloud") ? hostname.slice(0, -".convex.cloud".length) : process.env.CONVEX_DEPLOYMENT_NAME;
if (!deployment) throw new Error("Set CONVEX_DEPLOYMENT_NAME to the Convex deployment for this URL.");
const sessionsPath = fileURLToPath(new URL("../.mafia-test-seats.json", import.meta.url));
let sessions;
try { sessions = JSON.parse(await readFile(sessionsPath, "utf8")); }
catch (error) {
  if (error?.code !== "ENOENT") throw error;
  sessions = {};
}
const sessionKey = `${targetUrl}|${code}`;
sessions[sessionKey] ??= local ? sessions[code] ?? {} : {};
const names = ["Meera", "Aarav", "Isha", "Kabir", "Tara", "Rohan"].slice(0, count);
const candidates = await Promise.all(names.map(async name => {
  const savedSecret = sessions[sessionKey][name];
  const secret = savedSecret ?? randomBytes(32).toString("hex");
  const admitted = await client.query(api.invitations.status, { secret });
  return { name, secret, savedSecret, admitted };
}));
const missingInvites = candidates.filter(candidate => !candidate.admitted).map(candidate => {
  const inviteCode = randomBytes(16).toString("hex");
  return { ...candidate, inviteCode, codeHash: createHash("sha256").update(inviteCode).digest("hex") };
});
if (missingInvites.length) {
  const result = spawnSync("npx", ["convex", "run", "invitations:issueBatch", JSON.stringify({ codes: missingInvites.map(({ name, codeHash }) => ({ label: `Test ${name}`, codeHash })) }), ...(local ? [] : ["--deployment", deployment])], { encoding: "utf8", env: local ? { ...process.env, CONVEX_AGENT_MODE: process.env.CONVEX_AGENT_MODE || "anonymous" } : process.env });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || "Could not issue test invitations.");
  for (const candidate of missingInvites) await client.mutation(api.invitations.redeem, { secret: candidate.secret, code: candidate.inviteCode });
}
let added = 0;
let refreshed = 0;
for (const { name, secret, savedSecret } of candidates) {
  try {
    const { gameId } = await client.mutation(api.games.join, { code, name, secret });
    if (!savedSecret) {
      sessions[sessionKey][name] = secret;
      await writeFile(sessionsPath, JSON.stringify(sessions), { mode: 0o600 });
    }
    await client.mutation(api.games.ready, { gameId, secret, ready: true });
    if (savedSecret) refreshed++; else added++;
    console.log(`${name} ${savedSecret ? "refreshed" : "joined"} and is ready.`);
  } catch (error) {
    if (String(error).includes("This game has started")) throw new Error("This room has already started. Create a new lobby to add test seats.", { cause: error });
    if (String(error).includes("This room is full")) throw new Error("This room is full. Remove old test seats in the lobby before trying again.", { cause: error });
    if (String(error).includes("Someone already uses that name")) throw new Error(`${name} has an old test seat that this helper cannot refresh. Remove the old test seats in the lobby, or create a new room, then rerun this command.`, { cause: error });
    throw error;
  }
}
console.log(`Done: ${added} new test ${added === 1 ? "seat" : "seats"}, ${refreshed} refreshed. Rerun before starting if anyone shows Reconnecting.`);
