import {
  installGlobalErrorHandlers,
  reportBoundaryError,
  reportError,
} from "@/utils/globalErrorHandler";

describe("globalErrorHandler", () => {
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.error = originalError;
    console.warn = originalWarn;
    delete (globalThis as any).ErrorUtils;
    jest.resetModules();
  });

  it("routes warning reports to console.warn", () => {
    reportError({
      error: new Error("warn me"),
      severity: "warning",
      source: "global-js",
    });

    expect(console.warn).toHaveBeenCalled();
  });

  it("reports boundary errors as fatal", () => {
    reportBoundaryError(new Error("boom"), {
      componentStack: "stack",
    } as any);

    expect(console.error).toHaveBeenCalled();
  });

  it("installs and invokes global JS handler", () => {
    const previousHandler = jest.fn();
    const setGlobalHandler = jest.fn((nextHandler) => {
      nextHandler(new Error("global failure"), true);
    });

    (globalThis as any).ErrorUtils = {
      getGlobalHandler: () => previousHandler,
      setGlobalHandler,
    };

    installGlobalErrorHandlers();

    expect(setGlobalHandler).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
    expect(previousHandler).toHaveBeenCalled();
  });

  it("installs global handlers only once", () => {
    const previousHandler = jest.fn();
    const setGlobalHandler = jest.fn();

    (globalThis as any).ErrorUtils = {
      getGlobalHandler: () => previousHandler,
      setGlobalHandler,
    };

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      installGlobalErrorHandlers: installAgain,
    } = require("@/utils/globalErrorHandler");

    installAgain();
    installAgain();

    expect(setGlobalHandler).toHaveBeenCalledTimes(1);
  });
});
