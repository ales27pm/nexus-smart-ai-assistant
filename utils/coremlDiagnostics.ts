import { Platform } from "react-native";

import {
  ExpoCoreMLDiagnostics,
  type NativeDiagnosticErrorCode,
  type NativeDiagnosticErrorDescriptor,
} from "@/modules/expo-coreml-diagnostics";

export type CoreMLRecoveryResult = {
  recovered: boolean;
  attempts: number;
  descriptor?: NativeDiagnosticErrorDescriptor;
  userMessage: string;
};

type ErrorLike = {
  code?: string;
  message?: string;
};

export async function isCoreMLDiagnosticBridgeAvailable(): Promise<boolean> {
  if (!__DEV__ || Platform.OS !== "ios") {
    return false;
  }

  try {
    return await ExpoCoreMLDiagnostics.isEnabledAsync();
  } catch {
    return false;
  }
}

export async function delayDiagnosticPromise(
  durationMs: number,
): Promise<number> {
  const result = await ExpoCoreMLDiagnostics.delayResolveAsync(durationMs);
  return result.delayedMs;
}

export async function getNativeDiagnosticError(
  code: NativeDiagnosticErrorCode,
): Promise<NativeDiagnosticErrorDescriptor> {
  return ExpoCoreMLDiagnostics.describeErrorAsync(code);
}

export async function runMemoryPressureRecoveryProbe(): Promise<CoreMLRecoveryResult> {
  const descriptor = await getNativeDiagnosticError("MEMORY_PRESSURE");

  try {
    await ExpoCoreMLDiagnostics.throwErrorAsync("MEMORY_PRESSURE");
    return {
      recovered: false,
      attempts: 1,
      descriptor,
      userMessage: "Expected memory pressure failure was not raised.",
    };
  } catch (error) {
    const normalized = normalizeNativeError(error);
    if (descriptor.retryable || normalized.code === "MEMORY_PRESSURE") {
      const retryDelayMs = 150;
      await delayDiagnosticPromise(retryDelayMs);
      await delayDiagnosticPromise(10);
      return {
        recovered: true,
        attempts: 2,
        descriptor,
        userMessage:
          "Temporary memory pressure handled. Retrying inference with backoff.",
      };
    }

    return {
      recovered: false,
      attempts: 1,
      descriptor,
      userMessage: "Memory pressure recovery failed.",
    };
  }
}

export async function runBridgeTimeoutUXProbe(): Promise<CoreMLRecoveryResult> {
  const descriptor = await getNativeDiagnosticError("BRIDGE_TIMEOUT");

  try {
    await ExpoCoreMLDiagnostics.throwErrorAsync("BRIDGE_TIMEOUT");
    return {
      recovered: false,
      attempts: 1,
      descriptor,
      userMessage: "Expected timeout failure was not raised.",
    };
  } catch {
    return {
      recovered: false,
      attempts: 1,
      descriptor,
      userMessage:
        "Bridge timeout detected. Please retry from the diagnostics UI.",
    };
  }
}

function normalizeNativeError(error: unknown): ErrorLike {
  if (typeof error === "object" && error !== null) {
    return error as ErrorLike;
  }

  return { message: String(error) };
}
