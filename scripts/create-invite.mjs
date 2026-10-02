// Run: node scripts/create-invite.mjs "Friends" [--uses 8] [--deployment NAME | --prod]
// Uses the Convex CLI's administrator access. The raw code never appears in CLI arguments.
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
let prod = false;
let deployment;
let uses = 1;
const labelParts = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--prod") prod = true;
  else if (args[i] === "--deployment") deployment = args[++i];
  else if (args[i] === "--uses") uses = Number(args[++i]);
  else if (args[i].startsWith("--")) throw new Error(`Unknown option: ${args[i]}`);
  else labelParts.push(args[i]);
}
if (prod && deployment) throw new Error("Choose --prod or --deployment NAME, not both.");
if (deployment !== undefined && !/^[a-z0-9-]+$/.test(deployment)) throw new Error("Pass a Convex deployment name after --deployment.");
if (!Number.isInteger(uses) || uses < 1 || uses > 100) throw new Error("--uses must be a whole number from 1 to 100.");
const label = labelParts.join(" ").trim();
if (label.length < 2 || label.length > 40) throw new Error('Pass a label, e.g. node scripts/create-invite.mjs "Meera" --deployment DEPLOYMENT_NAME');
const target = deployment ? ["--deployment", deployment] : prod ? ["--prod"] : [];

// --prod can still resolve to an anonymous local deployment in this checkout.
// Check the server-reported URL before creating a credential or claiming success.
const probe = spawnSync("npx", ["convex", "run", "--inline-query", "return process.env.CONVEX_CLOUD_URL", ...target], { encoding: "utf8", env: process.env });
if (probe.error || probe.status !== 0) {
  console.error(probe.stderr || probe.stdout || probe.error?.message || "Could not inspect the Convex deployment.");
  process.exit(1);
}
let targetUrl;
try { targetUrl = JSON.parse(probe.stdout.trim()); }
catch { throw new Error(`Could not verify the Convex deployment URL: ${probe.stdout.trim()}`); }
if (typeof targetUrl !== "string" || (target.length && !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(targetUrl))) {
  throw new Error(`Invite was not created: ${targetUrl} is not a cloud deployment. Sign in to Convex and use --deployment NAME for the live site.`);
}
if (deployment && targetUrl !== `https://${deployment}.convex.cloud`) throw new Error(`Invite was not created: the CLI selected ${targetUrl}, not ${deployment}.`);

const code = randomBytes(16).toString("hex");
const codeHash = createHash("sha256").update(code).digest("hex");
const command = ["convex", "run", "invitations:issue", JSON.stringify({ codeHash, label, maxClaims: uses }), ...target];
const result = spawnSync("npx", command, { encoding: "utf8", env: process.env });
if (result.error || result.status !== 0) {
  console.error(result.stderr || result.stdout || result.error?.message || "Could not issue invitation.");
  process.exit(1);
}
console.log(`Convex deployment: ${targetUrl}`);
console.log(`Invitation for ${label}: ${code.toUpperCase().match(/.{1,4}/g).join("-")}`);
console.log(`Guest limit: ${uses} ${uses === 1 ? "person" : "people"}`);
console.log(`Invitation ID (save for revocation): ${result.stdout.trim()}`);
console.log("Can be redeemed for 7 days. Each invited person pastes this code into the site on their own browser.");
