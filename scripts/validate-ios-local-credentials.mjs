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

let creds;
try {
  creds = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
} catch (e) {
  fail(`credentials.json invalid JSON: ${e.message}`);
}

if (!creds || typeof creds !== "object") {
  fail("credentials.json parsed but does not contain an object.");
}

const r = run("node", ["./scripts/repair-ios-local-credentials.mjs"]);
if (r.status !== 0) {
  console.error(r.stdout || "");
  console.error(r.stderr || "");
  fail("iOS credential validation/repair failed. See logs above.");
}

console.log(
  "✅ iOS credential validation passed (P12 imports into a temp keychain).",
);
