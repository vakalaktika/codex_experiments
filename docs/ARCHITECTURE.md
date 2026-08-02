# Idea-to-Feature Capture PWA — Architecture Proposal

Status: **proposal, pre-implementation.** This document covers the file/folder
structure, the Supabase schema, and the PWA manifest/service-worker config.
No application code has been written yet.

---

## 1. Stack decisions

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite + React 18 + TypeScript | Fastest path to a small PWA; `vite-plugin-pwa` wraps Workbox with almost no config. |
| Styling | Tailwind CSS | Per the brief. Mobile-first utilities, safe-area plugin for iOS notch. |
| Routing | React Router v6 | Capture is the index route so the home-screen shortcut lands there directly. |
| Data | Supabase JS v2 (Postgres + Auth) | Per the brief. Row Level Security on every table even though it's single-user. |
| Server logic | Supabase Edge Functions (Deno) | Two functions: `generate-prompt`, `github-proxy`. See §2. |
| Offline | Workbox precache + IndexedDB outbox (`idb`) | Capture must work offline; everything else degrades to cached-read. |
| Voice | Web Speech API (`webkitSpeechRecognition`) | Per the brief, with a hard fallback to text. See §7 for the iOS caveat. |

### 2. Where secrets live — the one non-negotiable

The brief offers "Claude API call" and "client-side PAT" as options. Both would
put long-lived secrets in a JS bundle that anyone who loads the app can read.
A PWA is a static asset; there is no such thing as a private client-side key.

So both outbound integrations go through Edge Functions, with the keys stored as
Supabase function secrets:

```
Client  ──JWT──▶  Edge Function  ──ANTHROPIC_API_KEY──▶  Claude API
Client  ──JWT──▶  Edge Function  ──GITHUB_PAT─────────▶  GitHub REST API
```

Each function verifies the caller's Supabase JWT before doing anything, so the
functions aren't an open proxy to your Anthropic quota. This costs one extra
file per integration and nothing in latency terms that matters here.

`github-proxy` is also where issue/README responses get cached (60s edge cache
+ ETag passthrough), which keeps you clear of GitHub's rate limits when the
project detail screen is polled.

---

## 3. File / folder structure

```
codex_experiments/
├── README.md
├── .env.example                     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY only
├── index.html                       # viewport-fit=cover, apple-* meta tags
├── package.json
├── vite.config.ts                   # + VitePWA plugin config (see §6)
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
│
├── public/
│   ├── icons/
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-512-maskable.png    # 20% safe-zone padding for Android
│   │   └── apple-touch-icon-180.png # iOS ignores manifest icons
│   ├── screenshots/
│   │   ├── capture-narrow.png       # enables richer install prompt on Android
│   │   └── project-wide.png
│   └── offline.html                 # navigation fallback
│
├── src/
│   ├── main.tsx                     # router + SW registration
│   ├── App.tsx                      # auth gate + shell
│   ├── index.css                    # tailwind layers + safe-area vars
│   │
│   ├── lib/
│   │   ├── supabase.ts              # client, persistSession: true
│   │   ├── db.ts                    # typed CRUD wrappers over supabase-js
│   │   ├── outbox.ts                # IndexedDB queue for offline captures
│   │   ├── speech.ts                # SpeechRecognition wrapper + isSupported()
│   │   ├── promptTemplate.ts        # the feature-prompt template + parser
│   │   ├── clipboard.ts             # navigator.clipboard + iOS fallback
│   │   └── types.ts                 # generated Supabase types + app types
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useProjects.ts
│   │   ├── useNotes.ts
│   │   ├── useFeaturePrompts.ts
│   │   ├── useGithub.ts             # issues + readme via github-proxy
│   │   ├── useSpeech.ts
│   │   ├── useOnline.ts
│   │   └── useOutboxSync.ts         # flushes queue on reconnect
│   │
│   ├── components/
│   │   ├── AppShell.tsx
│   │   ├── BottomNav.tsx            # Capture · Projects
│   │   ├── MicButton.tsx            # press-and-hold, live transcript
│   │   ├── ProjectPicker.tsx        # sticky last-used project
│   │   ├── PromptCard.tsx
│   │   ├── CopyButton.tsx
│   │   ├── StatusBadge.tsx          # draft / approved / sent
│   │   ├── OfflineBanner.tsx
│   │   ├── EmptyState.tsx
│   │   └── Toast.tsx
│   │
│   └── screens/
│       ├── Login.tsx                # magic link
│       ├── Capture.tsx              # "/" — index route
│       ├── Projects.tsx             # "/projects"
│       ├── ProjectNew.tsx           # "/projects/new"
│       ├── ProjectDetail.tsx        # "/projects/:id" — tab host
│       │   └── tabs/
│       │       ├── NotesTab.tsx
│       │       ├── PromptsTab.tsx
│       │       ├── IssuesTab.tsx
│       │       └── RepoInfoTab.tsx
│       └── PromptEditor.tsx         # "/prompts/:id"
│
└── supabase/
    ├── config.toml
    ├── migrations/
    │   └── 0001_init.sql            # §4
    └── functions/
        ├── _shared/
        │   ├── cors.ts
        │   └── auth.ts              # verifies caller JWT
        ├── generate-prompt/
        │   └── index.ts             # note → Claude → feature prompt
        └── github-proxy/
            └── index.ts             # GET issues, GET readme (read-only)
```

