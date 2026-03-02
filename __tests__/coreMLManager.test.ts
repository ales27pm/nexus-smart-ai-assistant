import { CoreMLError } from "@/utils/coreml";
import { ensureCoreMLModelAssets } from "@/utils/coremlModelManager";
import { CoreMLManager } from "@/utils/coreMLManager";

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("@/utils/coremlModelManager", () => ({
  ensureCoreMLModelAssets: jest.fn(),
}));

describe("CoreMLManager", () => {
  const ensureCoreMLModelAssetsMock =
    ensureCoreMLModelAssets as jest.MockedFunction<
      typeof ensureCoreMLModelAssets
    >;

  beforeEach(() => {
    jest.clearAllMocks();
    ensureCoreMLModelAssetsMock.mockResolvedValue(null);
  });

  it("initializes and disposes through provider", async () => {
    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockResolvedValue(false),
    };

    const manager = new CoreMLManager(provider as any);

    await manager.initialize();
    await manager.dispose();

    expect(provider.load).toHaveBeenCalledWith(expect.any(Object), {
      forceReload: true,
    });
    expect(provider.unload).toHaveBeenCalled();
  });

  it("prefers downloaded model path when manager resolves one", async () => {
    ensureCoreMLModelAssetsMock.mockResolvedValue({
      modelDirectory: "/documents/coreml-models/model/",
      modelPath: "/documents/coreml-models/model/model.mlpackage",
      downloaded: true,
      telemetry: {
        modelName: "model",
        durationMs: 1000,
        attempts: 3,
        bytesWritten: 2048,
      },
    });

    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockResolvedValue(false),
    };

    const manager = new CoreMLManager(provider as any);
    await manager.initialize({ modelFile: "bundled.mlpackage" });

    expect(ensureCoreMLModelAssetsMock).toHaveBeenCalled();
    expect(provider.load).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: "/documents/coreml-models/model/model.mlpackage",
      }),
      { forceReload: true },
    );
    expect(provider.load).toHaveBeenCalledWith(
      expect.not.objectContaining({ modelFile: "bundled.mlpackage" }),
      { forceReload: true },
    );
  });

  it("skips reload when already loaded with identical options", async () => {
    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    };

    const manager = new CoreMLManager(provider as any);
    await manager.initialize({ modelFile: "bundled.mlpackage" });
    await manager.initialize({ modelFile: "bundled.mlpackage" });

    expect(provider.load).toHaveBeenCalledTimes(1);
  });

  it("throws outside __DEV__ when model preparation fails", async () => {
    const previousDev = global.__DEV__;
    (global as any).__DEV__ = false;

    ensureCoreMLModelAssetsMock.mockRejectedValue(new Error("storage failed"));

    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn(),
    };

    const manager = new CoreMLManager(provider as any);

    await expect(manager.initialize()).rejects.toThrow("storage failed");
    expect(provider.load).not.toHaveBeenCalled();

    (global as any).__DEV__ = previousDev;
  });

  it("generates cleaned response", async () => {
    const provider = {
      load: jest.fn(),
      generate: jest
        .fn()
        .mockResolvedValue("system\n\nUser: hello\nAssistant:  hi there"),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn(),
    };

    const manager = new CoreMLManager(provider as any);
    await expect(manager.generate("system", "hello")).resolves.toBe("hi there");
  });

  it("rejects concurrent generation requests", async () => {
    let resolveGenerate: ((value: string) => void) | null = null;
    const provider = {
      load: jest.fn(),
      generate: jest.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveGenerate = resolve;
          }),
      ),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn(),
    };

    const manager = new CoreMLManager(provider as any);
    const firstPromise = manager.generate("system", "first");

    await expect(manager.generate("system", "second")).rejects.toBeInstanceOf(
      CoreMLError,
    );

    resolveGenerate?.("system\n\nUser: first\nAssistant: done");
    await expect(firstPromise).resolves.toBe("done");
  });

  it("cancels generation when signal is aborted", async () => {
    let rejectGenerate: ((error: Error) => void) | null = null;
    const provider = {
      load: jest.fn(),
      generate: jest.fn().mockImplementation(
        () =>
          new Promise<string>((_, reject) => {
            rejectGenerate = reject;
          }),
      ),
      unload: jest.fn(),
      cancel: jest.fn().mockImplementation(async () => {
        rejectGenerate?.(new CoreMLError("Generation aborted", "ABORT_ERR"));
      }),
      isLoaded: jest.fn(),
    };

    const manager = new CoreMLManager(provider as any);
    const controller = new AbortController();

    const resultPromise = manager.generate(
      "system",
      "hello",
      undefined,
      controller.signal,
    );

    controller.abort();
    await expect(resultPromise).rejects.toBeInstanceOf(CoreMLError);

    expect(provider.cancel).toHaveBeenCalled();
  });
});
