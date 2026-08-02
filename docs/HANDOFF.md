# Handoff — Idea-to-Feature Capture PWA

Last updated: 2026-08-02. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first — it
holds the full design, the SQL, and the reasoning behind decisions this document
only summarises.

---

## 1. What this is

A mobile-first, installable PWA that captures raw ideas by voice or text and
turns them into structured feature prompts, organised by project. Each project
links to a GitHub repo and pulls live issues/README.

**Live:** https://vakalaktika.github.io/codex_experiments/
**Repo:** `vakalaktika/codex_experiments`, default branch `main`
**Deploy:** push to `main` → `.github/workflows/deploy-pages.yml` → GitHub Pages

---

## 2. Where the work stopped

Build order is in `ARCHITECTURE.md` §8. Steps 1–2 are **done and deployed**.
Step 3 is **not started** and is blocked on a decision (see §5).

| # | Step | State |
| --- | --- | --- |
| 1 | Scaffold — Vite, React, Tailwind, router, PWA | Done |
| 2 | GitHub Pages deploy + 404.html fallback | Done, live |
| 3 | Supabase — migration, RLS, magic-link auth | **Not started, blocked** |
| 4 | Capture → Supabase, offline outbox sync | Not started |
| 5 | `generate-prompt` edge function + prompt editor | Not started |
| 6 | Projects list + project detail tabs | Not started |
| 7 | `github-proxy` edge function + Issues/Repo tabs | Not started |
| 8 | Icons, screenshots, real-device install pass | Partial — icons done |

### What actually works right now

Capture (type or dictate), saving to an IndexedDB queue that survives reload and
force-quit, offline banner, two-tab navigation, installable to the home screen.

### What does not exist yet

Any backend. No auth, no sync, no projects, no AI generation, no GitHub
integration, no copy-to-clipboard. Notes live **only on the device that captured
them**. The Projects tab is an empty state explaining this.

---

## 3. Code map

```
src/
├── main.tsx              Router. basename comes from import.meta.env.BASE_URL.
├── index.css             Tailwind v4 CSS-first tokens (@theme) + safe-area utils.
├── lib/
│   ├── types.ts          Field names deliberately match the SQL columns.
│   ├── outbox.ts         IndexedDB capture queue. Real code, not a stub — step 4
│   │                     adds a flush, it does not replace this.
│   ├── speech.ts         Web Speech wrapper + isSpeechSupported().
│   └── clipboard.ts      Written for step 5, not yet wired to any UI.
├── hooks/
│   ├── useDictation.ts   Stops dictation on visibilitychange (iOS mic indicator).
│   └── useOnline.ts
├── components/
│   ├── AppShell.tsx      Bottom nav + offline banner.
│   ├── MicButton.tsx
│   └── UpdatePrompt.tsx  SW update gate — never auto-reloads mid-capture.
└── screens/
    ├── Capture.tsx       Index route "/". Dictation streams into the textarea.
    ├── Projects.tsx      Empty state.
    └── NotFound.tsx

scripts/
├── generate-icons.mjs    One SVG source → the icon set. `npm run icons`.
└── post-build.mjs        dist/index.html → dist/404.html. Load-bearing, see §4.
```

`supabase/` does not exist yet. Create it per `ARCHITECTURE.md` §3 when starting
step 3; the migration SQL is written and ready in §4 of that document.

---

## 4. Things that will bite you

**The subpath is load-bearing.** Pages serves from `/codex_experiments/`.
`base` in `vite.config.ts` is the single source of truth — the manifest paths,
router `basename`, and SW scope all derive from it. Hardcoding a root-absolute
path anywhere produces a PWA that installs fine and then launches to a blank
screen. If the app moves to its own repo or a domain, change `base` only.

**`scripts/post-build.mjs` is not optional.** Pages has no rewrite rules, so a
cold load of `/codex_experiments/projects` gets a real CDN 404 before the app
boots. `404.html` is how React Router ever sees that URL. The service worker's
`navigateFallback` masks this on repeat visits, which means removing the script
appears to work locally and fails on a link opened fresh on a phone.

**Secrets cannot live in the client.** The bundle is public. Only
`VITE_SUPABASE_URL` and the **anon** key belong in the build (guarded by RLS,
not secrecy). The Anthropic key and GitHub PAT go in Supabase edge-function
secrets — this is why both integrations are edge functions rather than direct
client calls. Do not "simplify" this.

**`client_id` on notes is an idempotency key**, uniquely indexed in the schema.
The outbox retries; without it a flaky reconnect saves the same idea repeatedly.

**Tailwind is v4**, so there is no `tailwind.config.js` or `postcss.config.js`.
Tokens live in `src/index.css` under `@theme`. Do not add a v3-style config.

**iOS specifics:** `apple-touch-icon` and the `apple-mobile-web-app-*` meta tags
in `index.html` are required because iOS ignores most of the manifest.
`viewport-fit=cover` plus the `pb-safe`/`pt-safe` utilities keep the mic button
clear of the home indicator.

---

## 5. Open decisions — do not guess these

1. **Supabase project ownership (blocks step 3).** A Supabase connector exists in
   the session but listing projects requires the user's approval, which was not
   given. Either they approve it and the agent creates/configures the project, or
   they supply the project URL + anon key. Ask; do not create infrastructure on
   their account unprompted.

2. **iOS voice fallback (blocks step 4's mic path).** `webkitSpeechRecognition`
   is unreliable in iOS standalone mode — the exact mode this app targets. The
   user was asked to test the mic on the installed app; **no answer yet**. If it
   fails, plan B is `MediaRecorder` → upload → server-side transcription, which
   is new scope and needs their sign-off. Android Chrome is fine either way.

3. **Repo choice (cosmetic, cheap to change).** The app lives inside
   `codex_experiments`, described as "Experiments with Open AI Codex", so the URL
   doesn't describe the app and shares an origin — and therefore
   `localStorage` — with anything else published under that account. A dedicated
   repo or a `vakalaktika.github.io` repo would be cleaner. User was told and
   chose to proceed here for now.

---

## 6. Operational notes

**Deploy is not fully automatic on a fresh repo.** Pages had to be enabled by
hand (Settings → Pages → Source → GitHub Actions); until then `deploy-pages`
fails with `404 — Ensure GitHub Pages has been enabled` while the build job
passes. That's done now, but it explains the two failed-then-green runs in the
history.

**Env vars are not yet set.** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
are read by the workflow as repo *variables* and are currently empty. The build
succeeds without them because nothing consumes them yet. Set them before step 3.

**Verifying the deployed site from an agent sandbox may be impossible.** The
network policy in the session that built this denied `vakalaktika.github.io`
(`connect_rejected`, 403 to CONNECT). Local verification was done instead by
serving `dist/` through a small server that mimics Pages' subpath and 404
behaviour — worth rebuilding if you need the same confidence. Do not report the
live site as verified if you could not actually load it.

**Local commands:**

```bash
npm install
npm run dev        # http://localhost:5173/codex_experiments/
npm run build      # typecheck + build + emit 404.html
npm run typecheck
npm run icons      # regenerate icons from the SVG source
```

---

## 7. Suggested first move

Ask the user about decision 1 in §5. While waiting, there is real unblocked work:
write `supabase/migrations/0001_init.sql` from `ARCHITECTURE.md` §4 verbatim and
scaffold `supabase/functions/_shared/`. Neither needs a live project, and both
are on the critical path.