### Routes

| Path | Screen |
| --- | --- |
| `/` | Capture (index — what the home-screen icon opens) |
| `/login` | Magic link |
| `/projects` | Projects list |
| `/projects/new` | Create project + link repo |
| `/projects/:id` | Project detail, tabs via `?tab=notes\|prompts\|issues\|repo` |
| `/prompts/:id` | Feature prompt editor |

---

## 4. Supabase schema

```sql
-- supabase/migrations/0001_init.sql

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type note_source as enum ('voice', 'text');
create type prompt_status as enum ('draft', 'approved', 'sent');

-- ---------------------------------------------------------------- tables
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  description   text,
  github_owner  text check (github_owner ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'),
  github_repo   text check (github_repo  ~ '^[A-Za-z0-9._-]{1,100}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- link a repo with both halves or neither
  constraint github_pair check (
    (github_owner is null) = (github_repo is null)
  )
);

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  raw_text    text not null check (length(trim(raw_text)) > 0),
  source      note_source not null default 'text',
  -- idempotency key from the offline outbox: a retried flush must not duplicate
  client_id   uuid,
  created_at  timestamptz not null default now()
);

create table public.feature_prompts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  note_id        uuid not null references public.notes(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  generated_text text not null,
  edited_text    text,
  status         prompt_status not null default 'draft',
  model          text,                       -- provenance: which model drafted it
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes
create index projects_user_updated_idx        on public.projects (user_id, updated_at desc);
create index notes_project_created_idx        on public.notes (project_id, created_at desc);
create unique index notes_user_client_id_uidx on public.notes (user_id, client_id)
  where client_id is not null;
create index prompts_project_created_idx      on public.feature_prompts (project_id, created_at desc);
create index prompts_note_idx                 on public.feature_prompts (note_id);

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger prompts_touch before update on public.feature_prompts
  for each row execute function public.touch_updated_at();

-- keep "last activity" on the project card honest
create or replace function public.touch_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return new;
end $$;

create trigger notes_touch_project after insert on public.notes
  for each row execute function public.touch_project();

-- ---------------------------------------------------------------- RLS
alter table public.projects        enable row level security;
alter table public.notes           enable row level security;
alter table public.feature_prompts enable row level security;

create policy projects_owner on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy notes_owner on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy prompts_owner on public.feature_prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- default user_id from the JWT so the client never has to send it
alter table public.projects        alter column user_id set default auth.uid();
alter table public.notes           alter column user_id set default auth.uid();
alter table public.feature_prompts alter column user_id set default auth.uid();
```

Three deliberate departures from the data model in the brief, all additive:

- **`user_id` on every table.** The brief says single-user is fine, and it is —
  but RLS needs a column to key on, and without it the anon key reads the whole
  table. Costs nothing today, saves a migration if a second user ever appears.
- **`client_id` on `notes`.** The offline outbox retries. Without an idempotency
  key, a flaky reconnect gives you the same idea saved three times.
- **`updated_at` + `model`.** `updated_at` drives "last activity" on the project
  cards, which the brief asks for. `model` records which model drafted a prompt.

---

## 5. Feature prompt generation

`generate-prompt` edge function, called right after the note is saved:

