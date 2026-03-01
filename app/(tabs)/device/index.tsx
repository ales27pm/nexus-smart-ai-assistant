import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
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
  Navigation,
  Phone,
  Send,
  Volume2,
} from "lucide-react-native";
import Colors from "@/constants/colors";
import {
  DEFAULT_COREML_BOS_TOKEN_ID,
  DEFAULT_COREML_EOS_TOKEN_ID,
  DEFAULT_COREML_LOAD_OPTIONS,
  DEFAULT_COREML_TOKENIZER_MERGES_PATH,
  DEFAULT_COREML_TOKENIZER_VOCAB_PATH,
  buildCoreMLChatPrompt,
  CoreMLBridge,
  toActionableCoreMLError,
} from "@/utils/coreml";
import { iosToolsService } from "@/utils/iosToolsService";
import { reportError } from "@/utils/globalErrorHandler";

type SafeActionOptions = {
  isCoreMLAction?: boolean;
};

type SafeAction = (
  label: string,
  fn: () => Promise<void>,
  options?: SafeActionOptions,
) => Promise<void>;

function useSafeAction(
  setStatus: React.Dispatch<React.SetStateAction<string>>,
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
        setStatus(`${label} failed: ${message}`);
        Alert.alert(`${label} failed`, message);
      }
    },
    [setStatus],
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
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Navigation size={14} color={Colors.dark.cyan} />
        <Text style={styles.sectionTitle}>GPS + native maps</Text>
      </View>
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
  const [coreML, setCoreML] = useState<CoreMLBridge | null>(null);
  const [coreMLStatus, setCoreMLStatus] = useState("CoreML LLM: not linked");
  const [coreMLModelName, setCoreMLModelName] = useState(
    DEFAULT_COREML_LOAD_OPTIONS.modelName ?? "MyLLM",
  );
  const [coreMLPrompt, setCoreMLPrompt] = useState(
    "Write a short, useful checklist for setting up a workshop.",
  );
  const [coreMLOutput, setCoreMLOutput] = useState("");
  const [coreMLVocabPath, setCoreMLVocabPath] = useState<string>(
    DEFAULT_COREML_TOKENIZER_VOCAB_PATH,
  );
  const [coreMLMergesPath, setCoreMLMergesPath] = useState<string>(
    DEFAULT_COREML_TOKENIZER_MERGES_PATH,
  );

  const runSafely = useSafeAction(setStatus);
  const isCoreMLAvailable = Platform.OS === "ios" && !!coreML;

  useEffect(() => {
    void runSafely("Load note", async () => {
      setNote(await iosToolsService.loadLocalNote());
    });

    if (Platform.OS !== "web") {
      import("react-native-maps")
        .then((module) => setMapViewNative(() => module.default))
        .catch((error) => console.warn("react-native-maps unavailable", error));
    }

    if (Platform.OS === "ios") {
      import("@/modules/expo-coreml-llm")
        .then((mod: any) => {
          if (mod?.CoreMLLLM) {
            setCoreML(mod.CoreMLLLM as CoreMLBridge);
            setCoreMLStatus("CoreML LLM: linked (not loaded)");
          }
        })
        .catch((error) => {
          console.warn("CoreML module unavailable", error);
          setCoreMLStatus(
            "CoreML LLM: not linked (run expo prebuild + dev build)",
          );
        });
    }
  }, [runSafely]);

  const loadCoreMLModel = useCallback(async () => {
    await runSafely(
      "CoreML load",
      async () => {
        if (!coreML) {
          throw new Error(
            "CoreML module not available (iOS dev build + prebuild required)",
          );
        }
        const selectedModelName = coreMLModelName.trim();
        const info = await coreML.loadModel({
          ...DEFAULT_COREML_LOAD_OPTIONS,
          modelName:
            selectedModelName ||
            DEFAULT_COREML_LOAD_OPTIONS.modelName ||
            "MyLLM",
        });
        setCoreMLStatus(`CoreML LLM loaded: ${JSON.stringify(info)}`);
        setStatus("CoreML model loaded");
      },
      { isCoreMLAction: true },
    );
  }, [coreML, coreMLModelName, runSafely]);

  const runCoreMLGenerate = useCallback(async () => {
    await runSafely(
      "CoreML generate",
      async () => {
        if (!coreML) {
          throw new Error(
            "CoreML module not available (iOS dev build + prebuild required)",
          );
        }

        let loaded = await coreML.isLoaded();
        if (!loaded) {
          const selectedModelName = coreMLModelName.trim();
          await coreML.loadModel({
            ...DEFAULT_COREML_LOAD_OPTIONS,
            modelName:
              selectedModelName ||
              DEFAULT_COREML_LOAD_OPTIONS.modelName ||
              "MyLLM",
          });
          loaded = await coreML.isLoaded();
        }

        if (!loaded) {
          throw new Error(
            "CoreML model failed to load. Verify the model name and bundled .mlmodelc asset.",
          );
        }

        const vocabPath =
          coreMLVocabPath.trim() || DEFAULT_COREML_TOKENIZER_VOCAB_PATH;
        const mergesPath =
          coreMLMergesPath.trim() || DEFAULT_COREML_TOKENIZER_MERGES_PATH;
        const tokenizer = {
          kind: "byte_level_bpe" as const,
          vocabJsonAssetPath: vocabPath,
          mergesTxtAssetPath: mergesPath,
          bosTokenId: DEFAULT_COREML_BOS_TOKEN_ID,
          eosTokenId: DEFAULT_COREML_EOS_TOKEN_ID,
        };

        const text = await coreML.generate(
          buildCoreMLChatPrompt("You are a concise assistant.", coreMLPrompt),
          {
            maxNewTokens: 160,
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            repetitionPenalty: 1.05,
            tokenizer,
          },
        );
        setCoreMLOutput(text);
        setStatus("CoreML generation complete");
      },
      { isCoreMLAction: true },
    );
  }, [
    coreML,
    coreMLModelName,
    coreMLPrompt,
    coreMLVocabPath,
    coreMLMergesPath,
    runSafely,
  ]);

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

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Database size={14} color={Colors.dark.accent} />
          <Text style={styles.sectionTitle}>
            Local storage + vector database
          </Text>
        </View>
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
      </View>

      <DeviceNativeHubLocationSection
        MapViewNative={MapViewNative}
        runSafely={runSafely}
      />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Volume2 size={14} color={Colors.dark.warning} />
          <Text style={styles.sectionTitle}>Audio, TTS, STT</Text>
        </View>
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
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <CalendarDays size={14} color={Colors.dark.purple} />
          <Text style={styles.sectionTitle}>Calendar + contacts</Text>
        </View>
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
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Phone size={14} color={Colors.dark.rose} />
          <Text style={styles.sectionTitle}>Phone + messages</Text>
        </View>
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
      </View>

      <View style={styles.status}>
        <Send size={12} color={Colors.dark.textSecondary} />
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View
        style={[styles.section, !isCoreMLAvailable && styles.sectionDisabled]}
        pointerEvents={isCoreMLAvailable ? "auto" : "none"}
      >
        <View style={styles.sectionHeader}>
          <Brain size={14} color={Colors.dark.cyan} />
          <Text style={styles.sectionTitle}>On-device CoreML LLM (iOS)</Text>
        </View>
        {!isCoreMLAvailable && (
          <Text style={styles.result}>
            On-device CoreML controls are available on iOS dev builds with the
            native module linked. This platform uses server-side generation.
          </Text>
        )}
        <Text style={styles.result}>{coreMLStatus}</Text>
        <TextInput
          value={coreMLModelName}
          onChangeText={setCoreMLModelName}
          placeholder='Model name in iOS bundle (e.g. "MyLLM" -> MyLLM.mlmodelc)'
          placeholderTextColor={Colors.dark.textTertiary}
          style={styles.input}
        />
        <TouchableOpacity
          style={styles.button}
          onPress={loadCoreMLModel}
          disabled={!isCoreMLAvailable}
        >
          <Text style={styles.buttonText}>Load CoreML model</Text>
        </TouchableOpacity>
        <TextInput
          value={coreMLVocabPath}
          onChangeText={setCoreMLVocabPath}
          placeholder="Tokenizer vocab path (byte_level_bpe: .../vocab.json, gpt2_bpe: .../gpt2-vocab.json)"
          placeholderTextColor={Colors.dark.textTertiary}
          style={styles.input}
        />
        <TextInput
          value={coreMLMergesPath}
          onChangeText={setCoreMLMergesPath}
          placeholder="Tokenizer merges path (byte_level_bpe: .../merges.txt, gpt2_bpe: .../gpt2-merges.txt)"
          placeholderTextColor={Colors.dark.textTertiary}
          style={styles.input}
        />
        <TextInput
          value={coreMLPrompt}
          onChangeText={setCoreMLPrompt}
          placeholder="Prompt"
          placeholderTextColor={Colors.dark.textTertiary}
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          multiline
        />
        <TouchableOpacity
          style={styles.button}
          onPress={runCoreMLGenerate}
          disabled={!isCoreMLAvailable}
        >
          <Text style={styles.buttonText}>Generate locally</Text>
        </TouchableOpacity>
        <Text style={styles.result}>
          Output: {coreMLOutput ? coreMLOutput : "—"}
        </Text>
        <Text style={styles.result}>
          Notes: CoreML model must be bundled as a compiled .mlmodelc. Tokenizer
          kind may be byte_level_bpe or gpt2_bpe, and vocab/merges paths must
          match that tokenizer asset set.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Contact size={14} color={Colors.dark.accent} />
          <Text style={styles.sectionTitle}>Build note</Text>
        </View>
        <Text style={styles.result}>
          For full iOS native behavior, run this in a development build on a
          physical device (Xcode/EAS/AltStore).
        </Text>
      </View>
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
