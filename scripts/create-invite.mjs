// Run: node scripts/create-invite.mjs "Friend name" [--prod]
// Uses the Convex CLI's administrator access. The raw code never appears in CLI arguments.
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const prod = process.argv.includes("--prod");
const label = process.argv.slice(2).filter(arg => arg !== "--prod").join(" ").trim();
if (label.length < 2 || label.length > 40) throw new Error('Pass a label, e.g. node scripts/create-invite.mjs "Meera" --prod');

const code = randomBytes(16).toString("hex");
const codeHash = createHash("sha256").update(code).digest("hex");
const command = ["convex", "run", "invitations:issue", JSON.stringify({ codeHash, label }), ...(prod ? ["--prod"] : [])];
const result = spawnSync("npx", command, { encoding: "utf8", env: process.env });
if (result.error || result.status !== 0) {
  console.error(result.stderr || result.stdout || result.error?.message || "Could not issue invitation.");
  process.exit(1);
}
console.log(`Invitation for ${label}: ${code.toUpperCase().match(/.{1,4}/g).join("-")}`);
console.log(`Invitation ID (save for revocation): ${result.stdout.trim()}`);
console.log("Expires if unused after 7 days. The invited person pastes this code into the site once.");
