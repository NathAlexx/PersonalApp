// IndexedDB pequeno (sem libs) para:
// - notes (cache local)
// - outbox (fila de operações para sync)

const DB_NAME = 'personal_app_db';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('by_updated_at', 'updated_at');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'op_id' });
      }
    };
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

export async function upsertNote(note) {
  await tx('notes', 'readwrite', (s) => s.put(note));
}

export async function deleteNote(id) {
  await tx('notes', 'readwrite', (s) => s.delete(id));
}

export async function getAllNotes() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('notes', 'readonly');
    const s = t.objectStore('notes');
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearNotes() {
  await tx('notes', 'readwrite', (s) => s.clear());
}

// Outbox
export async function enqueueOp(op) {
  // op: { op_id, type, payload, created_at }
  await tx('outbox', 'readwrite', (s) => s.put(op));
}

export async function dequeueOp(op_id) {
  await tx('outbox', 'readwrite', (s) => s.delete(op_id));
}

export async function listOutbox() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('outbox', 'readonly');
    const s = t.objectStore('outbox');
    const req = s.getAll();
    req.onsuccess = () => {
      const items = (req.result || []).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}
