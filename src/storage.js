// IndexedDB pequeno (sem libs) para:
// - notes (cache local)
// - outbox (fila de operações para sync)

const DB_NAME = 'personal_app_db';
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
  const db = req.result;

  // =========================
  // STORES JÁ EXISTENTES
  // =========================
  if (!db.objectStoreNames.contains('notes')) {
    const notes = db.createObjectStore('notes', { keyPath: 'id' });
    notes.createIndex('by_updated_at', 'updated_at');
  }

  if (!db.objectStoreNames.contains('outbox')) {
    db.createObjectStore('outbox', { keyPath: 'op_id' });
  }

  // =========================
  // NOVAS STORES - FINANÇAS
  // =========================

  // Tags personalizadas (nome + cor)
  if (!db.objectStoreNames.contains('finance_tags')) {
    const tags = db.createObjectStore('finance_tags', { keyPath: 'id' });
    tags.createIndex('by_user', 'user_id');
  }

  // Compromissos (parcelado / recorrente / único)
  if (!db.objectStoreNames.contains('finance_commitments')) {
    const commitments = db.createObjectStore('finance_commitments', { keyPath: 'id' });
    commitments.createIndex('by_user', 'user_id');
  }

  // Ocorrências (parcelas geradas)
  if (!db.objectStoreNames.contains('finance_occurrences')) {
    const occ = db.createObjectStore('finance_occurrences', { keyPath: 'id' });
    occ.createIndex('by_user', 'user_id');
    occ.createIndex('by_due_date', 'due_date');
    occ.createIndex('by_user_due', ['user_id', 'due_date']);
    occ.createIndex('by_commitment', 'commitment_id');
  }

  // Relação N:N entre compromisso e tags
  if (!db.objectStoreNames.contains('finance_commitment_tags')) {
    db.createObjectStore('finance_commitment_tags', {
      keyPath: ['commitment_id', 'tag_id']
    });
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
  console.log('[storage] upsertNote', note.id);
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
  console.log('[storage] enqueueOp', op.op_id, op.type);
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

// =========================
// FINANCE - HELPERS
// =========================

export async function upsertFinanceTag(tag) {
  await tx('finance_tags', 'readwrite', (s) => s.put(tag));
}

export async function deleteFinanceTag(id) {
  await tx('finance_tags', 'readwrite', (s) => s.delete(id));
}

export async function getAllFinanceTags() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('finance_tags', 'readonly');
    const s = t.objectStore('finance_tags');
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertFinanceCommitment(commitment) {
  await tx('finance_commitments', 'readwrite', (s) => s.put(commitment));
}

export async function deleteFinanceCommitment(id) {
  await tx('finance_commitments', 'readwrite', (s) => s.delete(id));
}

export async function getAllFinanceCommitments() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('finance_commitments', 'readonly');
    const s = t.objectStore('finance_commitments');
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertFinanceOccurrence(occ) {
  await tx('finance_occurrences', 'readwrite', (s) => s.put(occ));
}

export async function deleteFinanceOccurrence(id) {
  await tx('finance_occurrences', 'readwrite', (s) => s.delete(id));
}

export async function getAllFinanceOccurrences() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('finance_occurrences', 'readonly');
    const s = t.objectStore('finance_occurrences');
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertFinanceCommitmentTag(row) {
  // row: { commitment_id, tag_id, user_id, created_at }
  await tx('finance_commitment_tags', 'readwrite', (s) => s.put(row));
}

export async function deleteFinanceCommitmentTag(commitment_id, tag_id) {
  await tx('finance_commitment_tags', 'readwrite', (s) => s.delete([commitment_id, tag_id]));
}

export async function getAllFinanceCommitmentTags() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('finance_commitment_tags', 'readonly');
    const s = t.objectStore('finance_commitment_tags');
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
} 