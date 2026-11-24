// Tiny key-value wrapper around IndexedDB (database "studypath", store "kv").
// The service worker (sw.js) opens the same database to read the reminder schedule,
// so keep the names in sync with it. Falls back to localStorage, then to memory.

const DB_NAME = 'studypath';
const STORE = 'kv';
let dbPromise = null;
const memory = new Map();

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function lsGet(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const v = globalThis.localStorage?.getItem('sp:' + key);
    return v == null ? undefined : JSON.parse(v);
  } catch {
    return undefined;
  }
}

function lsSet(key, value) {
  try {
    globalThis.localStorage.setItem('sp:' + key, JSON.stringify(value));
  } catch {
    memory.set(key, value);
  }
}

export async function idbGet(key) {
  const db = await openDB();
  if (!db) return lsGet(key);
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(lsGet(key));
    } catch {
      resolve(lsGet(key));
    }
  });
}

export async function idbSet(key, value) {
  const db = await openDB();
  if (!db) return lsSet(key, value);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        lsSet(key, value);
        resolve();
      };
    } catch {
      lsSet(key, value);
      resolve();
    }
  });
}

export async function idbDel(key) {
  const db = await openDB();
  try {
    globalThis.localStorage?.removeItem('sp:' + key);
  } catch {}
  memory.delete(key);
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
