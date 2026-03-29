import { openDB, IDBPDatabase } from 'idb'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }>
  timestamp: number
}

const DB_NAME = 'liquidai-tool-calling'
const STORE = 'messages'
let db: IDBPDatabase | null = null

async function getDB() {
  if (!db) {
    db = await openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      },
    })
  }
  return db
}

export async function loadMessages(): Promise<ChatMessage[]> {
  try {
    const database = await getDB()
    const all = await database.getAll(STORE)
    return all as ChatMessage[]
  } catch {
    return []
  }
}

export async function saveMessage(msg: ChatMessage): Promise<void> {
  try {
    const database = await getDB()
    await database.add(STORE, msg)
  } catch {
    // ignore
  }
}

export async function clearMessages(): Promise<void> {
  try {
    const database = await getDB()
    await database.clear(STORE)
  } catch {
    // ignore
  }
}
