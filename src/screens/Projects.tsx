export function Projects() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-safe">
      <header className="py-3">
        <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
      </header>

      <div className="border-edge bg-surface/60 rounded-2xl border border-dashed p-6 text-center">
        <p className="text-sm font-medium">No projects yet</p>
        <p className="text-muted mt-2 text-sm leading-relaxed">
          Projects, feature prompts, and linked GitHub repos arrive with the
          Supabase layer. Capture works now — notes are held on this device and
          will sync into their project once it's connected.
        </p>
      </div>
    </div>
  )
}
