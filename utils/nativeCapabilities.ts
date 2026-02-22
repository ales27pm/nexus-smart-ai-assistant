import * as Calendar from "expo-calendar";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import * as Speech from "expo-speech";
import { Linking, Platform } from "react-native";

const VECTOR_DB_NAME = "native_vectors.db";
const STORAGE_KEY = "native_lab_last_note";
const EMBED_DIMENSIONS = 64;

export type VectorSearchResult = {
  id: number;
  content: string;
  score: number;
};

export type NetworkSnapshot = {
  ipAddress: string;
  isConnected: boolean;
  type: string;
  isInternetReachable: boolean | null;
};

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function computeEmbedding(text: string): number[] {
  const tokens = tokenize(text);
  const vector = Array.from<number>({ length: EMBED_DIMENSIONS }).fill(0);

  for (const token of tokens) {
    const index = hashToken(token) % EMBED_DIMENSIONS;
    vector[index] += 1;
  }

  const magnitude = Math.sqrt(
    vector.reduce((acc, value) => acc + value * value, 0),
  );
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embedding dimension mismatch");
  }

  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
  }

  return dot;
}

export function buildRviCaptureCommands(udid: string): string[] {
  if (!udid.trim()) {
    throw new Error("UDID is required for rvictl capture instructions");
  }

  return [
    `rvictl -s ${udid}`,
    "tcpdump -i rvi0 -n -s 0 -w capture.pcap",
    `rvictl -x ${udid}`,
  ];
}

async function getDb() {
  const db = await SQLite.openDatabaseAsync(VECTOR_DB_NAME);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS vector_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

export async function upsertVectorDocument(content: string): Promise<void> {
  const db = await getDb();
  const embedding = computeEmbedding(content);
  await db.runAsync(
    "INSERT INTO vector_docs (content, embedding, created_at) VALUES (?, ?, ?);",
    content,
    JSON.stringify(embedding),
    Date.now(),
  );
}

export async function searchVectorDocuments(
  query: string,
  limit = 5,
): Promise<VectorSearchResult[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    content: string;
    embedding: string;
  }>(
    "SELECT id, content, embedding FROM vector_docs ORDER BY created_at DESC LIMIT 200;",
  );
  const queryVector = computeEmbedding(query);

  return rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      score: cosineSimilarity(
        queryVector,
        JSON.parse(row.embedding) as number[],
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function persistLocalNote(note: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, note);
}

export async function loadLocalNote(): Promise<string> {
  return (await SecureStore.getItemAsync(STORAGE_KEY)) ?? "";
}

export async function getNetworkSnapshot(): Promise<NetworkSnapshot> {
  const [state, ipAddress] = await Promise.all([
    Network.getNetworkStateAsync(),
    Network.getIpAddressAsync().catch(() => "unavailable"),
  ]);

  return {
    ipAddress,
    isConnected: !!state.isConnected,
    type: state.type ?? "unknown",
    isInternetReachable: state.isInternetReachable ?? null,
  };
}

export async function getCurrentCoordinates(): Promise<string> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new Error("Location permission not granted");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
}

export async function createCalendarEvent(): Promise<string> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== Calendar.PermissionStatus.GRANTED) {
    throw new Error("Calendar permission denied");
  }

  const defaultCalendar = await Calendar.getDefaultCalendarAsync();
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const eventId = await Calendar.createEventAsync(defaultCalendar.id, {
    title: "Native Lab validation event",
    notes: "Created from Smart AI Assistant native capability hub.",
    startDate: start,
    endDate: end,
    timeZone: "UTC",
  });

  return eventId;
}

export async function getPrimaryContactSummary(): Promise<string> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== Contacts.PermissionStatus.GRANTED) {
    throw new Error("Contacts permission denied");
  }

  const result = await Contacts.getContactsAsync({ pageSize: 1 });
  if (!result.data.length) {
    return "No contacts found";
  }

  const contact = result.data[0];
  return `${contact.name ?? "Unnamed"}${contact.phoneNumbers?.[0]?.number ? ` • ${contact.phoneNumbers[0].number}` : ""}`;
}

export async function speakText(text: string): Promise<void> {
  const audio = await import("expo-audio");
  await audio.setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
  });

  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: "en-US",
      onDone: () => resolve(),
      onError: () => reject(new Error("Text-to-speech failed")),
    });
  });
}

export async function transcribeSpeechOnce(): Promise<string> {
  const speech = await import("expo-speech-recognition");
  const module = speech.ExpoSpeechRecognitionModule;

  if (!module.isRecognitionAvailable()) {
    throw new Error("Speech recognition service unavailable");
  }

  const permission = await module.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Speech permission was denied");
  }

  return new Promise((resolve, reject) => {
    let transcript = "";
    const timeout = setTimeout(() => {
      cleanUp();
      reject(new Error("No speech detected in time"));
    }, 8000);

    const resultSub = module.addListener("result", (event) => {
      transcript = event.results?.[0]?.transcript ?? transcript;
      if (event.isFinal && transcript) {
        cleanUp();
        resolve(transcript);
      }
    });

    const errorSub = module.addListener("error", (event) => {
      cleanUp();
      reject(
        new Error(event.message ?? event.error ?? "Speech recognition failed"),
      );
    });

    const endSub = module.addListener("end", () => {
      if (transcript) {
        cleanUp();
        resolve(transcript);
      }
    });

    function cleanUp() {
      clearTimeout(timeout);
      resultSub.remove();
      errorSub.remove();
      endSub.remove();
      try {
        module.stop();
      } catch {
        // no-op
      }
    }

    module.start({
      lang: "en-US",
      interimResults: true,
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
    });
  });
}

export async function openDialer(phoneNumber: string): Promise<void> {
  const url = `tel:${phoneNumber}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error("Dialer is unavailable on this device");
  }
  await Linking.openURL(url);
}

export async function openSms(
  phoneNumber: string,
  body: string,
): Promise<void> {
  const separator = Platform.OS === "ios" ? "&" : "?";
  const url = `sms:${phoneNumber}${separator}body=${encodeURIComponent(body)}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error("SMS app is unavailable on this device");
  }
  await Linking.openURL(url);
}
