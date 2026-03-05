import {
  requireNativeModule,
  requireOptionalNativeModule,
} from "expo-modules-core";

type NativeDiagnosticErrorCode =
  | "MEMORY_PRESSURE"
  | "MODEL_EVICTED"
  | "BRIDGE_TIMEOUT"
  | "UNKNOWN";

type NativeDiagnosticErrorDescriptor = {
  code: NativeDiagnosticErrorCode;
  numericCode: number;
  message: string;
  retryable: boolean;
  category: "memory" | "bridge" | "state" | "generic";
};

type ExpoCoreMLDiagnosticsModuleShape = {
  isEnabledAsync(): Promise<boolean>;
  delayResolveAsync(durationMs: number): Promise<{ delayedMs: number }>;
  describeErrorAsync(
    code: NativeDiagnosticErrorCode,
  ): Promise<NativeDiagnosticErrorDescriptor>;
  throwErrorAsync(code: NativeDiagnosticErrorCode): Promise<never>;
};

let cachedModule: ExpoCoreMLDiagnosticsModuleShape | null = null;

function getNativeModule(): ExpoCoreMLDiagnosticsModuleShape {
  if (cachedModule) {
    return cachedModule;
  }

  const optionalModule =
    requireOptionalNativeModule<ExpoCoreMLDiagnosticsModuleShape>(
      "ExpoCoreMLDiagnosticsModule",
    ) ??
    requireOptionalNativeModule<ExpoCoreMLDiagnosticsModuleShape>(
      "ExpoCoreMLDiagnostics",
    );

  if (optionalModule) {
    cachedModule = optionalModule;
    return cachedModule;
  }

  cachedModule = requireNativeModule<ExpoCoreMLDiagnosticsModuleShape>(
    "ExpoCoreMLDiagnosticsModule",
  );

  return cachedModule;
}

export { NativeDiagnosticErrorCode, NativeDiagnosticErrorDescriptor };

export const ExpoCoreMLDiagnostics: ExpoCoreMLDiagnosticsModuleShape = {
  isEnabledAsync: () => getNativeModule().isEnabledAsync(),
  delayResolveAsync: (durationMs) =>
    getNativeModule().delayResolveAsync(durationMs),
  describeErrorAsync: (code) => getNativeModule().describeErrorAsync(code),
  throwErrorAsync: (code) => getNativeModule().throwErrorAsync(code),
};
