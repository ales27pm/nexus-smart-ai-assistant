#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  getIOExpectationsFromManifest,
  readCoreMLManifest,
} from "./coreml_manifest.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function resolveModelPath(argv, manifest) {
  const explicitPath = argv[0];
  const defaultPath = path.join(
    repoRoot,
    ".hf_models/Dolphin3.0-CoreML",
    manifest.activeModel,
  );

  const modelPath = explicitPath
    ? path.resolve(process.cwd(), explicitPath)
    : defaultPath;

  try {
    await access(modelPath);
    return modelPath;
  } catch {
    const source = explicitPath
      ? `provided argument: ${explicitPath}`
      : "default local cache derived from coreml-config.json";
    throw new Error(
      `Model path does not exist (${source}): ${modelPath}. Pass an explicit local .mlpackage path, e.g. npm run coreml:inspect -- /absolute/path/to/model.mlpackage`,
    );
  }
}

const { manifest } = await readCoreMLManifest(repoRoot);
const io = getIOExpectationsFromManifest(manifest);
const modelPath = await resolveModelPath(process.argv.slice(2), manifest);

const inspectScript = path.join(
  repoRoot,
  "scripts/coreml/inspect_coreml_io.py",
);
const args = [
  inspectScript,
  modelPath,
  "--expect-input",
  io.inputIdsName,
  "--expect-input",
  io.attentionMaskName,
  "--expect-input",
  io.cachePositionName,
  "--expect-output",
  io.logitsName,
  "--strict",
];

const result = spawnSync("python3", args, {
  cwd: repoRoot,
  stdio: "inherit",
  encoding: "utf8",
});

process.exit(result.status ?? 1);
