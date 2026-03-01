import { NativeCoreMLProvider } from "@/utils/coremlProvider";
import {
  CoreMLBridge,
  CoreMLLoadModelOptions,
  DEFAULT_COREML_LOAD_OPTIONS,
} from "@/utils/coreml";

describe("NativeCoreMLProvider", () => {
  function createBridgeMock(): jest.Mocked<CoreMLBridge> {
    return {
      loadModel: jest.fn().mockResolvedValue(undefined),
      unloadModel: jest.fn().mockResolvedValue(undefined),
      isLoaded: jest.fn().mockResolvedValue(false),
      generate: jest.fn().mockResolvedValue("ok"),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
  }

  it("falls back to cpuOnly and retries generate after execution-plan failure", async () => {
    const bridge = createBridgeMock();
    const planBuildError = new Error(
      "CoreML could not build an execution plan for this model on this device.",
    ) as Error & { code: number };
    planBuildError.code = 104;

    bridge.generate
      .mockRejectedValueOnce(planBuildError)
      .mockResolvedValueOnce("retry-ok");

    const provider = new NativeCoreMLProvider(bridge);
    const initialLoadOptions: CoreMLLoadModelOptions = {
      ...DEFAULT_COREML_LOAD_OPTIONS,
      computeUnits: "cpuAndNeuralEngine",
    };

    await provider.load(initialLoadOptions);
    const output = await provider.generate("hello");

    expect(output).toBe("retry-ok");
    expect(bridge.generate).toHaveBeenCalledTimes(2);
    expect(bridge.unloadModel).not.toHaveBeenCalled();
    expect(bridge.loadModel).toHaveBeenNthCalledWith(1, initialLoadOptions);
    expect(bridge.loadModel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ computeUnits: "cpuOnly" }),
    );
  });

  it("does not retry generate when computeUnits is already cpuOnly", async () => {
    const bridge = createBridgeMock();
    const planBuildError = new Error(
      "CoreML could not build an execution plan for this model on this device.",
    ) as Error & { code: number };
    planBuildError.code = 104;

    bridge.generate.mockRejectedValueOnce(planBuildError);

    const provider = new NativeCoreMLProvider(bridge);
    await provider.load({
      ...DEFAULT_COREML_LOAD_OPTIONS,
      computeUnits: "cpuOnly",
    });

    await expect(provider.generate("hello")).rejects.toMatchObject({
      code: 104,
    });
    expect(bridge.generate).toHaveBeenCalledTimes(1);
    expect(bridge.unloadModel).not.toHaveBeenCalled();
    expect(bridge.loadModel).toHaveBeenCalledTimes(1);
  });

  it("treats modelPath changes as reload-triggering option changes", async () => {
    const bridge = createBridgeMock();
    bridge.isLoaded.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const provider = new NativeCoreMLProvider(bridge);
    await provider.load({ modelPath: "/models/a.mlpackage" });

    await expect(
      provider.load({ modelPath: "/models/b.mlpackage" }),
    ).rejects.toThrow("forceReload: true");
  });
});
