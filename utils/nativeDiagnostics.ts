import * as Application from "expo-application";
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type DiagnosticItemStatus = "supported" | "limited" | "error";

export type NativeDiagnosticItem = {
  id: string;
  title: string;
  detail: string;
  status: DiagnosticItemStatus;
};

const SECURE_STORE_KEY = "native_diagnostic_probe";

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function resolveStatusColor(status: DiagnosticItemStatus): string {
  if (status === "supported") return "#22C55E";
  if (status === "limited") return "#F59E0B";
  return "#EF4444";
}

export async function runNativeDiagnostics(): Promise<NativeDiagnosticItem[]> {
  const diagnostics: NativeDiagnosticItem[] = [];

  diagnostics.push({
    id: "build",
    title: "App Build Context",
    detail: `Native runtime: ${Application.nativeApplicationVersion ?? "unknown"} (${Application.nativeBuildVersion ?? "unknown"})`,
    status: "supported",
  });

  diagnostics.push({
    id: "device",
    title: "Physical Device",
    detail: Device.isDevice
      ? `${Device.brand ?? "Unknown"} ${Device.modelName ?? "Device"} • ${Platform.OS}`
      : "Running in simulator/emulator",
    status: Device.isDevice ? "supported" : "limited",
  });

  try {
    const networkState = await Network.getNetworkStateAsync();
    diagnostics.push({
      id: "network",
      title: "Network Reachability",
      detail: `Connected: ${networkState.isConnected ? "yes" : "no"} • Type: ${networkState.type ?? "unknown"}`,
      status: networkState.isConnected ? "supported" : "limited",
    });
  } catch (error) {
    diagnostics.push({
      id: "network",
      title: "Network Reachability",
      detail: `Failed to read network state: ${toMessage(error)}`,
      status: "error",
    });
  }

  try {
    const [hasHardware, enrolledLevel] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);

    const isBiometricEnrolled =
      enrolledLevel === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK ||
      enrolledLevel === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
    diagnostics.push({
      id: "biometric",
      title: "Biometric Capability",
      detail: hasHardware
        ? isBiometricEnrolled
          ? `Available and enrolled (${LocalAuthentication.SecurityLevel[enrolledLevel]})`
          : "Hardware present but no enrollment yet"
        : "No biometric hardware",
      status: hasHardware && isBiometricEnrolled ? "supported" : "limited",
    });
  } catch (error) {
    diagnostics.push({
      id: "biometric",
      title: "Biometric Capability",
      detail: `Failed to read biometrics: ${toMessage(error)}`,
      status: "error",
    });
  }

  try {
    const probeValue = `ok-${Date.now()}`;
    await SecureStore.setItemAsync(SECURE_STORE_KEY, probeValue);
    const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY);
    diagnostics.push({
      id: "secure-store",
      title: "Secure Encrypted Storage",
      detail:
        stored === probeValue
          ? "Read/write succeeded"
          : "Unexpected readback result",
      status: stored === probeValue ? "supported" : "limited",
    });
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY).catch(() => {
      // best-effort cleanup
    });
  } catch (error) {
    diagnostics.push({
      id: "secure-store",
      title: "Secure Encrypted Storage",
      detail: `SecureStore unavailable: ${toMessage(error)}`,
      status: "error",
    });
  }

  return diagnostics;
}

export async function copyDiagnostics(
  items: NativeDiagnosticItem[],
): Promise<boolean> {
  const lines = items.map((item) => `• ${item.title}: ${item.detail}`);
  const payload = ["Native diagnostic snapshot", ...lines].join("\n");

  try {
    await Clipboard.setStringAsync(payload);
    return true;
  } catch (error) {
    console.warn("Failed to copy diagnostics", error);
    return false;
  }
}
