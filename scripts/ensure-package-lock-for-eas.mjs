#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const lockPath = path.resolve(process.cwd(), "package-lock.json");
const extraLockfiles = ["bun.lock", "yarn.lock", "pnpm-lock.yaml"];

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

const foundExtraLockfiles = extraLockfiles.filter((file) =>
  fs.existsSync(path.resolve(process.cwd(), file)),
);

if (foundExtraLockfiles.length > 0) {
  fail(
    `Found additional lockfile(s): ${foundExtraLockfiles.join(
      ", ",
    )}. Keep only package-lock.json to avoid inconsistent dependency resolution in EAS builds.`,
  );
}

let lockfile;
const parseLockfile = () => {
  const raw = fs.readFileSync(lockPath, "utf8");
  const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(normalized);
};

try {
  lockfile = parseLockfile();
} catch {
  log(
    "package-lock.json could not be parsed as JSON; regenerating it with npm install --package-lock-only.",
  );
  try {
    execSync("npm install --package-lock-only --no-audit --ignore-scripts", {
      stdio: "inherit",
    });
    lockfile = parseLockfile();
  } catch {
    fail(
      "package-lock.json exists but could not be parsed as JSON, and regeneration failed.",
    );
  }
}

if (
  !Number.isInteger(lockfile.lockfileVersion) ||
  lockfile.lockfileVersion < 1
) {
  fail("package-lock.json is present but has an unsupported lockfileVersion.");
}

log(`package-lock.json ready (lockfileVersion=${lockfile.lockfileVersion}).`);
