import {
  installGlobalErrorHandlers,
  reportBoundaryError,
  reportError,
  resetHandlers,
} from "@/utils/globalErrorHandler";

describe("globalErrorHandler", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let scope: any;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    scope = undefined;
  });

  afterEach(() => {
    resetHandlers();
    jest.restoreAllMocks();
    scope = undefined;
  });

  it("routes warning reports to console.warn", () => {
    reportError({
      error: new Error("warn me"),
      severity: "warning",
      source: "global-js",
    });

    expect(warnSpy).toHaveBeenCalled();
  });

  it("reports boundary errors as fatal", () => {
    reportBoundaryError(new Error("boom"), {
      componentStack: "stack",
    } as any);

    expect(errorSpy).toHaveBeenCalled();
  });

  it("installs and invokes global JS handler", () => {
    const previousHandler = jest.fn();
    const setGlobalHandler = jest.fn((nextHandler) => {
      nextHandler(new Error("global failure"), true);
    });

    scope = {
      ErrorUtils: {
        getGlobalHandler: () => previousHandler,
        setGlobalHandler,
      },
    };

    installGlobalErrorHandlers(scope);

    expect(setGlobalHandler).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(previousHandler).toHaveBeenCalled();
  });

  it("installs global handlers only once", () => {
    const previousHandler = jest.fn();
    const setGlobalHandler = jest.fn();

    scope = {
      ErrorUtils: {
        getGlobalHandler: () => previousHandler,
        setGlobalHandler,
      },
    };

    installGlobalErrorHandlers(scope);
    installGlobalErrorHandlers(scope);

    expect(setGlobalHandler).toHaveBeenCalledTimes(1);
  });

  it("registers and invokes unhandledrejection handler", () => {
    const listeners: Record<string, (event: any) => void> = {};

    scope = {
      addEventListener: jest.fn(
        (eventName: string, callback: (event: any) => void) => {
          listeners[eventName] = callback;
        },
      ),
    };

    installGlobalErrorHandlers(scope);

    expect(scope.addEventListener).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );

    listeners.unhandledrejection({ reason: "rejected reason" });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("source=promise-rejection"),
      expect.any(Error),
    );
  });

  it("does not throw when metadata is unserializable", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => {
      reportError({
        error: new Error("boom"),
        severity: "error",
        source: "global-js",
        metadata: circular,
      });
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("metadata=[unserializable]"),
      expect.any(Error),
    );
  });
});
