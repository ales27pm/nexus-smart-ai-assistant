import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Brain,
  CalendarDays,
  Contact,
  Database,
  LucideIcon,
  Navigation,
  Phone,
  Send,
  Volume2,
} from "lucide-react-native";
import Colors from "@/constants/colors";
import {
  COREML_MODEL_PRESETS,
  CoreMLGenerateOptions,
  CoreMLLoadModelOptions,
  CoreMLLoadUxState,
  CoreMLModelPreset,
  CoreMLModelPresetId,
  DEFAULT_COREML_MODEL_PRESET_ID,
  DEFAULT_COREML_GENERATE_OPTIONS,
  DEFAULT_COREML_LOAD_OPTIONS,
  toActionableCoreMLError,
} from "@/utils/coreml";
import { iosToolsService } from "@/utils/iosToolsService";
import { reportError } from "@/utils/globalErrorHandler";
import { coreMLManager } from "@/utils/coreMLManager";

type SafeActionOptions = {
  isCoreMLAction?: boolean;
};

type SafeAction = (
  label: string,
  fn: () => Promise<void>,
  options?: SafeActionOptions,
) => Promise<void>;

type SectionCardProps = {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  children: ReactNode;
};

type CoreMLSectionProps = {
  isAvailable: boolean;
  status: string;
  loadState: CoreMLLoadUxState;
  prompt: string;
  output: string;
  loadOptions: CoreMLLoadModelOptions;
  generateOptions: CoreMLGenerateOptions;
  modelPresets: readonly CoreMLModelPreset[];
  selectedModelPresetId: CoreMLModelPresetId;
  onSelectModelPreset: (presetId: CoreMLModelPresetId) => void;
  onPromptChange: (next: string) => void;
  onLoadOptionsChange: React.Dispatch<
    React.SetStateAction<CoreMLLoadModelOptions>
  >;
  onGenerateOptionsChange: React.Dispatch<
    React.SetStateAction<CoreMLGenerateOptions>
  >;
  onLoadModel: () => void;
  onGenerate: () => void;
};

