import ExpoHfTokenizers from "@naveen521kk/expo-hf-tokenizers";
import * as FileSystem from "expo-file-system";

const HF_BASE =
  "https://huggingface.co/dphn/Dolphin3.0-Llama3.2-3B/resolve/main";
const TOKENIZER_FILES = [
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "config.json",
  "generation_config.json",
];

const TOKENIZER_DIR = `${FileSystem.cacheDirectory}dolphin_llama3_2_3b_tokenizer`;

async function ensureDir(path: string) {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function ensureTokenizerFilesDownloaded() {
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
    return Number((e.ids as bigint[])[0]);
  }
  const e: any = await (ExpoHfTokenizers as any).encodeWithExtra(
    dir,
    tokenText,
    false,
    false,
  );
  return Number((e.ids as bigint[])[0]);
}
