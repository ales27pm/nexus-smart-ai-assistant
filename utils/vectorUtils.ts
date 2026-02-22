const EMBED_DIMENSIONS = 64;

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function computeEmbedding(text: string): number[] {
  const tokens = tokenize(text);
  const vector = Array.from<number>({ length: EMBED_DIMENSIONS }).fill(0);

  for (const token of tokens) {
    const index = hashToken(token) % EMBED_DIMENSIONS;
    vector[index] += 1;
  }

  const magnitude = Math.sqrt(
    vector.reduce((acc, value) => acc + value * value, 0),
  );
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embedding dimension mismatch");
  }

  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
  }

  return dot;
}