function SectionCard({
  icon: Icon,
  iconColor,
  title,
  children,
}: SectionCardProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Icon size={14} color={iconColor} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function useSafeAction(
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  setCoreMLLoadState: React.Dispatch<React.SetStateAction<CoreMLLoadUxState>>,
): SafeAction {
  return React.useCallback(
    async (
      label: string,
      fn: () => Promise<void>,
      options: SafeActionOptions = {},
    ) => {
      try {
        await fn();
      } catch (error) {
        const normalizedError = options.isCoreMLAction
          ? toActionableCoreMLError(error)
          : error;
        reportError({
          error:
            normalizedError instanceof Error
              ? normalizedError
              : new Error(String(normalizedError)),
          severity: "error",
          source: "user-action",
          metadata: { label, screen: "deviceNativeHub" },
        });
        const message =
          normalizedError instanceof Error
            ? normalizedError.message
            : String(normalizedError);
        if (options.isCoreMLAction) {
          setCoreMLLoadState("failed—retry");
        }
        setStatus(`${label} failed: ${message}`);
        Alert.alert(`${label} failed`, message);
      }
    },
    [setCoreMLLoadState, setStatus],
  );
}

function DeviceNativeHubLocationSection({
  MapViewNative,
  runSafely,
}: {
  MapViewNative: React.ComponentType<any> | null;
  runSafely: SafeAction;
}) {
  const [coords, setCoords] = useState("Unavailable");

  const mapRegion = useMemo(() => {
    const [lat, lng] = coords
      .split(",")
      .map((value) => Number.parseFloat(value));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }, [coords]);

  const handleGetLocation = useCallback(
    () =>
      runSafely("Location", async () => {
        setCoords(await iosToolsService.getCurrentCoordinates());
      }),
    [runSafely],
  );

  return (
    <SectionCard
      icon={Navigation}
      iconColor={Colors.dark.cyan}
      title="GPS + native maps"
    >
      <TouchableOpacity style={styles.button} onPress={handleGetLocation}>
        <Text style={styles.buttonText}>Get current location</Text>
      </TouchableOpacity>
      <Text style={styles.result}>Coordinates: {coords}</Text>
      {MapViewNative && mapRegion ? (
        <View style={styles.mapWrap}>
          <MapViewNative
            style={styles.map}
            initialRegion={mapRegion}
            region={mapRegion}
          />
        </View>
      ) : !MapViewNative ? (
        <Text style={styles.result}>
          Map preview available in native runtime.
        </Text>
      ) : (
        <Text style={styles.result}>
          Press {'"'}Get current location{'"'} to show the map.
        </Text>
      )}
    </SectionCard>
  );
}

function CoreMLSection({
  isAvailable,
  status,
  loadState,
  prompt,
  output,
  loadOptions,
  generateOptions,
  modelPresets,
  selectedModelPresetId,
  onSelectModelPreset,
  onPromptChange,
  onLoadOptionsChange,
  onGenerateOptionsChange,
  onLoadModel,
  onGenerate,
}: CoreMLSectionProps) {
  const selectedPreset =
    modelPresets.find((preset) => preset.id === selectedModelPresetId) ?? null;

  return (
    <View
      style={[styles.section, !isAvailable && styles.sectionDisabled]}
      pointerEvents={isAvailable ? "auto" : "none"}
    >
      <View style={styles.sectionHeader}>
        <Brain size={14} color={Colors.dark.cyan} />
        <Text style={styles.sectionTitle}>On-device CoreML LLM (iOS)</Text>
      </View>
      {!isAvailable && (
        <Text style={styles.result}>
          On-device CoreML controls are available on iOS dev builds with the
          native module linked. This platform uses server-side generation.
        </Text>
      )}
      <Text style={styles.result}>{status}</Text>
      <Text style={styles.result}>CoreML load state: {loadState}</Text>
      <Text style={styles.result}>Model preset</Text>
      <View style={styles.presetRow}>
        {modelPresets.map((preset) => {
          const isSelected = preset.id === selectedModelPresetId;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.presetChip, isSelected && styles.presetChipActive]}
              onPress={() => onSelectModelPreset(preset.id)}
            >
              <Text
                style={[
                  styles.presetChipText,
                  isSelected && styles.presetChipTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.result}>{selectedPreset?.modelFile}</Text>
      <Text style={styles.result}>{selectedPreset?.detail}</Text>
      <TouchableOpacity style={styles.button} onPress={onLoadModel}>
        <Text style={styles.buttonText}>Download + load CoreML model</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <Text style={styles.result}>Compute units</Text>
        <View style={styles.switchRow}>
          <Text style={styles.result}>CPU-only</Text>
          <Switch
            value={loadOptions.computeUnits === "cpuOnly"}
            onValueChange={(enabled) =>
              onLoadOptionsChange((current) => ({
                ...current,
                computeUnits: enabled
                  ? "cpuOnly"
                  : DEFAULT_COREML_LOAD_OPTIONS.computeUnits,
              }))
            }
          />
        </View>
      </View>

      <TextInput
        value={String(generateOptions.maxNewTokens ?? 160)}
        onChangeText={(value) => {
          const parsed = Number.parseInt(value, 10);
          onGenerateOptionsChange((current) => ({
            ...current,
            maxNewTokens: Number.isFinite(parsed)
              ? parsed
              : current.maxNewTokens,
          }));
        }}
        keyboardType="numeric"
        placeholder="Max new tokens"
        placeholderTextColor={Colors.dark.textTertiary}
        style={styles.input}
      />
      <TextInput
        value={prompt}
        onChangeText={onPromptChange}
        placeholder="Prompt"
        placeholderTextColor={Colors.dark.textTertiary}
        style={[styles.input, styles.promptInput]}
        multiline
      />
      <TouchableOpacity style={styles.button} onPress={onGenerate}>
        <Text style={styles.buttonText}>Generate locally</Text>
      </TouchableOpacity>
      <Text style={styles.result}>Output: {output || "—"}</Text>
      <Text style={styles.result}>
        Notes: Pick a preset that matches the packaged/downloaded model variant,
        then load. If loading fails, refresh model assets and rebuild iOS native
        resources.
      </Text>
    </View>
  );
}

export default function DeviceNativeHubScreen() {
  const [note, setNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("device diagnostics profile");
  const [results, setResults] = useState<
    { id: number; content: string; score: number }[]
  >([]);
  const [MapViewNative, setMapViewNative] =
    useState<React.ComponentType<any> | null>(null);
  const [contact, setContact] = useState("Not loaded");
  const [status, setStatus] = useState("Idle");
  const [speechTranscript, setSpeechTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [coreMLStatus, setCoreMLStatus] = useState("CoreML LLM: not loaded");
  const [coreMLLoadOptions, setCoreMLLoadOptions] =
    useState<CoreMLLoadModelOptions>(() => ({
      ...DEFAULT_COREML_LOAD_OPTIONS,
    }));
  const [coreMLGenerateOptions, setCoreMLGenerateOptions] =
    useState<CoreMLGenerateOptions>(() => ({
      ...DEFAULT_COREML_GENERATE_OPTIONS,
    }));
  const [coreMLLoadState, setCoreMLLoadState] =
    useState<CoreMLLoadUxState>("ready");
  const [coreMLPrompt, setCoreMLPrompt] = useState(
    "Write a short, useful checklist for setting up a workshop.",
  );
  const [coreMLOutput, setCoreMLOutput] = useState("");
  const [selectedModelPresetId, setSelectedModelPresetId] =
    useState<CoreMLModelPresetId>(DEFAULT_COREML_MODEL_PRESET_ID);
  const initialCoreMLLoadOptionsRef = useRef(coreMLLoadOptions);

  const runSafely = useSafeAction(setStatus, setCoreMLLoadState);
  const isCoreMLAvailable = Platform.OS === "ios";

  const handleModelPresetSelect = useCallback(
    (presetId: CoreMLModelPresetId) => {
      const preset = COREML_MODEL_PRESETS.find((item) => item.id === presetId);
      if (!preset) {
        return;
      }

      setSelectedModelPresetId(presetId);
      setCoreMLLoadOptions((current) => ({
        ...current,
        modelFile: preset.modelFile,
        modelPath: undefined,
      }));
      setCoreMLStatus(`CoreML LLM: preset ${preset.label} selected`);
    },
    [],
  );

  useEffect(() => {
    void runSafely("Load note", async () => {
      setNote(await iosToolsService.loadLocalNote());
    });

    if (Platform.OS !== "web") {
      import("react-native-maps")
        .then((module) => setMapViewNative(() => module.default))
        .catch((error) => console.warn("react-native-maps unavailable", error));
    }

  }, [runSafely]);

  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    void runSafely(
      "CoreML auto-initialize",
      async () => {
        setCoreMLLoadState("downloading model");
        await coreMLManager.initialize(initialCoreMLLoadOptionsRef.current);
        setCoreMLLoadState("ready");
        setCoreMLStatus("CoreML LLM: ready");
      },
      { isCoreMLAction: true },
    );
  }, [runSafely]);

  const loadCoreMLModel = useCallback(async () => {
    await runSafely(
      "CoreML load",
      async () => {
        setCoreMLLoadState("downloading model");
        await coreMLManager.initialize(coreMLLoadOptions);
        setCoreMLLoadState("ready");
        setCoreMLStatus("CoreML LLM: ready");
        setStatus("CoreML model loaded");
      },
      { isCoreMLAction: true },
    );
  }, [coreMLLoadOptions, runSafely]);

  const runCoreMLGenerate = useCallback(async () => {
    await runSafely(
      "CoreML generate",
      async () => {
        if (!(await coreMLManager.isReady())) {
          setCoreMLLoadState("downloading model");
          await coreMLManager.initialize(coreMLLoadOptions);
          setCoreMLLoadState("ready");
          setCoreMLStatus("CoreML LLM: ready");
        }

        const text = await coreMLManager.generate(
          "You are a concise assistant.",
          coreMLPrompt,
          coreMLGenerateOptions,
        );
        setCoreMLOutput(text);
        setStatus("CoreML generation complete");
      },
      { isCoreMLAction: true },
    );
  }, [coreMLGenerateOptions, coreMLLoadOptions, coreMLPrompt, runSafely]);

  const runSttCapture = useCallback(async () => {
    if (isListening) {
      return;
    }

    setIsListening(true);
    await runSafely("Speech-to-text", async () => {
      setStatus("Listening... speak now");
      const transcript = await iosToolsService.transcribeSpeechOnce();
      setSpeechTranscript(transcript);
      setStatus("Speech captured");
    });
    setIsListening(false);
  }, [isListening, runSafely]);

  const saveNote = useCallback(async () => {
    await runSafely("Local save", async () => {
      if (!note.trim()) {
        throw new Error("Enter text before saving");
      }

      await iosToolsService.persistLocalNote(note);
      await iosToolsService.upsertVectorDocument(note);
      setStatus("Saved to SecureStore + local vector DB");
    });
  }, [note, runSafely]);

  const runVectorSearch = useCallback(async () => {
    await runSafely("Vector search", async () => {
      const next = await iosToolsService.searchVectorDocuments(searchQuery);
      setResults(next);
      setStatus(`Vector search completed (${next.length} results)`);
    });
  }, [runSafely, searchQuery]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Native Capability Hub (Dev Build)</Text>
      <Text style={styles.subtitle}>
        iOS native features for on-device workflows and diagnostics research.
      </Text>

      <SectionCard
        icon={Database}
        iconColor={Colors.dark.accent}
        title="Local storage + vector database"
      >
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Write a local note"
          placeholderTextColor={Colors.dark.textTertiary}
          style={styles.input}
        />
        <TouchableOpacity style={styles.button} onPress={saveNote}>
          <Text style={styles.buttonText}>Save note</Text>
        </TouchableOpacity>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Semantic search query"
          placeholderTextColor={Colors.dark.textTertiary}
          style={styles.input}
        />
        <TouchableOpacity style={styles.button} onPress={runVectorSearch}>
          <Text style={styles.buttonText}>Run vector search</Text>
        </TouchableOpacity>
        {results.map((item) => (
          <Text key={item.id} style={styles.result}>
            • {item.content} ({item.score.toFixed(3)})
          </Text>
        ))}
      </SectionCard>

      <DeviceNativeHubLocationSection
        MapViewNative={MapViewNative}
        runSafely={runSafely}
      />

      <SectionCard
        icon={Volume2}
        iconColor={Colors.dark.warning}
        title="Audio, TTS, STT"
      >
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            runSafely("Text-to-speech", async () => {
              await iosToolsService.speakText(
                "Native text to speech is active in your development build.",
              );
              setStatus("TTS completed");
            })
          }
        >
          <Text style={styles.buttonText}>Speak sample text</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, isListening && styles.buttonDisabled]}
          onPress={runSttCapture}
          disabled={isListening}
        >
          <Text style={styles.buttonText}>Capture speech-to-text</Text>
        </TouchableOpacity>
        <Text style={styles.result}>Transcript: {speechTranscript || "—"}</Text>
      </SectionCard>

      <SectionCard
        icon={CalendarDays}
        iconColor={Colors.dark.purple}
        title="Calendar + contacts"
      >
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            runSafely("Calendar", async () => {
              const eventId = await iosToolsService.createCalendarEvent();
              setStatus(`Calendar event created (${eventId})`);
            })
          }
        >
          <Text style={styles.buttonText}>Create calendar event</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            runSafely("Contacts", async () => {
              setContact(await iosToolsService.getPrimaryContactSummary());
              setStatus("Contact read succeeded");
            })
          }
        >
          <Text style={styles.buttonText}>Read primary contact</Text>
        </TouchableOpacity>
        <Text style={styles.result}>Contact: {contact}</Text>
      </SectionCard>

      <SectionCard
        icon={Phone}
        iconColor={Colors.dark.rose}
        title="Phone + messages"
      >
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            runSafely("Dialer", () => iosToolsService.openDialer("18005551212"))
          }
        >
          <Text style={styles.buttonText}>Open dialer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            runSafely("SMS", () =>
              iosToolsService.openSms(
                "18005551212",
                "Diagnostic test from native hub",
              ),
            )
          }
        >
          <Text style={styles.buttonText}>Open SMS composer</Text>
        </TouchableOpacity>
      </SectionCard>

      <View style={styles.status}>
        <Send size={12} color={Colors.dark.textSecondary} />
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <CoreMLSection
        isAvailable={isCoreMLAvailable}
        status={coreMLStatus}
        loadState={coreMLLoadState}
        prompt={coreMLPrompt}
        output={coreMLOutput}
        loadOptions={coreMLLoadOptions}
        generateOptions={coreMLGenerateOptions}
        modelPresets={COREML_MODEL_PRESETS}
        selectedModelPresetId={selectedModelPresetId}
        onSelectModelPreset={handleModelPresetSelect}
        onPromptChange={setCoreMLPrompt}
        onLoadOptionsChange={setCoreMLLoadOptions}
        onGenerateOptionsChange={setCoreMLGenerateOptions}
        onLoadModel={() => {
          void loadCoreMLModel();
        }}
        onGenerate={() => {
          void runCoreMLGenerate();
        }}
      />

      <SectionCard
        icon={Contact}
        iconColor={Colors.dark.accent}
        title="Build note"
      >
        <Text style={styles.result}>
          For full iOS native behavior, run this in a development build on a
          physical device (Xcode/EAS/AltStore).
        </Text>
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  content: { padding: 16, gap: 12 },
  title: { color: Colors.dark.text, fontSize: 19, fontWeight: "700" },
  subtitle: { color: Colors.dark.textSecondary, fontSize: 12, lineHeight: 17 },
  section: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { color: Colors.dark.text, fontWeight: "700", fontSize: 13 },
  input: {
    backgroundColor: Colors.dark.inputBackground,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    color: Colors.dark.text,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12,
  },
  promptInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  button: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sectionDisabled: {
    opacity: 0.5,
  },
  buttonText: { color: Colors.dark.text, fontSize: 12, fontWeight: "600" },
  result: { color: Colors.dark.textSecondary, fontSize: 12, lineHeight: 17 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetChip: {
    flex: 1,
    backgroundColor: Colors.dark.inputBackground,
    borderColor: Colors.dark.borderSubtle,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  presetChipActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  presetChipText: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  presetChipTextActive: {
    color: Colors.dark.text,
  },
  mapWrap: {
    height: 170,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  map: { flex: 1 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  statusText: { color: Colors.dark.textSecondary, fontSize: 12 },
});
