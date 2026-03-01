#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getIOExpectationsFromManifest,
  readCoreMLManifest,
} from "./coreml_manifest.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const { manifest } = await readCoreMLManifest(repoRoot);
const io = getIOExpectationsFromManifest(manifest);

const modelPath = path.join(
  repoRoot,
  "modules/expo-coreml-llm/ios/resources/models",
  manifest.activeModel,
);

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
