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
  function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function createConcurrencyAwareProvider() {
    const loadDeferred = createDeferred<void>();
    const unloadDeferred = createDeferred<void>();
    const events: string[] = [];
    let inFlightNativeOperations = 0;
    let maxInFlightNativeOperations = 0;

    const beginNativeOp = (label: string) => {
      inFlightNativeOperations += 1;
      maxInFlightNativeOperations = Math.max(
        maxInFlightNativeOperations,
        inFlightNativeOperations,
      );
      events.push(`${label}:start`);
    };

    const endNativeOp = (label: string) => {
      inFlightNativeOperations -= 1;
      events.push(`${label}:end`);
    };

    const provider = {
      load: jest.fn().mockImplementation(async () => {
        beginNativeOp("load");
        await loadDeferred.promise;
        endNativeOp("load");
      }),
      generate: jest.fn(),
      unload: jest.fn().mockImplementation(async () => {
        beginNativeOp("unload");
        await unloadDeferred.promise;
        endNativeOp("unload");
      }),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockResolvedValue(false),
    };

    return {
      provider,
      loadDeferred,
      unloadDeferred,
      events,
      getInFlightNativeOperations: () => inFlightNativeOperations,
      getMaxInFlightNativeOperations: () => maxInFlightNativeOperations,
    };
  }

  async function flushMicrotasks(iterations = 5) {
    for (let i = 0; i < iterations; i += 1) {
      await Promise.resolve();
    }
  }

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

  it("emits progress events during initialize", async () => {
    ensureCoreMLModelAssetsMock.mockImplementation(async (onProgress) => {
      onProgress?.({
        stage: "downloading",
        message: "Downloading model",
        progress: 0.4,
      });
      onProgress?.({
        stage: "ready",
        message: "Model ready",
        progress: 1,
      });

      return {
        modelDirectory: "/documents/coreml-models/model/",
        modelPath: "/documents/coreml-models/model/model.mlpackage",
        downloaded: true,
        activeVersionId: "model",
      };
    });

    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn(),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockResolvedValue(false),
    };

    const manager = new CoreMLManager(provider as any);
    const onProgress = jest.fn();
    await manager.initialize({ modelFile: "bundled.mlpackage" }, onProgress);

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "preparing" }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "downloading", progress: 0.4 }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "ready", progress: 1 }),
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

  it("serializes dispose and initialize transitions", async () => {
    let releaseUnload: (() => void) | null = null;
    const unloadStarted = new Promise<void>((resolve) => {
      releaseUnload = resolve;
    });

    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn().mockImplementation(() => unloadStarted),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockResolvedValue(false),
    };

    const manager = new CoreMLManager(provider as any);

    const disposePromise = manager.dispose();
    const initializePromise = manager.initialize();

    await Promise.resolve();
    expect(provider.unload).toHaveBeenCalledTimes(1);
    expect(provider.load).not.toHaveBeenCalled();

    releaseUnload?.();
    await disposePromise;
    await initializePromise;

    expect(provider.load).toHaveBeenCalledTimes(1);
  });

  it("queues dispose while initialize load is still in progress", async () => {
    const {
      provider,
      loadDeferred,
      unloadDeferred,
      events,
      getInFlightNativeOperations,
      getMaxInFlightNativeOperations,
    } = createConcurrencyAwareProvider();
    const manager = new CoreMLManager(provider as any);
    const states: string[] = [];

    const unsubscribe = manager.onStateChange(({ state }) => {
      states.push(state);
    });

    const initializePromise = manager.initialize();
    const disposePromise = manager.dispose();

    await flushMicrotasks();
    expect(provider.load).toHaveBeenCalledTimes(1);
    expect(provider.unload).not.toHaveBeenCalled();
    expect(getInFlightNativeOperations()).toBe(1);

    loadDeferred.resolve();
    await initializePromise;
    await Promise.resolve();

    expect(provider.unload).toHaveBeenCalledTimes(1);
    expect(getInFlightNativeOperations()).toBe(1);

    unloadDeferred.resolve();
    await disposePromise;
    unsubscribe();

    expect(events).toEqual([
      "load:start",
      "load:end",
      "unload:start",
      "unload:end",
    ]);
    expect(getMaxInFlightNativeOperations()).toBe(1);
    expect(states).toEqual(["Loading", "Ready", "Disposing", "Idle"]);
    expect(manager.getState()).toBe("Idle");
  });

  it("runs initialize after an in-progress dispose completes", async () => {
    const {
      provider,
      loadDeferred,
      unloadDeferred,
      events,
      getInFlightNativeOperations,
      getMaxInFlightNativeOperations,
    } = createConcurrencyAwareProvider();
    const manager = new CoreMLManager(provider as any);
    const states: string[] = [];
    const unsubscribe = manager.onStateChange(({ state }) => {
      states.push(state);
    });

    const disposePromise = manager.dispose();
    const initializePromise = manager.initialize();

    await Promise.resolve();
    expect(provider.unload).toHaveBeenCalledTimes(1);
    expect(provider.load).not.toHaveBeenCalled();
    expect(getInFlightNativeOperations()).toBe(1);

    unloadDeferred.resolve();
    await disposePromise;
    await flushMicrotasks();

    expect(provider.load).toHaveBeenCalledTimes(1);
    expect(getInFlightNativeOperations()).toBe(1);

    loadDeferred.resolve();
    await initializePromise;
    unsubscribe();

    expect(events).toEqual([
      "unload:start",
      "unload:end",
      "load:start",
      "load:end",
    ]);
    expect(getMaxInFlightNativeOperations()).toBe(1);
    expect(states).toEqual(["Disposing", "Idle", "Loading", "Ready"]);
    expect(manager.getState()).toBe("Ready");
  });

  it("publishes deterministic state transitions", async () => {
    const provider = {
      load: jest.fn().mockResolvedValue(undefined),
      generate: jest.fn(),
      unload: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn(),
      isLoaded: jest.fn().mockResolvedValue(false),
    };

    const manager = new CoreMLManager(provider as any);
    const states: string[] = [];
    const unsubscribe = manager.onStateChange(({ state }) => {
      states.push(state);
    });

    await manager.initialize();
    await manager.dispose();

    unsubscribe();

    expect(states).toEqual(["Loading", "Ready", "Disposing", "Idle"]);
    expect(manager.getState()).toBe("Idle");
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
