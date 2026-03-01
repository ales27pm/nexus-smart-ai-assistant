#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const manifestPath = path.join(repoRoot, "coreml-config.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const modelName = manifest?.activeModel;

if (typeof modelName !== "string" || modelName.trim().length === 0) {
  console.error("[coreml-inspect] Invalid activeModel in coreml-config.json");
  process.exit(1);
}

const modelPath = path.join(
  repoRoot,
  "modules/expo-coreml-llm/ios/resources/models",
  modelName,
);

const inspectScript = path.join(
  repoRoot,
  "scripts/coreml/inspect_coreml_io.py",
);
const args = [
  inspectScript,
  modelPath,
  "--expect-input",
  "input_ids",
  "--expect-input",
  "attention_mask",
  "--expect-input",
  "cache_position",
  "--expect-output",
  "logits",
];

const result = spawnSync("python3", args, {
  cwd: repoRoot,
  stdio: "inherit",
  encoding: "utf8",
});

process.exit(result.status ?? 1);
