import { validateWebScrapeUrl } from "@/utils/webScrape";

describe("validateWebScrapeUrl", () => {
  it("returns normalized https URL", () => {
    expect(validateWebScrapeUrl("  https://example.com/path?q=1  ")).toEqual({
      safeUrl: "https://example.com/path?q=1",
      errorMessage: null,
    });
  });

  it("rejects non-https URLs", () => {
    expect(validateWebScrapeUrl("http://example.com")).toEqual({
      safeUrl: null,
      errorMessage:
        "Invalid URL. Web scrape only supports fully-qualified HTTPS URLs (for example: https://example.com).",
    });
  });

  it("rejects malformed URLs", () => {
    expect(validateWebScrapeUrl("not a url")).toEqual({
      safeUrl: null,
      errorMessage:
        "Invalid URL. Web scrape only supports fully-qualified HTTPS URLs (for example: https://example.com).",
    });
  });
});
