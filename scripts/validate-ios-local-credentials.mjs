#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const credentialsPath = path.join(root, "credentials.json");

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...options });
}

if (!fs.existsSync(credentialsPath)) {
  fail("credentials.json is missing in project root.");
}

let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
} catch (error) {
  fail(`credentials.json is not valid JSON: ${error.message}`);
}

const certs = [];
const profiles = [];

function walk(node) {
  if (!node || typeof node !== "object") return;

  if (typeof node.provisioningProfilePath === "string") {
    profiles.push(node.provisioningProfilePath);
  }

  if (
    node.distributionCertificate &&
    typeof node.distributionCertificate === "object"
  ) {
    const cert = node.distributionCertificate;
    if (typeof cert.path === "string") {
      certs.push({ path: cert.path, password: cert.password ?? "" });
    }
  }

  for (const value of Object.values(node)) {
    walk(value);
  }
}

walk(credentials.ios ?? credentials);

if (certs.length === 0) {
  fail("No iOS distributionCertificate.path found in credentials.json.");
}

for (const cert of certs) {
  const certPath = path.resolve(root, cert.path);
  if (!fs.existsSync(certPath)) {
    fail(`Distribution certificate file not found: ${cert.path}`);
  }

  if (os.platform() === "darwin") {
    const commonArgs = [
      "pkcs12",
      "-in",
      certPath,
      "-nokeys",
      "-passin",
      `pass:${cert.password ?? ""}`,
    ];
    const firstTry = run("openssl", [...commonArgs, "-legacy"]);
    const secondTry =
      firstTry.status === 0 ? firstTry : run("openssl", commonArgs);

    if (secondTry.status !== 0) {
      fail(
        [
          `Cannot read P12 certificate ${cert.path} with the password from credentials.json.`,
          'This often causes EAS local build failures like "Distribution certificate ... has not been imported successfully".',
          "Re-download credentials via `eas credentials -p ios`, or create a new distribution certificate and update credentials.json.",
        ].join(" "),
      );
    }
  }
}

for (const profilePathRaw of profiles) {
  const profilePath = path.resolve(root, profilePathRaw);
  if (!fs.existsSync(profilePath)) {
    fail(`Provisioning profile file not found: ${profilePathRaw}`);
  }

  if (os.platform() === "darwin") {
    const result = run("security", ["cms", "-D", "-i", profilePath]);
    if (result.status !== 0) {
      fail(
        `Provisioning profile could not be parsed by macOS security tool: ${profilePathRaw}`,
      );
    }
  }
}

console.log(
  `✅ iOS credential validation passed (${certs.length} certificate(s), ${profiles.length} profile(s))`,
);
