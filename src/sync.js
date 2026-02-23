import { supabase } from './supabaseClient.js';
import { enqueueOp, dequeueOp, listOutbox, upsertNote, deleteNote, getAllNotes, clearNotes } from './storage.js';

export function isOnline() {
  return navigator.onLine;
}

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

export async function pushOutbox() {
  const ops = await listOutbox();
  for (const op of ops) {
    try {
      if (op.type === 'upsert_note') {
        const { error } = await supabase.from('notes').upsert(op.payload, { onConflict: 'id' });
        if (error) throw error;
      }
      if (op.type === 'delete_note') {
        const { error } = await supabase.from('notes').delete().eq('id', op.payload.id);
        if (error) throw error;
      }
      await dequeueOp(op.op_id);
    } catch (e) {
      // Para na primeira falha (ex: offline, token expirado)
      throw e;
    }
  }
}

export async function saveNoteOptimistic(note) {
  console.log('[sync] saveNoteOptimistic', note.id);
  await upsertNote(note);
  console.log('[sync] upsertNote completed', note.id);
  await enqueueOp({
    op_id: crypto.randomUUID(),
    type: 'upsert_note',
    payload: note,
    created_at: new Date().toISOString()
  });
  console.log('[sync] enqueueOp completed for', note.id);
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
  // Recebe inserts/updates/deletes e repassa pro app.
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

export async function getLocalNotes() {
  const notes = await getAllNotes();
  // ordena
  notes.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return notes;
}
