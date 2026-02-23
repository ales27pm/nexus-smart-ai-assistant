#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const credentialsPath = path.join(root, "credentials.json");

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8" });
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(credentialsPath))
  fail("credentials.json is missing in project root.");

try {
  const creds = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  if (!creds || typeof creds !== "object") {
    fail("credentials.json parsed but does not contain an object.");
  }
} catch (e) {
  fail(`credentials.json invalid JSON: ${e.message}`);
}

const r = run("node", [
  "./scripts/repair-ios-local-credentials.mjs",
  "--check",
]);
if (r.status !== 0) {
  console.error(r.stdout || "");
  console.error(r.stderr || "");
  fail(
    "iOS credential validation failed. Run `node ./scripts/repair-ios-local-credentials.mjs --repair` to auto-fix when possible.",
  );
}

if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
console.log(
  "✅ iOS credential validation passed (temp keychain import check).",
);
