#!/usr/bin/env node
/**
 * Write credentials.json in the exact format Expo documents for local credentials.
 * Docs: credentials.json + ios.credentialsSource=local  [oai_citation:3‡Expo Documentation](https://docs.expo.dev/app-signing/local-credentials/)
 *
 * Usage:
 *   P12_PASSWORD='...' node scripts/ios/write_credentials_local.mjs \
 *     --p12 credentials/ios/dist-cert.p12 \
 *     --profile credentials/ios/profile.mobileprovision \
 *     --out credentials.json
 */
import fs from "fs";
import path from "path";
import process from "process";

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "1";
      out[k] = v;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const p12Path = args.p12;
const profPath = args.profile;
const outPath = args.out || "credentials.json";

if (!p12Path) die("❌ Missing --p12 path/to/dist-cert.p12");
if (!profPath) die("❌ Missing --profile path/to/profile.mobileprovision");
if (!process.env.P12_PASSWORD) die("❌ Set P12_PASSWORD env var.");

const absP12 = path.resolve(p12Path);
const absProf = path.resolve(profPath);

if (!fs.existsSync(absP12)) die(`❌ P12 not found: ${absP12}`);
if (!fs.existsSync(absProf))
  die(`❌ Provisioning profile not found: ${absProf}`);

const json = {
  ios: {
    provisioningProfilePath: profPath,
    distributionCertificate: {
      path: p12Path,
      password: process.env.P12_PASSWORD,
    },
  },
};

fs.writeFileSync(outPath, JSON.stringify(json, null, 2));
console.log(`✅ Wrote ${outPath}`);
console.log(`   ios.provisioningProfilePath: ${profPath}`);
console.log(`   ios.distributionCertificate.path: ${p12Path}`);
