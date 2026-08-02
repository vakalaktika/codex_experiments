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
```

### Deployment

Pushes to `main` build and publish to GitHub Pages via
`.github/workflows/deploy-pages.yml`. The site is served from a subpath, so
`base` in `vite.config.ts` must match the repo name — the manifest paths,
router basename, and service worker scope are all derived from it.

**One-time setup:** repo → Settings → Pages → Source → **GitHub Actions**.

### Status

Capture works end to end against local storage: dictation where the browser
supports it, typing everywhere, and an IndexedDB queue that holds notes on the
device until a backend exists. Supabase, Claude-generated feature prompts, and
the GitHub integration are next — see the build order in the architecture doc.
