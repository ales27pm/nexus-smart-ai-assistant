import ExpoHfTokenizers from "@naveen521kk/expo-hf-tokenizers";
import { sha256 } from "js-sha256";
import * as FileSystem from "expo-file-system";

const HF_COMMIT = "392a6f57223e7ccfe6ef4ebdb2ff101a42d57364";
const HF_BASE = `https://huggingface.co/dphn/Dolphin3.0-Llama3.2-3B/resolve/${HF_COMMIT}`;
const TOKENIZER_FILES = [
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "config.json",
  "generation_config.json",
] as const;

const TOKENIZER_SHA256: Record<(typeof TOKENIZER_FILES)[number], string> = {
  "tokenizer.json":
    "e40b93124a3e29f62d5f4ff41be56cb2af34ecacf9239acd9da53a98860380b5",
  "tokenizer_config.json":
    "51ad9580aba8d00016efda43357185a0d8ff9884584dcc82ab58ca552afd14e1",
  "special_tokens_map.json":
    "2df2c4620bb1a9eb877bc7c90c7fa04608bda9fa7c0cf2cdcc0a17b849649683",
  "config.json":
    "e21ff53ea39726f972362beba869807216775d5e308bc2f531784846c06a0249",
  "generation_config.json":
    "e627b5a8b2dc371f90388947ada64fa6e71de0f991c04c835f0c0bc97e305a4f",
};

let tokenizerDirCache: string | null = null;

function getTokenizerDir() {
  if (tokenizerDirCache) return tokenizerDirCache;
  if (!FileSystem.cacheDirectory) {
    throw new Error(
      "FileSystem.cacheDirectory is null - tokenizer cannot be stored",
    );
  }
  tokenizerDirCache = `${FileSystem.cacheDirectory}dolphin_llama3_2_3b_tokenizer`;
  return tokenizerDirCache;
}

async function ensureDir(path: string) {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function verifySha256(path: string, expectedHash: string) {
  const contents = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const digest = sha256(contents);
  if (digest.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(
      `Checksum mismatch for ${path}. Expected ${expectedHash}, got ${digest}`,
    );
  }
}

async function ensureTokenizerFilesDownloaded() {
  const tokenizerDir = getTokenizerDir();
  await ensureDir(tokenizerDir);

  await Promise.all(
    TOKENIZER_FILES.map(async (file) => {
      const toFile = `${tokenizerDir}/${file}`;
      const expectedHash = TOKENIZER_SHA256[file];
      const exists = await FileSystem.getInfoAsync(toFile);
      if (exists.exists && exists.size && exists.size > 0) {
        await verifySha256(toFile, expectedHash);
        return;
      }

      const url = `${HF_BASE}/${file}`;
      const res = await FileSystem.downloadAsync(url, toFile);
      if (res.status !== 200) {
        throw new Error(`Failed to download ${file} (HTTP ${res.status})`);
      }
let pendingTokenizerDownload: Promise<string> | null = null;

async function ensureTokenizerFilesDownloaded(): Promise<string> {
  if (pendingTokenizerDownload) {
    return pendingTokenizerDownload;
  }

  pendingTokenizerDownload = (async () => {
    await ensureDir(TOKENIZER_DIR);

    await Promise.all(
      TOKENIZER_FILES.map(async (file) => {
        const toFile = `${TOKENIZER_DIR}/${file}`;
        const exists = await FileSystem.getInfoAsync(toFile);
        if (exists.exists && exists.size && exists.size > 0) return;

        const url = `${HF_BASE}/${file}`;
        const res = await FileSystem.downloadAsync(url, toFile);
        if (res.status !== 200) {
          throw new Error(`Failed to download ${file} (HTTP ${res.status})`);
        }
      }),
    );

    const tok = await FileSystem.getInfoAsync(`${TOKENIZER_DIR}/tokenizer.json`);
    if (!tok.exists || !tok.size || tok.size < 1024) {
      throw new Error("tokenizer.json missing or suspiciously small");
    }

    return TOKENIZER_DIR;
  })();

  try {
    return await pendingTokenizerDownload;
  } finally {
    // Allow future calls to re-check the filesystem and re-download if needed.
    pendingTokenizerDownload = null;
  }
}

export type Encoded = {
  ids: number[];
  attentionMask?: number[];
  tokens?: string[];
};

export async function dolphinEncode(text: string): Promise<Encoded> {
  const dir = await ensureTokenizerFilesDownloaded();
  const encoded: any = await ExpoHfTokenizers.encode(dir, text);

  const ids = (encoded.ids as bigint[]).map((x) => Number(x));
  const attentionMask = encoded.attentionMask
    ? (encoded.attentionMask as bigint[]).map((x: bigint) => Number(x))
    : undefined;

  return {
    ids,
    attentionMask,
    tokens: encoded.tokens,
  };
}

export async function dolphinDecode(
  ids: number[],
  skipSpecialTokens = false,
): Promise<string> {
  const dir = await ensureTokenizerFilesDownloaded();
  const bigIds = ids.map((x) => BigInt(x));

  if (typeof (ExpoHfTokenizers as any).decodeWithExtra === "function") {
    return await (ExpoHfTokenizers as any).decodeWithExtra(
      dir,
      bigIds,
      skipSpecialTokens,
    );
  }
  return await (ExpoHfTokenizers as any).decode(dir, bigIds);
}

export async function dolphinTokenId(tokenText: string): Promise<number> {
  const dir = await ensureTokenizerFilesDownloaded();
  if (typeof (ExpoHfTokenizers as any).encodeWithExtra !== "function") {
    const e: any = await ExpoHfTokenizers.encode(dir, tokenText);
    return extractFirstTokenId(e, tokenText, "encode");
  }
  const e: any = await (ExpoHfTokenizers as any).encodeWithExtra(
    dir,
    tokenText,
    false,
    false,
  );
  return extractFirstTokenId(e, tokenText, "encodeWithExtra");
}
