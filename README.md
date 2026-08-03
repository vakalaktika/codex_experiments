# codex_experiments
Experiments with Open AI Codex

---

## Idea Capture (PWA)

A mobile-first, installable PWA for capturing raw ideas by voice or text and
turning them into structured feature prompts, organised by project.

Design, schema, and hosting notes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Local development

```bash
npm install
npm run dev        # http://localhost:5173/codex_experiments/
npm run build      # type-check, build, and emit the 404.html SPA fallback
npm run icons      # regenerate app icons from the SVG source
npm run serve:dist # serve dist/ exactly as GitHub Pages does (subpath + 404.html)
```

`serve:dist` is the one worth knowing about: `vite preview` does not reproduce
Pages' subpath mounting or its 404 handling, and those are precisely where a
subpath PWA breaks. Verify a build there before trusting it.

### Connecting the backend

The app builds and runs with no backend — capture works, notes queue on the
device, and the Projects tab explains that nothing is connected. Everything
else switches on once these are set.

**1. Apply the schema.** Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
against the project (`supabase db push`, or paste it into the SQL editor). It
creates the three tables, their indexes, and the RLS policies.

**2. Set the client env vars.** Locally in `.env`, and in the repo as Actions
*variables* (Settings → Secrets and variables → Actions → Variables) so the
deploy workflow picks them up:

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Same page → Project API keys → `anon` `public` |

Both are public by design and guarded by RLS, not secrecy — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §2.

**3. Point auth at the right origin.** Supabase → Authentication → URL
Configuration: set the Site URL to `https://vakalaktika.github.io/codex_experiments/`
and add it to the redirect allow list, plus `http://localhost:5173/codex_experiments/`
for local work. A mismatch here is the classic "auth works locally, fails in
production" failure.

**4. Deploy the edge functions and their secrets.**

```bash
supabase functions deploy generate-prompt github-proxy
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set GITHUB_PAT=github_pat_...          # needs only read access to the repos you link
supabase secrets set ALLOWED_ORIGINS=https://vakalaktika.github.io,http://localhost:5173
```

These two keys never enter the client bundle — that is the whole reason both
integrations are edge functions. `ANTHROPIC_MODEL` is an optional override for
the drafting model (it defaults to `claude-opus-5`).

### Deployment

Pushes to `main` build and publish to GitHub Pages via
`.github/workflows/deploy-pages.yml`. The site is served from a subpath, so
`base` in `vite.config.ts` must match the repo name — the manifest paths,
router basename, and service worker scope are all derived from it.

**One-time setup:** repo → Settings → Pages → Source → **GitHub Actions**.

### Status

All eight build steps in the architecture doc are implemented: capture with
dictation and an offline IndexedDB queue, magic-link auth, sync with an
idempotency key, projects, Claude-generated feature prompts, and the GitHub
issues/README tabs.

Verified locally: type-check, production build, subpath deep links against the
Pages-mimicking server, boot with no backend configured, and a capture that
survives a reload. **The two edge functions have not been executed** — that
needs a live Supabase project, which does not exist yet. Treat
`generate-prompt` and `github-proxy` as written-but-untested until they have
run once.
