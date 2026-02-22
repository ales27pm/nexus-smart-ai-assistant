#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const credentialsPath = path.join(root, "credentials.json");
const OPENSSL_TOOL = "openssl";
const OPENSSL_LABEL = "OpenSSL";
const SECURITY_TOOL = "security";
const SECURITY_LABEL = "Security";

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...options });
}

function getToolSpawnError(result) {
  if (!result) return false;
  return result.status === null || result.error?.code === "ENOENT";
}

function formatStderr(stderr, toolLabel) {
  const output = (stderr ?? "").trim();
  if (!output) return "";

  const maxLength = 240;
  const excerpt =
    output.length > maxLength ? `${output.slice(0, maxLength)}...` : output;
  return `${toolLabel} error: ${excerpt}`;
}

function failMissingSystemTool(toolName, purpose, errorMessage) {
  fail(
    [
      `The required system tool \`${toolName}\` could not be started.`,
      purpose,
      `Install \`${toolName}\` and ensure it is available on PATH, then re-run this script.`,
      errorMessage ? `Details: ${errorMessage}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function runWithLegacyFallback(cmd, args) {
  const firstTry = run(cmd, [...args, "-legacy"]);
  const secondTry = firstTry.status === 0 ? firstTry : run(cmd, args);
  return { firstTry, secondTry };
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
      certs.push({ path: cert.path, password: cert.password });
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

  if (typeof cert.password !== "string") {
    fail(
      `distributionCertificate.password is missing or invalid for ${cert.path} in credentials.json. Re-download credentials via \`eas credentials -p ios\` and try again.`,
    );
  }

  if (os.platform() === "darwin") {
    const baseArgs = [
      "pkcs12",
      "-in",
      certPath,
      "-passin",
      `pass:${cert.password}`,
    ];

    const certReadArgs = [...baseArgs, "-clcerts", "-nokeys"];
    const certAttempt = runWithLegacyFallback(OPENSSL_TOOL, certReadArgs);

    if (
      getToolSpawnError(certAttempt.firstTry) ||
      getToolSpawnError(certAttempt.secondTry)
    ) {
      failMissingSystemTool(
        OPENSSL_TOOL,
        "It is required to validate and read the iOS P12 distribution certificate.",
        certAttempt.firstTry.error?.message ??
          certAttempt.secondTry.error?.message,
      );
    }

    if (certAttempt.secondTry.status !== 0) {
      const opensslDetails = formatStderr(
        certAttempt.secondTry.stderr,
        OPENSSL_LABEL,
      );
      fail(
        [
          `Cannot read P12 certificate ${cert.path} with the password from credentials.json.`,
          'This often causes EAS local build failures like "Distribution certificate ... has not been imported successfully".',
          "Re-download credentials via `eas credentials -p ios`, or create a new distribution certificate and update credentials.json.",
          opensslDetails,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }

    const keyReadArgs = [...baseArgs, "-nocerts", "-nodes"];
    const keyAttempt = runWithLegacyFallback(OPENSSL_TOOL, keyReadArgs);

    if (
      getToolSpawnError(keyAttempt.firstTry) ||
      getToolSpawnError(keyAttempt.secondTry)
    ) {
      failMissingSystemTool(
        OPENSSL_TOOL,
        "It is required to validate and read the iOS P12 distribution private key.",
        keyAttempt.firstTry.error?.message ??
          keyAttempt.secondTry.error?.message,
      );
    }

    if (keyAttempt.secondTry.status !== 0) {
      const opensslDetails = formatStderr(
        keyAttempt.secondTry.stderr,
        OPENSSL_LABEL,
      );
      fail(
        [
          `P12 certificate ${cert.path} does not expose a readable private key with the password from credentials.json.`,
          "EAS local builds require a valid certificate + private key identity for keychain import.",
          "Re-download iOS credentials (`eas credentials -p ios`) or regenerate the distribution certificate and update credentials.json.",
          opensslDetails,
        ]
          .filter(Boolean)
          .join(" "),
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
    const result = run(SECURITY_TOOL, ["cms", "-D", "-i", profilePath]);
    if (getToolSpawnError(result)) {
      failMissingSystemTool(
        SECURITY_TOOL,
        "It is required to validate and parse iOS provisioning profiles on macOS.",
        result.error?.message,
      );
    }

    if (result.status !== 0) {
      const securityDetails = formatStderr(result.stderr, SECURITY_LABEL);
      fail(
        [
          `Provisioning profile could not be parsed by macOS security tool: ${profilePathRaw}.`,
          securityDetails,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
  }
}

console.log(
  `✅ iOS credential validation passed (${certs.length} certificate(s), ${profiles.length} profile(s))`,
);
