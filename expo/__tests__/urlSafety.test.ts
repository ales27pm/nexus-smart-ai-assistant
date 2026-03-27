import { getDisplayHost, getSafeExternalUrl } from "@/utils/urlSafety";

describe("urlSafety", () => {
  it("allows valid https links", () => {
    expect(getSafeExternalUrl("https://example.com/path?q=1")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("blocks non-https links", () => {
    expect(getSafeExternalUrl("http://example.com")).toBeNull();
    expect(getSafeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeExternalUrl("tel:+123456789")).toBeNull();
  });

  it("returns null for malformed urls", () => {
    expect(getSafeExternalUrl("not a url")).toBeNull();
  });

  it("returns host for display based on validated url", () => {
    expect(getDisplayHost("https://sub.example.com/path")).toBe(
      "sub.example.com",
    );
    expect(getDisplayHost("http://sub.example.com/path")).toBe("unknown host");
  });

  it("fails closed when URL constructor is unavailable", () => {
    const originalUrl = global.URL;
    // @ts-expect-error test override for runtime capability check
    global.URL = undefined;

    expect(getSafeExternalUrl("https://example.com")).toBeNull();
    expect(getDisplayHost("https://example.com")).toBe("unknown host");

    global.URL = originalUrl;
  });
});
