import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useCoreMLChat } from "@/hooks/useCoreMLChat";
import type { CoreMLLoadModelOptions } from "@/utils/coreml";
import {
  delayDiagnosticPromise,
  runBridgeTimeoutUXProbe,
  runMemoryPressureRecoveryProbe,
} from "@/utils/coremlDiagnostics";

const SYSTEM_PROMPT =
  "You are a concise assistant. Reply with only one short sentence.";

type ScenarioStatus = "idle" | "running" | "passed" | "failed";

type ScenarioKey =
  | "load-generate"
  | "compute-fallback"
  | "cancel"
  | "diagnostic-delay"
  | "diagnostic-memory-backoff"
  | "diagnostic-timeout-ux"
  | "transition-serialize";

const scenarioTitle: Record<ScenarioKey, string> = {
  "load-generate": "Model load + generate",
  "compute-fallback": "Compute-unit fallback to cpuOnly",
  cancel: "Cancellation during active generation",
  "diagnostic-delay": "Diagnostic delay promise",
  "diagnostic-memory-backoff": "Memory-pressure backoff recovery",
  "diagnostic-timeout-ux": "Bridge timeout UX messaging",
  "transition-serialize": "Transition serialization under rapid reconfigure",
};

export default function E2ETabScreen() {
  const [computeUnits, setComputeUnits] =
    useState<CoreMLLoadModelOptions["computeUnits"]>("all");
  const abortControllerRef = useRef<AbortController | null>(null);
  const [resultText, setResultText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [diagnosticMessage, setDiagnosticMessage] = useState("");
  const [scenarioStatus, setScenarioStatus] = useState<
    Record<ScenarioKey, ScenarioStatus>
  >({
    "load-generate": "idle",
    "compute-fallback": "idle",
    cancel: "idle",
    "diagnostic-delay": "idle",
    "diagnostic-memory-backoff": "idle",
    "diagnostic-timeout-ux": "idle",
    "transition-serialize": "idle",
  });

  const loadOptions = useMemo<CoreMLLoadModelOptions>(
    () => ({ computeUnits }),
    [computeUnits],
  );

  const {
    isAvailable,
    isGenerating,
    generate,
    loadStatus,
    activeComputeUnits,
  } = useCoreMLChat(undefined, loadOptions);

  const setScenario = (key: ScenarioKey, status: ScenarioStatus) => {
    setScenarioStatus((prev) => ({ ...prev, [key]: status }));
  };

  const runLoadAndGenerate = async () => {
    setScenario("load-generate", "running");
    setErrorText("");

    try {
      const output = await generate(SYSTEM_PROMPT, "Give a short hello.");
      setResultText(output);
      setScenario(
        "load-generate",
        output.trim().length > 0 ? "passed" : "failed",
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setScenario("load-generate", "failed");
    }
  };

  const runComputeFallbackScenario = async () => {
    setScenario("compute-fallback", "running");
    setErrorText("");

    try {
      setComputeUnits("cpuAndNeuralEngine");
      const output = await generate(
        SYSTEM_PROMPT,
        "Confirm fallback test success in one sentence.",
      );
      setResultText(output);
      setScenario(
        "compute-fallback",
        activeComputeUnits === "cpuOnly" ? "passed" : "failed",
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setScenario("compute-fallback", "failed");
    }
  };

  const runCancellationScenario = async () => {
    setScenario("cancel", "running");
    setErrorText("");
    abortControllerRef.current = new AbortController();

    try {
      await generate(
        SYSTEM_PROMPT,
        "Generate a very long output describing planets in detail.",
        abortControllerRef.current.signal,
      );
      setScenario("cancel", "failed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(message);
      setScenario(
        "cancel",
        message.toLowerCase().includes("abort") ? "passed" : "failed",
      );
    } finally {
      abortControllerRef.current = null;
    }
  };

  const runDiagnosticDelayScenario = async () => {
    setScenario("diagnostic-delay", "running");
    setErrorText("");

    try {
      const delayedMs = await delayDiagnosticPromise(120);
      setDiagnosticMessage(`Delay result: ${delayedMs}ms`);
      setScenario("diagnostic-delay", delayedMs >= 120 ? "passed" : "failed");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setScenario("diagnostic-delay", "failed");
    }
  };

  const runMemoryBackoffScenario = async () => {
    setScenario("diagnostic-memory-backoff", "running");
    setErrorText("");

    try {
      const result = await runMemoryPressureRecoveryProbe();
      setDiagnosticMessage(result.userMessage);
      setScenario(
        "diagnostic-memory-backoff",
        result.recovered && result.attempts >= 2 ? "passed" : "failed",
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setScenario("diagnostic-memory-backoff", "failed");
    }
  };

  const runTimeoutUXScenario = async () => {
    setScenario("diagnostic-timeout-ux", "running");
    setErrorText("");

    try {
      const result = await runBridgeTimeoutUXProbe();
      setDiagnosticMessage(result.userMessage);
      setScenario(
        "diagnostic-timeout-ux",
        result.userMessage.toLowerCase().includes("retry")
          ? "passed"
          : "failed",
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setScenario("diagnostic-timeout-ux", "failed");
    }
  };

  const runTransitionSerializationScenario = async () => {
    setScenario("transition-serialize", "running");
    setErrorText("");

    try {
      setComputeUnits("all");
      setComputeUnits("cpuAndNeuralEngine");
      setComputeUnits("all");

      const output = await generate(
        SYSTEM_PROMPT,
        "Confirm transition serialization test in one sentence.",
      );
      setResultText(output);
      setScenario(
        "transition-serialize",
        loadStatus.state === "ready" && output.trim().length > 0
          ? "passed"
          : "failed",
      );
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
      setScenario("transition-serialize", "failed");
    }
  };

  const cancelActiveGeneration = () => {
    abortControllerRef.current?.abort();
  };

  if (Platform.OS !== "ios") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>CoreML E2E Lab (iOS only)</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title} testID="e2e-coreml-title">
        CoreML E2E Lab
      </Text>
      <Text testID="e2e-coreml-availability">
        Available: {String(isAvailable)}
      </Text>
      <Text testID="e2e-coreml-load-status">
        Load status: {loadStatus.state}
        {loadStatus.detail ? ` (${loadStatus.detail})` : ""}
      </Text>
      <Text testID="e2e-coreml-compute-unit">
        Active compute unit: {activeComputeUnits ?? "unknown"}
      </Text>

      <View style={styles.row}>
        <Pressable
          testID="e2e-set-compute-all"
          style={styles.button}
          onPress={() => setComputeUnits("all")}
        >
          <Text style={styles.buttonText}>Use all</Text>
        </Pressable>
        <Pressable
          testID="e2e-set-compute-ne"
          style={styles.button}
          onPress={() => setComputeUnits("cpuAndNeuralEngine")}
        >
          <Text style={styles.buttonText}>Use cpu+ne</Text>
        </Pressable>
      </View>

      <Pressable
        testID="e2e-run-load-generate"
        style={styles.button}
        onPress={runLoadAndGenerate}
      >
        <Text style={styles.buttonText}>Run load + generate</Text>
      </Pressable>

      <Pressable
        testID="e2e-run-compute-fallback"
        style={styles.button}
        onPress={runComputeFallbackScenario}
      >
        <Text style={styles.buttonText}>Run fallback scenario</Text>
      </Pressable>

      <Pressable
        testID="e2e-run-cancel"
        style={styles.button}
        onPress={runCancellationScenario}
      >
        <Text style={styles.buttonText}>Run cancellation scenario</Text>
      </Pressable>

      <Pressable
        testID="e2e-cancel-generation"
        style={styles.buttonDanger}
        onPress={cancelActiveGeneration}
      >
        <Text style={styles.buttonText}>Cancel active generation</Text>
      </Pressable>

      <Pressable
        testID="e2e-run-diagnostic-delay"
        style={styles.button}
        onPress={runDiagnosticDelayScenario}
      >
        <Text style={styles.buttonText}>Run diagnostic delay</Text>
      </Pressable>

      <Pressable
        testID="e2e-run-diagnostic-memory-backoff"
        style={styles.button}
        onPress={runMemoryBackoffScenario}
      >
        <Text style={styles.buttonText}>Run memory backoff recovery</Text>
      </Pressable>

      <Pressable
        testID="e2e-run-diagnostic-timeout-ux"
        style={styles.button}
        onPress={runTimeoutUXScenario}
      >
        <Text style={styles.buttonText}>Run timeout UX scenario</Text>
      </Pressable>

      <Pressable
        testID="e2e-run-transition-serialize"
        style={styles.button}
        onPress={runTransitionSerializationScenario}
      >
        <Text style={styles.buttonText}>Run transition serialization</Text>
      </Pressable>

      {isGenerating ? (
        <ActivityIndicator testID="e2e-generating-indicator" />
      ) : null}

      {(Object.keys(scenarioStatus) as ScenarioKey[]).map((key) => (
        <Text key={key} testID={`e2e-scenario-${key}`}>
          {scenarioTitle[key]}: {scenarioStatus[key]}
        </Text>
      ))}

      <Text testID="e2e-coreml-result">Result: {resultText || "<empty>"}</Text>
      <Text testID="e2e-coreml-error">Error: {errorText || "<none>"}</Text>
      <Text testID="e2e-diagnostic-message">
        Diagnostic message: {diagnosticMessage || "<none>"}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 16,
    paddingBottom: 48,
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    backgroundColor: "#1f5eff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonDanger: {
    backgroundColor: "#b3261e",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
  },
});
