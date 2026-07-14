/**
 * IndexedDB database layer using Dexie.js
 * All learning data is stored locally in the user's browser.
 */

import Dexie, { type EntityTable } from "dexie";

// ─── Type definitions ───

export interface DBNoteFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface DBNote {
  id: string;
  topic: string;
  content: string;
  timestamp: string;
  folderId?: string;
}

export interface DBConversation {
  id?: string;
  title?: string;
  topicTags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DBMessage {
  id?: string;
  conversationId: string;
  sender: "user" | "system";
  text: string;
  chips: string[];
  autoNote?: string;
  topicMasteryImpact?: Record<string, number>;
  createdAt: string;
}

export interface DBReviewRecord {
  id?: string;
  topicId: string;
  topicName: string;
  score: number;
  total: number;
  accuracy: number;
  date: string;
}

export interface DBAppSetting {
  id?: number;
  key: string;
  value: string;
}

// ─── Database definition ───

class QuicklyDB extends Dexie {
  folders!: EntityTable<DBNoteFolder, "id">;
  notes!: EntityTable<DBNote, "id">;
  conversations!: EntityTable<DBConversation, "id">;
  messages!: EntityTable<DBMessage, "id">;
  reviewHistory!: EntityTable<DBReviewRecord, "id">;
  appSettings!: EntityTable<DBAppSetting, "id">;

  constructor() {
    super("QuicklyDB");
    this.version(1).stores({
      folders: "id, name",
      notes: "id, topic, folderId, timestamp",
      conversations: "id, createdAt, updatedAt",
      messages: "id, conversationId, sender, createdAt",
      reviewHistory: "id, topicId, date",
      appSettings: "id, &key",
    });
  }
}

export const db = new QuicklyDB();

// ─── Helper: load app setting by key ───

export async function loadSetting<T = string>(
  key: string,
  defaultValue: T,
): Promise<T> {
  const row = await db.appSettings.where("key").equals(key).first();
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

// ─── Helper: save app setting ───

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const current = await db.appSettings.where("key").equals(key).first();
  const json = JSON.stringify(value);
  if (current) {
    await db.appSettings.update(current.id!, { value: json });
  } else {
    await db.appSettings.add({ key, value: json });
  }
}
