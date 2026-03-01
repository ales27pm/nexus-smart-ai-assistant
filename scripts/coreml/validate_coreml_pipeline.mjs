#!/usr/bin/env node
import { access, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const strict = argv.includes("--strict");
  return { strict };
}

function assertNonEmptyString(value, key) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function assertNumber(value, key) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }
  return value;
}

function assertComputeUnits(value) {
  const allowed = new Set([
    "all",
    "cpuOnly",
    "cpuAndGPU",
    "cpuAndNeuralEngine",
  ]);
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(
      "computeUnits must be one of all|cpuOnly|cpuAndGPU|cpuAndNeuralEngine",
    );
  }
  return value;
}

function parseManifest(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("manifest must be an object");
  }

  const config = raw;
  return {
    activeModel: assertNonEmptyString(config.activeModel, "activeModel"),
    tokenizerRepo: assertNonEmptyString(config.tokenizerRepo, "tokenizerRepo"),
    coremlRepo: assertNonEmptyString(config.coremlRepo, "coremlRepo"),
    contextLimit: assertNumber(config.contextLimit, "contextLimit"),
    bosTokenId: assertNumber(config.bosTokenId, "bosTokenId"),
    eosTokenId: assertNumber(config.eosTokenId, "eosTokenId"),
    stopTokenIds: config.stopTokenIds,
    computeUnits: assertComputeUnits(config.computeUnits),
  };
}

function buildTokenizerIdSet(tokenizerJson) {
  const ids = new Set();
  const modelVocab = tokenizerJson?.model?.vocab;
  if (modelVocab && typeof modelVocab === "object") {
    for (const value of Object.values(modelVocab)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) ids.add(numeric);
    }
  }

  const addedTokens = tokenizerJson?.added_tokens;
  if (Array.isArray(addedTokens)) {
    for (const token of addedTokens) {
      const numeric = Number(token?.id);
      if (Number.isFinite(numeric)) ids.add(numeric);
    }
  }

  return ids;
}

function validateTokenizerCompatibility(tokenizerJson, manifest) {
  const issues = [];
  const notes = [];

  const modelType = tokenizerJson?.model?.type;
  if (modelType !== "BPE") {
    issues.push(
      `tokenizer.json model.type=${String(modelType)} (expected BPE)`,
    );
  } else {
    notes.push("OK tokenizer.json model.type=BPE (byte-level BPE compatible)");
  }

  const preTokenizer = tokenizerJson?.pre_tokenizer;
  const preTokenizerText = JSON.stringify(preTokenizer ?? {});
  if (!preTokenizerText.includes("ByteLevel")) {
    notes.push(
      "WARN tokenizer pre-tokenizer does not explicitly reference ByteLevel",
    );
  } else {
    notes.push("OK tokenizer pre-tokenizer includes ByteLevel");
  }

  const knownTokenIds = buildTokenizerIdSet(tokenizerJson);
  if (!knownTokenIds.has(manifest.bosTokenId)) {
    issues.push(
      `bosTokenId ${manifest.bosTokenId} not present in tokenizer vocab/added_tokens`,
    );
  }
  if (!knownTokenIds.has(manifest.eosTokenId)) {
    issues.push(
      `eosTokenId ${manifest.eosTokenId} not present in tokenizer vocab/added_tokens`,
    );
  }

  return { issues, notes };
}

function runCoreMLToolsInspection({ repoRoot, modelDir, strict }) {
  const inspectScriptPath = path.join(
    repoRoot,
    "scripts/coreml/inspect_coreml_io.py",
  );
  const pythonCheck = spawnSync("python3", ["--version"], { encoding: "utf8" });
  if (pythonCheck.status !== 0) {
    return {
      issues: strict
        ? ["python3 is unavailable; cannot run deep CoreML IO inspection"]
        : [],
      notes: ["WARN python3 unavailable; skipping deep CoreML IO inspection"],
    };
  }

  const inspectArgs = [
    inspectScriptPath,
    modelDir,
    "--expect-input",
    "input_ids",
    "--expect-input",
    "attention_mask",
    "--expect-input",
    "cache_position",
    "--expect-output",
    "logits",
    "--strict",
  ];

  const result = spawnSync("python3", inspectArgs, {
    encoding: "utf8",
    cwd: repoRoot,
    maxBuffer: 8 * 1024 * 1024,
  });

  const notes = [];
  const issues = [];

  if (result.status === 0) {
    notes.push(
      "OK deep CoreML IO inspection passed via coremltools (expected input/output names present)",
    );
    return { issues, notes };
  }

  const stderr = (result.stderr || "").trim();
  const missingCoreMLTools = stderr.includes("coremltools not installed");
  if (missingCoreMLTools && !strict) {
    notes.push(
      "WARN coremltools not installed; skipping deep CoreML IO inspection",
    );
    return { issues, notes };
  }

  issues.push(
    `Deep CoreML IO inspection failed${stderr ? `: ${stderr.split("\n").slice(-1)[0]}` : ""}`,
  );
  return { issues, notes };
}

