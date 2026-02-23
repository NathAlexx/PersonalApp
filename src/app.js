import { supabase } from './supabaseClient.js';
import {
  isOnline,
  pullFromServer,
  pushOutbox,
  saveNoteOptimistic,
  deleteNoteOptimistic,
  subscribeNotesRealtime,
  getLocalNotes
} from './sync.js';
import { upsertNote, deleteNote } from './storage.js';

function el(id) {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento #${id} não encontrado`);
  return e;
}

function setMsg(target, text, show = true) {
  target.textContent = text;
  target.hidden = !show;
}

function renderNotes(listEl, notes) {
  listEl.innerHTML = '';
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Sem notas ainda.';
    listEl.appendChild(li);
    return;
  }
  for (const n of notes) {
    const li = document.createElement('li');
    li.className = 'item';

    const left = document.createElement('div');
    const content = document.createElement('div');
    content.className = 'content';
    content.textContent = n.content;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = new Date(n.updated_at || n.created_at).toLocaleString();

    left.appendChild(content);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';

    const del = document.createElement('button');
    del.className = 'btn secondary';
    del.textContent = 'Excluir';
    del.addEventListener('click', async () => {
      await deleteNoteOptimistic(n.id);
      await refreshFromLocal();
      await trySync();
    });

    right.appendChild(del);

    li.appendChild(left);
    li.appendChild(right);

    listEl.appendChild(li);
  }
}

let unsubscribeRealtime = null;
let currentSession = null;

async function refreshFromLocal() {
  const notes = await getLocalNotes();
  renderNotes(el('notesList'), notes);
}

async function trySync() {
  const msg = el('syncMsg');
  if (!isOnline()) {
    msg.textContent = 'Offline: mudanças vão sincronizar quando a internet voltar.';
    return;
  }
  try {
    msg.textContent = 'Sincronizando…';
    await pushOutbox();
    // Opcional: recarregar do servidor para garantir consistência
    const user = (await supabase.auth.getUser()).data.user;
    if (user) {
      await pullFromServer(user.id);
      await refreshFromLocal();
    }
    msg.textContent = 'Sincronizado.';
  } catch (e) {
    msg.textContent = `Falha ao sincronizar: ${e.message || e}`;
  }
}

function updateNetBadge() {
  const badge = el('netStatus');
  badge.textContent = isOnline() ? 'Online' : 'Offline';
}

async function showApp(session) {
  el('authCard').hidden = true;
  el('appCard').hidden = false;
  el('btnSignOut').hidden = false;

  el('userInfo').textContent = session.user.email;
  currentSession = session;

  updateNetBadge();
  

  // Render imediato do cache local
  await refreshFromLocal();

  // Pull inicial quando online
  if (isOnline()) {
    try {
      await pullFromServer(session.user.id);
      await refreshFromLocal();
    } catch (e) {
      // sem pânico
      console.warn('Pull inicial falhou', e);
    }
  }

  // Realtime
  if (unsubscribeRealtime) unsubscribeRealtime();
  unsubscribeRealtime = subscribeNotesRealtime(async (payload) => {
    // Observação: payload só chega quando online.
    const { eventType, new: newRow, old } = payload;

    // Atualiza cache local.
    if (eventType === 'DELETE') {
      await deleteNote(old.id);
    } else {
      await upsertNote(newRow);
    }
    await refreshFromLocal();
  });

  // Eventos UI
  // UI listeners são registrados em initApp() para evitar duplicação.
}

async function showAuth() {
  el('authCard').hidden = false;
  el('appCard').hidden = true;
  el('btnSignOut').hidden = true;
  if (unsubscribeRealtime) {
    unsubscribeRealtime();
    unsubscribeRealtime = null;
  }
  currentSession = null;
}

export async function initApp() {
  const authMsg = el('authMsg');

  el('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg(authMsg, '', false);

    const email = el('loginEmail').value.trim();
    const password = el('loginPassword').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(authMsg, error.message, true);
      return;
    }
    await showApp(data.session);
  });

  el('btnSignUp').addEventListener('click', async () => {
    setMsg(authMsg, '', false);

    const email = el('loginEmail').value.trim();
    const password = el('loginPassword').value;
    if (!email || !password) {
      setMsg(authMsg, 'Preencha e-mail e senha para criar conta.', true);
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setMsg(authMsg, error.message, true);
      return;
    }

    // Dependendo da config de confirmação de email, pode não logar automaticamente.
    if (data.session) {
      await showApp(data.session);
    } else {
      setMsg(authMsg, 'Conta criada! Verifique seu e-mail (se confirmação estiver ligada) e depois faça login.', true);
    }
  });

  // Listeners de UI que devem existir apenas uma vez durante o ciclo de vida da página
  el('formNewNote').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = el('noteInput');
    const content = input.value.trim();
    console.log('[app] formNewNote submit fired', { content, hasSession: !!currentSession });
    if (!content) return;

    // Usa sessão atual definida em showApp() para evitar dependência de chamadas assíncronas
    const user = currentSession?.user;
    if (!user) {
      const msg = el('syncMsg');
      msg.textContent = 'Você precisa estar logado para salvar notas.';
      setTimeout(() => (msg.textContent = ''), 2000);
      return;
    }

    const now = new Date().toISOString();
    const note = {
      id: crypto.randomUUID(),
      user_id: user.id,
      content,
      created_at: now,
      updated_at: now
    };

    await saveNoteOptimistic(note);
    console.log('[app] saveNoteOptimistic called', note.id);
    input.value = '';
    await refreshFromLocal();
    await trySync();
  });

  el('btnSync').addEventListener('click', trySync);

  el('btnSignOut').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  // Atualiza badge de rede e listeners para online/offline — registrar uma vez
  updateNetBadge();
  window.addEventListener('online', () => {
    updateNetBadge();
    trySync();
  });
  window.addEventListener('offline', updateNetBadge);

  // sessão existente
  const { data: sess } = await supabase.auth.getSession();
  if (sess.session) {
    await showApp(sess.session);
  } else {
    await showAuth();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) await showApp(session);
    else await showAuth();
  });
}
