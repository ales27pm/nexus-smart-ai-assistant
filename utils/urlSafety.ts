const ALLOWED_SCHEMES = new Set(["https"]);

export function getSafeExternalUrl(rawUrl: string): string | null {
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

    return parsed.toString();
  } catch {
    return null;
  }
}

export function getDisplayHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return rawUrl;
  }
}
