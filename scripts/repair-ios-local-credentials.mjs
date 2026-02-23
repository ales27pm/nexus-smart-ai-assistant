#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const credentialsPath = path.join(root, "credentials.json");
const isMacOS = os.platform() === "darwin";

const args = new Set(process.argv.slice(2));
const shouldWrite = args.has("--repair") || args.has("--write");
const checkOnly = args.has("--check") || !shouldWrite;

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function run(cmd, argsList, options = {}) {
  return spawnSync(cmd, argsList, { encoding: "utf8", ...options });
}

function toolMissing(r) {
  return r?.status === null || r?.error?.code === "ENOENT";
}

function normalizeSha1Fingerprint(s) {
  const m = String(s).match(/([A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){19})/);
  const hex = m ? m[1] : s;
  return String(hex)
    .replace(/[^A-Fa-f0-9]/g, "")
    .toUpperCase();
}

function sha1Hex(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex").toUpperCase();
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eas-creds-repair-"));
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

function decodeBase64Maybe(b64) {
  return Buffer.from(String(b64), "base64");
}

function extractCertPemFromP12(p12Path, password) {
  const tryArgs = (legacy) => [
    "pkcs12",
    "-in",
    p12Path,
    "-passin",
    `pass:${password}`,
    "-clcerts",
    "-nokeys",
    ...(legacy ? ["-legacy"] : []),
  ];

  const r1 = run("openssl", tryArgs(true));
  const r2 = r1.status === 0 ? r1 : run("openssl", tryArgs(false));

  if (toolMissing(r2)) fail("openssl not found on PATH.");
  if (r2.status !== 0) {
    throw new Error(
      `openssl cannot read certificate from P12 (wrong password / corrupted p12): ${String(r2.stderr).trim()}`,
    );
  }
  return r2.stdout;
}

function getP12Fingerprint(p12Path, password) {
  const tmp = mkTmpDir();
  try {
    const certPem = extractCertPemFromP12(p12Path, password);
    const pemPath = path.join(tmp, "cert.pem");
    fs.writeFileSync(pemPath, certPem, "utf8");

    const r = run("openssl", [
      "x509",
      "-in",
      pemPath,
      "-noout",
      "-fingerprint",
      "-sha1",
    ]);
    if (toolMissing(r)) fail("openssl not found on PATH.");
    if (r.status !== 0) {
      throw new Error(
        `openssl x509 fingerprint failed: ${String(r.stderr).trim()}`,
      );
    }

    return normalizeSha1Fingerprint(r.stdout);
  } finally {
    rmrf(tmp);
  }
}

function createTempKeychain() {
  const tmp = mkTmpDir();
  const keychain = path.join(tmp, "eas-temp.keychain");
  const kcPass = crypto.randomBytes(12).toString("hex");

  const r1 = run("security", ["create-keychain", "-p", kcPass, keychain]);
  if (toolMissing(r1))
    fail("macOS `security` tool not found (must run on macOS).");
  if (r1.status !== 0) {
    throw new Error(`security create-keychain failed: ${r1.stderr}`);
  }

  run("security", ["set-keychain-settings", "-lut", "21600", keychain]);
  const r2 = run("security", ["unlock-keychain", "-p", kcPass, keychain]);
  if (r2.status !== 0) {
    throw new Error(`security unlock-keychain failed: ${r2.stderr}`);
  }

  return { tmp, keychain, kcPass };
}

function keychainImportAndFindIdentity(p12Path, password, fingerprint) {
  const { tmp, keychain, kcPass } = createTempKeychain();
  try {
    const imp = run("security", [
      "import",
      p12Path,
      "-k",
      keychain,
      "-P",
      password,
      "-A",
      "-T",
      "/usr/bin/codesign",
      "-T",
      "/usr/bin/security",
    ]);
    if (imp.status !== 0) {
      return {
        ok: false,
        reason: `security import failed: ${String(imp.stderr).trim()}`,
      };
    }

    run("security", [
      "set-key-partition-list",
      "-S",
      "apple-tool:,apple:",
      "-s",
      "-k",
      kcPass,
      keychain,
    ]);

    const ids = run("security", [
      "find-identity",
      "-v",
      "-p",
      "codesigning",
      keychain,
    ]);
    if (ids.status !== 0) {
      return {
        ok: false,
        reason: `security find-identity failed: ${String(ids.stderr).trim()}`,
      };
    }

    const lines = String(ids.stdout).split("\n");
    const hashes = lines
      .map((l) => l.match(/\)\s*([A-F0-9]{40})\s*"/))
      .filter(Boolean)
      .map((m) => m[1]);

    const ok = hashes.includes(fingerprint);
    return ok
      ? { ok: true }
      : {
          ok: false,
          reason:
            `Imported, but fingerprint not found in keychain identities.\n` +
            `Found identities:\n${lines.filter((l) => l.includes('"')).join("\n")}`,
        };
  } finally {
    try {
      run("security", ["delete-keychain", keychain]);
    } catch {
      // best-effort cleanup
    }
    rmrf(tmp);
  }
}

function repackP12Legacy(originalP12Path, password, outP12Path) {
  const tmp = mkTmpDir();
  try {
    const pemPath = path.join(tmp, "all.pem");

    const r1 = run("openssl", [
      "pkcs12",
      "-in",
      originalP12Path,
      "-nodes",
      "-passin",
      `pass:${password}`,
      "-out",
      pemPath,
    ]);
    const r2 =
      r1.status === 0
        ? r1
        : run("openssl", [
            "pkcs12",
            "-legacy",
            "-in",
            originalP12Path,
            "-nodes",
            "-passin",
            `pass:${password}`,
            "-out",
            pemPath,
          ]);

    if (r2.status !== 0) {
      throw new Error(
        `openssl pkcs12 extract failed: ${String(r2.stderr).trim()}`,
      );
    }

    const exp = run("openssl", [
      "pkcs12",
      "-export",
      "-legacy",
      "-in",
      pemPath,
      "-out",
      outP12Path,
      "-passout",
      `pass:${password}`,
    ]);
    if (exp.status !== 0) {
      throw new Error(
        `openssl pkcs12 export -legacy failed: ${String(exp.stderr).trim()}`,
      );
    }
  } finally {
    rmrf(tmp);
  }
}

function findCredentialNodes(obj) {
  const certNodes = [];
  const profileNodes = [];

  const walk = (node) => {
    if (!node || typeof node !== "object") return;

    if (
      node.distributionCertificate &&
      typeof node.distributionCertificate === "object"
    ) {
      certNodes.push(node.distributionCertificate);
    }

    if (typeof node.provisioningProfilePath === "string") {
      profileNodes.push({ type: "path", value: node.provisioningProfilePath });
    }
    if (typeof node.provisioningProfileBase64 === "string") {
      profileNodes.push({
        type: "base64",
        value: node.provisioningProfileBase64,
      });
    }

    for (const value of Object.values(node)) walk(value);
  };

  walk(obj);
  return { certNodes, profileNodes };
}

function decodeProvisioningProfileToPlist(profileBuf) {
  const tmp = mkTmpDir();
  const mp = path.join(tmp, "profile.mobileprovision");
  fs.writeFileSync(mp, profileBuf);

  const r = run("security", ["cms", "-D", "-i", mp]);
  if (toolMissing(r)) fail("macOS `security` tool missing.");
  if (r.status !== 0)
    throw new Error(`security cms decode failed: ${String(r.stderr).trim()}`);

  rmrf(tmp);
  return r.stdout;
}

function extractDevCertFingerprintsFromProfilePlist(plistXml) {
  const block = plistXml.match(
    /<key>DeveloperCertificates<\/key>\s*<array>([\s\S]*?)<\/array>/,
  );
  if (!block) return [];
  const dataMatches = [...block[1].matchAll(/<data>\s*([\s\S]*?)\s*<\/data>/g)];
  const certs = dataMatches.map((m) => m[1].replace(/\s+/g, ""));
  const fps = [];
  for (const b64 of certs) {
    try {
      const der = Buffer.from(b64, "base64");
      fps.push(sha1Hex(der));
    } catch {
      // ignore malformed data block
    }
  }
  return fps;
}

if (!fs.existsSync(credentialsPath)) {
  fail("credentials.json missing in project root.");
}

if (!isMacOS) {
  console.warn(
    "⚠️ iOS keychain import checks are only available on macOS; skipping credential import validation.",
  );
  process.exit(0);
}

let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
} catch (e) {
  fail(`credentials.json invalid JSON: ${e.message}`);
}

const { certNodes, profileNodes } = findCredentialNodes(
  credentials.ios ?? credentials,
);
if (certNodes.length === 0) {
  fail("No distributionCertificate found in credentials.json.");
}

let changed = false;
let needsRepair = false;
const backupPath = credentialsPath + ".bak";

for (const cert of certNodes) {
  const password = cert.password;
  if (typeof password !== "string" || !password) {
    fail(
      "distributionCertificate.password missing/invalid in credentials.json.",
    );
  }

  let p12Buf;
  let p12PathOnDisk = null;
  let isPath = false;

  if (typeof cert.path === "string") {
    const abs = path.resolve(root, cert.path);
    if (!fs.existsSync(abs))
      fail(`distributionCertificate.path not found: ${cert.path}`);
    p12Buf = fs.readFileSync(abs);
    p12PathOnDisk = abs;
    isPath = true;
  } else if (typeof cert.dataBase64 === "string") {
    p12Buf = decodeBase64Maybe(cert.dataBase64);
  } else {
    fail("distributionCertificate must have either .path or .dataBase64");
  }

  const tmp = mkTmpDir();
  const origP12 = path.join(tmp, "orig.p12");
  fs.writeFileSync(origP12, p12Buf);

  let fp;
  try {
    fp = getP12Fingerprint(origP12, password);
  } catch (e) {
    rmrf(tmp);
    fail(`Cannot read P12 certificate with password: ${e.message}`);
  }

  const t1 = keychainImportAndFindIdentity(origP12, password, fp);
  if (t1.ok) {
    console.log(`✅ P12 import OK for fingerprint ${fp}`);
    rmrf(tmp);
    continue;
  }

  needsRepair = true;
  console.warn(`⚠️ P12 import FAILED for fingerprint ${fp}`);
  console.warn(`   Reason: ${t1.reason}`);

  const fixedP12 = path.join(tmp, "fixed-legacy.p12");
  try {
    repackP12Legacy(origP12, password, fixedP12);
  } catch (e) {
    rmrf(tmp);
    fail(`Unable to repack P12 with openssl -legacy: ${e.message}`);
  }

  const fp2 = getP12Fingerprint(fixedP12, password);
  const t2 = keychainImportAndFindIdentity(fixedP12, password, fp2);
  if (!t2.ok) {
    rmrf(tmp);
    fail(
      `Repacked legacy P12 STILL fails to import.\n` +
        `This usually means the P12/private key is broken or mismatched.\n` +
        `Fix: create/export the .p12 on macOS Keychain Access (not Windows/OpenSSL), then regenerate the provisioning profile accordingly.`,
    );
  }

  console.log(`✅ Repacked legacy P12 imports OK (${fp2})`);

  if (checkOnly) {
    console.warn(
      "⚠️ Repair is available but --check mode is active; no files were modified.",
    );
    rmrf(tmp);
    continue;
  }

  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(credentialsPath, backupPath);
  }

  if (isPath) {
    const legacyPath = p12PathOnDisk.replace(/\.p12$/i, "") + ".legacy.p12";
    fs.copyFileSync(fixedP12, legacyPath);
    cert.path = path.relative(root, legacyPath);
    console.log(`✅ Wrote legacy P12 to: ${legacyPath}`);
  } else {
    const fixedBuf = fs.readFileSync(fixedP12);
    cert.dataBase64 = fixedBuf.toString("base64");
    console.log(
      "✅ Updated distributionCertificate.dataBase64 with legacy P12 bytes",
    );
  }

  changed = true;
  rmrf(tmp);
}

