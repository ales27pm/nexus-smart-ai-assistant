import AsyncStorage from '@react-native-async-storage/async-storage';
import { Conversation } from '@/types';

const LIST_KEY = 'nexus_conv_list';
const MSG_PREFIX = 'nexus_msgs_';

export async function loadConversationList(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

export async function saveConversationList(list: Conversation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch (e) {
    console.log('[NEXUS] Failed to save conversation list:', e);
  }
}

export async function upsertConversation(conv: Conversation): Promise<void> {
  const list = await loadConversationList();
  const idx = list.findIndex((c) => c.id === conv.id);
  if (idx >= 0) {
    list[idx] = conv;
  } else {
    list.unshift(conv);
  }
  await saveConversationList(list);
}

export async function removeConversation(id: string): Promise<void> {
  const list = await loadConversationList();
  await saveConversationList(list.filter((c) => c.id !== id));
  await AsyncStorage.removeItem(MSG_PREFIX + id);
}

export async function clearAllConversations(): Promise<void> {
  const list = await loadConversationList();
  for (const c of list) {
    await AsyncStorage.removeItem(MSG_PREFIX + c.id);
  }
  await AsyncStorage.removeItem(LIST_KEY);
}

export async function saveMessages(convId: string, messages: unknown[]): Promise<void> {
  await AsyncStorage.setItem(MSG_PREFIX + convId, JSON.stringify(messages));
  console.log('[NEXUS] Messages saved for:', convId, 'count:', messages.length);
}

export async function loadMessages(convId: string): Promise<unknown[]> {
  try {
    const raw = await AsyncStorage.getItem(MSG_PREFIX + convId);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
