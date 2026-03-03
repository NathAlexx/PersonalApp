import { supabase } from './supabaseClient.js';
import {
  enqueueOp,
  dequeueOp,
  listOutbox,

  // Notes
  upsertNote,
  deleteNote,
  getAllNotes,
  clearNotes,

  // Finance (novos helpers que você colou no storage.js)
  upsertFinanceTag,
  deleteFinanceTag,
  getAllFinanceTags,

  upsertFinanceCommitment,
  deleteFinanceCommitment,
  getAllFinanceCommitments,

  upsertFinanceOccurrence,
  deleteFinanceOccurrence,
  getAllFinanceOccurrences,

  upsertFinanceCommitmentTag,
  deleteFinanceCommitmentTag,
  getAllFinanceCommitmentTags,
} from './storage.js';

export function isOnline() {
  return navigator.onLine;
}

/* =========================
   NOTES
========================= */

export async function pullFromServer(userId) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  await clearNotes();
  for (const n of data) {
    await upsertNote(n);
  }
  return data;
}

export async function getLocalNotes() {
  const notes = await getAllNotes();
  notes.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return notes;
}

export async function saveNoteOptimistic(note) {
  await upsertNote(note);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'upsert_note',
    payload: note,
    created_at: new Date().toISOString()
  });
}

export async function deleteNoteOptimistic(id) {
  await deleteNote(id);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'delete_note',
    payload: { id },
    created_at: new Date().toISOString()
  });
}

export function subscribeNotesRealtime(onChange) {
  const channel = supabase
    .channel('public:notes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, (payload) => {
      onChange(payload);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/* =========================
   FINANCE - PULL/LOCAL
========================= */

export async function pullFinanceFromServer(userId) {
  // tags
  {
    const { data, error } = await supabase
      .from('finance_tags')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    for (const row of data) await upsertFinanceTag(row);
  }

  // commitments
  {
    const { data, error } = await supabase
      .from('finance_commitments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    for (const row of data) await upsertFinanceCommitment(row);
  }

  // occurrences
  {
    const { data, error } = await supabase
      .from('finance_occurrences')
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: true });
    if (error) throw error;
    for (const row of data) await upsertFinanceOccurrence(row);
  }

  // commitment_tags
  {
    const { data, error } = await supabase
      .from('finance_commitment_tags')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    for (const row of data) await upsertFinanceCommitmentTag(row);
  }
}

export async function getLocalFinanceSnapshot() {
  const [tags, commitments, occurrences, links] = await Promise.all([
    getAllFinanceTags(),
    getAllFinanceCommitments(),
    getAllFinanceOccurrences(),
    getAllFinanceCommitmentTags(),
  ]);

  return { tags, commitments, occurrences, links };
}

/* =========================
   FINANCE - OPTIMISTIC
========================= */

export async function saveFinanceTagOptimistic(tag) {
  await upsertFinanceTag(tag);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'upsert_finance_tag',
    payload: tag,
    created_at: new Date().toISOString()
  });
}

export async function deleteFinanceTagOptimistic(id) {
  await deleteFinanceTag(id);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'delete_finance_tag',
    payload: { id },
    created_at: new Date().toISOString()
  });
}

export async function saveFinanceCommitmentOptimistic(commitment) {
  await upsertFinanceCommitment(commitment);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'upsert_finance_commitment',
    payload: commitment,
    created_at: new Date().toISOString()
  });
}

export async function deleteFinanceCommitmentOptimistic(id) {
  await deleteFinanceCommitment(id);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'delete_finance_commitment',
    payload: { id },
    created_at: new Date().toISOString()
  });
}

export async function saveFinanceOccurrenceOptimistic(occ) {
  await upsertFinanceOccurrence(occ);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'upsert_finance_occurrence',
    payload: occ,
    created_at: new Date().toISOString()
  });
}

export async function saveFinanceCommitmentTagOptimistic(row) {
  await upsertFinanceCommitmentTag(row);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'upsert_finance_commitment_tag',
    payload: row,
    created_at: new Date().toISOString()
  });
}

export async function deleteFinanceCommitmentTagOptimistic(commitment_id, tag_id) {
  await deleteFinanceCommitmentTag(commitment_id, tag_id);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'delete_finance_commitment_tag',
    payload: { commitment_id, tag_id },
    created_at: new Date().toISOString()
  });
}

/* =========================
   PUSH OUTBOX (NOTES + FINANCE)
========================= */

export async function pushOutbox() {
  const ops = await listOutbox();
  for (const op of ops) {
    try {
      // NOTES
      if (op.type === 'upsert_note') {
        const { error } = await supabase.from('notes').upsert(op.payload, { onConflict: 'id' });
        if (error) throw error;
      }
      if (op.type === 'delete_note') {
        const { error } = await supabase.from('notes').delete().eq('id', op.payload.id);
        if (error) throw error;
      }

      // FINANCE TAGS
      if (op.type === 'upsert_finance_tag') {
        const { error } = await supabase.from('finance_tags').upsert(op.payload, { onConflict: 'id' });
        if (error) throw error;
      }
      if (op.type === 'delete_finance_tag') {
        const { error } = await supabase.from('finance_tags').delete().eq('id', op.payload.id);
        if (error) throw error;
      }

      // FINANCE COMMITMENTS
      if (op.type === 'upsert_finance_commitment') {
        const { error } = await supabase.from('finance_commitments').upsert(op.payload, { onConflict: 'id' });
        if (error) throw error;
      }
      if (op.type === 'delete_finance_commitment') {
        const { error } = await supabase.from('finance_commitments').delete().eq('id', op.payload.id);
        if (error) throw error;
      }

      // FINANCE OCCURRENCES
      if (op.type === 'upsert_finance_occurrence') {
        const { error } = await supabase.from('finance_occurrences').upsert(op.payload, { onConflict: 'id' });
        if (error) throw error;
      }

      // FINANCE COMMITMENT TAGS
      if (op.type === 'upsert_finance_commitment_tag') {
        const { error } = await supabase.from('finance_commitment_tags').upsert(op.payload, { onConflict: 'commitment_id,tag_id' });
        if (error) throw error;
      }
      if (op.type === 'delete_finance_commitment_tag') {
        const { error } = await supabase
          .from('finance_commitment_tags')
          .delete()
          .eq('commitment_id', op.payload.commitment_id)
          .eq('tag_id', op.payload.tag_id);
        if (error) throw error;
      }

      await dequeueOp(op.op_id);
    } catch (e) {
      throw e;
    }
  }
}

/* =========================
   FINANCE REALTIME
========================= */

export function subscribeFinanceRealtime(onChange) {
  const channel = supabase
    .channel('public:finance')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_tags' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_commitments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_occurrences' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_commitment_tags' }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}