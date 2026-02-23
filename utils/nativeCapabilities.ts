import * as Calendar from "expo-calendar";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import * as Speech from "expo-speech";
import { setAudioModeAsync } from "expo-audio";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Linking, Platform } from "react-native";
import { recognizeOnce } from "@/utils/speechRecognition";
import { computeEmbedding, cosineSimilarity } from "@/utils/vectorUtils";

const VECTOR_DB_NAME = "native_vectors.db";
const STORAGE_KEY = "native_lab_last_note";
const VECTOR_SEARCH_CANDIDATE_LIMIT = 400;
let cachedDb: SQLite.SQLiteDatabase | null = null;

export { computeEmbedding, cosineSimilarity };

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

export function buildRviCaptureCommands(udid: string): string[] {
  const normalizedUdid = udid.trim();

  if (!normalizedUdid) {
    throw new Error("UDID is required for rvictl capture instructions");
  }

  if (!/^[a-fA-F0-9-]+$/.test(normalizedUdid)) {
    throw new Error("UDID must contain only hexadecimal characters and dashes");
  }

  return [
    `rvictl -s ${normalizedUdid}`,
    "tcpdump -i rvi0 -n -s 0 -w capture.pcap",
    `rvictl -x ${normalizedUdid}`,
  ];
}

async function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  cachedDb = await SQLite.openDatabaseAsync(VECTOR_DB_NAME);
  await cachedDb.execAsync(`
    CREATE TABLE IF NOT EXISTS vector_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  return cachedDb;
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
  const queryVector = computeEmbedding(query);
  const queryVectorJson = JSON.stringify(queryVector);

  const candidateLimit = Math.max(limit, VECTOR_SEARCH_CANDIDATE_LIMIT);
  const rows = await db.getAllAsync<VectorSearchResult>(
    `WITH recent_docs AS (
      SELECT id, content, embedding
      FROM vector_docs
      ORDER BY created_at DESC
      LIMIT ?
    ),
    query_vector AS (
      SELECT CAST(value AS REAL) AS q_value, key AS idx
      FROM json_each(?)
    )
    SELECT
      d.id AS id,
      d.content AS content,
      CASE
        WHEN norm.doc_norm = 0 OR norm.query_norm = 0 THEN 0
        ELSE norm.dot_product / (norm.doc_norm * norm.query_norm)
      END AS score
    FROM recent_docs d
    JOIN (
      SELECT
        vd.id,
        SUM(CAST(doc.value AS REAL) * q.q_value) AS dot_product,
        SQRT(SUM(CAST(doc.value AS REAL) * CAST(doc.value AS REAL))) AS doc_norm,
        SQRT(SUM(q.q_value * q.q_value)) AS query_norm
      FROM recent_docs vd
      JOIN json_each(vd.embedding) doc
      JOIN query_vector q ON q.idx = doc.key
      GROUP BY vd.id
    ) norm ON norm.id = d.id
    ORDER BY score DESC
    LIMIT ?;`,
    candidateLimit,
    queryVectorJson,
    limit,
  );

  return rows;
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

  const defaultCalendar =
    Platform.OS === "ios"
      ? await Calendar.getDefaultCalendarAsync()
      : (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).find(
          (calendar) => calendar.allowsModifications,
        );

  if (!defaultCalendar) {
    throw new Error("No writable calendar available on this device");
  }

  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const eventId = await Calendar.createEventAsync(defaultCalendar.id, {
    title: "Native Lab validation event",
    notes: "Created from Smart AI Assistant native capability hub.",
    startDate: start,
    endDate: end,
    timeZone,
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
  await setAudioModeAsync({
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
  const module = ExpoSpeechRecognitionModule;

  if (!module.isRecognitionAvailable()) {
    throw new Error("Speech recognition service unavailable");
  }

  const permission = await module.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Speech permission was denied");
  }

  const { promise, cancel } = recognizeOnce(module, 8000);

  try {
    module.start({
      lang: "en-US",
      interimResults: true,
      requiresOnDeviceRecognition: false,
      addsPunctuation: true,
    });
  } catch (error) {
    cancel();
    throw error;
  }

  return promise;
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
