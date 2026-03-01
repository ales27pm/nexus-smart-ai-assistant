import type { ErrorInfo } from "react";

export type ErrorSeverity = "fatal" | "error" | "warning";

let globalHandlersInstalled = false;

export type ErrorReport = {
  error: Error;
  severity: ErrorSeverity;
  source: "react-boundary" | "global-js" | "promise-rejection";
  componentStack?: string;
  metadata?: Record<string, unknown>;
};

function formatErrorReport(report: ErrorReport): string {
  const parts = [
    `[GlobalErrorHandler] severity=${report.severity}`,
    `source=${report.source}`,
    `message=${report.error.message}`,
  ];

  if (report.componentStack) {
    parts.push(
      `componentStack=${report.componentStack.replace(/\s+/g, " ").trim()}`,
    );
  }

  if (report.metadata) {
    parts.push(`metadata=${JSON.stringify(report.metadata)}`);
  }

  return parts.join(" | ");
}

export function reportError(report: ErrorReport): void {
  const message = formatErrorReport(report);

  if (report.severity === "fatal") {
    console.error(message, report.error);
    return;
  }

  if (report.severity === "warning") {
    console.warn(message, report.error);
    return;
  }

  console.error(message, report.error);
}

export function reportBoundaryError(error: Error, errorInfo: ErrorInfo): void {
  reportError({
    error,
    severity: "fatal",
    source: "react-boundary",
    componentStack: errorInfo.componentStack,
  });
}

export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled) {
    return;
  }

  globalHandlersInstalled = true;

  const globalHandler = (
    globalThis as typeof globalThis & {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
        setGlobalHandler?: (
          handler: (error: unknown, isFatal?: boolean) => void,
        ) => void;
      };
      onunhandledrejection?: (event: PromiseRejectionEvent) => void;
    }
  ).ErrorUtils;

  if (globalHandler?.setGlobalHandler && globalHandler.getGlobalHandler) {
    const previousHandler = globalHandler.getGlobalHandler();
    globalHandler.setGlobalHandler((error, isFatal) => {
      const normalizedError =
        error instanceof Error
          ? error
          : new Error(
              typeof error === "string" ? error : "Unknown global JS error",
            );

      reportError({
        error: normalizedError,
        severity: isFatal ? "fatal" : "error",
        source: "global-js",
      });

      previousHandler(error, isFatal);
    });
  }

  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener(
      "unhandledrejection",
      (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        const normalizedError =
          reason instanceof Error
            ? reason
            : new Error(
                typeof reason === "string"
                  ? reason
                  : "Unhandled promise rejection",
              );

        reportError({
          error: normalizedError,
          severity: "error",
          source: "promise-rejection",
        });
      },
    );
  }
}