try {
  if (profileNodes.length) {
    console.log(
      "\n[i] Checking provisioning profile DeveloperCertificates match…",
    );
    const cert = certNodes[0];
    const password = cert.password;
    const tmp = mkTmpDir();
    const p12 = path.join(tmp, "check.p12");

    if (typeof cert.path === "string") {
      fs.writeFileSync(p12, fs.readFileSync(path.resolve(root, cert.path)));
    } else if (typeof cert.dataBase64 === "string") {
      fs.writeFileSync(p12, decodeBase64Maybe(cert.dataBase64));
    }
    const fp = getP12Fingerprint(p12, password);

    for (const p of profileNodes) {
      const profBuf =
        p.type === "path"
          ? fs.readFileSync(path.resolve(root, p.value))
          : decodeBase64Maybe(p.value);

      const plist = decodeProvisioningProfileToPlist(profBuf);
      const fps = extractDevCertFingerprintsFromProfilePlist(plist);
      if (!fps.length) {
        console.warn(
          "⚠️ Could not extract DeveloperCertificates from provisioning profile plist.",
        );
        continue;
      }

      if (!fps.includes(fp)) {
        console.warn(
          `⚠️ Provisioning profile does NOT include distribution cert fingerprint ${fp}`,
        );
        console.warn(
          "   Fix: regenerate the provisioning profile for the same distribution certificate.",
        );
      } else {
        console.log(`✅ Provisioning profile includes cert fingerprint ${fp}`);
      }
    }

    rmrf(tmp);
  }
} catch (e) {
  console.warn(`⚠️ Provisioning profile match check skipped: ${e.message}`);
}

if (changed) {
  fs.writeFileSync(
    credentialsPath,
    JSON.stringify(credentials, null, 2) + "\n",
  );
  console.log(
    `\n✅ Updated credentials.json (backup: ${path.basename(backupPath)})`,
  );
} else if (needsRepair && checkOnly) {
  fail(
    "Credential import failures detected. Re-run with `node ./scripts/repair-ios-local-credentials.mjs --repair` to apply automatic fixes.",
  );
} else {
  console.log("\n✅ credentials.json OK (no changes needed)");
}
