/**
 * IndexedDB database layer using Dexie.js
 * All learning data is stored locally in the user's browser.
 */

import Dexie, { type EntityTable } from "dexie";
import type { MaterialQuizSession } from "./types";
import type { AccountSnapshot } from "./utils/accountSync";

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
  noteId?: string;
  messageCount?: number;
}

export interface DBMessage {
  id?: string;
  conversationId: string;
  sender: "user" | "system";
  text: string;
  chips: string[];
  autoNote?: string;
  topicMasteryImpact?: Record<string, number>;
  mode?: "ai" | "local";
  isScopeNotice?: boolean;
  sources?: { noteId: string; topic: string; snippet: string }[];
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
  id?: string;
  key: string;
  value: string;
}

export interface DBMaterial {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface DBLibraryFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface DBMaterialPackage {
  id: string;
  name: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DBMaterialFile {
  id: string;
  packageId: string;
  name: string;
  content: string;
  format: string;
  createdAt: string;
  updatedAt: string;
}

/** Last snapshot both the browser and the account agreed on (per account). */
export interface DBSyncState {
  id: string;
  updatedAt: string | null;
  snapshot: AccountSnapshot;
}

// ─── Database definition ───

class QuicklyDB extends Dexie {
  folders!: EntityTable<DBNoteFolder, "id">;
  notes!: EntityTable<DBNote, "id">;
  conversations!: EntityTable<DBConversation, "id">;
  messages!: EntityTable<DBMessage, "id">;
  reviewHistory!: EntityTable<DBReviewRecord, "id">;
  appSettings!: EntityTable<DBAppSetting, "id">;
  materials!: EntityTable<DBMaterial, "id">;
  libraryFolders!: EntityTable<DBLibraryFolder, "id">;
  materialPackages!: EntityTable<DBMaterialPackage, "id">;
  materialFiles!: EntityTable<DBMaterialFile, "id">;
  materialQuizSessions!: EntityTable<MaterialQuizSession, "id">;
  syncState!: EntityTable<DBSyncState, "id">;

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
    // v2: study material library
    this.version(2).stores({
      materials: "id, name, updatedAt",
    });
    // v3: resource packages + folders (multiple files per package)
    this.version(3)
      .stores({
        libraryFolders: "id, name",
        materialPackages: "id, folderId, updatedAt",
        materialFiles: "id, packageId, name",
      })
      .upgrade(async (tx) => {
        // Migrate each flat v2 material into a single-file package.
        const oldMaterials = await tx.table("materials").toArray();
        if (!oldMaterials || oldMaterials.length === 0) return;

        const packages: DBMaterialPackage[] = [];
        const files: DBMaterialFile[] = [];

        for (const material of oldMaterials) {
          const packageId = `pkg-migrated-${material.id}`;
          const createdAt = material.createdAt || new Date().toISOString();
          const updatedAt = material.updatedAt || createdAt;
          packages.push({
            id: packageId,
            name: material.name || "Imported material",
            createdAt,
            updatedAt,
          });
          files.push({
            id: `file-migrated-${material.id}`,
            packageId,
            name: material.name || "material.txt",
            content: material.content || "",
            format: "txt",
            createdAt,
            updatedAt,
          });
        }

        await tx.table("materialPackages").bulkAdd(packages);
        await tx.table("materialFiles").bulkAdd(files);
      });
    // v4: persistent material quiz sessions (questions + progress)
    this.version(4).stores({
      materialQuizSessions: "id, updatedAt",
    });
    // v5: last agreed sync snapshot (per account) for three-way merge
    this.version(5).stores({
      syncState: "id",
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
    // The table's primary key is `id` (not auto-increment), so it must be
    // supplied explicitly. Deriving it from `key` keeps it stable across
    // devices, which matters for the account snapshot merge.
    await db.appSettings.add({ id: `setting:${key}`, key, value: json });
  }
}
