/**
 * One stored resume, in the background worker's IndexedDB so the ArrayBuffer
 * never lives in a page origin or in chrome.storage (which would serialize it
 * into every snapshot).
 */
const DB_NAME = 'job-copilot';
const STORE = 'files';
const KEY = 'resume';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

function run(mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let request;
    try {
      request = work(store);
    } catch (err) {
      db.close();
      reject(err);
      return;
    }
    if (request) {
      request.onsuccess = () => {};
      request.onerror = () => reject(request.error);
    }
    tx.oncomplete = () => {
      const value = request ? request.result : undefined;
      db.close();
      resolve(value);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB transaction failed'));
    };
  }));
}

export async function putDocument({ name, type, buffer }) {
  if (!name || !buffer) throw new Error('Resume file is missing a name or contents');
  const record = {
    name: String(name),
    type: type || 'application/octet-stream',
    buffer,
    size: buffer.byteLength || 0,
    storedAt: new Date().toISOString(),
  };
  await run('readwrite', (store) => store.put(record, KEY));
  return { name: record.name, type: record.type, size: record.size };
}

export async function getDocument() {
  const record = await run('readonly', (store) => store.get(KEY));
  if (!record) return null;
  return {
    name: record.name,
    type: record.type,
    size: record.size,
    buffer: record.buffer,
  };
}

export async function documentMeta() {
  const record = await getDocument();
  if (!record) return null;
  return { name: record.name, type: record.type, size: record.size };
}

export async function deleteDocument() {
  await run('readwrite', (store) => store.delete(KEY));
  return { ok: true };
}