async function run() {
  const { strict } = parseArgs(process.argv.slice(2));

  const manifestPath = path.join(repoRoot, "coreml-config.json");
  const rawManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifest = parseManifest(rawManifest);

  if (
    !Array.isArray(manifest.stopTokenIds) ||
    manifest.stopTokenIds.length < 1
  ) {
    throw new Error("stopTokenIds must contain at least one token id");
  }

  const modelDir = path.join(
    repoRoot,
    "modules/expo-coreml-llm/ios/resources/models",
    manifest.activeModel,
  );

  const vocabPath = path.join(
    repoRoot,
    "modules/expo-coreml-llm/ios/resources/tokenizers/gpt2/vocab.json",
  );
  const mergesPath = path.join(
    repoRoot,
    "modules/expo-coreml-llm/ios/resources/tokenizers/gpt2/merges.txt",
  );

  const issues = [];
  const notes = [];

  const tokenizerCacheDir = path.join(
    repoRoot,
    ".hf_tokenizer_cache/dolphin_llama3_2_3b",
  );
  const tokenizerJsonPath = path.join(tokenizerCacheDir, "tokenizer.json");

  const modelExists = await exists(modelDir);
  if (!modelExists) {
    const message = `Model asset missing: ${path.relative(repoRoot, modelDir)}`;
    if (strict) issues.push(message);
    else notes.push(`WARN ${message}`);
  }

  if (modelExists) {
    const modelStats = await stat(modelDir);
    if (!modelStats.isDirectory()) {
      issues.push(`Model path exists but is not a directory: ${modelDir}`);
    }

    const modelMilPath = path.join(modelDir, "Data/com.apple.CoreML/model.mil");
    if (!(await exists(modelMilPath))) {
      notes.push(
        `WARN model.mil not found at expected path (${path.relative(repoRoot, modelMilPath)}).`,
      );
    }

    const deepInspection = runCoreMLToolsInspection({
      repoRoot,
      modelDir,
      strict,
    });
    issues.push(...deepInspection.issues);
    notes.push(...deepInspection.notes);
  }

  if (await exists(tokenizerJsonPath)) {
    const tokenizerJson = JSON.parse(await readFile(tokenizerJsonPath, "utf8"));
    const compatibility = validateTokenizerCompatibility(
      tokenizerJson,
      manifest,
    );
    issues.push(...compatibility.issues);
    notes.push(...compatibility.notes);
  } else {
    notes.push(
      `WARN tokenizer.json missing in cache (${path.relative(repoRoot, tokenizerJsonPath)}); run npm run coreml:fetch to validate tokenizer-model compatibility.`,
    );
  }

  for (const tokenizerPath of [vocabPath, mergesPath]) {
    if (!(await exists(tokenizerPath))) {
      issues.push(
        `Tokenizer asset missing: ${path.relative(repoRoot, tokenizerPath)}`,
      );
      continue;
    }
    const tokenizerStats = await stat(tokenizerPath);
    if (!tokenizerStats.isFile() || tokenizerStats.size === 0) {
      issues.push(
        `Tokenizer asset is empty or invalid: ${path.relative(repoRoot, tokenizerPath)}`,
      );
    } else {
      notes.push(
        `OK ${path.relative(repoRoot, tokenizerPath)} (${formatBytes(tokenizerStats.size)})`,
      );
    }
  }

  console.log("[coreml-validate] Manifest", manifestPath);
  notes.push(
    "INFO tokenizer kind byte_level_bpe is expected for Llama 3.2 models; gpt2_bpe remains accepted as a legacy alias.",
  );
  console.log(
    `[coreml-validate] activeModel=${manifest.activeModel} computeUnits=${manifest.computeUnits} contextLimit=${manifest.contextLimit}`,
  );

  for (const line of notes) {
    console.log(`[coreml-validate] ${line}`);
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`[coreml-validate] ERROR ${issue}`);
    }
    process.exit(1);
  }

  console.log("[coreml-validate] CoreML pipeline validation passed");
}

run().catch((error) => {
  console.error(
    "[coreml-validate] ERROR",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
