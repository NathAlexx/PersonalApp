# Personal App (GitHub Pages + Supabase) — Starter

Um esqueleto **pronto para subir no GitHub** e publicar no **GitHub Pages**, com:

- Frontend estático (Vite + JS puro)
- Supabase Auth + Postgres (RLS)
- CRUD de **Notas** (exemplo)
- Cache/suporte offline:
  - IndexedDB (dados + fila de sync/outbox)
  - Service Worker (cache de assets)
- Realtime: escuta mudanças na tabela e sincroniza UI

## 1) Rodar localmente

```bash
npm install
cp .env.example .env
# edite .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

## 2) Configurar Supabase (SQL pronto)

No Supabase Dashboard → SQL Editor, rode:

- `sql/001_notes.sql`

Isso cria a tabela `notes`, habilita RLS e adiciona policies por usuário.

## 3) Deploy no GitHub Pages (com GitHub Actions)

1. Crie um repositório no GitHub (ex: `meu-app`).
2. Suba este projeto.
3. No GitHub, vá em **Settings → Pages** e selecione **GitHub Actions** como source.
4. Em **Settings → Secrets and variables → Actions → Variables**, crie:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BASE` com `/<nome-do-repo>/` (ex: `/meu-app/`)

5. Faça push. O workflow `.github/workflows/deploy.yml` vai publicar automaticamente.

## 4) O que você edita primeiro

- `src/app.js`: UI e regras de negócio
- `src/sync.js`: sincronização (pull/push/outbox + realtime)
- `src/storage.js`: IndexedDB
- `public/sw.js` e `public/manifest.webmanifest`: PWA / offline

## Observações rápidas

- As credenciais do Supabase que ficam no front são **públicas** (anon). A segurança real está no **RLS**.
- Se você quiser "offline-first" mais robusto (conflitos e replicação avançada), dá pra evoluir depois para RxDB/PowerSync.
