import { sha256 } from "js-sha256";

type DownloadProgressCallback = (progress: {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}) => void;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type AppStateChangeHandler = (state: string) => void;

function setupReactNativeMock(initialState = "active") {
  let currentState = initialState;
  const listeners = new Set<AppStateChangeHandler>();

  jest.doMock("react-native", () => ({
    AppState: {
      get currentState() {
        return currentState;
      },
      addEventListener: jest.fn(
        (_eventType: "change", listener: AppStateChangeHandler) => {
          listeners.add(listener);
          return {
            remove: () => {
              listeners.delete(listener);
            },
          };
        },
      ),
    },
  }));

  return {
    setState(nextState: string) {
      currentState = nextState;
      for (const listener of listeners) {
        listener(nextState);
      }
    },
  };
}

describe("coremlModelManager", () => {
  it("replays latest progress to late concurrent listeners", async () => {
    jest.resetModules();
    setupReactNativeMock("active");

    const files = new Map<string, string>();
    const dirs = new Set<string>();
    const payload = "model-data";
    const expectedSource = "https://example.com/model";
    const expectedHash = sha256(payload);
    const downloadGate = createDeferred<{ status: number }>();

    jest.doMock("expo-file-system/legacy", () => {
      const normalize = (path: string) => path.replace(/\/+/g, "/");
      return {
        documentDirectory: "/docs/",
        EncodingType: { Base64: "base64" },
        getInfoAsync: jest.fn(async (path: string) => {
          const normalized = normalize(path);
          if (dirs.has(normalized)) {
            return { exists: true, isDirectory: true };
          }
          if (files.has(normalized)) {
            return {
              exists: true,
              isDirectory: false,
              size: Buffer.from(files.get(normalized) ?? "", "utf8").length,
            };
          }
          return { exists: false, isDirectory: false, size: 0 };
        }),
        makeDirectoryAsync: jest.fn(async (path: string) => {
          dirs.add(normalize(path));
        }),
        writeAsStringAsync: jest.fn(async (path: string, value: string) => {
          files.set(normalize(path), value);
        }),
        readAsStringAsync: jest.fn(
          async (
            path: string,
            options?: { position?: number; length?: number },
          ) => {
            const normalized = normalize(path);
            const content = files.get(normalized) ?? "";

            if (
              options &&
              (options.position !== undefined || options.length !== undefined)
            ) {
              const start = options.position ?? 0;
              const end =
                start + (options.length ?? Buffer.from(content, "utf8").length);
              return Buffer.from(content, "utf8")
                .subarray(start, end)
                .toString("base64");
            }

            return content;
          },
        ),
        deleteAsync: jest.fn(async (path: string) => {
          files.delete(normalize(path));
        }),
        readDirectoryAsync: jest.fn(async () => []),
        createDownloadResumable: jest.fn(
          (
            _source: string,
            destination: string,
            _opts: unknown,
            onProgress: DownloadProgressCallback,
          ) => ({
            downloadAsync: jest.fn(async () => {
              onProgress({
                totalBytesWritten: payload.length,
                totalBytesExpectedToWrite: payload.length,
              });
              files.set(normalize(destination), payload);
              return downloadGate.promise;
            }),
            pauseAsync: jest.fn(async () => undefined),
          }),
        ),
      };
    });

    jest.doMock("@/utils/modelManifest", () => ({
      runtimeModelManifest: {
        manifestVersion: 1,
        minimumAppSupportedSchemaVersion: 1,
        maxRetainedVersions: 2,
        activeVersionId: "v1",
        versions: [
          {
            id: "v1",
            modelName: "test",
            modelRelativePath: "model.mlpackage",
            retries: 1,
            files: [
              {
                path: "model.mlpackage",
                sha256: expectedHash,
                sources: [expectedSource],
              },
            ],
          },
        ],
      },
      toModelDownloadConfig: jest.fn(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manager =
      require("@/utils/coremlModelManager") as typeof import("@/utils/coremlModelManager");

    const listenerOne = jest.fn();
    const listenerTwo = jest.fn();

    const firstCall = manager.ensureCoreMLModelAssets(listenerOne);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listenerOne).toHaveBeenCalled();

    const secondCall = manager.ensureCoreMLModelAssets(listenerTwo);
    expect(listenerTwo).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "downloading" }),
    );

    downloadGate.resolve({ status: 200 });

    await expect(firstCall).resolves.toEqual(
      expect.objectContaining({
        modelPath: "/docs/coreml-models/v1/model.mlpackage",
        telemetry: expect.objectContaining({
          attempts: 1,
          bytesWritten: payload.length,
          source: expectedSource,
        }),
      }),
    );
    await expect(secondCall).resolves.toEqual(
      expect.objectContaining({
        modelPath: "/docs/coreml-models/v1/model.mlpackage",
      }),
    );
  });

  it("reports byte-based download message when expected size is unknown", async () => {
    jest.resetModules();
    setupReactNativeMock("active");

    const files = new Map<string, string>();
    const dirs = new Set<string>();
    const payload = "hello";
    const expectedSource = "https://example.com/model";
    const expectedHash = sha256(payload);

    jest.doMock("expo-file-system/legacy", () => {
      const normalize = (path: string) => path.replace(/\/+/g, "/");
      return {
        documentDirectory: "/docs/",
        EncodingType: { Base64: "base64" },
        getInfoAsync: jest.fn(async (path: string) => {
          const normalized = normalize(path);
          if (dirs.has(normalized)) {
            return { exists: true, isDirectory: true };
          }
          if (files.has(normalized)) {
            return {
              exists: true,
              isDirectory: false,
              size: Buffer.from(files.get(normalized) ?? "", "utf8").length,
            };
          }
          return { exists: false, isDirectory: false, size: 0 };
        }),
        makeDirectoryAsync: jest.fn(async (path: string) => {
          dirs.add(normalize(path));
        }),
        writeAsStringAsync: jest.fn(async (path: string, value: string) => {
          files.set(normalize(path), value);
        }),
        readAsStringAsync: jest.fn(
          async (
            path: string,
            options?: { position?: number; length?: number },
          ) => {
            const normalized = normalize(path);
            const content = files.get(normalized) ?? "";

            if (
              options &&
              (options.position !== undefined || options.length !== undefined)
            ) {
              const start = options.position ?? 0;
              const end =
                start + (options.length ?? Buffer.from(content, "utf8").length);
              return Buffer.from(content, "utf8")
                .subarray(start, end)
                .toString("base64");
            }

            return content;
          },
        ),
        deleteAsync: jest.fn(async (path: string) => {
          files.delete(normalize(path));
        }),
        readDirectoryAsync: jest.fn(async () => []),
        createDownloadResumable: jest.fn(
          (
            _source: string,
            destination: string,
            _opts: unknown,
            onProgress: DownloadProgressCallback,
          ) => ({
            downloadAsync: jest.fn(async () => {
              onProgress({
                totalBytesWritten: payload.length,
                totalBytesExpectedToWrite: -1,
              });
              files.set(normalize(destination), payload);
              return { status: 200 };
            }),
            pauseAsync: jest.fn(async () => undefined),
          }),
        ),
      };
    });

    jest.doMock("@/utils/modelManifest", () => ({
      runtimeModelManifest: {
        manifestVersion: 1,
        minimumAppSupportedSchemaVersion: 1,
        maxRetainedVersions: 2,
        activeVersionId: "v1",
        versions: [
          {
            id: "v1",
            modelName: "test",
            modelRelativePath: "model.mlpackage",
            retries: 1,
            files: [
              {
                path: "model.mlpackage",
                sha256: expectedHash,
                sources: [expectedSource],
              },
            ],
          },
        ],
      },
      toModelDownloadConfig: jest.fn(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manager =
      require("@/utils/coremlModelManager") as typeof import("@/utils/coremlModelManager");

    const listener = jest.fn();

    await expect(manager.ensureCoreMLModelAssets(listener)).resolves.toEqual(
      expect.objectContaining({
        modelPath: "/docs/coreml-models/v1/model.mlpackage",
      }),
    );

    const unknownSizeEvent = listener.mock.calls
      .map(([event]) => event)
      .find(
        (event) =>
          event.stage === "downloading" &&
          String(event.message).includes("downloaded)"),
      );

    expect(unknownSizeEvent).toEqual(
      expect.objectContaining({
        message: "Downloading model.mlpackage (5 B downloaded)",
        progress: 0.05,
      }),
    );
  });

  it("emits verification progress events for multi-chunk files", async () => {
    jest.resetModules();
    setupReactNativeMock("active");

    const files = new Map<string, string>();
    const dirs = new Set<string>();
    const payload = "a".repeat(2 * 1024 * 1024 + 256 * 1024);
    const expectedSource = "https://example.com/model";
    const expectedHash = sha256(payload);

    jest.doMock("expo-file-system/legacy", () => {
      const normalize = (path: string) => path.replace(/\/+/g, "/");
      return {
        documentDirectory: "/docs/",
        EncodingType: { Base64: "base64" },
        getInfoAsync: jest.fn(async (path: string) => {
          const normalized = normalize(path);
          if (dirs.has(normalized)) {
            return { exists: true, isDirectory: true };
          }
          if (files.has(normalized)) {
            return {
              exists: true,
              isDirectory: false,
              size: Buffer.from(files.get(normalized) ?? "", "utf8").length,
            };
          }
          return { exists: false, isDirectory: false, size: 0 };
        }),
        makeDirectoryAsync: jest.fn(async (path: string) => {
          dirs.add(normalize(path));
        }),
        writeAsStringAsync: jest.fn(async (path: string, value: string) => {
          files.set(normalize(path), value);
        }),
        readAsStringAsync: jest.fn(
          async (
            path: string,
            options?: { position?: number; length?: number },
          ) => {
            const normalized = normalize(path);
            const content = files.get(normalized) ?? "";

            if (
              options &&
              (options.position !== undefined || options.length !== undefined)
            ) {
              const start = options.position ?? 0;
              const end =
                start + (options.length ?? Buffer.from(content, "utf8").length);
              return Buffer.from(content, "utf8")
                .subarray(start, end)
                .toString("base64");
            }

            return content;
          },
        ),
        deleteAsync: jest.fn(async (path: string) => {
          files.delete(normalize(path));
        }),
        readDirectoryAsync: jest.fn(async () => []),
        createDownloadResumable: jest.fn(
          (
            _source: string,
            destination: string,
            _opts: unknown,
            onProgress: DownloadProgressCallback,
          ) => ({
            downloadAsync: jest.fn(async () => {
              onProgress({
                totalBytesWritten: payload.length,
                totalBytesExpectedToWrite: payload.length,
              });
              files.set(normalize(destination), payload);
              return { status: 200 };
            }),
            pauseAsync: jest.fn(async () => undefined),
          }),
        ),
      };
    });

    jest.doMock("@/utils/modelManifest", () => ({
      runtimeModelManifest: {
        manifestVersion: 1,
        minimumAppSupportedSchemaVersion: 1,
        maxRetainedVersions: 2,
        activeVersionId: "v1",
        versions: [
          {
            id: "v1",
            modelName: "test",
            modelRelativePath: "model.mlpackage",
            retries: 1,
            files: [
              {
                path: "model.mlpackage",
                sha256: expectedHash,
                sources: [expectedSource],
              },
            ],
          },
        ],
      },
      toModelDownloadConfig: jest.fn(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manager =
      require("@/utils/coremlModelManager") as typeof import("@/utils/coremlModelManager");

    const listener = jest.fn();

    await expect(manager.ensureCoreMLModelAssets(listener)).resolves.toEqual(
      expect.objectContaining({
        modelPath: "/docs/coreml-models/v1/model.mlpackage",
      }),
    );

    const verifyingEvents = listener.mock.calls
      .map(([event]) => event)
      .filter(
        (event) =>
          event.stage === "verifying" && event.message.startsWith("Verifying"),
      );

    expect(verifyingEvents.length).toBeGreaterThan(1);
    expect(verifyingEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "model.mlpackage",
          bytesProcessed: expect.any(Number),
          totalBytes: payload.length,
          progress: expect.any(Number),
        }),
      ]),
    );

    const lastVerifyingEvent = verifyingEvents[verifyingEvents.length - 1];
    expect(lastVerifyingEvent).toEqual(
      expect.objectContaining({
        bytesProcessed: payload.length,
        totalBytes: payload.length,
      }),
    );
  });

  it("defers inactivity timeout while app is backgrounded", async () => {
    jest.resetModules();
    jest.useFakeTimers();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { __coreMLModelManagerTestUtils } =
      require("@/utils/coremlModelManager") as typeof import("@/utils/coremlModelManager");

    const events = new Set<(state: string) => void>();
    let appState = "background";
    const onForegroundRequired = jest.fn();
    const onTimeout = jest.fn(async () => undefined);

    const opGate = createDeferred<string>();

    const runPromise = __coreMLModelManagerTestUtils.runWithInactivityTimeout({
      timeoutMs: 100,
      timeoutMessage: "stalled",
      operation: async () => opGate.promise,
      onTimeout,
      onForegroundRequired,
      getCurrentAppState: () => appState,
      subscribeToAppState: (listener) => {
        events.add(listener);
        return {
          remove: () => {
            events.delete(listener);
          },
        };
      },
    });

    await Promise.resolve();

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();

    expect(onForegroundRequired).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();

    appState = "active";
    for (const listener of events) {
      listener("active");
    }

    jest.advanceTimersByTime(101);
    await Promise.resolve();

    await expect(runPromise).rejects.toThrow("stalled");
    expect(onTimeout).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
