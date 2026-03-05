#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const IOS_TARGET = [18, 0, 0];
const LIB_RELATIVE_PATHS = [
  "node_modules/react-native-executorch/third-party/ios/libs/phonemis/physical-arm64-release/libphonemis.a",
  "node_modules/react-native-executorch/third-party/ios/libs/phonemis/simulator-arm64-debug/libphonemis.a",
];

const LC_BUILD_VERSION = 0x32;

const encodeVersion = ([major, minor, patch]) =>
  ((major & 0xffff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);

const parseDecimal = (input) => {
  const parsed = Number.parseInt(input.trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatVersion = (parts) => parts.join(".");

const patchArchive = (archivePath) => {
  if (!fs.existsSync(archivePath)) {
    console.warn(`[phonemis-ios-target] Skip missing archive: ${archivePath}`);
    return { updated: false, patchedMembers: 0 };
  }

  const targetRaw = encodeVersion(IOS_TARGET);
  const data = fs.readFileSync(archivePath);

  if (data.subarray(0, 8).toString("ascii") !== "!<arch>\n") {
    throw new Error(`Unsupported archive format: ${archivePath}`);
  }

  let offset = 8;
  let patchedMembers = 0;

  while (offset + 60 <= data.length) {
    const header = data.subarray(offset, offset + 60);
    const nameField = header.subarray(0, 16).toString("ascii").trim();
    const size = parseDecimal(header.subarray(48, 58).toString("ascii"));
    const bodyOffset = offset + 60;
    const bodyEnd = bodyOffset + size;

    if (bodyEnd > data.length) {
      throw new Error(`Corrupted archive member detected in ${archivePath}`);
    }

    let objectOffset = bodyOffset;
    if (nameField.startsWith("#1/")) {
      const extendedNameSize = parseDecimal(nameField.slice(3));
      objectOffset += extendedNameSize;
    }

    if (objectOffset + 32 <= bodyEnd) {
      const magicLE = data.readUInt32LE(objectOffset);
      const magicBE = data.readUInt32BE(objectOffset);
      const isMachOLE = magicLE === 0xfeedfacf;
      const isMachOBE = magicBE === 0xfeedfacf;

      if (isMachOLE || isMachOBE) {
        const readU32 = isMachOLE
          ? data.readUInt32LE.bind(data)
          : data.readUInt32BE.bind(data);
        const writeU32 = isMachOLE
          ? data.writeUInt32LE.bind(data)
          : data.writeUInt32BE.bind(data);

        const ncmds = readU32(objectOffset + 16);
        let cmdOffset = objectOffset + 32;

        for (let commandIndex = 0; commandIndex < ncmds; commandIndex += 1) {
          if (cmdOffset + 8 > bodyEnd) {
            break;
          }

          const command = readU32(cmdOffset);
          const cmdsize = readU32(cmdOffset + 4);

          if (cmdsize <= 0 || cmdOffset + cmdsize > bodyEnd) {
            break;
          }

          if (command === LC_BUILD_VERSION && cmdsize >= 24) {
            const minosOffset = cmdOffset + 12;
            const currentRaw = readU32(minosOffset);
            if (currentRaw !== targetRaw) {
              writeU32(targetRaw, minosOffset);
              patchedMembers += 1;
            }
          }

          cmdOffset += cmdsize;
        }
      }
    }

    offset = bodyEnd + (bodyEnd % 2);
  }

  if (patchedMembers > 0) {
    fs.writeFileSync(archivePath, data);
  }

  return { updated: patchedMembers > 0, patchedMembers };
};

const root = process.cwd();
let totalPatchedMembers = 0;

for (const relativePath of LIB_RELATIVE_PATHS) {
  const absolutePath = path.join(root, relativePath);
  const { updated, patchedMembers } = patchArchive(absolutePath);
  totalPatchedMembers += patchedMembers;

  if (updated) {
    console.log(
      `[phonemis-ios-target] Patched ${patchedMembers} Mach-O member(s) in ${relativePath} to min iOS ${formatVersion(IOS_TARGET)}`,
    );
  } else if (fs.existsSync(absolutePath)) {
    console.log(`[phonemis-ios-target] No patch needed for ${relativePath}`);
  }
}

if (totalPatchedMembers > 0) {
  console.log("[phonemis-ios-target] Done.");
}
