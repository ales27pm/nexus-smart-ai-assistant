import { resolveStatusColor } from "../utils/nativeDiagnostics";

describe("resolveStatusColor", () => {
  it("returns a stable mapping for supported", () => {
    expect(resolveStatusColor("supported")).toBe("#22C55E");
  });

  it("returns a stable mapping for limited", () => {
    expect(resolveStatusColor("limited")).toBe("#F59E0B");
  });

  it("returns a stable mapping for error", () => {
    expect(resolveStatusColor("error")).toBe("#EF4444");
  });
});
