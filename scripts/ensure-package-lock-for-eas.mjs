#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const lockPath = path.resolve(process.cwd(), "package-lock.json");

const log = (message) => {
  console.log(`[ensure-package-lock-for-eas] ${message}`);
};

const fail = (message) => {
  console.error(`[ensure-package-lock-for-eas] ${message}`);
  process.exit(1);
};

if (!fs.existsSync(lockPath)) {
  log(
    "package-lock.json is missing; generating it with npm install --package-lock-only.",
  );
  try {
    execSync("npm install --package-lock-only --no-audit --ignore-scripts", {
      stdio: "inherit",
    });
  } catch {
    fail("Failed to generate package-lock.json before EAS npm ci step.");
  }
}

let lockfile;
try {
  lockfile = JSON.parse(fs.readFileSync(lockPath, "utf8"));
} catch {
  fail("package-lock.json exists but could not be parsed as JSON.");
}

if (!Number.isInteger(lockfile.lockfileVersion) || lockfile.lockfileVersion < 1) {
  fail("package-lock.json is present but has an unsupported lockfileVersion.");
}

log(`package-lock.json ready (lockfileVersion=${lockfile.lockfileVersion}).`);
