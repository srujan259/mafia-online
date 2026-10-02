// Local development helper: add missing named test guests to a lobby.
// Run: node scripts/fill-local-room.mjs ROOM_CODE [5|6]
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const code = process.argv[2]?.toUpperCase();
if (!/^[A-Z2-9]{6}$/.test(code ?? "")) throw new Error("Pass a six-character room code.");
const count = Number(process.argv[3] ?? 5);
if (![5, 6].includes(count)) throw new Error("Choose five guests, or six when the room organizer sits out as moderator.");
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210");
const sessionsPath = fileURLToPath(new URL("../.mafia-test-seats.json", import.meta.url));
let sessions;
try { sessions = JSON.parse(await readFile(sessionsPath, "utf8")); }
catch (error) {
  if (error?.code !== "ENOENT") throw error;
  sessions = {};
}
sessions[code] ??= {};
let added = 0;
let refreshed = 0;
for (const name of ["Meera", "Aarav", "Isha", "Kabir", "Tara", "Rohan"].slice(0, count)) {
  const savedSecret = sessions[code][name];
  const secret = savedSecret ?? randomBytes(32).toString("hex");
  try {
    const { gameId } = await client.mutation(api.games.join, { code, name, secret });
    if (!savedSecret) {
      sessions[code][name] = secret;
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
