#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

import { sha256 } from "js-sha256";

const CHUNK_SIZE_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = token.split("=", 2);
    const nextToken = argv[index + 1];
    const value =
      inlineValue ??
      (nextToken && !nextToken.startsWith("--") ? nextToken : true);

    if (value === nextToken && inlineValue === undefined) {
      index += 1;
    }

    parsed[key.slice(2)] = value;
  }

  return parsed;
}

function toBooleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }

  return false;
}

function normalizeManifestVersion(manifest, requestedVersionId) {
  if (requestedVersionId) {
    const version = manifest.versions.find(
      (entry) => entry.id === requestedVersionId,
    );
    if (!version) {
      throw new Error(
        `Version '${requestedVersionId}' was not found in manifest. Available: ${manifest.versions
          .map((entry) => entry.id)
          .join(", ")}`,
      );
    }

    return version;
  }

  const activeVersion = manifest.versions.find(
    (entry) => entry.id === manifest.activeVersionId,
  );

  if (!activeVersion) {
    throw new Error(
      `Active version '${manifest.activeVersionId}' was not found in manifest.`,
    );
  }

  return activeVersion;
}

function resolveAssetPathWithinRoot(assetsRoot, relativePath) {
  const rootPath = path.resolve(assetsRoot);
  const absolutePath = path.resolve(rootPath, relativePath);
  const relativeToRoot = path.relative(rootPath, absolutePath);

  if (
    relativeToRoot === "" ||
    (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot))
  ) {
    return absolutePath;
  }

  throw new Error(
    `Manifest path escapes assets root: '${relativePath}' is outside '${rootPath}'.`,
  );
}

async function computeSha256ForFile(filePath) {
  const handle = await fs.open(filePath, "r");
  const hasher = sha256.create();
  const buffer = Buffer.alloc(CHUNK_SIZE_BYTES);

  try {
    let bytesRead = 0;
    let position = 0;

    do {
      const readResult = await handle.read(
        buffer,
        0,
        CHUNK_SIZE_BYTES,
        position,
      );
      bytesRead = readResult.bytesRead;
      if (bytesRead > 0) {
        hasher.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
    } while (bytesRead > 0);

    return hasher.hex();
  } finally {
    await handle.close();
  }
}

async function verifyAssets({
  manifestPath,
  assetsRoot,
  versionId,
  deleteCorrupted,
}) {
  const manifestJson = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const version = normalizeManifestVersion(manifestJson, versionId);
  const failures = [];

  for (const file of version.files) {
    let absolutePath;
    try {
      absolutePath = resolveAssetPathWithinRoot(assetsRoot, file.path);
    } catch (error) {
      failures.push({
        type: "invalid_manifest_path",
        path: file.path,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    let digest;
    try {
      digest = await computeSha256ForFile(absolutePath);
    } catch (error) {
      failures.push({
        type: "missing",
        path: absolutePath,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (digest !== file.sha256) {
      if (deleteCorrupted) {
        await fs.rm(absolutePath, { force: true });
      }

      failures.push({
        type: "sha256_mismatch",
        path: absolutePath,
        expected: file.sha256,
        actual: digest,
      });
    }
  }

  if (failures.length > 0) {
    console.error("[coreml-verify-assets] Verification failed.");
    for (const failure of failures) {
      if (failure.type === "sha256_mismatch") {
        console.error(
          ` - hash mismatch: ${failure.path} expected=${failure.expected} actual=${failure.actual}${deleteCorrupted ? " (deleted corrupted asset)" : ""}`,
        );
      } else if (failure.type === "invalid_manifest_path") {
        console.error(
          ` - invalid manifest path: ${failure.path} (${failure.message})`,
        );
      } else {
        console.error(` - missing asset: ${failure.path} (${failure.message})`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[coreml-verify-assets] Verified ${version.files.length} file(s) for version '${version.id}'.`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(
    String(args.manifest ?? "./coreml-runtime-manifest.json"),
  );
  const assetsRoot = args["assets-root"]
    ? path.resolve(String(args["assets-root"]))
    : null;
  const versionId = args["version-id"] ? String(args["version-id"]) : undefined;
  const deleteCorrupted = toBooleanFlag(args["delete-corrupted"]);

  if (!assetsRoot) {
    throw new Error(
      "Missing required --assets-root argument (directory containing manifest file paths).",
    );
  }

  await verifyAssets({ manifestPath, assetsRoot, versionId, deleteCorrupted });
}

main().catch((error) => {
  console.error("[coreml-verify-assets] Fatal error:", error);
  process.exit(1);
});
