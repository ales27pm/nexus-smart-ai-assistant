#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_COMPUTE_UNITS = new Set([
  "all",
  "cpuOnly",
  "cpuAndGPU",
  "cpuAndNeuralEngine",
]);

function asNonEmptyString(value, key) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function asNonNegativeNumber(value, key) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }
  return value;
}

export function normalizeCacheKey(source) {
  return source
    .replace(/^.+\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function getTokenizerCacheKeyFromManifest(manifest) {
  const source = manifest.tokenizerRepo || manifest.activeModel || "tokenizer";
  return normalizeCacheKey(source) || "tokenizer";
}

export function getTokenizerBundlePathsFromManifest(manifest) {
  const bundleDir = asNonEmptyString(
    manifest.tokenizerBundleDir ??
      "modules/expo-coreml-llm/ios/resources/tokenizers/byte_level_bpe",
    "tokenizerBundleDir",
  );
  const vocabFile = asNonEmptyString(
    manifest.tokenizerVocabFile ?? "vocab.json",
    "tokenizerVocabFile",
  );
  const mergesFile = asNonEmptyString(
    manifest.tokenizerMergesFile ?? "merges.txt",
    "tokenizerMergesFile",
  );

  return {
    bundleDir,
    vocabFile,
    mergesFile,
  };
}

export function getIOExpectationsFromManifest(manifest) {
  return {
    inputIdsName: asNonEmptyString(
      manifest.inputIdsName ?? "input_ids",
      "inputIdsName",
    ),
    attentionMaskName: asNonEmptyString(
      manifest.attentionMaskName ?? "attention_mask",
      "attentionMaskName",
    ),
    cachePositionName: asNonEmptyString(
      manifest.cachePositionName ?? "cache_position",
      "cachePositionName",
    ),
    logitsName: asNonEmptyString(manifest.logitsName ?? "logits", "logitsName"),
  };
}

export function parseCoreMLManifest(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("manifest must be an object");
  }

  const manifest = {
    activeModel: asNonEmptyString(raw.activeModel, "activeModel"),
    tokenizerRepo: asNonEmptyString(raw.tokenizerRepo, "tokenizerRepo"),
    coremlRepo: asNonEmptyString(raw.coremlRepo, "coremlRepo"),
    contextLimit: asNonNegativeNumber(raw.contextLimit, "contextLimit"),
    bosTokenId: asNonNegativeNumber(raw.bosTokenId, "bosTokenId"),
    eosTokenId: asNonNegativeNumber(raw.eosTokenId, "eosTokenId"),
    stopTokenIds: raw.stopTokenIds,
    computeUnits: raw.computeUnits,
    inputIdsName: raw.inputIdsName,
    attentionMaskName: raw.attentionMaskName,
    cachePositionName: raw.cachePositionName,
    logitsName: raw.logitsName,
    tokenizerBundleDir: raw.tokenizerBundleDir,
    tokenizerVocabFile: raw.tokenizerVocabFile,
    tokenizerMergesFile: raw.tokenizerMergesFile,
  };

  if (
    !Array.isArray(manifest.stopTokenIds) ||
    manifest.stopTokenIds.length < 1
  ) {
    throw new Error("stopTokenIds must contain at least one token id");
  }

  for (const [index, tokenId] of manifest.stopTokenIds.entries()) {
    if (!Number.isInteger(tokenId) || tokenId < 0) {
      throw new Error(
        `stopTokenIds[${index}] must be a non-negative integer; received ${String(tokenId)}`,
      );
    }
  }

  if (
    typeof manifest.computeUnits !== "string" ||
    !ALLOWED_COMPUTE_UNITS.has(manifest.computeUnits)
  ) {
    throw new Error(
      "computeUnits must be one of all|cpuOnly|cpuAndGPU|cpuAndNeuralEngine",
    );
  }

  return manifest;
}

export async function readCoreMLManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, "coreml-config.json");
  const rawManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifest = parseCoreMLManifest(rawManifest);
  return { manifestPath, manifest };
}
