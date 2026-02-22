import { resolveStatusColor } from "../utils/nativeDiagnostics";

describe("resolveStatusColor", () => {
  it("returns a stable mapping for supported", () => {
    expect(resolveStatusColor("supported")).toBe("supported");
  });

  it("returns a stable mapping for limited", () => {
    expect(resolveStatusColor("limited")).toBe("limited");
  });

  it("returns a stable mapping for error", () => {
    expect(resolveStatusColor("error")).toBe("error");
  });
});