**Input** `{ note_id }` → loads note + project (under the caller's RLS context).

**Output** `{ generated_text }`, persisted as a `feature_prompts` row with
`status = 'draft'`, then opened immediately in the editor. Auto-draft, editable
— per the brief, not manual-only.

The system prompt pins the output to exactly the template, headings verbatim,
no preamble:

```
Context: [project name/description]
Feature: [derived title]
Problem: [what the note implies is being solved]
Proposed approach: [derived from the note]
Acceptance criteria: [bullet list, inferred]
Open questions: [anything ambiguous, flagged for me to clarify]
```

Model: `claude-sonnet-5` — the drafting is short-form and latency matters more
than depth here, and the draft is editable by design. Configurable per-call via
a function env var.

The 10-second capture target is measured tap → note saved, which does not wait
on the model. The save returns as soon as Postgres has the note; generation
streams in behind it. If generation fails or you're offline, the note is still
saved and the prompt can be generated later from the note row — the "Generate"
action stays available on any note without a prompt.

---

## 6. PWA config

### `public/manifest.webmanifest` (emitted by `vite-plugin-pwa`)

```jsonc
{
  "name": "Idea Capture",
  "short_name": "Capture",
  "id": "/",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0b0f",
  "theme_color": "#0b0b0f",
  "description": "Capture raw ideas by voice or text and turn them into structured feature prompts.",
  "categories": ["productivity", "developer"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "New capture", "url": "/?new=1", "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }] },
    { "name": "Projects", "url": "/projects" }
  ],
  "screenshots": [
    { "src": "/screenshots/capture-narrow.png", "sizes": "1080x1920", "type": "image/png", "form_factor": "narrow" },
    { "src": "/screenshots/project-wide.png", "sizes": "1920x1080", "type": "image/png", "form_factor": "wide" }
  ]
}
```

`start_url` is `/`, so the home-screen icon opens Capture with no intermediate
navigation — the first requirement in the core flow.

### `index.html` head — the iOS-specific half

iOS ignores most of the manifest, so these are not optional:

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Capture" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
<meta name="theme-color" content="#0b0b0f" />
```

Plus `env(safe-area-inset-*)` padding on the shell and bottom nav, or the mic
button sits under the home indicator.

### Service worker (`vite.config.ts`)

```ts
VitePWA({
  registerType: 'prompt',          // never swap the SW mid-capture
  manifest: /* above */,
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/functions\//],
    runtimeCaching: [
      { // Supabase REST reads — stale data beats a spinner
        urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-rest',
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
        },
      },
      { // GitHub issues / README via the proxy
        urlPattern: ({ url }) => url.pathname.includes('/github-proxy'),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'github',
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
        },
      },
    ],
  },
})
```

Writes are never cached by the SW. Offline capture is handled explicitly by the
IndexedDB outbox in `lib/outbox.ts`, not by background sync — Safari doesn't
implement Background Sync, so the queue flushes on `online` + on app focus.

---

## 7. Known constraints worth naming now

- **Web Speech API on iOS.** `webkitSpeechRecognition` exists in iOS Safari but
  is unreliable in standalone (home-screen) mode, which is exactly the mode this
  app is built for. The graceful fallback is therefore not a corner case — it's a
  likely everyday path on iPhone. Plan A is Web Speech per the brief; if it
  proves dead in standalone, plan B is `MediaRecorder` → upload → server-side
  transcription, which is a new dependency and a scope decision for you, not me.
  Android Chrome is fine.
- **iOS 7-day storage eviction.** Safari clears IndexedDB/localStorage after 7
  days of no interaction with the site, which can log you out and drop a queued
  offline note. Installing to the home screen exempts the app, which the brief
  already requires — worth knowing that the exemption depends on installing.
- **Mic permission needs HTTPS** and a user gesture. Fine in production; local
  dev needs `localhost` or a tunnel.
- **GitHub rate limits.** 5,000 req/hr authenticated via the PAT, shared across
  all projects. The SWR cache above keeps normal use far under it.

---

## 8. Build order (once approved)

1. Scaffold — Vite + Tailwind + router + PWA plugin, installable shell.
2. Supabase — migration, RLS, magic-link auth, session persistence.
3. Capture — text first, then mic, then the offline outbox.
4. `generate-prompt` edge function + prompt editor + copy-to-clipboard.
5. Projects list + project detail (Notes / Prompts tabs).
6. `github-proxy` edge function + Issues / Repo Info tabs.
7. Icons, screenshots, and an install pass on real iOS Safari + Android Chrome.
