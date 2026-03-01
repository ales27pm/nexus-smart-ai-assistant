import { CoreMLError } from "@/utils/coreml";
import { ensureCoreMLModelAssets } from "@/utils/coremlModelManager";
import { CoreMLLLMService } from "@/utils/llmService";

jest.mock("@/utils/coremlModelManager", () => ({
  ensureCoreMLModelAssets: jest.fn(),
}));

describe("CoreMLLLMService", () => {
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
      isLoaded: jest.fn().mockResolvedValue(true),
    };

    const service = new CoreMLLLMService(provider as any);

    await service.initialize();
    await service.dispose();

    expect(provider.load).toHaveBeenCalled();
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
      isLoaded: jest.fn(),
    };

    const service = new CoreMLLLMService(provider as any);
    await service.initialize({ modelFile: "bundled.mlpackage" });

    expect(ensureCoreMLModelAssetsMock).toHaveBeenCalled();
    expect(provider.load).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: "/documents/coreml-models/model/model.mlpackage",
      }),
    );
    expect(provider.load).toHaveBeenCalledWith(
      expect.not.objectContaining({ modelFile: "bundled.mlpackage" }),
    );
  });

  it("emits explicit load-status events during initialize", async () => {
    ensureCoreMLModelAssetsMock.mockResolvedValue({
      modelDirectory: "/documents/coreml-models/model/",
      modelPath: "/documents/coreml-models/model/model.mlpackage",
      downloaded: false,
      telemetry: {
        modelName: "model",
        durationMs: 25,
        attempts: 1,
        bytesWritten: 0,
      },
    });

    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn(),
    };

    const service = new CoreMLLLMService(provider as any);
    const events: string[] = [];

    await service.initialize(undefined, (event) => {
      events.push(event.state);
    });

    expect(events).toEqual(["downloading model", "verifying model", "ready"]);
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

    const service = new CoreMLLLMService(provider as any);

    await expect(service.initialize()).rejects.toThrow("storage failed");
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

    const service = new CoreMLLLMService(provider as any);
    await expect(service.generateChatResponse("system", "hello")).resolves.toBe(
      "hi there",
    );
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

    const service = new CoreMLLLMService(provider as any);
    const controller = new AbortController();

    const resultPromise = service.generateChatResponse(
      "system",
      "hello",
      undefined,
      controller.signal,
    );

    controller.abort();
    await expect(resultPromise).rejects.toBeInstanceOf(CoreMLError);

    expect(provider.cancel).toHaveBeenCalled();
  });

  it("throws when signal is already aborted", async () => {
    const provider = {
      load: jest.fn(),
      generate: jest.fn(),
      unload: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      isLoaded: jest.fn(),
    };

    const service = new CoreMLLLMService(provider as any);
    const controller = new AbortController();
    controller.abort();

    await expect(
      service.generateChatResponse(
        "system",
        "hello",
        undefined,
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(CoreMLError);
    expect(provider.cancel).toHaveBeenCalledTimes(1);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("wraps readiness failures as CoreMLError", async () => {
    const provider = {
      load: jest.fn(),
      generate: jest.fn(),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockRejectedValue(new Error("bridge missing")),
    };

    const service = new CoreMLLLMService(provider as any);

    await expect(service.isReady()).rejects.toBeInstanceOf(CoreMLError);
  });
});
