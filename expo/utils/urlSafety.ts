const ALLOWED_SCHEMES = new Set(["https"]);

function parseSafeUrl(rawUrl: unknown): URL | null {
  if (typeof URL !== "function") {
    return null;
  }

  if (typeof rawUrl !== "string") return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const scheme = parsed.protocol.replace(":", "").toLowerCase();

    if (!ALLOWED_SCHEMES.has(scheme)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function getSafeExternalUrl(rawUrl: unknown): string | null {
  const parsed = parseSafeUrl(rawUrl);
  return parsed ? parsed.toString() : null;
}

export function getDisplayHost(rawUrl: unknown): string {
  const safeUrl = getSafeExternalUrl(rawUrl);
  if (!safeUrl || typeof URL !== "function") {
    return "unknown host";
  }

  try {
    return new URL(safeUrl).host;
  } catch {
    return "unknown host";
  }
}
