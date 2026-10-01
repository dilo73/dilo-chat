// ─── Offline outbox: messages queued while the app is "Off" ───────────────
// Stored in AsyncStorage so they survive app restarts, then auto-sent later.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface QueuedMessage {
  tempId: string;
  chatId: string;
  text: string;
  createdAt: number;
}

const KEY = 'dilochat_outbox_v1';

async function readAll(): Promise<QueuedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedMessage[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: QueuedMessage[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function enqueueMessage(chatId: string, text: string): Promise<QueuedMessage> {
  const item: QueuedMessage = {
    tempId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    chatId,
    text,
    createdAt: Date.now(),
  };
  const all = await readAll();
  all.push(item);
  await writeAll(all);
  return item;
}

export async function getQueued(chatId?: string): Promise<QueuedMessage[]> {
  const all = await readAll();
  return chatId ? all.filter((m) => m.chatId === chatId) : all;
}

export async function removeQueued(tempId: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((m) => m.tempId !== tempId));
}
