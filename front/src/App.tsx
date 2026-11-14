import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  GraduationCap, 
  FileText, 
  Sparkles, 
  Route, 
  RotateCcw, 
  Send, 
  Paperclip,
  Bell,
  HelpCircle,
  Activity,
  ArrowRight,
  BookOpen,
  Milestone,
  CheckCircle2,
  Lock,
  Compass,
  FileDown,
  FileUp,
  RefreshCw,
  Plus,
  HelpCircle as HelpIcon,
  Flame,
  Award,
  Brain,
  Folder,
  X,
  Undo2,
  History,
  Database,
  ChevronDown,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Sidebar from "./components/Sidebar";
import ChatHistoryPanel from "./components/ChatHistoryPanel";
import NotesChest from "./components/NotesChest";
import ImasNotes from "./components/ImasNotes";
import ActiveQuiz from "./components/ActiveQuiz";
import MaterialReview from "./components/MaterialReview";
import MaterialQuiz from "./components/MaterialQuiz";
import MaterialQuizHistory from "./components/MaterialQuizHistory";
import MaterialLibrary from "./components/MaterialLibrary";
import ImasKnowledgeBase from "./components/ImasKnowledgeBase";
import ProgressHub from "./components/ProgressHub";
import SettingsPage from "./components/SettingsPage";
import AuthPage from "./components/AuthPage";
import ToastContainer, { Notification } from "./components/ToastContainer";
import { Message, MasteryScores, NoteItem, NoteFolder, AIModelConfig, AI_MODEL_PRESETS, IMAConfig, DEFAULT_IMA_CONFIG, ReviewRecord, MaterialQuizResult, MaterialQuizSession, MaterialQuizProgress, EMPTY_MATERIAL_PROGRESS, ConversationSummary, LibraryFolder, MaterialPackage, MaterialFile, CloudUser } from "./types";
import { useI18n } from "./i18n";
import { useReminder } from "./hooks/useReminder";
import { db, loadSetting, saveSetting, type DBConversation } from "./db";
import { searchNotes } from "./utils/localSearch";
import { encryptSecret, decryptSecret } from "./utils/secureSecret";
import {
  type AccountSnapshot,
  emptySnapshot,
  mergeSnapshots,
  normalizeSnapshot,
  snapshotFingerprint,
} from "./utils/accountSync";

type StudyScope =
  | { kind: "all" }
  | { kind: "local-folder"; folderId: string; name: string }
  | { kind: "local-note"; noteId: string; name: string }
  | { kind: "ima-notebook"; notebookId: string; name: string }
  | { kind: "ima-kb"; kbId: string; name: string };

async function collectLocalSnapshot(): Promise<AccountSnapshot> {
  const [
    notes, folders, reviewHistory, conversations, messages, appSettings,
    materialQuizSessions, libraryFolders, materialPackages, materialFiles,
  ] = await Promise.all([
    db.notes.toArray(),
    db.folders.toArray(),
    db.reviewHistory.toArray(),
    db.conversations.toArray(),
    db.messages.toArray(),
    db.appSettings.toArray(),
    db.materialQuizSessions.toArray(),
    db.libraryFolders.toArray(),
    db.materialPackages.toArray(),
    db.materialFiles.toArray(),
  ]);
  const demoNoteIds = new Set(["note-lr"]);
  const demoFolderIds = new Set(["folder-ml", "folder-math"]);
  return {
    notes: notes.filter((note: any) => !demoNoteIds.has(note.id)),
    folders: folders.filter((folder: any) => !demoFolderIds.has(folder.id)),
    reviewHistory,
    conversations,
    messages,
    appSettings,
    materialQuizSessions,
    libraryFolders,
    materialPackages,
    materialFiles,
    savedAt: new Date().toISOString(),
  };
}

async function clearLocalPreferences(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.notes,
      db.folders,
      db.reviewHistory,
      db.conversations,
      db.messages,
      db.appSettings,
      db.libraryFolders,
      db.materialPackages,
      db.materialFiles,
      db.materials,
      db.materialQuizSessions,
      db.syncState,
    ],
    async () => {
      await Promise.all([
        db.notes.clear(),
        db.folders.clear(),
        db.reviewHistory.clear(),
        db.conversations.clear(),
        db.messages.clear(),
        db.appSettings.clear(),
        db.libraryFolders.clear(),
        db.materialPackages.clear(),
        db.materialFiles.clear(),
        db.materials.clear(),
        db.materialQuizSessions.clear(),
        db.syncState.clear(),
      ]);
    },
  );
}

function stashActiveConfigs(userId: string) {
  const aiConfig = localStorage.getItem("quickly_ai_config");
  const imaConfig = localStorage.getItem("quickly_ima_config");
  if (aiConfig) localStorage.setItem(`quickly_user_config:${userId}:ai`, aiConfig);
  if (imaConfig) localStorage.setItem(`quickly_user_config:${userId}:ima`, imaConfig);
}

function restoreUserConfigs(userId: string) {
  const aiConfig = localStorage.getItem(`quickly_user_config:${userId}:ai`);
  const imaConfig = localStorage.getItem(`quickly_user_config:${userId}:ima`);
  if (aiConfig) localStorage.setItem("quickly_ai_config", aiConfig);
  else localStorage.removeItem("quickly_ai_config");
  if (imaConfig) localStorage.setItem("quickly_ima_config", imaConfig);
  else localStorage.removeItem("quickly_ima_config");
}

async function restoreLocalSnapshot(snapshotInput: AccountSnapshot): Promise<void> {
  const snapshot = normalizeSnapshot(snapshotInput);
  await db.transaction(
    "rw",
    [
      db.notes, db.folders, db.reviewHistory, db.conversations, db.messages,
      db.appSettings, db.materialQuizSessions, db.libraryFolders,
      db.materialPackages, db.materialFiles,
    ],
    async () => {
      await Promise.all([
        db.notes.clear(),
        db.folders.clear(),
        db.reviewHistory.clear(),
        db.conversations.clear(),
        db.messages.clear(),
        db.appSettings.clear(),
        db.materialQuizSessions.clear(),
        db.libraryFolders.clear(),
        db.materialPackages.clear(),
        db.materialFiles.clear(),
      ]);

      const put = async (table: any, rows: any) => {
        if (Array.isArray(rows) && rows.length > 0) await table.bulkPut(rows);
      };
      const demoNoteIds = new Set(["note-lr"]);
      const demoFolderIds = new Set(["folder-ml", "folder-math"]);
      await put(db.notes, snapshot.notes.filter((note: any) => !demoNoteIds.has(note.id)));
      await put(db.folders, snapshot.folders.filter((folder: any) => !demoFolderIds.has(folder.id)));
      await put(db.reviewHistory, snapshot.reviewHistory);
      await put(db.conversations, snapshot.conversations);
      await put(db.messages, snapshot.messages);
      await put(db.appSettings, snapshot.appSettings);
      await put(db.materialQuizSessions, snapshot.materialQuizSessions);
      await put(db.libraryFolders, snapshot.libraryFolders);
      await put(db.materialPackages, snapshot.materialPackages);
      await put(db.materialFiles, snapshot.materialFiles);
    },
  );
}

/** Throws when the snapshot could not be fetched — callers must not treat that
 *  as "no account data", otherwise they would overwrite the cloud copy. */
