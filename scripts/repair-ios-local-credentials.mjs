#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  return res;
}

function trimOrEmpty(s) {
  return (s ?? "").toString().trim();
}

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function readJSON(p) {
  return JSON.parse(readText(p));
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 30; i++) {
    if (fileExists(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function parseArgs(argv) {
  const args = {
    repair: false,
    validate: true,
    credentialsJson: null,
    p12: null,
    profile: null,
    expectedFingerprint: null,
    projectRoot: null,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repair") args.repair = true;
    else if (a === "--no-validate") args.validate = false;
    else if (a === "--credentials-json") args.credentialsJson = argv[++i];
    else if (a === "--p12") args.p12 = argv[++i];
    else if (a === "--profile") args.profile = argv[++i];
    else if (a === "--expected-fingerprint")
      args.expectedFingerprint = argv[++i];
    else if (a === "--project-root") args.projectRoot = argv[++i];
    else die(`❌ Unknown argument: ${a}`);
  }
  return args;
}

function parseDotenvFile(p) {
  if (!fileExists(p)) return {};
  const out = {};
  const lines = readText(p).split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function loadEnvFallbacks(projectRoot) {
  // Load in this order (later overrides earlier):
  const files = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ];
  let env = {};
  for (const f of files) {
    env = { ...env, ...parseDotenvFile(path.join(projectRoot, f)) };
  }
  return env;
}

function relIfPossible(projectRoot, absPath) {
  const rp = path.resolve(projectRoot);
  const ap = path.resolve(absPath);
  if (ap.startsWith(rp + path.sep)) return path.relative(rp, ap);
  return absPath;
}

function autoDetectCredFiles(projectRoot) {
  const base = path.join(projectRoot, "credentials", "ios");
  if (!fileExists(base)) return { p12: null, profile: null };

  const entries = fs.readdirSync(base).map((n) => path.join(base, n));
  const p12s = entries.filter((p) => p.toLowerCase().endsWith(".p12"));
  const profiles = entries.filter((p) =>
    p.toLowerCase().endsWith(".mobileprovision"),
  );

  function pickPreferred(list, preferSubstrings) {
    const lower = list.map((p) => ({ p, l: path.basename(p).toLowerCase() }));
    for (const sub of preferSubstrings) {
      const hit = lower.find((x) => x.l.includes(sub));
      if (hit) return hit.p;
    }
    return list[0] ?? null;
  }

  return {
    p12: pickPreferred(p12s, [
      "dist",
      "distribution",
      "apple_distribution",
      "ios_distribution",
      "cert",
    ]),
    profile: pickPreferred(profiles, [
      "appstore",
      "profile",
      "provision",
      "distribution",
    ]),
  };
}

function opensslFingerprintSHA1(p12Path, p12Password) {
  // Extract leaf cert -> fingerprint. Use -legacy (OpenSSL 3 + RC2).
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p12fp-"));
  const certPem = path.join(tmpDir, "leaf_cert.pem");

  const env = { ...process.env, P12_PASSWORD: p12Password };

  let res = sh(
    "openssl",
    [
      "pkcs12",
      "-legacy",
      "-in",
      p12Path,
      "-clcerts",
      "-nokeys",
      "-passin",
      "env:P12_PASSWORD",
      "-out",
      certPem,
    ],
    { env },
  );
  if (res.status !== 0) {
    // fallback without -legacy
    res = sh(
      "openssl",
      [
        "pkcs12",
        "-in",
        p12Path,
        "-clcerts",
        "-nokeys",
        "-passin",
        "env:P12_PASSWORD",
        "-out",
        certPem,
      ],
      { env },
    );
  }
  if (res.status !== 0) {
    die(
      `❌ openssl failed extracting certificate:\n${res.stderr || res.stdout}`,
    );
  }

  const fpRes = sh("openssl", [
    "x509",
    "-in",
    certPem,
    "-noout",
    "-fingerprint",
    "-sha1",
  ]);
  if (fpRes.status !== 0) {
    die(
      `❌ openssl failed computing fingerprint:\n${fpRes.stderr || fpRes.stdout}`,
    );
  }

  // Format: "sha1 Fingerprint=AA:BB:..."
  const m = fpRes.stdout.match(/Fingerprint=([0-9A-Fa-f:]+)/);
  if (!m) die(`❌ Could not parse fingerprint from:\n${fpRes.stdout}`);
  return m[1].toUpperCase().replace(/:/g, "");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function downloadWWDRG3(tmpDir) {
  // Apple PKI publishes the WWDR G3 intermediate certificate (AppleWWDRCAG3.cer). :contentReference[oaicite:2]{index=2}
  const out = path.join(tmpDir, "AppleWWDRCAG3.cer");
  const url = "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer";
  const res = sh("curl", ["-fsSL", url, "-o", out]);
  if (res.status !== 0) return null;
  return out;
}

function validateP12InTempKeychain(p12Path, p12Password) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eas-kc-"));
  const kcPath = path.join(tmpDir, `codesign-${Date.now()}.keychain-db`);
  const kcPass = `kc-${Math.random().toString(16).slice(2)}-${Date.now()}`;

  const runSec = (args) => sh("security", args);

  // Create + unlock keychain
  let r = runSec(["create-keychain", "-p", kcPass, kcPath]);
  if (r.status !== 0)
    die(`❌ security create-keychain failed:\n${r.stderr || r.stdout}`);

  r = runSec(["set-keychain-settings", "-lut", "21600", kcPath]);
  if (r.status !== 0)
    die(`❌ security set-keychain-settings failed:\n${r.stderr || r.stdout}`);

  r = runSec(["unlock-keychain", "-p", kcPass, kcPath]);
  if (r.status !== 0)
    die(`❌ security unlock-keychain failed:\n${r.stderr || r.stdout}`);

  // Import P12
  r = runSec([
    "import",
    p12Path,
    "-k",
    kcPath,
    "-P",
    p12Password,
    "-A",
    "-T",
    "/usr/bin/codesign",
    "-T",
    "/usr/bin/security",
  ]);
  if (r.status !== 0)
    die(`❌ security import P12 failed:\n${r.stderr || r.stdout}`);

  // IMPORTANT: search THIS keychain (don’t rely on user search list)
  const findIdent = () =>
    runSec(["find-identity", "-p", "codesigning", "-v", kcPath]);

  let ident = findIdent();
  let out = ident.stdout + ident.stderr;

  // If no identities, try importing WWDR G3 intermediate and re-check.
  // Apple documents WWDR intermediate renewals and points to Apple PKI for current certs. :contentReference[oaicite:3]{index=3}
  if (!out.match(/\b[1-9]\d*\)\s+[0-9A-F]{40}\b/)) {
    const wwdr = downloadWWDRG3(tmpDir);
    if (wwdr) {
      const imp = runSec(["import", wwdr, "-k", kcPath, "-A"]);
      // ignore import failure; still proceed to re-check
      void imp;
      ident = findIdent();
      out = ident.stdout + ident.stderr;
    }
  }

  // Parse “N valid identities found”
  const m = out.match(/(\d+)\s+valid identities found/);
  const n = m ? parseInt(m[1], 10) : 0;

  return { ok: n > 0, identitiesOutput: out.trim(), keychainPath: kcPath };
}

function main() {
  const args = parseArgs(process.argv);

  const cwd = process.cwd();
  const projectRoot = path.resolve(args.projectRoot ?? findProjectRoot(cwd));
  const envFallbacks = loadEnvFallbacks(projectRoot);

  const credentialsJsonPath = path.resolve(
    projectRoot,
    args.credentialsJson ?? "credentials.json",
  );

  const existingCreds = fileExists(credentialsJsonPath)
    ? readJSON(credentialsJsonPath)
    : null;

  const auto = autoDetectCredFiles(projectRoot);

  const p12Path = path.resolve(
    projectRoot,
    args.p12 ??
      existingCreds?.ios?.distributionCertificate?.path ??
      auto.p12 ??
      "",
  );
  const profilePath = path.resolve(
    projectRoot,
    args.profile ??
      existingCreds?.ios?.provisioningProfilePath ??
      auto.profile ??
      "",
  );

  if (!args.repair) {
    die("❌ Missing --repair (this script is intentionally explicit).");
  }

  if (!p12Path || !fileExists(p12Path)) {
    die(
      `❌ P12 not found.\n` +
        `   Provide --p12 path/to/cert.p12 OR place it under credentials/ios/\n`,
    );
  }
  if (!profilePath || !fileExists(profilePath)) {
    die(
      `❌ Provisioning profile not found.\n` +
        `   Provide --profile path/to/profile.mobileprovision OR place it under credentials/ios/\n`,
    );
  }

  // Password resolution order:
  // 1) env P12_PASSWORD
  // 2) credentials.json ios.distributionCertificate.password
  // 3) .env / .env.local etc
  const p12Password =
    process.env.P12_PASSWORD ||
    existingCreds?.ios?.distributionCertificate?.password ||
    envFallbacks.P12_PASSWORD;

  if (!p12Password) {
    die(
      `\n❌ Missing P12 password.\n` +
        `Fix options:\n` +
        `  A) export P12_PASSWORD='...'  (recommended)\n` +
        `  B) put P12_PASSWORD=... in .env.local\n` +
        `  C) add ios.distributionCertificate.password in credentials.json\n`,
    );
  }

  // Optional fingerprint verification
  const expectedFp = trimOrEmpty(args.expectedFingerprint).toUpperCase();
  const actualFp = opensslFingerprintSHA1(p12Path, p12Password);

  if (expectedFp && expectedFp !== actualFp) {
    die(
      `❌ P12 fingerprint mismatch.\n   Expected: ${expectedFp}\n   Actual:   ${actualFp}`,
    );
  }

  // Write credentials.json in the format EAS expects for local credentials. :contentReference[oaicite:4]{index=4}
  const credsOut = {
    ios: {
      provisioningProfilePath: relIfPossible(projectRoot, profilePath),
      distributionCertificate: {
        path: relIfPossible(projectRoot, p12Path),
        password: p12Password,
      },
    },
  };

  writeJSON(credentialsJsonPath, credsOut);
  console.log(`✅ Wrote ${credentialsJsonPath}`);
  console.log(
    `   ios.provisioningProfilePath: ${credsOut.ios.provisioningProfilePath}`,
  );
  console.log(
    `   ios.distributionCertificate.path: ${credsOut.ios.distributionCertificate.path}`,
  );
  console.log(`   ios.distributionCertificate.password: (set)`);

  if (args.validate) {
    console.log(
      "\n[i] Validating P12 import into an isolated temp keychain...",
    );
    const v = validateP12InTempKeychain(p12Path, p12Password);
    console.log(v.identitiesOutput ? v.identitiesOutput : "(no output)");

    if (!v.ok) {
      die(
        `\n❌ Imported into temp keychain but no code-signing identity was detected.\n` +
          `   This is usually a chain/trust/keychain-search issue.\n` +
          `   Next steps:\n` +
          `     1) Ensure WWDR intermediate is installed (AppleWWDRCAG3.cer).\n` +
          `     2) Recreate the .p12 from Keychain Access (must include private key).\n`,
      );
    }
    console.log("✅ Temp-keychain import looks usable (identity detected).");
  } else {
    console.log("\n[i] Validation skipped (--no-validate).");
  }

  console.log("\n[next] Run:");
  console.log("  npm run build:prod:ios:local:repair");
}

main();
