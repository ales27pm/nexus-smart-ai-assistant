jest.mock("@/modules/expo-coreml-diagnostics", () => ({
  ExpoCoreMLDiagnostics: {
    isEnabledAsync: jest.fn(),
    delayResolveAsync: jest.fn(),
    describeErrorAsync: jest.fn(),
    throwErrorAsync: jest.fn(),
  },
}));

import { ExpoCoreMLDiagnostics } from "@/modules/expo-coreml-diagnostics";
import {
  delayDiagnosticPromise,
  getNativeDiagnosticError,
  runBridgeTimeoutUXProbe,
  runMemoryPressureRecoveryProbe,
} from "@/utils/coremlDiagnostics";

const mockedDiagnostics = ExpoCoreMLDiagnostics as jest.Mocked<
  typeof ExpoCoreMLDiagnostics
>;

describe("coremlDiagnostics wrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("delays promise resolution through native bridge", async () => {
    mockedDiagnostics.delayResolveAsync.mockResolvedValue({ delayedMs: 120 });

    await expect(delayDiagnosticPromise(120)).resolves.toBe(120);
    expect(mockedDiagnostics.delayResolveAsync).toHaveBeenCalledWith(120);
  });

  it("returns structured error descriptors", async () => {
    mockedDiagnostics.describeErrorAsync.mockResolvedValue({
      code: "MEMORY_PRESSURE",
      numericCode: 901,
      message: "simulated",
      retryable: true,
      category: "memory",
    });

    await expect(getNativeDiagnosticError("MEMORY_PRESSURE")).resolves.toEqual(
      expect.objectContaining({ code: "MEMORY_PRESSURE", retryable: true }),
    );
  });

  it("applies backoff recovery for memory pressure", async () => {
    mockedDiagnostics.describeErrorAsync.mockResolvedValue({
      code: "MEMORY_PRESSURE",
      numericCode: 901,
      message: "simulated",
      retryable: true,
      category: "memory",
    });
    mockedDiagnostics.throwErrorAsync.mockRejectedValue(new Error("memory"));
    mockedDiagnostics.delayResolveAsync.mockResolvedValue({ delayedMs: 150 });

    const result = await runMemoryPressureRecoveryProbe();

    expect(result.recovered).toBe(true);
    expect(result.attempts).toBe(2);
    expect(mockedDiagnostics.delayResolveAsync).toHaveBeenCalledTimes(2);
  });

  it("surfaces retry UX guidance for bridge timeout", async () => {
    mockedDiagnostics.describeErrorAsync.mockResolvedValue({
      code: "BRIDGE_TIMEOUT",
      numericCode: 903,
      message: "timed out",
      retryable: false,
      category: "bridge",
    });
    mockedDiagnostics.throwErrorAsync.mockRejectedValue(new Error("timeout"));

    const result = await runBridgeTimeoutUXProbe();

    expect(result.recovered).toBe(false);
    expect(result.userMessage).toMatch(/retry/i);
  });
});