async function fetchAccountSnapshot(): Promise<{ snapshot: AccountSnapshot | null; updatedAt: string | null }> {
  const response = await fetch("/api/user-data/snapshot", { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Snapshot fetch failed (${response.status})`);
  const payload = await response.json().catch(() => null);
  return {
    snapshot: payload?.data && typeof payload.data === "object"
      ? normalizeSnapshot(payload.data as AccountSnapshot)
      : null,
    updatedAt: typeof payload?.updatedAt === "string" ? payload.updatedAt : null,
  };
}

interface SaveSnapshotResult {
  ok: boolean;
  conflict?: boolean;
  updatedAt?: string | null;
  status?: number;
  error?: string;
}

async function saveAccountSnapshot(
  snapshot: AccountSnapshot,
  baseUpdatedAt: string | null,
): Promise<SaveSnapshotResult> {
  const response = await fetch("/api/user-data/snapshot", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: snapshot, baseUpdatedAt }),
  });
  const payload = await response.json().catch(() => null);
  if (response.status === 409) return { ok: false, conflict: true, status: 409 };
  if (!response.ok) {
    return { ok: false, status: response.status, error: payload?.error };
  }
  return { ok: true, updatedAt: typeof payload?.updatedAt === "string" ? payload.updatedAt : null };
}

export default function App() {
  const { t, locale } = useI18n();

  const [isDbReady, setIsDbReady] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("study");
  const [reviewMode, setReviewMode] = useState<"notes" | "material">("notes");
  const [expandedReviewFolders, setExpandedReviewFolders] = useState<Set<string>>(new Set());

  const toggleReviewFolder = (folderId: string) => {
    setExpandedReviewFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };
  const [statusMode, setStatusMode] = useState<string>("simulator");
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [hasBuiltinAI, setHasBuiltinAI] = useState<boolean>(false);
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => localStorage.getItem("quickly_study_ai") !== "false");

  // Decrypt API keys on load and migrate legacy plaintext keys.
  useEffect(() => {
    let cancelled = false;
    const hydrateSecrets = async () => {
      const aiRaw = localStorage.getItem("quickly_ai_config");
      if (aiRaw) {
        try {
          const parsed = JSON.parse(aiRaw);
          if (typeof parsed.apiKey === "string" && parsed.apiKey) {
            const key = parsed.apiKey;
            if (!cancelled) setModelConfig(prev => ({ ...prev, apiKey: key }));
            try {
              const apiKeyEnc = await encryptSecret(key);
              localStorage.setItem(
                "quickly_ai_config",
                JSON.stringify({ ...parsed, apiKey: "", apiKeyEnc }),
              );
            } catch { /* leave legacy value if encryption is unavailable */ }
          } else if (typeof parsed.apiKeyEnc === "string" && parsed.apiKeyEnc) {
            const key = await decryptSecret(parsed.apiKeyEnc);
            if (!cancelled && key) setModelConfig(prev => ({ ...prev, apiKey: key }));
          }
        } catch { /* ignore corrupt config */ }
      }

      const imaRaw = localStorage.getItem("quickly_ima_config");
      if (imaRaw) {
        try {
          const parsed = JSON.parse(imaRaw);
          if (typeof parsed.apiKey === "string" && parsed.apiKey) {
            const key = parsed.apiKey;
            if (!cancelled) setImaConfig(prev => ({ ...prev, apiKey: key }));
            try {
              const apiKeyEnc = await encryptSecret(key);
              localStorage.setItem(
                "quickly_ima_config",
                JSON.stringify({ ...parsed, apiKey: "", apiKeyEnc }),
              );
            } catch { /* leave legacy value if encryption is unavailable */ }
          } else if (typeof parsed.apiKeyEnc === "string" && parsed.apiKeyEnc) {
            const key = await decryptSecret(parsed.apiKeyEnc);
            if (!cancelled && key) setImaConfig(prev => ({ ...prev, apiKey: key }));
          }
        } catch { /* ignore corrupt config */ }
      }
    };
    void hydrateSecrets();
    return () => { cancelled = true; };
  }, []);

  // Web account state. Content lives in IMA; this only guards the small
  // metadata snapshot stored by the server.
  const [currentUser, setCurrentUser] = useState<CloudUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  // Base = last snapshot both sides agreed on. Null means "not synced yet";
  // the sync loop will pull before it is allowed to push anything.
  const baseSnapshotRef = useRef<AccountSnapshot | null>(null);
  const baseUpdatedAtRef = useRef<string | null>(null);
  const baseFingerprintRef = useRef<string>("");
  const syncingRef = useRef(false);
  const syncErrorRef = useRef<string>("");
  const syncAccountIdRef = useRef<string | null>(null);
  const lastBasePersistRef = useRef(0);

  const setSyncBase = (snapshot: AccountSnapshot | null, updatedAt: string | null, persist = true) => {
    baseSnapshotRef.current = snapshot;
    baseUpdatedAtRef.current = updatedAt;
    baseFingerprintRef.current = snapshot ? snapshotFingerprint(snapshot) : "";
    // Persist the base so deletions made on another device survive a reload
    // (a memory-only base would misread them as "local additions").
    const accountId = syncAccountIdRef.current;
    if (!accountId || !persist) return;
    // An older ancestor is still valid for deletion tracking, so writing the
    // full base on every push is unnecessary; throttle it.
    const now = Date.now();
    if (snapshot && now - lastBasePersistRef.current < 30_000) return;
    lastBasePersistRef.current = now;
    const id = `base:${accountId}`;
    if (snapshot) {
      void db.syncState.put({ id, updatedAt, snapshot }).catch((error) => {
        console.error("Failed to persist sync base", error);
      });
    } else {
      void db.syncState.delete(id).catch(() => { /* ignore */ });
    }
  };
  const configFingerprintRef = useRef(
    `${localStorage.getItem("quickly_ai_config") || ""}|${localStorage.getItem("quickly_ima_config") || ""}`,
  );

  const bootstrapAccount = async (user: CloudUser) => {
    syncAccountIdRef.current = user.id;
    const storedAccountId = localStorage.getItem("quickly_account_id");

    // Keep BYOK keys browser-local, but scope them to the account that used
    // them so switching accounts never leaks credentials.
    if (storedAccountId) stashActiveConfigs(storedAccountId);
    else stashActiveConfigs(user.id);

    // A different account was used in this browser. Clear local metadata
    // before restoring this account's snapshot.
    if (storedAccountId && storedAccountId !== user.id) {
      await clearLocalPreferences();
    }
    restoreUserConfigs(user.id);

    const configChanged = () => (
      `${localStorage.getItem("quickly_ai_config") || ""}|${localStorage.getItem("quickly_ima_config") || ""}`
      !== configFingerprintRef.current
    );

    if (storedAccountId === user.id) {
      if (configChanged()) {
        window.location.reload();
        return;
      }
      // The sync loop pulls the remote snapshot before its first write.
      setCurrentUser(user);
      setAccountReady(true);
      return;
    }

    try {
      const { snapshot: remote, updatedAt } = await fetchAccountSnapshot();
      if (remote) {
        await restoreLocalSnapshot(remote);
        setSyncBase(remote, updatedAt);
        // Make sure the merge ancestor is on disk before the reload below.
        await db.syncState.put({ id: `base:${user.id}`, updatedAt, snapshot: remote }).catch(() => {});
        localStorage.setItem("quickly_account_id", user.id);
        window.location.reload();
        return;
      }

      // First login: migrate the current local data into the account. The
      // `baseUpdatedAt: null` guard makes the server reject the write if
      // another device created a snapshot in the meantime.
      const snapshot = await collectLocalSnapshot();
      const result = await saveAccountSnapshot(snapshot, null);
      if (result.ok) {
        setSyncBase(normalizeSnapshot(snapshot), result.updatedAt ?? null);
        localStorage.setItem("quickly_account_id", user.id);
      }
      if (configChanged()) {
        window.location.reload();
        return;
      }
      setCurrentUser(user);
      setAccountReady(true);
      if (!result.ok && !result.conflict) {
        addNotification(
          t.accountSync.failedTitle,
          result.error || t.accountSync.failedMessage,
          "reminder",
        );
      }
    } catch (error) {
      console.error("Failed to bootstrap account metadata", error);
      // Leave the account id unset and the sync base empty: the app stays
      // usable offline, but nothing is pushed until a pull succeeds. The
      // persisted base is kept so a later pull can still merge correctly.
      baseSnapshotRef.current = null;
      baseUpdatedAtRef.current = null;
      baseFingerprintRef.current = "";
      if (configChanged()) {
        window.location.reload();
        return;
      }
      setCurrentUser(user);
      setAccountReady(true);
      addNotification(t.accountSync.offlineTitle, t.accountSync.offlineMessage, "reminder");
    }
  };

  const handleAuthed = async (user: CloudUser) => {
    setCurrentUser(user);
    await bootstrapAccount(user);
  };

  const handleLogout = async () => {
    try {
      const snapshot = await collectLocalSnapshot();
      if (baseSnapshotRef.current) {
        await saveAccountSnapshot(snapshot, baseUpdatedAtRef.current);
      }
    } catch (error) {
      console.error("Failed to flush account snapshot", error);
    }
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch { /* ignore */ }
    if (currentUser) stashActiveConfigs(currentUser.id);
    localStorage.removeItem("quickly_ai_config");
    localStorage.removeItem("quickly_ima_config");
    setCurrentUser(null);
    setAccountReady(false);
    window.location.reload();
  };

  // Check the session once on load. The DB hydrates in parallel; rendering is
  // gated below so the app never starts syncing before account bootstrap.
  useEffect(() => {
    if (!isDbReady) return;
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        if (!cancelled && payload?.user) {
          await bootstrapAccount(payload.user as CloudUser);
        }
      })
      .catch(() => { /* not logged in */ })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => { cancelled = true; };
  }, [isDbReady]);

  // Two-way metadata sync. Pulls remote changes first (three-way merge), then
  // pushes only what actually changed. A push never happens before the first
  // successful pull, so a failing/slow server can't wipe the account copy.
  useEffect(() => {
    if (!currentUser || !accountReady || !isDbReady) return;
    let stopped = false;

    const reportSyncError = (message: string) => {
      if (syncErrorRef.current === message) return;
      syncErrorRef.current = message;
      addNotification(t.accountSync.failedTitle, message, "reminder");
    };

    const refreshStateFromDb = async () => {
      const [
        dbNotes, dbFolders, dbReviews, dbConversations, dbSessions,
        dbLibraryFolders, dbPackages, dbFiles,
      ] = await Promise.all([
        db.notes.toArray(),
        db.folders.toArray(),
        db.reviewHistory.toArray(),
        db.conversations.toArray(),
        db.materialQuizSessions.toArray(),
        db.libraryFolders.toArray(),
        db.materialPackages.toArray(),
        db.materialFiles.toArray(),
      ]);

      setNotes(dbNotes.map(note => ({
        id: note.id,
        topic: note.topic,
        content: note.content,
        timestamp: note.timestamp,
        folderId: note.folderId,
      })));
      setFolders(dbFolders.map(folder => ({
        id: folder.id,
        name: folder.name,
        createdAt: folder.createdAt,
      })));
      setReviewHistory(dbReviews as unknown as ReviewRecord[]);

      const sortedSessions = [...dbSessions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setMaterialQuizSessions(sortedSessions);
      materialSessionsRef.current = sortedSessions;

      setLibraryFolders(dbLibraryFolders);
      setMaterialPackages(
        [...dbPackages].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      );
      setMaterialFiles(
        [...dbFiles].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      );

      const summaries: ConversationSummary[] = [];
      for (const conversation of dbConversations) {
        if (!conversation.id) continue;
        summaries.push({
          id: conversation.id,
          title: conversation.title || "",
          topicTags: conversation.topicTags || [],
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          noteId: conversation.noteId,
          messageCount: typeof conversation.messageCount === "number"
            ? conversation.messageCount
            : await db.messages.where("conversationId").equals(conversation.id).count(),
        });
      }
      setConversations(summaries.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ));

      const openConversationId = activeConversationIdRef.current;
      if (openConversationId) {
        const rows = await db.messages
          .where("conversationId").equals(openConversationId)
          .sortBy("createdAt");
        setMessages(rows.map((row, index) => ({
          id: row.id || `msg-${openConversationId}-${index}`,
          sender: row.sender,
          text: row.text,
          timestamp: new Date(row.createdAt).toLocaleTimeString(
            locale === "en-US" ? "en-US" : "zh-CN",
            { hour: "2-digit", minute: "2-digit" },
          ),
          chips: row.chips,
          mode: row.mode,
          isScopeNotice: row.isScopeNotice,
          sources: row.sources,
        })));
      }
    };

    const pushSnapshot = async (snapshot: AccountSnapshot) => {
      const result = await saveAccountSnapshot(snapshot, baseUpdatedAtRef.current);
      if (result.ok) {
        setSyncBase(normalizeSnapshot(snapshot), result.updatedAt ?? null);
        syncErrorRef.current = "";
        return;
      }
      if (result.conflict) {
        // Another device wrote between our pull and push. The current base is
        // still a valid ancestor; the next tick sees the new revision, pulls
        // and merges before retrying the push.
        return;
      }
      if (result.status === 413) reportSyncError(t.accountSync.tooLargeMessage);
      else reportSyncError(result.error || t.accountSync.failedMessage);
    };

    const syncOnce = async () => {
      if (stopped || syncingRef.current) return;
      syncingRef.current = true;
      try {
        // Restore the last agreed snapshot so a reload doesn't lose deletion
        // tracking (three-way merge needs the common ancestor).
        if (!baseSnapshotRef.current && currentUser) {
          const persisted = await db.syncState.get(`base:${currentUser.id}`).catch(() => undefined);
          if (persisted?.snapshot) {
            const snapshot = normalizeSnapshot(persisted.snapshot);
            baseSnapshotRef.current = snapshot;
            baseUpdatedAtRef.current = persisted.updatedAt ?? null;
            baseFingerprintRef.current = snapshotFingerprint(snapshot);
          }
        }

        // First sync after login/reload: pull before doing anything else.
        if (!baseSnapshotRef.current) {
          const { snapshot: remote, updatedAt } = await fetchAccountSnapshot();
          const local = await collectLocalSnapshot();
          if (remote) {
            // Without a common ancestor, union the two sides rather than
            // treating records missing locally as deletions.
            const merged = mergeSnapshots(emptySnapshot(), local, remote);
            const mergedPrint = snapshotFingerprint(merged);
            if (mergedPrint !== snapshotFingerprint(local)) {
              await restoreLocalSnapshot(merged);
              await refreshStateFromDb();
            }
            if (mergedPrint !== snapshotFingerprint(remote)) {
              // Keep the remote revision as the base so a failed push retries
              // on the next tick instead of being treated as already synced.
              setSyncBase(remote, updatedAt, false);
              await pushSnapshot(merged);
            } else {
              setSyncBase(merged, updatedAt);
            }
          } else {
            // No snapshot yet. Create one, guarded by baseUpdatedAt: null.
            setSyncBase(emptySnapshot(), null);
            await pushSnapshot(local);
          }
          return;
        }

        const metaResponse = await fetch("/api/user-data/snapshot/meta", { credentials: "same-origin" });
        if (!metaResponse.ok) throw new Error(`Snapshot meta failed (${metaResponse.status})`);
        const meta = await metaResponse.json().catch(() => null);
        const remoteUpdatedAt = typeof meta?.updatedAt === "string" ? meta.updatedAt : null;

        let local = await collectLocalSnapshot();
        const base = baseSnapshotRef.current;

        if (remoteUpdatedAt !== baseUpdatedAtRef.current) {
          // Remote changed since the last successful sync.
          const { snapshot: remote } = await fetchAccountSnapshot();
          if (!remote) {
            // The server copy disappeared. Re-create it from local data
            // instead of treating every record as remotely deleted.
            setSyncBase(emptySnapshot(), null, false);
            await pushSnapshot(local);
            return;
          }
          const remoteSnapshot = remote;
          const merged = mergeSnapshots(base, local, remoteSnapshot);
          const mergedPrint = snapshotFingerprint(merged);
          if (mergedPrint !== snapshotFingerprint(local)) {
            await restoreLocalSnapshot(merged);
            await refreshStateFromDb();
            local = merged;
          }
          if (mergedPrint === snapshotFingerprint(remoteSnapshot)) {
            setSyncBase(merged, remoteUpdatedAt);
            syncErrorRef.current = "";
            return; // both sides already agree
          }
          setSyncBase(remoteSnapshot, remoteUpdatedAt, false);
          await pushSnapshot(merged);
          return;
        }

        if (snapshotFingerprint(local) !== baseFingerprintRef.current) {
          await pushSnapshot(local);
        }
      } catch (error) {
        console.error("Account snapshot sync failed", error);
        reportSyncError(t.accountSync.failedMessage);
      } finally {
        syncingRef.current = false;
      }
    };

    void syncOnce();
    const interval = window.setInterval(syncOnce, 5000);
    const onPageHide = () => {
      void syncOnce();
      // Best-effort flush of the merge ancestor before the tab goes away.
      const snapshot = baseSnapshotRef.current;
      const accountId = syncAccountIdRef.current;
      if (snapshot && accountId) {
        void db.syncState
          .put({ id: `base:${accountId}`, updatedAt: baseUpdatedAtRef.current, snapshot })
          .catch(() => { /* ignore */ });
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [currentUser, accountReady, isDbReady]);

  // Theme & Reminder settings (persisted in localStorage)
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("quickly_theme") || "dark");
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(() => localStorage.getItem("quickly_reminder_enabled") !== "false");
  const [reminderTime, setReminderTime] = useState<string>(() => localStorage.getItem("quickly_reminder_time") || "09:00");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => localStorage.getItem("quickly_sound_enabled") !== "false");
  const [autoSaveNotes, setAutoSaveNotes] = useState<boolean>(() => localStorage.getItem("quickly_auto_save") !== "false");
  const [dailyGoal, setDailyGoal] = useState<number>(() => {
    const saved = localStorage.getItem("quickly_daily_goal");
    return saved ? parseInt(saved) : 60;
  });
  const [weeklyGoal, setWeeklyGoal] = useState<number>(() => {
    const saved = localStorage.getItem("quickly_weekly_goal");
    return saved ? parseInt(saved) : 14;
  });

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("quickly_theme", theme);
  }, [theme]);

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "notif-welcome",
      type: "info",
      title: locale === "en-US" ? "Welcome to Quickly" : "欢迎使用 Quickly",
      message: locale === "en-US" ? "Start your learning journey today!" : "开始今天的学习之旅吧！",
      timestamp: new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" }),
    }
  ]);
  const [activeToasts, setActiveToasts] = useState<Notification[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const addNotification = (title: string, message: string, type: Notification["type"] = "reminder") => {
    const newNotif: Notification = {
      id: `notif-${Date.now()}`,
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };
    setNotifications(prev => [newNotif, ...prev]);
    setActiveToasts(prev => [...prev, newNotif]);
  };

  const dismissToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  };

  const clearNotifications = () => {
    setNotifications([]);
    setShowNotifDropdown(false);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Reminder hook
  useReminder({
    enabled: reminderEnabled,
    time: reminderTime,
    soundEnabled,
    onFire: ({ title, message }) => addNotification(title, message, "reminder"),
  });

  // Core interactive states
  const [scores, setScores] = useState<MasteryScores>({
    logisticRegression: 82,
    gradientDescent: 61,
    regularization: 44,
  });

  // Review history tracking
  const [reviewHistory, setReviewHistory] = useState<ReviewRecord[]>([]);
  const [materialQuizSessions, setMaterialQuizSessions] = useState<MaterialQuizSession[]>([]);
  const materialSessionsRef = useRef<MaterialQuizSession[]>([]);
  const [activeMaterialSession, setActiveMaterialSession] = useState<MaterialQuizSession | null>(null);
  const [materialSessionRunId, setMaterialSessionRunId] = useState(0);

  const [notes, setNotes] = useState<NoteItem[]>([]);

  // Folders state for organizing notes
  const [folders, setFolders] = useState<NoteFolder[]>([]);

  // Study material library: folders -> packages -> files
  const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>([]);
  const [materialPackages, setMaterialPackages] = useState<MaterialPackage[]>([]);
  const [materialFiles, setMaterialFiles] = useState<MaterialFile[]>([]);
  const [openLibraryFileId, setOpenLibraryFileId] = useState<string | null>(null);
  const [libraryView, setLibraryView] = useState<"ima" | "local">("ima");
  const [notesView, setNotesView] = useState<"ima" | "local">("ima");
  const [openImaNoteId, setOpenImaNoteId] = useState<string | null>(null);

  // Library files are searchable in the Study chat alongside notes.
  const libraryStudyNotes = useMemo<NoteItem[]>(() => materialFiles.map(file => {
    const pkg = materialPackages.find(item => item.id === file.packageId);
    return {
      id: `matfile:${file.id}`,
      topic: `${pkg?.name || t.library.title} / ${file.name}`,
      content: file.content,
      timestamp: "",
    };
  }), [materialFiles, materialPackages, t]);

  const studyDocuments = useMemo(
    () => [...notes, ...libraryStudyNotes],
    [notes, libraryStudyNotes],
  );

  // One-step undo for note deletion (shown for a few seconds).
  const [undoDeletedNote, setUndoDeletedNote] = useState<NoteItem | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  // Folder CRUD operations
  const createFolder = async (name: string) => {
    const newFolder: NoteFolder = {
      id: `folder-${Date.now()}`,
      name,
      createdAt: new Date().toISOString().slice(0, 10)
    };
    setFolders(prev => [...prev, newFolder]);
    await db.folders.add(newFolder);
  };

  const renameFolder = async (folderId: string, newName: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f));
    await db.folders.where("id").equals(folderId).modify({ name: newName });
  };

  const deleteFolder = async (folderId: string) => {
    setFolders(prev => prev.filter(f => f.id !== folderId));
    // Move notes in this folder to unassigned
    setNotes(prev => prev.map(n => n.folderId === folderId ? { ...n, folderId: undefined } : n));
    await db.folders.where("id").equals(folderId).delete();
    await db.notes.where("folderId").equals(folderId).modify(record => {
      delete record.folderId;
    });
  };

  const moveNoteToFolder = async (noteId: string, folderId: string | undefined) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folderId } : n));
    await db.notes.where("id").equals(noteId).modify(record => {
      if (folderId) record.folderId = folderId;
      else delete record.folderId;
    });
  };

  const createNote = async (topic: string, content: string, folderId?: string) => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      topic,
      content,
      timestamp: new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" }),
      folderId,
    };
    setNotes(prev => [newNote, ...prev]);
    await db.notes.add(newNote);
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "msg-init-user",
      sender: "user",
      text: "为什么逻辑回归适合用于二分类问题？",
      timestamp: "14:01"
    },
    {
      id: "msg-init-sys",
      sender: "system",
      text: `逻辑回归非常适合**二分类问题**，因为它输出的概率值在 **0 到 1** 之间，直接对应两类结果（例如：是/否，垃圾邮件/非垃圾邮件）。

它使用 **Sigmoid 函数** 将原始的线性预测压缩到这个概率范围内：
$$S(z) = \\frac{1}{1 + e^{-z}}$$

然后我们应用一个 **决策边界**（通常是 0.5）来对输出进行分类：
* 如果概率大于 0.5，则属于类别 1（正类）；
* 否则属于类别 0（负类）。

#### 与线性回归的区别
1. **有界输出**：线性回归预测值在 $[-\\infty, +\\infty]$，而逻辑回归输出 $[0, 1]$。
2. **鲁棒性（对异常值不敏感）**：线性回归容易被极值拉偏决策边界，而 Sigmoid 函数具有饱和性，对两端的异常样本非常稳定。`,
      timestamp: "14:02",
      chips: ["逻辑回归", "Sigmoid 函数", "决策边界"]
    }
  ]);

  const [inputText, setInputText] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [uploadAttached, setUploadAttached] = useState<string | null>(null);
  const [savingNoteMsgId, setSavingNoteMsgId] = useState<string | null>(null);
  const [savedNoteMsgIds, setSavedNoteMsgIds] = useState<Set<string>>(new Set());
  const [saveNoteDialog, setSaveNoteDialog] = useState<{ msgId: string; msgText: string; msgChips: string[] } | null>(null);
  const [saveNoteTarget, setSaveNoteTarget] = useState<"local" | "ima">("local");
  const [saveNoteFolderId, setSaveNoteFolderId] = useState("");
  const [saveNoteNotebookId, setSaveNoteNotebookId] = useState("");
  const [saveNoteUseAI, setSaveNoteUseAI] = useState(true);
  const [saveNoteNotebooks, setSaveNoteNotebooks] = useState<Array<{ id: string; name: string }>>([]);
  const [saveNoteSubmitting, setSaveNoteSubmitting] = useState(false);
  const [saveNoteError, setSaveNoteError] = useState<string | null>(null);
  const [sourceDialog, setSourceDialog] = useState<{ topic: string; snippet: string; noteId: string } | null>(null);

  const sourceDialogContent = useMemo(() => {
    if (!sourceDialog) return "";
    if (sourceDialog.noteId.startsWith("matfile:")) {
      const fileId = sourceDialog.noteId.slice("matfile:".length);
      return materialFiles.find(file => file.id === fileId)?.content || sourceDialog.snippet;
    }
    if (!sourceDialog.noteId.includes(":")) {
      return notes.find(note => note.id === sourceDialog.noteId)?.content || sourceDialog.snippet;
    }
    return sourceDialog.snippet;
  }, [sourceDialog, materialFiles, notes]);

  const openSourceOriginal = (noteId: string) => {
    if (noteId.startsWith("imanote:")) {
      setOpenImaNoteId(noteId.slice("imanote:".length));
      setNotesView("ima");
      setActiveTab("notes");
    } else if (noteId.startsWith("imakb:")) {
      setLibraryView("ima");
      setActiveTab("library");
    } else if (noteId.startsWith("matfile:")) {
      setOpenLibraryFileId(noteId.slice("matfile:".length));
      setLibraryView("local");
      setActiveTab("library");
    } else {
      setJumpToNoteId(noteId);
      setNotesView("local");
      setActiveTab("notes");
    }
    setSourceDialog(null);
  };

  // AI Model Config state
  const [modelConfig, setModelConfig] = useState<AIModelConfig>(() => {
    const saved = localStorage.getItem("quickly_ai_config");
    if (saved) {
      try { return { ...JSON.parse(saved), apiKey: "" }; } catch { /* ignore */ }
    }
    return AI_MODEL_PRESETS[0];
  });

  // IMA knowledge base config state
  const [imaConfig, setImaConfig] = useState<IMAConfig>(() => {
    const saved = localStorage.getItem("quickly_ima_config");
    if (saved) {
      try { return { ...DEFAULT_IMA_CONFIG, ...JSON.parse(saved), apiKey: "" }; } catch { /* ignore */ }
    }
    return DEFAULT_IMA_CONFIG;
  });

  const aiConfigSaveSeq = useRef(0);
  const imaConfigSaveSeq = useRef(0);

  const updateModelConfig = (next: AIModelConfig) => {
    setModelConfig(next);
    const seq = ++aiConfigSaveSeq.current;
    const { apiKey, ...rest } = next;
    void (async () => {
      try {
        const apiKeyEnc = apiKey ? await encryptSecret(apiKey) : "";
        if (seq !== aiConfigSaveSeq.current) return;
        localStorage.setItem(
          "quickly_ai_config",
          JSON.stringify({ ...rest, apiKey: "", apiKeyEnc }),
        );
      } catch (error) {
        console.error("Failed to encrypt AI API key", error);
      }
    })();
  };

  const updateImaConfig = (next: IMAConfig) => {
    setImaConfig(next);
    const seq = ++imaConfigSaveSeq.current;
    const { apiKey, ...rest } = next;
    void (async () => {
      try {
        const apiKeyEnc = apiKey ? await encryptSecret(apiKey) : "";
        if (seq !== imaConfigSaveSeq.current) return;
        localStorage.setItem(
          "quickly_ima_config",
          JSON.stringify({ ...rest, apiKey: "", apiKeyEnc }),
        );
      } catch (error) {
        console.error("Failed to encrypt IMA API key", error);
      }
    })();
  };

  // AI is available if the server has a built-in model, an env Gemini key, or the user configured a model.
  const aiAvailable = hasBuiltinAI || hasApiKey || Boolean(modelConfig.apiKey);
  const isImaProvider = (imaConfig.provider || "ima") === "ima";

  const toggleAI = () => {
    const next = !aiEnabled;
    setAiEnabled(next);
    localStorage.setItem("quickly_study_ai", String(next));
  };

  // Active Quiz Modal state
  const [activeQuiz, setActiveQuiz] = useState<{ topicId: string; topicName: string; noteContent?: string } | null>(null);

  const [jumpToNoteId, setJumpToNoteId] = useState<string | null>(null);
  const [selectedNoteContext, setSelectedNoteContext] = useState<NoteItem | null>(null);
  const [showNoteSelector, setShowNoteSelector] = useState(false);
  const [studyScope, setStudyScope] = useState<StudyScope>({ kind: "all" });
  const [scopeNotebooks, setScopeNotebooks] = useState<Array<{ id: string; name: string }>>([]);
  const [scopeKbs, setScopeKbs] = useState<Array<{ id: string; name: string }>>([]);
  const [scopeOptionsLoading, setScopeOptionsLoading] = useState(false);

  const scopeName = studyScope.kind === "all"
    ? (locale === "en-US" ? "All notes" : "所有笔记")
    : studyScope.name;

  const suggestedQuestions = useMemo(() => {
    const lastUser = [...messages].reverse().find(message => message.sender === "user")?.text?.trim() || "";
    const lastAnswer = [...messages].reverse().find(message => (
      message.sender === "system" && !message.isThinking && !message.isScopeNotice && message.text
    ));
    const chips = (lastAnswer?.chips || []).filter(Boolean);
    const topic = selectedNoteContext?.topic ||
      (studyScope.kind !== "all" ? studyScope.name : "");
    const shortQuestion = lastUser.replace(/\s+/g, " ").slice(0, 30);
    const items: string[] = [];

    if (locale === "en-US") {
      if (lastUser) {
        items.push(`Explain the key steps in "${shortQuestion}" further`);
        items.push("Turn the previous answer into review takeaways");
        items.push(topic ? `What is the most confusing concept in "${topic}"?` : "Give me another example");
      } else if (topic) {
        items.push(`Summarize the core points of "${topic}"`);
        items.push(`What is the most confusing concept in "${topic}"?`);
        items.push(`Create a practice question about "${topic}"`);
      } else {
        items.push(t.presets.q1, t.presets.q2, t.presets.q3);
      }
      if (chips.length >= 2 && items.length > 0) {
        items[Math.min(2, items.length - 1)] = `What is the difference between "${chips[0]}" and "${chips[1]}"?`;
      }
    } else {
      if (lastUser) {
        items.push(`继续解释「${shortQuestion}」中的关键步骤`);
        items.push("把上一个回答整理成复习要点");
        items.push(topic ? `「${topic}」最容易混淆的概念是什么？` : "换一个例子说明");
      } else if (topic) {
        items.push(`总结「${topic}」的核心内容`);
        items.push(`「${topic}」最容易混淆的概念是什么？`);
        items.push(`根据「${topic}」出一道练习题`);
      } else {
        items.push(t.presets.q1, t.presets.q2, t.presets.q3);
      }
      if (chips.length >= 2) {
        items[Math.min(2, items.length - 1)] = `「${chips[0]}」和「${chips[1]}」有什么区别？`;
      }
    }

    return Array.from(new Set(items.filter(Boolean))).slice(0, 3);
  }, [messages, selectedNoteContext, studyScope, locale, t]);

  const scopeParent = (() => {
    if (studyScope.kind === "local-note") {
      const note = notes.find(item => item.id === studyScope.noteId);
      const folder = note?.folderId ? folders.find(item => item.id === note.folderId) : null;
      return folder?.name || "";
    }
    if (studyScope.kind === "local-folder") return locale === "en-US" ? "Notes" : "笔记";
    if (studyScope.kind === "ima-notebook") return locale === "en-US" ? "IMA notebook" : "IMA 笔记本";
    if (studyScope.kind === "ima-kb") return locale === "en-US" ? "Knowledge base" : "知识库";
    return "";
  })();

  const loadScopeOptions = async () => {
    if (!imaConfig.enabled || !isImaProvider || !imaConfig.clientId.trim() || !imaConfig.apiKey.trim()) return;
    setScopeOptionsLoading(true);
    try {
      const credentials = { clientId: imaConfig.clientId.trim(), apiKey: imaConfig.apiKey.trim() };
      const [notebooksResponse, kbsResponse] = await Promise.all([
        fetch("/api/ima/notebooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...credentials, cursor: "0", limit: 20 }),
        }),
        fetch("/api/ima/knowledge-bases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...credentials, query: "", cursor: "", limit: 20 }),
        }),
      ]);
      const notebooksData = await notebooksResponse.json().catch(() => ({}));
      const kbsData = await kbsResponse.json().catch(() => ({}));
      setScopeNotebooks(
        (Array.isArray(notebooksData.notebooks) ? notebooksData.notebooks : [])
          .filter((notebook: any) => notebook.folderType === 0)
          .map((notebook: any) => ({ id: String(notebook.id), name: String(notebook.name) })),
      );
      setScopeKbs(
        (Array.isArray(kbsData.knowledgeBases) ? kbsData.knowledgeBases : [])
          .map((kb: any) => ({ id: String(kb.id), name: String(kb.name) })),
      );
    } catch (error) {
      console.error("Failed to load study scope options", error);
    } finally {
      setScopeOptionsLoading(false);
    }
  };

  const selectScope = (scope: StudyScope) => {
    const nextName = scope.kind === "all"
      ? (locale === "en-US" ? "All notes" : "所有笔记")
      : scope.name;
    const currentKey = JSON.stringify(studyScope);
    const nextKey = JSON.stringify(scope);

    setStudyScope(scope);
    setSelectedNoteContext(
      scope.kind === "local-note"
        ? notes.find(note => note.id === scope.noteId) || null
        : null,
    );
    setShowNoteSelector(false);

    if (currentKey !== nextKey) {
      const notice: Message = {
        id: `msg-scope-${Date.now()}`,
        sender: "system",
        text: locale === "en-US"
          ? `Search scope switched to “${nextName}”`
          : `检索范围已切换为「${nextName}」`,
        timestamp: new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        isScopeNotice: true,
      };
      setMessages(prev => [...prev, notice]);
      if (activeConversationId) void persistChatMessage(activeConversationId, notice);
    }
  };
  // Saved conversation history (IndexedDB)
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);
  const [historyOpen, setHistoryOpen] = useState<boolean>(
    () => localStorage.getItem("quickly_history_open") !== "false",
  );

  const toggleHistory = () => {
    setHistoryOpen(prev => {
      const next = !prev;
      localStorage.setItem("quickly_history_open", String(next));
      return next;
    });
  };

  // ─── Conversation history (persisted in IndexedDB) ───

  const conversationSummary = (conversation: DBConversation, messageCount = 0): ConversationSummary => ({
    id: conversation.id as string,
    title: conversation.title || "",
    topicTags: conversation.topicTags || [],
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    noteId: conversation.noteId,
    messageCount,
  });

  const conversationTitle = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 40);

  const ensureConversation = async (firstText: string): Promise<string> => {
    const now = new Date().toISOString();
    if (activeConversationId) {
      await db.conversations.where("id").equals(activeConversationId).modify(conversation => {
        conversation.updatedAt = now;
        if (!conversation.noteId && selectedNoteContext?.id) {
          conversation.noteId = selectedNoteContext.id;
        }
      });
      setConversations(prev => prev.map(conversation => (
        conversation.id === activeConversationId ? { ...conversation, updatedAt: now } : conversation
      )));
      return activeConversationId;
    }

    const id = `conv-${Date.now()}`;
    const conversation: DBConversation = {
      id,
      title: conversationTitle(firstText),
      topicTags: [],
      createdAt: now,
      updatedAt: now,
      noteId: selectedNoteContext?.id,
      messageCount: 0,
    };
    await db.conversations.add(conversation);
    setActiveConversationId(id);
    setConversations(prev => [conversationSummary(conversation), ...prev]);
    return id;
  };

  const persistChatMessage = async (conversationId: string, message: Message) => {
    // Ensure a strict order even when the user message and the instant local
    // answer land in the same millisecond.
    const timestamp = Math.max(Date.now(), lastPersistTimeRef.current + 1);
    lastPersistTimeRef.current = timestamp;
    const now = new Date(timestamp).toISOString();
    try {
      await db.messages.add({
        id: message.id,
        conversationId,
        sender: message.sender,
        text: message.text,
        chips: message.chips || [],
        mode: message.mode,
        isScopeNotice: message.isScopeNotice,
        sources: message.sources,
        createdAt: now,
      });
      await db.conversations.where("id").equals(conversationId).modify(conversation => {
        conversation.updatedAt = now;
        conversation.messageCount = (conversation.messageCount || 0) + 1;
        if (message.chips?.length) {
          conversation.topicTags = Array.from(new Set([...(conversation.topicTags || []), ...message.chips]));
        }
        if (!conversation.title && message.sender === "user") {
          conversation.title = message.text.replace(/\s+/g, " ").trim().slice(0, 40);
        }
      });
      setConversations(prev => {
        const target = prev.find(conversation => conversation.id === conversationId);
        if (!target) return prev;
        const updated: ConversationSummary = {
          ...target,
          updatedAt: now,
          messageCount: target.messageCount + 1,
          topicTags: message.chips?.length
            ? Array.from(new Set([...target.topicTags, ...message.chips]))
            : target.topicTags,
          title: target.title || (message.sender === "user" ? message.text.replace(/\s+/g, " ").trim().slice(0, 40) : target.title),
        };
        return [updated, ...prev.filter(conversation => conversation.id !== conversationId)];
      });
    } catch (error) {
      console.error("Failed to persist chat message", error);
    }
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
    setSelectedNoteContext(null);
    setShowNoteSelector(false);
    setActiveTab("study");
  };

  const handleSelectConversation = async (conversationId: string) => {
    try {
      const rows = await db.messages.where("conversationId").equals(conversationId).sortBy("createdAt");
      setMessages(rows.map((row, index) => ({
        id: row.id || `msg-${conversationId}-${index}`,
        sender: row.sender,
        text: row.text,
        timestamp: new Date(row.createdAt).toLocaleTimeString(
          locale === "en-US" ? "en-US" : "zh-CN",
          { hour: "2-digit", minute: "2-digit" },
        ),
        chips: row.chips,
        mode: row.mode,
        isScopeNotice: row.isScopeNotice,
        sources: row.sources,
      })));
      setActiveConversationId(conversationId);
      const conversation = conversations.find(item => item.id === conversationId);
      setSelectedNoteContext(
        conversation?.noteId ? notes.find(note => note.id === conversation.noteId) || null : null,
      );
      setActiveTab("study");
    } catch (error) {
      console.error("Failed to load conversation", error);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      await db.messages.where("conversationId").equals(conversationId).delete();
      await db.conversations.where("id").equals(conversationId).delete();
    } catch (error) {
      console.error("Failed to delete conversation", error);
    }
    setConversations(prev => prev.filter(conversation => conversation.id !== conversationId));
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setMessages([]);
    }
  };

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const lastPersistTimeRef = useRef(0);
  const mcpPullingRef = useRef(false);

  // Load persisted data from IndexedDB on mount
  useEffect(() => {
    async function hydrate() {
      try {
        const [
          dbFolders, dbNotes, dbReviews, dbSettings, dbConversations,
          dbLibraryFolders, dbMaterialPackages, dbMaterialFiles, dbMaterialQuizSessions,
        ] = await Promise.all([
          db.folders.toArray(),
          db.notes.toArray(),
          db.reviewHistory.toArray(),
          db.appSettings.toArray(),
          db.conversations.toArray(),
          db.libraryFolders.toArray(),
          db.materialPackages.toArray(),
          db.materialFiles.toArray(),
          db.materialQuizSessions.toArray(),
        ]);
        // Remove the old demo notes/folders once. Keep a demo folder if the
        // user has since moved real notes into it.
        let visibleNotes = dbNotes;
        let visibleFolders = dbFolders;
        if (localStorage.getItem("quickly_demo_removed") !== "true") {
          const demoNoteIds = ["note-lr"];
          await db.notes.bulkDelete(demoNoteIds);
          visibleNotes = dbNotes.filter(note => !demoNoteIds.includes(note.id));

          const demoFolderIds = ["folder-ml", "folder-math"];
          for (const folderId of demoFolderIds) {
            if (!visibleNotes.some(note => note.folderId === folderId)) {
              await db.folders.where("id").equals(folderId).delete();
            }
          }
          visibleFolders = dbFolders.filter(folder => (
            !demoFolderIds.includes(folder.id) ||
            visibleNotes.some(note => note.folderId === folder.id)
          ));
          localStorage.setItem("quickly_demo_removed", "true");
        }

        setFolders(visibleFolders.map(f => ({ id: f.id, name: f.name, createdAt: f.createdAt })));
        setNotes(visibleNotes.map(n => ({ id: n.id, topic: n.topic, content: n.content, timestamp: n.timestamp, folderId: n.folderId })));
        if (dbReviews.length > 0) {
          setReviewHistory(dbReviews as unknown as ReviewRecord[]);
        }
        const sortedMaterialSessions = [...dbMaterialQuizSessions].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setMaterialQuizSessions(sortedMaterialSessions);
        materialSessionsRef.current = sortedMaterialSessions;
        if (dbLibraryFolders.length > 0) {
          setLibraryFolders(dbLibraryFolders);
        }
        setMaterialPackages(
          [...dbMaterialPackages].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ),
        );
        setMaterialFiles(
          [...dbMaterialFiles].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          ),
        );
        if (dbConversations.length > 0) {
          const summaries = await Promise.all(
            dbConversations.filter(conversation => conversation.id).map(async (conversation) => ({
              id: conversation.id as string,
              title: conversation.title || "",
              topicTags: conversation.topicTags || [],
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
              noteId: conversation.noteId,
              messageCount: typeof conversation.messageCount === "number"
                ? conversation.messageCount
                : await db.messages.where("conversationId").equals(conversation.id as string).count(),
            })),
          );
          setConversations(summaries.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          ));
        }
        // Restore settings from IndexedDB
        for (const s of dbSettings) {
          try {
            const val = JSON.parse(s.value);
            if (s.key === "dailyGoal") setDailyGoal(val);
            else if (s.key === "weeklyGoal") setWeeklyGoal(val);
            else if (s.key === "reminderTime") setReminderTime(val);
            else if (s.key === "scores") setScores(val);
            else if (s.key === "soundEnabled") setSoundEnabled(val);
            else if (s.key === "autoSaveNotes") setAutoSaveNotes(val);
          } catch { /* ignore corrupt entries */ }
        }
      } catch (e) {
        console.error("IndexedDB hydration failed", e);
      } finally {
        setIsDbReady(true);
      }
    }
    hydrate();
  }, []);

  // Persist mastery scores to IndexedDB when they change
  useEffect(() => {
    if (!isDbReady) return;
    saveSetting("scores", scores);
  }, [scores, isDbReady]);

  // Check API mode on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await fetch("/api/status");
        const data = await response.json();
        setStatusMode(data.mode);
        setHasApiKey(Boolean(data.hasApiKey));
        setHasBuiltinAI(Boolean(data.hasBuiltinAI));
      } catch (e) {
        console.error("Status check failed, running simulator", e);
      }
    }
    checkStatus();
  }, []);

  // Scroll chat bottom helper
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const fetchImaStudyHits = async (
    question: string,
    scope: StudyScope,
  ): Promise<Array<{ noteId: string; topic: string; snippet: string }>> => {
    if (!imaConfig.enabled || !isImaProvider || !imaConfig.clientId.trim() || !imaConfig.apiKey.trim()) return [];
    const credentials = { clientId: imaConfig.clientId.trim(), apiKey: imaConfig.apiKey.trim() };

    try {
      if (scope.kind === "ima-notebook") {
        const searchResponse = await fetch("/api/ima/search-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...credentials, query: question }),
        });
        const searchData = await searchResponse.json().catch(() => ({}));
        const matchedNotes = (Array.isArray(searchData.notes) ? searchData.notes : [])
          .filter((note: any) => note.folderId === scope.notebookId)
          .slice(0, 4);

        if (matchedNotes.length === 0) {
          const listResponse = await fetch("/api/ima/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...credentials, folderId: scope.notebookId, cursor: "", limit: 20 }),
          });
          const listData = await listResponse.json().catch(() => ({}));
          const lower = question.toLowerCase();
          const listed = (Array.isArray(listData.notes) ? listData.notes : [])
            .filter((note: any) => (
              String(note.title || "").toLowerCase().includes(lower) ||
              String(note.summary || "").toLowerCase().includes(lower)
            ))
            .slice(0, 4);
          return listed.map((note: any) => ({
            noteId: `imanote:${note.id}`,
            topic: String(note.title || ""),
            snippet: String(note.summary || note.title || ""),
          }));
        }

        const hits: Array<{ noteId: string; topic: string; snippet: string }> = [];
        for (const note of matchedNotes) {
          const contentResponse = await fetch("/api/ima/note-content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...credentials, noteId: note.id }),
          });
          const contentData = await contentResponse.json().catch(() => ({}));
          hits.push({
            noteId: `imanote:${note.id}`,
            topic: String(note.title || ""),
            snippet: String(contentData.content || note.summary || note.title || "").slice(0, 1200),
          });
        }
        return hits;
      }

      if (scope.kind === "ima-kb") {
        const searchResponse = await fetch("/api/ima/search-knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...credentials, query: question, knowledgeBaseId: scope.kbId, cursor: "" }),
        });
        const searchData = await searchResponse.json().catch(() => ({}));
        const items = Array.isArray(searchData?.data?.items) ? searchData.data.items : [];
        return items.slice(0, 5).map((item: any) => ({
          noteId: `imakb:${item.mediaId || item.id}`,
          topic: String(item.title || ""),
          snippet: String(item.highlightContent || item.title || ""),
        }));
      }
    } catch (error) {
      console.error("IMA study retrieval failed", error);
    }

    return [];
  };

  // Handle send message
  const handleSendMessage = async (textToSend: string) => {
    const textClean = textToSend.trim();
    if (!textClean || sendingRef.current) return;
    sendingRef.current = true;

    const userMsgId = "msg-u-" + Date.now();
    const nowStr = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    
    const userMsg: Message = {
      id: userMsgId,
      sender: "user",
      text: textClean,
      timestamp: nowStr
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setUploadAttached(null);

    // Persist this exchange into the conversation history.
    let conversationId: string | null = null;
    try {
      conversationId = await ensureConversation(textClean);
      await persistChatMessage(conversationId, userMsg);
    } catch (error) {
      console.error("Failed to start conversation", error);
    }

    // Retrieval is scoped to the selected notebook / knowledge base.
    let hits: Array<{ noteId: string; topic: string; snippet: string }> = [];
    try {
      if (studyScope.kind === "ima-notebook" || studyScope.kind === "ima-kb") {
        hits = await fetchImaStudyHits(textClean, studyScope);
      } else {
        const scopeDocuments = studyScope.kind === "local-folder"
          ? studyDocuments.filter(note => note.folderId === studyScope.folderId)
          : studyScope.kind === "local-note"
            ? studyDocuments.filter(note => note.id === studyScope.noteId)
            : studyDocuments;
        hits = searchNotes(textClean, scopeDocuments, 4);
      }
    } catch (searchError) {
      console.error("Scoped search failed", searchError);
    }
    const sources = hits.map(hit => ({
      noteId: hit.noteId,
      topic: hit.topic,
      snippet: hit.snippet,
    }));

    // AI off / unavailable -> answer with located passages only.
    if (!aiEnabled || !aiAvailable) {
      const localMessage: Message = {
        id: "msg-local-" + Date.now(),
        sender: "system",
        text: hits.length > 0
          ? t.study.localFound.replace("{count}", String(hits.length))
          : t.study.localNotFound,
        timestamp: nowStr,
        mode: "local",
        sources,
      };
      setMessages(prev => [...prev, localMessage]);
      if (conversationId) void persistChatMessage(conversationId, localMessage);
      sendingRef.current = false;
      return;
    }

    setIsSending(true);

    // AI placeholder
    const thinkingMsgId = "msg-thinking-" + Date.now();
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      sender: "system",
      text: "",
      timestamp: nowStr,
      isThinking: true
    };
    setMessages(prev => [...prev, thinkingMsg]);

    // Give the model both the retrieved snippets and their source notes so it can
    // resolve paraphrases that pure lexical search misses.
    const noteLibrary: { topic: string; content: string }[] = [];
    const libraryIds = new Set<string>();
    const addToLibrary = (note: NoteItem | undefined) => {
      if (!note || libraryIds.has(note.id) || noteLibrary.length >= 4) return;
      libraryIds.add(note.id);
      noteLibrary.push({ topic: note.topic, content: note.content.slice(0, 3000) });
    };
    for (const hit of hits) {
      if (hit.noteId.startsWith("imanote:") || hit.noteId.startsWith("imakb:")) {
        if (noteLibrary.length < 4) {
          noteLibrary.push({ topic: hit.topic, content: hit.snippet });
        }
      } else {
        addToLibrary(studyDocuments.find(n => n.id === hit.noteId));
      }
    }
    if (studyScope.kind !== "ima-notebook" && studyScope.kind !== "ima-kb") {
      const scopeDocuments = studyScope.kind === "local-folder"
        ? studyDocuments.filter(note => note.folderId === studyScope.folderId)
        : studyScope.kind === "local-note"
          ? studyDocuments.filter(note => note.id === studyScope.noteId)
          : studyDocuments;
      for (const note of scopeDocuments.slice(0, 4)) addToLibrary(note);
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: textClean,
          useAI: true,
          modelConfig: {
            provider: modelConfig.provider,
            apiKey: modelConfig.apiKey,
            apiBase: modelConfig.apiBase,
            model: modelConfig.model,
          },
          noteContext: selectedNoteContext ? {
            topic: selectedNoteContext.topic,
            content: selectedNoteContext.content,
          } : undefined,
          studyContext: hits.map(hit => ({ topic: hit.topic, snippet: hit.snippet })),
          noteLibrary,
        }),
      });
      if (!response.ok) throw new Error(`Chat request failed: ${response.status}`);
      const data = await response.json();
      if (!data || typeof data.text !== "string") throw new Error("Invalid chat response");

      // Remove thinking line and replace with authentic payload
      const assistantMessage: Message = {
        id: "msg-sys-" + Date.now(),
        sender: "system",
        text: data.text,
        timestamp: nowStr,
        chips: data.chips,
        mode: "ai",
        sources,
      };
      setMessages(prev => [
        ...prev.filter(m => m.id !== thinkingMsgId),
        assistantMessage,
      ]);
      if (conversationId) void persistChatMessage(conversationId, assistantMessage);

      // Update Mastery Scores dynamically
      if (data.topicMasteryImpact) {
        setScores(prev => ({
          logisticRegression: Math.min(100, Math.max(0, prev.logisticRegression + (data.topicMasteryImpact.logisticRegression || 0))),
          gradientDescent: Math.min(100, Math.max(0, prev.gradientDescent + (data.topicMasteryImpact.gradientDescent || 0))),
          regularization: Math.min(100, Math.max(0, prev.regularization + (data.topicMasteryImpact.regularization || 0))),
        }));
      }

      // Prepend automatic notes distillation
      if (data.autoNote) {
        const matchingTopic = data.chips?.[0] || "智能答疑";
        const newNote: NoteItem = {
          id: "note-" + Date.now(),
          topic: matchingTopic,
          content: data.autoNote,
          timestamp: nowStr,
        };
        setNotes(prev => [newNote, ...prev]);
        db.notes.add(newNote);
      }

      // Auto-save Q&A pair to note when a note context is selected
      if (selectedNoteContext) {
        const autoContent = `Q: ${textClean}\n\nA: ${data.text}`;
        const autoTopic = data.chips?.[0] || selectedNoteContext.topic;
        const autoNote: NoteItem = {
          id: "note-" + Date.now() + 1,
          topic: autoTopic,
          content: autoContent,
          timestamp: nowStr,
          folderId: selectedNoteContext.folderId,
        };
        setNotes(prev => [autoNote, ...prev]);
        db.notes.add(autoNote);
      }

    } catch (e) {
      console.error("Failed to post chat API", e);
      // Graceful fallback: show located passages instead of a dead end.
      const fallbackMessage: Message = {
        id: "msg-local-fallback-" + Date.now(),
        sender: "system",
        text: hits.length > 0
          ? `${t.study.aiFallback}\n${t.study.localFound.replace("{count}", String(hits.length))}`
          : t.study.aiFallbackNoResults,
        timestamp: nowStr,
        mode: "local",
        sources,
      };
      setMessages(prev => [
        ...prev.filter(m => m.id !== thinkingMsgId),
        fallbackMessage,
      ]);
      if (conversationId) void persistChatMessage(conversationId, fallbackMessage);
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  // Set file upload context
  const simulateFileUpload = () => {
    setUploadAttached("context_raw_data.csv");
  };


  // Start Quiz Callback
  const handleStartQuiz = (topicId: string, topicName: string, noteContent?: string) => {
    setActiveQuiz({ topicId, topicName, noteContent });
  };

  // Complete Quiz score bump - records review history
  const handleQuizComplete = async (result: { score: number; total: number; accuracy: number }) => {
    if (activeQuiz) {
      // Record review history
      const record: ReviewRecord = {
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        topicId: activeQuiz.topicId,
        topicName: activeQuiz.topicName,
        score: result.score,
        total: result.total,
        accuracy: result.accuracy,
        date: new Date().toISOString(),
      };
      setReviewHistory(prev => [record, ...prev]);
      await db.reviewHistory.add(record);

      // Update legacy scores for known topics
      const bonusPct = Math.round((result.score / result.total) * 10);
      const tid = activeQuiz.topicId;
      setScores(prev => {
        const next = { ...prev };
        if (tid === "logistic-regression") {
          next.logisticRegression = Math.min(100, next.logisticRegression + bonusPct);
        } else if (tid === "gradient-descent") {
          next.gradientDescent = Math.min(100, next.gradientDescent + bonusPct);
        } else if (tid === "regularization") {
          next.regularization = Math.min(100, next.regularization + bonusPct);
        }
        return next;
      });
    }
  };

  // Complete a material-based review quiz - records it in review history
  const saveMaterialQuizSession = async (session: MaterialQuizSession) => {
    materialSessionsRef.current = [
      session,
      ...materialSessionsRef.current.filter(item => item.id !== session.id),
    ];
    setMaterialQuizSessions(materialSessionsRef.current);
    await db.materialQuizSessions.put(session);
  };

  const updateMaterialQuizSession = (id: string, progress: MaterialQuizProgress) => {
    const existing = materialSessionsRef.current.find(item => item.id === id);
    if (!existing) return;
    const next: MaterialQuizSession = {
      ...existing,
      ...progress,
      updatedAt: new Date().toISOString(),
    };
    materialSessionsRef.current = [
      next,
      ...materialSessionsRef.current.filter(item => item.id !== id),
    ];
    setMaterialQuizSessions(materialSessionsRef.current);
    void db.materialQuizSessions.put(next);
  };

  const deleteMaterialQuizSession = async (id: string) => {
    materialSessionsRef.current = materialSessionsRef.current.filter(item => item.id !== id);
    setMaterialQuizSessions(materialSessionsRef.current);
    if (activeMaterialSession?.id === id) setActiveMaterialSession(null);
    await db.materialQuizSessions.where("id").equals(id).delete();
  };

  const openMaterialSession = (session: MaterialQuizSession, redo = false) => {
    if (redo) updateMaterialQuizSession(session.id, { ...EMPTY_MATERIAL_PROGRESS });
    const next: MaterialQuizSession = redo
      ? { ...session, ...EMPTY_MATERIAL_PROGRESS, updatedAt: new Date().toISOString() }
      : session;
    setActiveMaterialSession(next);
    setMaterialSessionRunId(prev => prev + 1);
  };

  useEffect(() => {
    materialSessionsRef.current = materialQuizSessions;
  }, [materialQuizSessions]);

  const handleMaterialQuizComplete = async (result: MaterialQuizResult, materialName: string) => {
    const record: ReviewRecord = {
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      topicId: `material-${Date.now()}`,
      topicName: materialName,
      score: result.score,
      total: result.total,
      accuracy: result.accuracy,
      date: new Date().toISOString(),
    };
    setReviewHistory(prev => [record, ...prev]);
    await db.reviewHistory.add(record);

    addNotification(
      t.header.quizCompleteTitle,
      `${materialName}: ${result.accuracy}%`,
      "success"
    );
  };

  const openSaveNoteDialog = async (msgId: string, msgText: string, msgChips: string[]) => {
    setSaveNoteDialog({ msgId, msgText, msgChips });
    setSaveNoteTarget(
      isImaProvider && imaConfig.enabled && imaConfig.clientId.trim() && imaConfig.apiKey.trim()
        ? "ima"
        : "local",
    );
    setSaveNoteFolderId(
      selectedNoteContext?.folderId ||
      (studyScope.kind === "local-folder" ? studyScope.folderId : ""),
    );
    setSaveNoteNotebookId(studyScope.kind === "ima-notebook" ? studyScope.notebookId : "");
    setSaveNoteUseAI(aiAvailable);
    setSaveNoteError(null);

    if (isImaProvider && imaConfig.enabled && imaConfig.clientId.trim() && imaConfig.apiKey.trim()) {
      try {
        const response = await fetch("/api/ima/notebooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: imaConfig.clientId.trim(),
            apiKey: imaConfig.apiKey.trim(),
            cursor: "0",
            limit: 20,
          }),
        });
        const data = await response.json().catch(() => ({}));
        const list = (Array.isArray(data.notebooks) ? data.notebooks : [])
          .filter((notebook: any) => notebook.folderType === 0)
          .map((notebook: any) => ({ id: String(notebook.id), name: String(notebook.name) }));
        setSaveNoteNotebooks(list);
        if (!studyScope.kind.startsWith("ima-") && list.length > 0) {
          setSaveNoteNotebookId(list[0].id);
        }
      } catch (error) {
        console.error("Failed to load notebooks for save dialog", error);
      }
    }
  };

  const confirmSaveNote = async () => {
    if (!saveNoteDialog || saveNoteSubmitting) return;
    const { msgId, msgText, msgChips } = saveNoteDialog;
    setSaveNoteSubmitting(true);
    setSavingNoteMsgId(msgId);
    setSaveNoteError(null);

    try {
      const recentMessages = messages.slice(-6);
      let topic = msgChips[0] || msgText.replace(/\s+/g, " ").trim().slice(0, 40) ||
        (locale === "en-US" ? "Chat note" : "对话摘录");
      let content = recentMessages
        .map(message => `${message.sender === "user" ? (locale === "en-US" ? "Me" : "我") : "AI"}：${message.text}`)
        .join("\n\n") || msgText;

      if (saveNoteUseAI && aiAvailable) {
        const response = await fetch("/api/save-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: recentMessages,
            modelConfig: {
              provider: modelConfig.provider,
              apiKey: modelConfig.apiKey,
              apiBase: modelConfig.apiBase,
              model: modelConfig.model,
            },
          }),
        });
        if (!response.ok) throw new Error(t.study.saveNoteFailed);
        const data = await response.json();
        if (data?.note?.topic) topic = data.note.topic;
        if (data?.note?.content) content = data.note.content;
      }

      if (saveNoteTarget === "ima") {
        if (!isImaProvider || !imaConfig.enabled || !imaConfig.clientId.trim() || !imaConfig.apiKey.trim()) {
          throw new Error(t.study.saveNoteImaUnavailable);
        }
        const response = await fetch("/api/ima/create-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: imaConfig.clientId.trim(),
            apiKey: imaConfig.apiKey.trim(),
            title: topic,
            content,
            folderId: saveNoteNotebookId || undefined,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!data.success) throw new Error(data.error || t.study.saveNoteFailed);
      } else {
        const nowStr = new Date().toLocaleTimeString(locale === "en-US" ? "en-US" : "zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const newNote: NoteItem = {
          id: "note-" + Date.now(),
          topic,
          content,
          timestamp: nowStr,
          folderId: saveNoteFolderId || undefined,
        };
        setNotes(prev => [newNote, ...prev]);
        await db.notes.add(newNote);
      }

      setSavedNoteMsgIds(prev => new Set(prev).add(msgId));
      addNotification(
        t.header.noteSavedTitle,
        `${t.study.savedNoteSuccess}: ${topic}`,
        "success",
      );
      setSaveNoteDialog(null);
    } catch (error: any) {
      console.error("Failed to save note", error);
      setSaveNoteError(error?.message || t.study.saveNoteFailed);
    } finally {
      setSaveNoteSubmitting(false);
      setSavingNoteMsgId(null);
    }
  };

  const deleteNote = async (id: string) => {
    const note = notes.find(n => n.id === id) || null;
    setNotes(prev => prev.filter(n => n.id !== id));
    await db.notes.where("id").equals(id).delete();

    if (note) {
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
      setUndoDeletedNote(note);
      undoTimerRef.current = window.setTimeout(() => setUndoDeletedNote(null), 6000);
    }
  };

  const undoDeleteNote = async () => {
    if (!undoDeletedNote) return;
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    const note = undoDeletedNote;
    setUndoDeletedNote(null);
    setNotes(prev => [note, ...prev.filter(n => n.id !== note.id)]);
    await db.notes.put(note);
  };

  const updateNote = async (id: string, updates: { topic?: string; content?: string }) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    await db.notes.where("id").equals(id).modify(updates);
  };

  const restoreNotesBackup = async (backup: { notes: NoteItem[]; folders: NoteFolder[] }) => {
    if (backup.folders.length > 0) await db.folders.bulkPut(backup.folders);
    if (backup.notes.length > 0) await db.notes.bulkPut(backup.notes);

    setFolders(prev => {
      const merged = new Map(prev.map(folder => [folder.id, folder]));
      for (const folder of backup.folders) merged.set(folder.id, folder);
      return Array.from(merged.values());
    });
    setNotes(prev => {
      const merged = new Map(prev.map(note => [note.id, note]));
      for (const note of backup.notes) merged.set(note.id, note);
      return Array.from(merged.values());
    });
  };

  // ─── Material library: folders / packages / files ───

  const createLibraryFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folder: LibraryFolder = {
      id: `libfolder-${Date.now()}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
    };
    setLibraryFolders(prev => [...prev, folder]);
    await db.libraryFolders.add(folder);
  };

  const renameLibraryFolder = async (folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLibraryFolders(prev => prev.map(folder => (
      folder.id === folderId ? { ...folder, name: trimmed } : folder
    )));
    await db.libraryFolders.where("id").equals(folderId).modify({ name: trimmed });
  };

  const deleteLibraryFolder = async (folderId: string) => {
    setLibraryFolders(prev => prev.filter(folder => folder.id !== folderId));
    setMaterialPackages(prev => prev.map(pkg => (
      pkg.folderId === folderId ? { ...pkg, folderId: undefined } : pkg
    )));
    await db.libraryFolders.where("id").equals(folderId).delete();
    await db.materialPackages.where("folderId").equals(folderId).modify(pkg => {
      delete pkg.folderId;
    });
  };

  const createMaterialPackage = async (
    name: string,
    inputFiles: Array<{ name: string; content: string; format: string }>,
    folderId?: string,
  ) => {
    const now = new Date().toISOString();
    const packageId = `pkg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const fileRows: MaterialFile[] = inputFiles
      .filter(file => file.content.trim())
      .map((file, index) => ({
        id: `file-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
        packageId,
        name: file.name.trim() || `file-${index + 1}`,
        content: file.content.trim(),
        format: file.format || "txt",
        createdAt: now,
        updatedAt: now,
      }));

    if (fileRows.length === 0) {
      throw new Error("No material content");
    }

    const pkg: MaterialPackage = {
      id: packageId,
      name: name.trim() || t.library.pastedName,
      folderId,
      createdAt: now,
      updatedAt: now,
    };

    setMaterialPackages(prev => [pkg, ...prev]);
    setMaterialFiles(prev => [...prev, ...fileRows]);
    await db.materialPackages.add(pkg);
    await db.materialFiles.bulkAdd(fileRows);
    return pkg;
  };

  const addFilesToMaterialPackage = async (
    packageId: string,
    inputFiles: Array<{ name: string; content: string; format: string }>,
  ) => {
    const pkg = materialPackages.find(item => item.id === packageId);
    if (!pkg) return;

    const now = new Date().toISOString();
    const fileRows: MaterialFile[] = inputFiles
      .filter(file => file.content.trim())
      .map((file, index) => ({
        id: `file-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
        packageId,
        name: file.name.trim() || `file-${index + 1}`,
        content: file.content.trim(),
        format: file.format || "txt",
        createdAt: now,
        updatedAt: now,
      }));
    if (fileRows.length === 0) return;

    setMaterialFiles(prev => [...prev, ...fileRows]);
    setMaterialPackages(prev => [
      { ...pkg, updatedAt: now },
      ...prev.filter(item => item.id !== packageId),
    ]);
    await db.materialFiles.bulkAdd(fileRows);
    await db.materialPackages.where("id").equals(packageId).modify({ updatedAt: now });
  };

  const deleteMaterialPackage = async (id: string) => {
    setMaterialPackages(prev => prev.filter(pkg => pkg.id !== id));
    setMaterialFiles(prev => prev.filter(file => file.packageId !== id));
    await db.materialFiles.where("packageId").equals(id).delete();
    await db.materialPackages.where("id").equals(id).delete();
  };

  const deleteMaterialFile = async (fileId: string) => {
    const file = materialFiles.find(item => item.id === fileId);
    if (!file) return;

    const remaining = materialFiles.filter(
      item => item.packageId === file.packageId && item.id !== fileId,
    );
    setMaterialFiles(prev => prev.filter(item => item.id !== fileId));
    await db.materialFiles.where("id").equals(fileId).delete();

    const pkg = materialPackages.find(item => item.id === file.packageId);
    if (!pkg) return;
    if (remaining.length === 0) {
      await deleteMaterialPackage(pkg.id);
    } else {
      const now = new Date().toISOString();
      setMaterialPackages(prev => prev.map(item => (
        item.id === pkg.id ? { ...item, updatedAt: now } : item
      )));
      await db.materialPackages.where("id").equals(pkg.id).modify({ updatedAt: now });
    }
  };

  const addMaterialToLibrary = async (name: string, content: string, format = "txt") => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const trimmedName = name.trim() || t.library.pastedName;
    const existing = materialFiles.find(
      file => file.name === trimmedName && file.content === trimmedContent,
    );
    if (existing) return;

    await createMaterialPackage(trimmedName, [
      { name: trimmedName, content: trimmedContent, format },
    ]);
  };

  const organizeNotesIntoMaterial = async (
    selectedNotes: NoteItem[],
    name: string,
    mode: "raw" | "ai",
  ) => {
    if (selectedNotes.length === 0) return;

    const fallbackName = name.trim()
      || `${t.library.notesPackagePrefix} ${new Date().toLocaleDateString(locale === "en-US" ? "en-US" : "zh-CN")}`;
    const rawFiles = selectedNotes.map(note => ({
      name: note.topic,
      content: note.content,
      format: "note",
    }));
    let createdName = fallbackName;

    if (mode === "raw") {
      await createMaterialPackage(fallbackName, rawFiles);
    } else {
      try {
        const response = await fetch("/api/organize-material", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: selectedNotes.map(note => ({ topic: note.topic, content: note.content })),
            title: fallbackName,
            modelConfig: {
              provider: modelConfig.provider,
              apiKey: modelConfig.apiKey,
              apiBase: modelConfig.apiBase,
              model: modelConfig.model,
            },
          }),
        });
        if (!response.ok) throw new Error(`Organize failed: ${response.status}`);
        const data = await response.json();
        const title = typeof data.title === "string" && data.title.trim()
          ? data.title.trim()
          : fallbackName;
        const content = typeof data.content === "string" && data.content.trim()
          ? data.content.trim()
          : selectedNotes.map(note => `## ${note.topic}\n${note.content}`).join("\n\n");
        createdName = title;
        await createMaterialPackage(title, [{ name: `${title}.md`, content, format: "md" }]);
      } catch (error) {
        console.error("AI organize failed, keeping original notes", error);
        await createMaterialPackage(fallbackName, rawFiles);
      }
    }

    addNotification(t.library.organizedTitle, createdName, "success");
    setLibraryView("local");
    setActiveTab("library");
  };

  const analyzeNoteSource = async (source: {
    link?: string;
    imageDataUrl?: string;
    instruction?: string;
  }) => {
    const response = await fetch("/api/analyze-note-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...source,
        modelConfig: {
          provider: modelConfig.provider,
          apiKey: modelConfig.apiKey,
          apiBase: modelConfig.apiBase,
          model: modelConfig.model,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || t.notes.analyzeFailed);
    }
    if (typeof data.title !== "string" || typeof data.content !== "string") {
      throw new Error(t.notes.analyzeFailed);
    }
    return { title: data.title, content: data.content };
  };

  // Keep the MCP bridge snapshot up to date so external agents can search the library.
  useEffect(() => {
    if (!isDbReady || !currentUser) return;
    const timer = window.setTimeout(() => {
      fetch("/api/mcp/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folders: libraryFolders,
          packages: materialPackages,
          files: materialFiles,
        }),
      }).catch(error => console.error("Failed to sync library with MCP bridge", error));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [isDbReady, currentUser, libraryFolders, materialPackages, materialFiles]);

  // Pull materials imported by external agents via MCP.
  useEffect(() => {
    if (!isDbReady || !currentUser) return;

    const pullImports = async () => {
      if (mcpPullingRef.current) return;
      mcpPullingRef.current = true;
      try {
        const response = await fetch("/api/mcp/imports");
        if (!response.ok) return;
        const data = await response.json();
        const imports = Array.isArray(data.imports) ? data.imports : [];
        const acked: string[] = [];

        for (const item of imports) {
          if (
            !item ||
            typeof item.id !== "string" ||
            typeof item.title !== "string" ||
            typeof item.content !== "string" ||
            !item.content.trim()
          ) {
            continue;
          }
          const format = typeof item.format === "string" && item.format.trim()
            ? item.format.trim()
            : "txt";
          const fileName = `${item.title}.${format === "note" ? "txt" : format}`;
          try {
            await createMaterialPackage(item.title, [{
              name: fileName,
              content: item.content,
              format,
            }]);
            acked.push(item.id);
          } catch (error) {
            console.error("Failed to import MCP material", error);
          }
        }

        if (acked.length > 0) {
          await fetch("/api/mcp/imports/ack", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: acked }),
          });
          addNotification(
            t.library.organizedTitle,
            t.library.mcpImported.replace("{count}", String(acked.length)),
            "success",
          );
        }
      } catch (error) {
        console.error("Failed to pull MCP imports", error);
      } finally {
        mcpPullingRef.current = false;
      }
    };

    void pullImports();
    const interval = window.setInterval(() => void pullImports(), 30000);
    const handleFocus = () => void pullImports();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isDbReady, currentUser, locale]);

  const loadingScreen = (
    <div className="flex bg-[#181818] text-[#e3e3de] min-h-screen items-center justify-center font-mono">
      <div className="text-center space-y-4">
        <svg className="w-10 h-10 text-[#b8f600] mx-auto animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M6 6h10" />
          <path d="M6 10h10" />
          <path d="M11 14h5" />
          <path d="m15 18 3 3 5-5" />
        </svg>
        <p className="text-sm text-[#c3caac]/60">
          {locale === "en-US" ? "Quickly is starting..." : "Quickly 正在启动..."}
        </p>
      </div>
    </div>
  );

  if (!isDbReady || !authChecked || (currentUser && !accountReady)) {
    return loadingScreen;
  }

  if (!currentUser) {
    return <AuthPage onAuthed={handleAuthed} />;
  }

  return (
    <div className="flex bg-[#181818] text-[#e3e3de] min-h-screen font-mono selection:bg-[#b8f600] selection:text-black" id="applet-viewport">
      
      {/* 1. LEFT SIDEBAR */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userName={currentUser?.name}
        userEmail={currentUser?.email}
        onLogout={handleLogout}
      />

      {/* 2. DYNAMIC WORKSPACE BODY */}
      <div className="flex-1 flex flex-col min-h-screen relative bg-[#121411]" id="quickly-dynamic-workspace">
        
        {/* Top universal Header */}
        <header className="h-16 px-6 border-b border-[#434933]/30 flex items-center justify-between sticky top-0 bg-[#121411]/90 backdrop-blur-md z-40" id="study-global-header">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs text-[#c3caac]" id="header-breadcrumbs">
            {activeTab === "notes" ? (
              notesView === "ima" ? (
                <>
                  <span className="hover:text-white transition-colors cursor-pointer text-xs" onClick={() => setActiveTab("notes")}>
                    {t.imaNotes.tab}
                  </span>
                  <span className="text-[#434933] font-bold">/</span>
                  <span className="text-[#b8f600] font-bold text-xs">{t.imaNotes.title}</span>
                </>
              ) : (
                <>
                  <span className="hover:text-white transition-colors cursor-pointer text-xs" onClick={() => setActiveTab("notes")}>
                    {t.notes.allNotes}
                  </span>
                  <span className="text-[#434933] font-bold">/</span>
                  <span className="text-[#b8f600] font-bold text-xs">
                    {jumpToNoteId
                      ? notes.find(n => n.id === jumpToNoteId)?.topic || t.notes.allNotes
                      : folders.find(f => f.id === notes.find(n => n.id === jumpToNoteId)?.folderId)?.name || t.notes.allNotes
                    }
                  </span>
                </>
              )
            ) : activeTab === "review" ? (
              <>
                <span className="hover:text-white transition-colors cursor-pointer text-xs" onClick={() => setActiveTab("review")}>
                  {t.sidebar.review}
                </span>
                <span className="text-[#434933] font-bold">/</span>
                <span className="text-[#b8f600] font-bold text-xs">
                  {reviewMode === "material" ? t.review.tabMaterial : t.review.tabNotes}
                </span>
              </>
            ) : activeTab === "library" ? (
              <>
                <span className="hover:text-white transition-colors cursor-pointer text-xs" onClick={() => setActiveTab("library")}>
                  {t.library.title}
                </span>
                <span className="text-[#434933] font-bold">/</span>
                <span className="text-[#b8f600] font-bold text-xs">
                  {t.library.breadcrumb}
                </span>
              </>
            ) : activeTab === "mastery" ? (
              <>
                <span className="hover:text-white transition-colors cursor-pointer text-xs" onClick={() => setActiveTab("mastery")}>
                  {t.progressHub.title}
                </span>
                <span className="text-[#434933] font-bold">/</span>
                <span className="text-[#b8f600] font-bold text-xs">
                  {t.progressHub.breadcrumb}
                </span>
              </>
            ) : (
              <>
                {scopeParent && (
                  <>
                    <span className="hover:text-white transition-colors cursor-pointer text-xs" onClick={() => setActiveTab("study")}>
                      {scopeParent}
                    </span>
                    <span className="text-[#434933] font-bold">/</span>
                  </>
                )}
                <div className="relative flex items-center">
                  <button
                    onClick={() => {
                      setShowNoteSelector(!showNoteSelector);
                      if (!showNoteSelector) void loadScopeOptions();
                    }}
                    className="text-[#b8f600] font-bold text-xs max-w-[240px] truncate hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                    title={scopeName}
                  >
                    {scopeName}
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  </button>
                  {studyScope.kind !== "all" && (
                    <button
                      onClick={() => selectScope({ kind: "all" })}
                      className="ml-1 p-0.5 rounded text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title={locale === "en-US" ? "Clear scope" : "清除范围"}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}

                  {/* Study scope selector */}
                  <AnimatePresence>
                    {showNoteSelector && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowNoteSelector(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="absolute left-0 top-full mt-2 w-80 bg-[#222222] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden"
                        >
                          <button
                            onClick={startNewConversation}
                            className="w-full text-left px-4 py-2.5 border-b border-white/5 hover:bg-[#1a1c19] transition-colors flex items-center gap-2 text-[#c3caac]"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#b8f600]" />
                            <span className="text-[11px]">{locale === "en-US" ? "New Conversation" : "新对话"}</span>
                          </button>

                          <div className="max-h-80 overflow-y-auto">
                            <button
                              onClick={() => selectScope({ kind: "all" })}
                              className={`w-full text-left px-4 py-2 text-[11px] hover:bg-[#1a1c19] transition-colors flex items-center gap-2 ${
                                studyScope.kind === "all" ? "text-[#b8f600] bg-[#b8f600]/5" : "text-[#e3e3de]"
                              }`}
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              {locale === "en-US" ? "All notes" : "所有笔记"}
                            </button>

                            {folders.map(folder => {
                              const folderNotes = notes.filter(n => n.folderId === folder.id);
                              if (folderNotes.length === 0) return null;
                              return (
                                <div key={folder.id} className="border-t border-white/5">
                                  <button
                                    onClick={() => selectScope({ kind: "local-folder", folderId: folder.id, name: folder.name })}
                                    className={`w-full text-left px-4 py-2 text-[11px] hover:bg-[#1a1c19] transition-colors flex items-center gap-2 ${
                                      studyScope.kind === "local-folder" && studyScope.folderId === folder.id
                                        ? "text-[#b8f600] bg-[#b8f600]/5"
                                        : "text-[#e3e3de]"
                                    }`}
                                  >
                                    <Folder className="w-3.5 h-3.5" />
                                    <span className="truncate flex-1">{folder.name}</span>
                                    <span className="text-[9px] text-white/30 font-mono">{folderNotes.length}</span>
                                  </button>
                                  {folderNotes.map(note => (
                                    <button
                                      key={note.id}
                                      onClick={() => selectScope({ kind: "local-note", noteId: note.id, name: note.topic })}
                                      className={`w-full text-left pl-9 pr-4 py-1.5 text-[10px] hover:bg-[#1a1c19] transition-colors truncate ${
                                        studyScope.kind === "local-note" && studyScope.noteId === note.id
                                          ? "text-[#b8f600] bg-[#b8f600]/5"
                                          : "text-[#c3caac]"
                                      }`}
                                    >
                                      {note.topic}
                                    </button>
                                  ))}
                                </div>
                              );
                            })}

                            {(() => {
                              const unassigned = notes.filter(n => !n.folderId);
                              if (unassigned.length === 0) return null;
                              return (
                                <div className="border-t border-white/5">
                                  <div className="px-4 py-1.5 text-[9px] font-mono text-white/30 uppercase tracking-wider flex items-center gap-1">
                                    <Folder className="w-3 h-3" />
                                    {locale === "en-US" ? "Unassigned" : "未分类"}
                                  </div>
                                  {unassigned.map(note => (
                                    <button
                                      key={note.id}
                                      onClick={() => selectScope({ kind: "local-note", noteId: note.id, name: note.topic })}
                                      className={`w-full text-left pl-9 pr-4 py-1.5 text-[10px] hover:bg-[#1a1c19] transition-colors truncate ${
                                        studyScope.kind === "local-note" && studyScope.noteId === note.id
                                          ? "text-[#b8f600] bg-[#b8f600]/5"
                                          : "text-[#c3caac]"
                                      }`}
                                    >
                                      {note.topic}
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}

                            {scopeNotebooks.length > 0 && (
                              <div className="border-t border-white/5">
                                <div className="px-4 py-1.5 text-[9px] font-mono text-white/30 uppercase tracking-wider flex items-center gap-1">
                                  <BookOpen className="w-3 h-3" />
                                  {locale === "en-US" ? "IMA notebooks" : "IMA 笔记本"}
                                </div>
                                {scopeNotebooks.map(notebook => (
                                  <button
                                    key={notebook.id}
                                    onClick={() => selectScope({ kind: "ima-notebook", notebookId: notebook.id, name: notebook.name })}
                                    className={`w-full text-left px-6 py-2 text-[11px] hover:bg-[#1a1c19] transition-colors truncate ${
                                      studyScope.kind === "ima-notebook" && studyScope.notebookId === notebook.id
                                        ? "text-[#b8f600] bg-[#b8f600]/5"
                                        : "text-[#e3e3de]"
                                    }`}
                                  >
                                    {notebook.name}
                                  </button>
                                ))}
                              </div>
                            )}

                            {scopeKbs.length > 0 && (
                              <div className="border-t border-white/5">
                                <div className="px-4 py-1.5 text-[9px] font-mono text-white/30 uppercase tracking-wider flex items-center gap-1">
                                  <Database className="w-3 h-3" />
                                  {locale === "en-US" ? "IMA knowledge bases" : "IMA 知识库"}
                                </div>
                                {scopeKbs.map(kb => (
                                  <button
                                    key={kb.id}
                                    onClick={() => selectScope({ kind: "ima-kb", kbId: kb.id, name: kb.name })}
                                    className={`w-full text-left px-6 py-2 text-[11px] hover:bg-[#1a1c19] transition-colors truncate ${
                                      studyScope.kind === "ima-kb" && studyScope.kbId === kb.id
                                        ? "text-[#b8f600] bg-[#b8f600]/5"
                                        : "text-[#e3e3de]"
                                    }`}
                                  >
                                    {kb.name}
                                  </button>
                                ))}
                              </div>
                            )}

                            {scopeOptionsLoading && (
                              <div className="flex items-center justify-center gap-2 py-3 text-[10px] text-white/30">
                                <span className="w-3 h-3 border-2 border-[#b8f600]/30 border-t-[#b8f600] rounded-full animate-spin" />
                                {locale === "en-US" ? "Loading IMA scopes..." : "正在加载 IMA 范围..."}
                              </div>
                            )}

                            {notes.length === 0 && scopeNotebooks.length === 0 && scopeKbs.length === 0 && (
                              <div className="py-6 text-center">
                                <BookOpen className="w-6 h-6 text-white/10 mx-auto mb-2" />
                                <p className="text-[10px] text-white/40">{locale === "en-US" ? "No notes yet" : "暂无笔记"}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-4" id="header-actions">
            <div className="flex items-center gap-3 text-[#c3caac]" id="header-bell-actions">
              {/* Bell with dropdown */}
              <div className="relative">
                <button 
                  id="header-btn-news"
                  onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                  className="hover:text-[#b8f600] transition-colors relative p-1.5 rounded hover:bg-[#1a1c19]"
                  title={t.header.systemMsg}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#f43f5e] text-white text-[9px] font-bold">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                <AnimatePresence>
                  {showNotifDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowNotifDropdown(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute right-0 top-full mt-2 w-80 bg-[#222222] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                          <span className="text-xs font-bold text-[#e3e3de]">{t.header.systemMsg}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                              }}
                              className="text-[10px] text-[#c3caac] hover:text-[#b8f600] transition-colors"
                            >
                              {t.header.markAllRead}
                            </button>
                            <button
                              onClick={clearNotifications}
                              className="text-[10px] text-[#c3caac] hover:text-rose-400 transition-colors"
                            >
                              {t.header.clearAll}
                            </button>
                          </div>
                        </div>

                        {/* Notification List */}
                        <div className="max-h-72 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <div className="py-8 text-center">
                              <Bell className="w-8 h-8 text-white/10 mx-auto mb-2" />
                              <p className="text-[11px] text-white/40">{t.header.noNotifications}</p>
                            </div>
                          ) : (
                            notifications.map(notif => (
                              <div
                                key={notif.id}
                                className={`px-4 py-3 border-b border-white/5 hover:bg-[#1a1c19] transition-colors cursor-pointer ${!notif.read ? "bg-[#b8f600]/5" : ""}`}
                                onClick={() => {
                                  setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                                }}
                              >
                                <div className="flex items-start gap-2.5">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                    notif.type === "reminder" ? "bg-[#b8f600]/10 text-[#b8f600]" :
                                    notif.type === "success" ? "bg-[#b8f600]/10 text-[#b8f600]" :
                                    notif.type === "warning" ? "bg-amber-400/10 text-amber-400" :
                                    "bg-blue-400/10 text-blue-400"
                                  }`}>
                                    {notif.type === "reminder" ? <Bell className="w-3 h-3" /> :
                                     notif.type === "success" ? <CheckCircle2 className="w-3 h-3" /> :
                                     <Bell className="w-3 h-3" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={`text-[11px] font-medium truncate ${!notif.read ? "text-[#e3e3de]" : "text-[#c3caac]"}`}>
                                        {notif.title}
                                      </span>
                                      <span className="text-[9px] text-white/30 font-mono shrink-0">{notif.timestamp}</span>
                                    </div>
                                    <p className="text-[10px] text-white/40 mt-0.5 line-clamp-2">{notif.message}</p>
                                  </div>
                                  {!notif.read && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#b8f600] shrink-0 mt-1.5" />
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Conversation history button, next to notifications */}
              <button
                id="header-btn-history"
                onClick={toggleHistory}
                title={historyOpen ? t.history.collapse : t.history.expand}
                className={`transition-colors p-1.5 rounded hover:bg-[#1a1c19] relative ${
                  historyOpen ? "text-[#b8f600] bg-[#1a1c19]" : "hover:text-[#b8f600]"
                }`}
              >
                <History className="w-4 h-4" />
                {conversations.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-[#2A2A2A] border border-white/10 text-[#c3caac] text-[9px] font-mono">
                    {conversations.length}
                  </span>
                )}
              </button>

              <div className="mr-2" />
            </div>
          </div>
        </header>

        {/* Tab Interface Router */}
        <main className="flex-1 flex flex-col min-h-0" id="workspace-routing-layer">
          
          {/* TAB 1: STUDY AREA */}
          {activeTab === "study" && (
            <div className="flex-1 flex flex-col h-full bg-[#121411] overflow-hidden" id="tab-study-pane">
              <div className="w-full max-w-6xl flex-1 flex flex-col h-full overflow-hidden justify-between p-8">
                
                {/* Intro Title */}
                <div className="mb-4 text-left select-none" id="chat-tab-heading">
                  <h1 className="text-xl font-bold tracking-tight text-[#e3e3de]">
                    {t.study.title}
                  </h1>
                  <p className="text-[11px] text-[#c3caac]/70 mt-1">
                    {t.study.subtitle}
                  </p>
                </div>

                {/* Messages Viewport scrollable */}
                <div 
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto space-y-6 scrollbar-none pb-4"
                  id="chat-messages-viewport"
                >
                  {messages.length === 0 ? (
                    <div className="text-center py-16" id="welcome-chat-center">
                      <GraduationCap className="w-12 h-12 text-[#b8f600] opacity-30 mx-auto mb-4 animate-pulse" />
                      <p className="text-sm font-semibold text-[#e3e3de]">{t.study.welcomeTitle}</p>
                      <p className="text-xs text-[#c3caac]/60 mt-1 max-w-sm mx-auto">
                        {t.study.welcomeDesc}
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      if (m.isScopeNotice) {
                        return (
                          <div key={m.id} className="flex justify-center py-1" id={`chat-scope-notice-${m.id}`}>
                            <span className="text-[10px] font-mono text-[#c3caac]/70 bg-[#1a1c19] border border-white/5 rounded-full px-3 py-1">
                              {m.text}
                            </span>
                          </div>
                        );
                      }
                      const isSystem = m.sender === "system";
                      return (
                        <div 
                          key={m.id}
                          id={`chat-bubble-${m.id}`}
                          className={`flex gap-4 ${isSystem ? "justify-start items-start" : "justify-end"}`}
                        >
                          {/* AI Avatar Side Icon */}
                          {isSystem && (
                            <div className="w-8 h-8 rounded-full border border-[#434933]/45 flex items-center justify-center bg-[#1a1c19] shrink-0 mt-0.5 shadow-sm select-none">
                              <Brain className="w-4.5 h-4.5 text-[#b8f600]" />
                            </div>
                          )}

                          <div className={`flex flex-col ${isSystem ? "flex-1" : "max-w-[80%]"}`}>
                            <div className={`rounded-lg p-4 border border-white/5 text-xs text-[#e3e3de] leading-relaxed shadow-sm ${
                              isSystem 
                                ? "bg-[#222222] rounded-tl-sm space-y-3" 
                                : "bg-[#222222] rounded-tr-sm"
                            }`}>
                              
                              {/* Sender Name & Time */}
                              <div className="flex items-center gap-2 text-[9px] font-mono text-white/30 tracking-wider pb-1.5 border-b border-outline-variant/20 select-none">
                                <span className="font-bold">{isSystem ? t.study.aiAssistant : t.study.student}</span>
                                {m.mode && (
                                  <span className={`px-1.5 py-0.5 rounded border text-[8px] font-mono ${
                                    m.mode === "local"
                                      ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                                      : "text-[#b8f600] bg-[#b8f600]/10 border-[#b8f600]/20"
                                  }`}>
                                    {m.mode === "local" ? t.study.localMode : t.study.aiMode}
                                  </span>
                                )}
                                <span>•</span>
                                <span>{m.timestamp}</span>
                              </div>

                              {m.isThinking ? (
                                <div className="flex items-center gap-2 py-1 select-none" id="ai-thinking-spark">
                                  <span className="w-1.5 h-1.5 bg-[#b8f600] rounded-full animate-ping" />
                                  <span className="text-[10px] font-mono text-[#b8f600] animate-pulse">
                                    {t.study.aiThinking}
                                  </span>
                                </div>
                              ) : (
                                /* Message text contents */
                                <div className="space-y-3">
                                  {isSystem && m.text.includes("逻辑回归非常适合") ? (
                                    <div className="space-y-3.5 leading-relaxed font-sans text-xs text-[#e3e3de]">
                                      <p className="text-left">
                                        逻辑回归非常适合二分类问题，因为它输出的概率值在0到1之间，直接对应两类结果（例如：是/否，垃圾邮件/非垃圾邮件）。
                                      </p>
                                      <p className="text-left">
                                        它使用 <span className="border-b border-[#b8f600] pb-0.5 font-bold hover:text-[#b8f600] transition-colors">Sigmoid 函数</span> 将原始的线性预测压缩到这个概率范围内。然后我们应用一个 <span className="border-b border-[#b8f600] pb-0.5 font-bold hover:text-[#b8f600] transition-colors">决策边界（通常是0.5）</span> 来对输出进行分类：如果概率大于0.5，则属于类别1；否则属于类别0。
                                      </p>
                                      <p className="text-left">
                                        与线性回归（可能预测出[0,1]范围之外的值且对异常值敏感）不同，<span className="border-b border-[#b8f600] pb-0.5 font-bold hover:text-[#b8f600] transition-colors">逻辑回归</span> 保持了有界的输出，专为类别决策量身定制。
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="whitespace-pre-line leading-relaxed text-[#e3e3de] text-left">
                                      {m.text}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Located source passages (local search hits / AI citations) */}
                              {!m.isThinking && m.sources && m.sources.length > 0 && (
                                <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1.5" id={`sources-${m.id}`}>
                                  <span className="text-[9px] font-mono uppercase tracking-wider text-white/30 block">
                                    {t.study.sources}
                                  </span>
                                  {m.sources.map((source, idx) => (
                                    <button
                                      key={`${source.noteId}-${idx}`}
                                      onClick={() => setSourceDialog(source)}
                                      className="w-full text-left rounded border border-white/5 bg-[#1a1c19] px-3 py-2 hover:border-[#b8f600]/30 transition-colors cursor-pointer"
                                      title={t.study.viewSource}
                                    >
                                      <span className="text-[9px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-1.5 py-0.5 rounded">
                                        {source.topic}
                                      </span>
                                      <p className="text-[10px] text-[#c3caac]/80 mt-1.5 line-clamp-2 leading-relaxed">
                                        {source.snippet}
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Sub-chips & Status Bar for AI bubble */}
                            {isSystem && !m.isThinking && m.chips && m.chips.length > 0 && (
                              <div className="flex items-center justify-between mt-2 select-none w-full" id={`chips-row-${m.id}`}>
                                <div className="flex gap-1.5">
                                  {m.chips.map((chip, idx) => (
                                    <span 
                                      key={idx}
                                      className="bg-[#2A2A2A] border border-white/5 rounded px-2 py-0.5 text-[10px] text-white/60 font-mono"
                                    >
                                      {chip}
                                    </span>
                                  ))}
                                </div>
                                {/* Save to Notes button */}
                                {savedNoteMsgIds.has(m.id) ? (
                                  <span className="text-[10px] text-[#b8f600]/80 italic flex items-center gap-1 font-medium select-none">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>{t.study.noteSaved}</span>
                                  </span>
                                ) : savingNoteMsgId === m.id ? (
                                  <span className="text-[10px] text-amber-400/80 italic flex items-center gap-1 font-medium animate-pulse select-none">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>{t.study.savingNote}</span>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => void openSaveNoteDialog(m.id, m.text, m.chips || [])}
                                    className="text-[10px] text-[#b8f600] hover:text-[#a6d600] hover:bg-[#b8f600]/10 border border-[#b8f600]/20 hover:border-[#b8f600]/40 rounded px-2.5 py-1 flex items-center gap-1 font-medium transition-all cursor-pointer select-none"
                                    title={t.study.saveToNote}
                                  >
                                    <BookOpen className="w-3 h-3" />
                                    <span>{t.study.saveToNote}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Suggestions shortcuts */}
                <div className="py-2.5 border-t border-white/5 bg-[#121411]/25 select-none text-left shrink-0" id="preset-suggestions-bar">
                  <span className="text-[10px] uppercase font-mono text-white/30 tracking-wider block mb-2 font-semibold">
                    {t.study.youMayAsk}
                  </span>
                  <div className="flex flex-wrap gap-2 pb-1" id="presets-container-row">
                    {suggestedQuestions.map((pq, idx) => (
                      <button
                        key={idx}
                        id={`preset-question-btn-${idx}`}
                        onClick={() => handleSendMessage(pq)}
                        className="text-[11px] text-[#c3caac] hover:text-[#b8f600] bg-[#1a1c19] border border-white/5 hover:border-[#b8f600]/30 px-3 py-1.5 rounded transition-all cursor-pointer font-medium"
                      >
                        {pq}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Input Dock */}
                <div className="pt-4 border-t border-[#434933]/30 bg-[#121411]/25 shrink-0" id="study-input-dock">
                  <div className="bg-[#222222] border border-white/5 rounded-lg p-3 flex flex-col focus-within:border-[#b8f600] transition-colors group" id="chat-input-wrapper">
                    
                    {uploadAttached && (
                      <div className="flex items-center gap-1.5 bg-[#b8f600]/10 border border-[#b8f600]/20 px-2 py-1 rounded text-[11px] text-[#b8f600] font-mono mb-2 w-max" id="file-upload-chip">
                        <Paperclip className="w-3 h-3" />
                        <span>{uploadAttached}</span>
                        <button 
                          onClick={() => setUploadAttached(null)} 
                          className="hover:text-white ml-1 font-bold text-xs"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    <textarea
                      id="chat-textarea-box"
                      rows={2}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(inputText);
                        }
                      }}
                      placeholder={t.study.inputPlaceholder}
                      className="w-full bg-transparent resize-none text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:ring-0"
                    />

                    <div className="flex items-center justify-between pt-2.5 border-t border-white/5 mt-2" id="chat-input-toolbar">
                      <div className="flex items-center gap-2">
                        {/* AI on/off switch: off = local lexical search over notes */}
                        <button
                          id="btn-toggle-ai"
                          onClick={toggleAI}
                          disabled={!aiAvailable}
                          title={!aiAvailable ? t.study.aiUnavailableTitle : aiEnabled ? t.study.aiToggleOnTitle : t.study.aiToggleOffTitle}
                          className={`flex items-center gap-1.5 py-1 px-2.5 rounded border text-[10px] transition-colors ${
                            aiAvailable
                              ? aiEnabled
                                ? "bg-[#b8f600]/10 border-[#b8f600]/30 text-[#b8f600] hover:bg-[#b8f600]/15 cursor-pointer"
                                : "bg-[#2A2A2A] border-white/10 text-[#c3caac] hover:text-white cursor-pointer"
                              : "bg-[#1a1c19] border-white/5 text-white/30 cursor-not-allowed"
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span className="font-bold">{t.study.aiEnabled}</span>
                          <span className={`relative w-6 h-3.5 rounded-full transition-colors ${
                            aiEnabled && aiAvailable ? "bg-[#b8f600]" : "bg-white/15"
                          }`}>
                            <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${
                              aiEnabled && aiAvailable ? "left-3 bg-[#141f00]" : "left-0.5 bg-white/50"
                            }`} />
                          </span>
                        </button>

                        <button
                          id="btn-upload-file-trigger"
                          onClick={simulateFileUpload}
                          className="flex items-center gap-1 text-[#c3caac] hover:text-white transition-colors py-1 px-3 rounded bg-[#2A2A2A] border border-white/5 text-[10px]"
                          title={t.study.uploadContext}
                        >
                          <Paperclip className="w-3 h-3" />
                          <span>{t.study.uploadContext}</span>
                        </button>
                      </div>

                      <button
                        id="btn-send-message-action"
                        onClick={() => handleSendMessage(inputText)}
                        disabled={isSending || !inputText.trim()}
                        className="bg-[#b8f600] text-[#141f00] font-bold text-xs px-4 py-1.5 rounded flex items-center gap-1 hover:bg-[#a1d800] transition-colors opacity-90 hover:opacity-100 disabled:opacity-30 disabled:hover:bg-[#b8f600]"
                      >
                        <span>{t.study.send}</span>
                        <span className="font-bold">&gt;</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NOTES (IMA by default, with local notes kept for migration) */}
          {activeTab === "notes" && (
            notesView === "ima" ? (
              <ImasNotes
                imaConfig={imaConfig}
                localNotes={notes}
                openNoteId={openImaNoteId}
                onOpenNoteHandled={() => setOpenImaNoteId(null)}
                onOpenSettings={() => setActiveTab("settings")}
                onOpenLocal={() => setNotesView("local")}
              />
            ) : (
              <NotesChest
                notes={notes}
                onDelete={deleteNote}
                onUpdate={updateNote}
                folders={folders}
                onCreateFolder={createFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={deleteFolder}
                onMoveNoteToFolder={moveNoteToFolder}
                onCreateNote={createNote}
                onRestoreBackup={restoreNotesBackup}
                onOrganizeNotes={organizeNotesIntoMaterial}
                onAnalyzeNoteSource={analyzeNoteSource}
                jumpToNoteId={jumpToNoteId}
                onOpenIma={() => setNotesView("ima")}
              />
            )
          )}

          {/* TAB 3: KNOWLEDGE BASE (IMA, with legacy local materials) */}
          {activeTab === "library" && (
            libraryView === "ima" ? (
              <ImasKnowledgeBase
                imaConfig={imaConfig}
                onOpenSettings={() => setActiveTab("settings")}
                hasLocal={materialPackages.length > 0 || libraryFolders.length > 0}
                onOpenLocal={() => setLibraryView("local")}
              />
            ) : (
              <MaterialLibrary
                folders={libraryFolders}
                packages={materialPackages}
                files={materialFiles}
                openFileId={openLibraryFileId}
                onOpenFileHandled={() => setOpenLibraryFileId(null)}
                onCreatePackage={createMaterialPackage}
                onAddFiles={addFilesToMaterialPackage}
                onDeletePackage={deleteMaterialPackage}
                onDeleteFile={deleteMaterialFile}
                onCreateFolder={createLibraryFolder}
                onRenameFolder={renameLibraryFolder}
                onDeleteFolder={deleteLibraryFolder}
                legacy
                onOpenIma={() => setLibraryView("ima")}
              />
            )
          )}

          {/* TAB 4: PLAN (mastery feedback + goals/plans) */}
          {activeTab === "mastery" && (
            <ProgressHub
              notes={notes}
              reviewHistory={reviewHistory}
              onStartQuiz={handleStartQuiz}
              onOpenReview={() => setActiveTab("review")}
              dailyGoal={dailyGoal}
              weeklyGoal={weeklyGoal}
              onDailyGoalChange={(value) => {
                setDailyGoal(value);
                localStorage.setItem("quickly_daily_goal", String(value));
                saveSetting("dailyGoal", value);
              }}
              onWeeklyGoalChange={(value) => {
                setWeeklyGoal(value);
                localStorage.setItem("quickly_weekly_goal", String(value));
                saveSetting("weeklyGoal", value);
              }}
            />
          )}

          {/* TAB 5: REVIEW / QUIZ CENTER */}
          {activeTab === "review" && (
            <div className="flex-1 bg-[#121411] p-8 h-screen overflow-y-auto" id="review-dashboard-pane">
              <div className="w-full max-w-6xl space-y-6 text-left" id="review-scroll-context">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-[#e3e3de]">{t.review.title}</h2>
                    <p className="text-xs text-[#c3caac]/70 mt-1">
                      {t.review.subtitle}
                    </p>
                  </div>
                  <div className="inline-flex bg-[#1a1c19] border border-white/5 rounded p-0.5 shrink-0">
                    <button
                      onClick={() => setReviewMode("notes")}
                      className={`px-4 py-1.5 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                        reviewMode === "notes" ? "bg-[#b8f600] text-[#141f00]" : "text-[#c3caac] hover:text-white"
                      }`}
                    >
                      {t.review.tabNotes}
                    </button>
                    <button
                      onClick={() => setReviewMode("material")}
                      className={`px-4 py-1.5 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                        reviewMode === "material" ? "bg-[#b8f600] text-[#141f00]" : "text-[#c3caac] hover:text-white"
                      }`}
                    >
                      {t.review.tabMaterial}
                    </button>
                  </div>
                </div>

                {reviewMode === "material" ? (
                  <>
                    <MaterialReview
                      modelConfig={modelConfig}
                      onComplete={handleMaterialQuizComplete}
                      onSaveToLibrary={addMaterialToLibrary}
                      onSaveSession={saveMaterialQuizSession}
                      onUpdateSession={updateMaterialQuizSession}
                    />
                    <MaterialQuizHistory
                      sessions={materialQuizSessions}
                      materialMode
                      historyOnly
                      onStartMaterial={() => setReviewMode("material")}
                      onOpen={(session) => openMaterialSession(session)}
                      onRedo={(session) => openMaterialSession(session, true)}
                      onDelete={(session) => void deleteMaterialQuizSession(session.id)}
                    />
                  </>
                ) : (
                  <>
                {/* Review by Notes - Dynamic */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="w-4 h-4 text-[#b8f600]" />
                    <h3 className="text-sm font-bold text-[#e3e3de]">{t.review.reviewByNote}</h3>
                  </div>
                  <p className="text-xs text-[#c3caac]/70 mb-4">{t.review.reviewByNoteDesc}</p>

                  {notes.length === 0 ? (
                    <div className="bg-[#222222] border border-white/5 rounded p-6 text-center">
                      <BookOpen className="w-8 h-8 text-white/10 mx-auto mb-3" />
                      <p className="text-xs text-white/40">{t.review.noNotesForReview}</p>
                    </div>
                  ) : (
                    <>
                      {/* Folder groups: collapsed by default; review a folder or a single note */}
                      {folders.map(folder => {
                        const folderNotes = notes.filter(n => n.folderId === folder.id);
                        if (folderNotes.length === 0) return null;
                        const expanded = expandedReviewFolders.has(folder.id);
                        const combinedContent = folderNotes
                          .map(note => `## ${note.topic}\n\n${note.content}`)
                          .join("\n\n");
                        return (
                          <div key={folder.id} className="mb-2.5 border border-white/5 rounded-lg overflow-hidden bg-[#1a1c19]/60">
                            <div className="flex items-center gap-2 px-3 py-2.5">
                              <button
                                onClick={() => toggleReviewFolder(folder.id)}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              >
                                {expanded
                                  ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
                                <Folder className="w-3.5 h-3.5 text-[#b8f600] shrink-0" />
                                <span className="text-[11px] font-medium text-[#e3e3de] truncate">{folder.name}</span>
                                <span className="text-[9px] text-white/30 font-mono">({folderNotes.length} {t.review.noteCount})</span>
                              </button>
                              <button
                                onClick={() => handleStartQuiz(`folder-${folder.id}`, folder.name, combinedContent)}
                                className="px-3 py-1.5 bg-[#b8f600]/10 border border-[#b8f600]/25 text-[#b8f600] hover:bg-[#b8f600]/15 text-[10px] font-bold rounded transition-colors shrink-0"
                              >
                                {t.review.reviewFolder}
                              </button>
                            </div>
                            {expanded && (
                              <div className="px-3 pb-3 space-y-2">
                                {folderNotes.map(note => (
                                  <div
                                    key={note.id}
                                    className="bg-[#222222] border border-white/5 rounded p-3 flex items-center justify-between gap-3"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className="text-[10px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-2 py-0.5 rounded font-bold">
                                        {note.topic}
                                      </span>
                                      <p className="text-[11px] text-[#c3caac] mt-1.5 line-clamp-2">{note.content}</p>
                                    </div>
                                    <button
                                      onClick={() => handleStartQuiz(note.id, note.topic, note.content)}
                                      className="px-3 py-1.5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors shrink-0"
                                    >
                                      {t.review.startReview}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Unassigned notes as one collapsible group */}
                      {(() => {
                        const unassignedNotes = notes.filter(n => !n.folderId);
                        if (unassignedNotes.length === 0) return null;
                        const expanded = expandedReviewFolders.has("__unassigned__");
                        const combinedContent = unassignedNotes
                          .map(note => `## ${note.topic}\n\n${note.content}`)
                          .join("\n\n");
                        return (
                          <div className="mb-2.5 border border-white/5 rounded-lg overflow-hidden bg-[#1a1c19]/60">
                            <div className="flex items-center gap-2 px-3 py-2.5">
                              <button
                                onClick={() => toggleReviewFolder("__unassigned__")}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              >
                                {expanded
                                  ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
                                  : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
                                <Folder className="w-3.5 h-3.5 text-[#b8f600] shrink-0" />
                                <span className="text-[11px] font-medium text-[#e3e3de] truncate">{t.notes.unassignedNotes}</span>
                                <span className="text-[9px] text-white/30 font-mono">({unassignedNotes.length} {t.review.noteCount})</span>
                              </button>
                              <button
                                onClick={() => handleStartQuiz("folder-unassigned", t.notes.unassignedNotes, combinedContent)}
                                className="px-3 py-1.5 bg-[#b8f600]/10 border border-[#b8f600]/25 text-[#b8f600] hover:bg-[#b8f600]/15 text-[10px] font-bold rounded transition-colors shrink-0"
                              >
                                {t.review.reviewFolder}
                              </button>
                            </div>
                            {expanded && (
                              <div className="px-3 pb-3 space-y-2">
                                {unassignedNotes.map(note => (
                                  <div
                                    key={note.id}
                                    className="bg-[#222222] border border-white/5 rounded p-3 flex items-center justify-between gap-3"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className="text-[10px] font-mono text-[#b8f600] bg-[#b8f600]/10 px-2 py-0.5 rounded font-bold">
                                        {note.topic}
                                      </span>
                                      <p className="text-[11px] text-[#c3caac] mt-1.5 line-clamp-2">{note.content}</p>
                                    </div>
                                    <button
                                      onClick={() => handleStartQuiz(note.id, note.topic, note.content)}
                                      className="px-3 py-1.5 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold rounded transition-colors shrink-0"
                                    >
                                      {t.review.startReview}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
                  </>
                )}

              </div>
            </div>
          )}

          {/* TAB 6: SETTINGS */}
          {activeTab === "settings" && (
            <SettingsPage
              modelConfig={modelConfig}
              onModelConfigChange={updateModelConfig}
              imaConfig={imaConfig}
              onImaConfigChange={updateImaConfig}
              theme={theme}
              onThemeChange={setTheme}
              reminderEnabled={reminderEnabled}
              onReminderEnabledChange={(v) => { setReminderEnabled(v); localStorage.setItem("quickly_reminder_enabled", String(v)); }}
              reminderTime={reminderTime}
              onReminderTimeChange={(v) => { setReminderTime(v); localStorage.setItem("quickly_reminder_time", v); saveSetting("reminderTime", v); }}
              soundEnabled={soundEnabled}
              onSoundEnabledChange={(v) => { setSoundEnabled(v); localStorage.setItem("quickly_sound_enabled", String(v)); saveSetting("soundEnabled", v); }}
              autoSaveNotes={autoSaveNotes}
              onAutoSaveNotesChange={(v) => { setAutoSaveNotes(v); localStorage.setItem("quickly_auto_save", String(v)); saveSetting("autoSaveNotes", v); }}
              dailyGoal={dailyGoal}
              onDailyGoalChange={(v) => { setDailyGoal(v); localStorage.setItem("quickly_daily_goal", String(v)); saveSetting("dailyGoal", v); }}
              weeklyGoal={weeklyGoal}
              onWeeklyGoalChange={(v) => { setWeeklyGoal(v); localStorage.setItem("quickly_weekly_goal", String(v)); saveSetting("weeklyGoal", v); }}
            />
          )}

        </main>
      </div>

      {/* 3. RIGHT PANEL: conversation history (toggled from the header) */}
      {historyOpen && (
        <ChatHistoryPanel
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={startNewConversation}
          onDeleteConversation={handleDeleteConversation}
        />
      )}

      {/* 4. ACTIVE QUIZ MODAL PORTAL */}
      <AnimatePresence>
        {activeQuiz && (
          <ActiveQuiz
            topicId={activeQuiz.topicId}
            topicName={activeQuiz.topicName}
            modelConfig={modelConfig}
            noteContent={activeQuiz.noteContent}
            onClose={() => setActiveQuiz(null)}
            onComplete={handleQuizComplete}
          />
        )}
      </AnimatePresence>

      {/* Material quiz opened from history */}
      {activeMaterialSession && (
        <React.Fragment key={`material-session-${activeMaterialSession.id}-${materialSessionRunId}`}>
          <MaterialQuiz
            open={true}
            materialName={activeMaterialSession.materialName}
            questions={activeMaterialSession.questions}
            initialProgress={activeMaterialSession}
            onProgressChange={(progress) => {
              updateMaterialQuizSession(activeMaterialSession.id, progress);
            }}
            onClose={() => setActiveMaterialSession(null)}
            onComplete={(result) => {
              void handleMaterialQuizComplete(result, activeMaterialSession.materialName);
            }}
          />
        </React.Fragment>
      )}

      {/* Save-to-notes confirmation dialog */}
      <AnimatePresence>
        {saveNoteDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] modal-backdrop flex items-center justify-center p-4"
            onClick={() => { if (!saveNoteSubmitting) setSaveNoteDialog(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-md bg-[#222222] border border-white/10 rounded shadow-2xl overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-[#e3e3de]">{t.study.saveNoteDialogTitle}</h3>
                <button
                  onClick={() => { if (!saveNoteSubmitting) setSaveNoteDialog(null); }}
                  className="text-white/40 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <span className="text-[10px] text-[#c3caac] block mb-2">{t.study.saveNoteTarget}</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSaveNoteTarget("local")}
                      className={`px-3 py-2 rounded border text-[11px] font-bold transition-colors ${
                        saveNoteTarget === "local"
                          ? "bg-[#b8f600]/10 border-[#b8f600]/30 text-[#b8f600]"
                          : "bg-[#1a1c19] border-white/5 text-[#c3caac] hover:border-white/15"
                      }`}
                    >
                      {t.study.saveNoteLocal}
                    </button>
                    <button
                      onClick={() => setSaveNoteTarget("ima")}
                      disabled={!isImaProvider || !imaConfig.enabled || !imaConfig.clientId.trim() || !imaConfig.apiKey.trim()}
                      className={`px-3 py-2 rounded border text-[11px] font-bold transition-colors disabled:opacity-30 ${
                        saveNoteTarget === "ima"
                          ? "bg-[#b8f600]/10 border-[#b8f600]/30 text-[#b8f600]"
                          : "bg-[#1a1c19] border-white/5 text-[#c3caac] hover:border-white/15"
                      }`}
                    >
                      {t.study.saveNoteIma}
                    </button>
                  </div>
                </div>

                {saveNoteTarget === "local" ? (
                  <label className="block">
                    <span className="text-[10px] text-[#c3caac] block mb-1">{t.study.saveNoteFolder}</span>
                    <select
                      value={saveNoteFolderId}
                      onChange={(event) => setSaveNoteFolderId(event.target.value)}
                      className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    >
                      <option value="">{t.study.saveNoteNoFolder}</option>
                      {folders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-[10px] text-[#c3caac] block mb-1">{t.study.saveNoteNotebook}</span>
                    <select
                      value={saveNoteNotebookId}
                      onChange={(event) => setSaveNoteNotebookId(event.target.value)}
                      className="w-full bg-[#1a1c19] border border-white/10 rounded px-3 py-2 text-xs text-[#e3e3de] focus:outline-none focus:border-[#b8f600]"
                    >
                      <option value="">{t.study.saveNoteNoNotebook}</option>
                      {saveNoteNotebooks.map(notebook => (
                        <option key={notebook.id} value={notebook.id}>{notebook.name}</option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="flex items-start justify-between gap-3 p-3 bg-[#1a1c19] rounded border border-white/5">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-[#e3e3de] block">{t.study.saveNoteUseAi}</span>
                    <p className="text-[10px] text-white/35 mt-1 leading-relaxed">{t.study.saveNoteUseAiDesc}</p>
                  </div>
                  <button
                    onClick={() => setSaveNoteUseAI(prev => !prev)}
                    disabled={!aiAvailable}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      saveNoteUseAI && aiAvailable ? "bg-[#b8f600]" : "bg-[#3a3a3a]"
                    } disabled:opacity-40`}
                  >
                    <motion.div
                      animate={{ x: saveNoteUseAI && aiAvailable ? 22 : 2 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow"
                    />
                  </button>
                </div>

                {saveNoteError && (
                  <p className="text-[10px] text-rose-400 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {saveNoteError}
                  </p>
                )}
              </div>

              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-end gap-2">
                <button
                  onClick={() => { if (!saveNoteSubmitting) setSaveNoteDialog(null); }}
                  className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white transition-colors"
                >
                  {t.study.saveNoteCancel}
                </button>
                <button
                  onClick={() => void confirmSaveNote()}
                  disabled={saveNoteSubmitting}
                  className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold transition-colors disabled:opacity-40"
                >
                  {saveNoteSubmitting ? t.study.saveNoteSaving : t.study.saveNoteConfirm}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-chat source content dialog */}
      <AnimatePresence>
        {sourceDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[85] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setSourceDialog(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              className="w-full max-w-2xl max-h-[82vh] bg-[#222222] border border-white/10 rounded shadow-2xl flex flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-[#434933]/30 flex items-start justify-between gap-4 shrink-0">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-mono text-white/35 tracking-wider block">
                    {t.study.sourceDialogTitle}
                  </span>
                  <h3 className="text-sm font-bold text-[#e3e3de] truncate mt-0.5">
                    {sourceDialog.topic || t.study.sources}
                  </h3>
                </div>
                <button
                  onClick={() => setSourceDialog(null)}
                  className="text-white/40 hover:text-white p-1.5 hover:bg-white/5 rounded transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 scrollbar-modern">
                <pre className="text-sm text-[#e3e3de] leading-relaxed font-mono whitespace-pre-wrap">
                  {sourceDialogContent || sourceDialog.snippet}
                </pre>
              </div>
              <div className="px-5 py-3 border-t border-[#434933]/30 flex items-center justify-end gap-2 shrink-0">
                <button
                  onClick={() => setSourceDialog(null)}
                  className="px-3 py-1.5 text-[10px] text-[#c3caac] hover:text-white transition-colors"
                >
                  {t.notes.close}
                </button>
                <button
                  onClick={() => openSourceOriginal(sourceDialog.noteId)}
                  className="px-4 py-1.5 rounded bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] text-[10px] font-bold transition-colors"
                >
                  {t.study.openSource}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <ToastContainer toasts={activeToasts} onDismiss={dismissToast} />

      {/* Undo note deletion */}
      <AnimatePresence>
        {undoDeletedNote && (
          <motion.div
            initial={{ opacity: 0, y: 16, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 16, x: "-50%" }}
            className="fixed bottom-6 left-1/2 z-[70] flex items-center gap-3 px-4 py-2.5 bg-[#222222] border border-white/10 rounded shadow-2xl select-none"
            id="note-deleted-snackbar"
          >
            <span className="text-[11px] text-[#c3caac]">
              {t.notes.noteDeleted}:{" "}
              <span className="text-[#e3e3de] font-bold">{undoDeletedNote.topic}</span>
            </span>
            <button
              onClick={undoDeleteNote}
              className="flex items-center gap-1 text-[11px] font-bold text-[#b8f600] hover:text-white transition-colors cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              {t.notes.undo}
            </button>
            <button
              onClick={() => setUndoDeletedNote(null)}
              className="text-white/30 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
