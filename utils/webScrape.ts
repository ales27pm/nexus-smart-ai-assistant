import { getSafeExternalUrl } from "@/utils/urlSafety";

const WEB_SCRAPE_URL_ERROR =
  "Invalid URL. Web scrape only supports fully-qualified HTTPS URLs (for example: https://example.com).";

export function validateWebScrapeUrl(rawUrl: string): {
  safeUrl: string | null;
  errorMessage: string | null;
} {
  const safeUrl = getSafeExternalUrl(rawUrl);

  if (!safeUrl) {
    return {
      safeUrl: null,
      errorMessage: WEB_SCRAPE_URL_ERROR,
    };
  }

  return { safeUrl, errorMessage: null };
}
