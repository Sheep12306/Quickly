const DB_NAME = "QuicklySecureDB";
const STORE_NAME = "keys";
const DEVICE_KEY_ID = "device-aes-gcm";

let keyPromise: Promise<CryptoKey> | null = null;

function openSecureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open secure storage"));
  });
}

async function readStoredKey(): Promise<CryptoKey | null> {
  const db = await openSecureDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(DEVICE_KEY_ID);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Failed to read secure key"));
  });
}

async function storeKey(key: CryptoKey): Promise<void> {
  const db = await openSecureDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(key, DEVICE_KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Failed to store secure key"));
  });
}

async function getDeviceKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await readStoredKey();
      if (existing) return existing;
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      await storeKey(key);
      return key;
    })();
  }
  return keyPromise;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptSecret(value: string): Promise<string> {
  if (!value) return "";
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  if (!payload || !payload.startsWith("v1.")) return "";
  const [, ivPart, cipherPart] = payload.split(".");
  if (!ivPart || !cipherPart) return "";
  try {
    const key = await getDeviceKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivPart) },
      key,
      base64ToBytes(cipherPart),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return "";
  }
}
