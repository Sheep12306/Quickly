/**
 * Account snapshot helpers.
 *
 * The web version stores small metadata in the account database. Sync is
 * three-way (base / local / remote) so two devices can't silently overwrite
 * each other's notes, conversations or quiz history.
 */

export interface AccountSnapshot {
  notes: any[];
  folders: any[];
  reviewHistory: any[];
  conversations: any[];
  messages: any[];
  appSettings: any[];
  materialQuizSessions: any[];
  libraryFolders: any[];
  materialPackages: any[];
  materialFiles: any[];
  savedAt: string;
}

export type SnapshotCollection = Exclude<keyof AccountSnapshot, "savedAt">;

export const SNAPSHOT_COLLECTIONS: SnapshotCollection[] = [
  "notes",
  "folders",
  "reviewHistory",
  "conversations",
  "messages",
  "appSettings",
  "materialQuizSessions",
  "libraryFolders",
  "materialPackages",
  "materialFiles",
];

/** Timestamp field used to resolve records changed on both sides. */
const STAMP_FIELDS: Record<string, string> = {
  notes: "timestamp",
  folders: "createdAt",
  reviewHistory: "date",
  conversations: "updatedAt",
  messages: "createdAt",
  materialQuizSessions: "updatedAt",
  libraryFolders: "createdAt",
  materialPackages: "updatedAt",
  materialFiles: "updatedAt",
};

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

/** Fill in collections missing from older snapshots. */
export function normalizeSnapshot(snapshot: Partial<AccountSnapshot> | null | undefined): AccountSnapshot {
  const source: any = snapshot || {};
  const normalized: any = { savedAt: typeof source.savedAt === "string" ? source.savedAt : "" };
  for (const key of SNAPSHOT_COLLECTIONS) {
    normalized[key] = asArray(source[key]);
  }
  return normalized as AccountSnapshot;
}

export function emptySnapshot(): AccountSnapshot {
  return normalizeSnapshot({ savedAt: new Date().toISOString() });
}

/** Stable serialization: object keys sorted, arrays untouched. */
function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function recordKey(collection: SnapshotCollection, record: any): string {
  if (collection === "appSettings") return String(record?.key ?? "");
  if (collection === "reviewHistory") {
    // Older rows may not carry an id; fall back to a content-derived key so
    // two devices' review records never collapse into one.
    return String(record?.id
      ?? `${record?.topicId ?? ""}|${record?.date ?? ""}|${record?.topicName ?? ""}`);
  }
  return String(record?.id ?? "");
}

function sortRecords(collection: SnapshotCollection, records: any[]): any[] {
  return [...records].sort((a, b) => recordKey(collection, a).localeCompare(recordKey(collection, b)));
}

function stampOf(collection: SnapshotCollection, record: any): number {
  const field = STAMP_FIELDS[collection];
  const raw = field ? record?.[field] : "";
  const time = typeof raw === "string" ? Date.parse(raw) : NaN;
  return Number.isFinite(time) ? time : 0;
}

function sameRecord(a: any, b: any): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Merge one collection. Rules:
 * - only local changed -> local
 * - only remote changed -> remote
 * - both changed -> newer timestamp (local wins for settings)
 * - deleted on one side and unchanged on the other -> deleted
 * - deleted on one side but modified on the other -> keep the modified record
 */
function mergeCollection(
  collection: SnapshotCollection,
  baseRecords: any[],
  localRecords: any[],
  remoteRecords: any[],
): any[] {
  const index = (rows: any[]) => {
    const map = new Map<string, any>();
    for (const row of rows) map.set(recordKey(collection, row), row);
    return map;
  };

  const base = index(baseRecords);
  const local = index(localRecords);
  const remote = index(remoteRecords);
  const keys = new Set<string>([...base.keys(), ...local.keys(), ...remote.keys()]);
  const merged: any[] = [];

  for (const key of keys) {
    const b = base.get(key);
    const l = local.get(key);
    const r = remote.get(key);
    const hasBase = b !== undefined;
    const hasLocal = l !== undefined;
    const hasRemote = r !== undefined;

    if (hasLocal && hasRemote) {
      if (sameRecord(l, r)) {
        merged.push(l);
      } else if (hasBase && sameRecord(l, b)) {
        merged.push(r);
      } else if (hasBase && sameRecord(r, b)) {
        merged.push(l);
      } else if (collection === "appSettings") {
        // Settings have no timestamp; the editing device wins.
        merged.push(l);
      } else {
        merged.push(stampOf(collection, l) >= stampOf(collection, r) ? l : r);
      }
      continue;
    }

    if (hasLocal && !hasRemote) {
      // Remote never had it (local addition) or deleted it.
      if (!hasBase || !sameRecord(l, b)) merged.push(l);
      continue;
    }

    if (!hasLocal && hasRemote) {
      // Local never had it (remote addition) or deleted it.
      if (!hasBase || !sameRecord(r, b)) merged.push(r);
    }
  }

  return sortRecords(collection, merged);
}

/** Three-way merge of account snapshots. `base` may be an empty snapshot. */
export function mergeSnapshots(
  baseInput: AccountSnapshot | null | undefined,
  localInput: AccountSnapshot | null | undefined,
  remoteInput: AccountSnapshot | null | undefined,
): AccountSnapshot {
  const base = normalizeSnapshot(baseInput);
  const local = normalizeSnapshot(localInput);
  const remote = normalizeSnapshot(remoteInput);

  const merged = emptySnapshot();
  merged.savedAt = local.savedAt || remote.savedAt || base.savedAt;

  for (const key of SNAPSHOT_COLLECTIONS) {
    (merged as any)[key] = mergeCollection(key, base[key], local[key], remote[key]);
  }

  return merged;
}

/** Fingerprint used for change detection. Ignores `savedAt` on purpose. */
export function snapshotFingerprint(snapshotInput: AccountSnapshot | null | undefined): string {
  const snapshot = normalizeSnapshot(snapshotInput);
  const payload: Record<string, any[]> = {};
  for (const key of SNAPSHOT_COLLECTIONS) {
    payload[key] = sortRecords(key, snapshot[key]);
  }
  return stableStringify(payload);
}
