import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProjects } from '../hooks/useProjects'
import { assignNote, listNotes } from '../lib/db'
import type { Note, Project } from '../lib/types'

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="border-edge bg-surface/60 hover:border-accent/50 block rounded-2xl border p-4 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-medium">{project.name}</h2>
        <span className="text-muted shrink-0 text-[11px]">
          {relativeTime(project.updated_at)}
        </span>
      </div>
      {project.description && (
        <p className="text-muted mt-1.5 line-clamp-2 text-sm leading-relaxed">
          {project.description}
        </p>
      )}
      {project.github_owner && project.github_repo && (
        <p className="text-muted/70 mt-2 truncate font-mono text-[11px]">
          {project.github_owner}/{project.github_repo}
        </p>
      )}
    </Link>
  )
}

/**
 * The inbox for notes captured before a project was chosen. Filing happens
 * here rather than on Capture so the capture path stays a single decision:
 * write the idea down.
 */
function UnfiledNotes({
  notes,
  projects,
  onFiled,
}: {
  notes: Note[]
  projects: Project[]
  onFiled: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function file(noteId: string, projectId: string) {
    setBusy(noteId)
    setError(null)
    try {
      await assignNote(noteId, projectId)
      onFiled()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not file that note.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-6">
      <h2 className="text-muted mb-2 text-xs font-medium">
        Unfiled · {notes.length} {notes.length === 1 ? 'note' : 'notes'}
      </h2>

      {error && (
        <p role="alert" className="mb-2 text-xs text-amber-300">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {notes.map((note) => (
          <li key={note.id} className="border-edge bg-surface/40 rounded-xl border p-3">
            <p className="line-clamp-3 text-sm leading-relaxed">{note.raw_text}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-muted text-[11px]">{relativeTime(note.created_at)}</span>
              <span className="flex-1" />
              {projects.length === 0 ? (
                <span className="text-muted/70 text-[11px]">Create a project to file it</span>
              ) : (
                <>
                  <label htmlFor={`file-${note.id}`} className="sr-only">
                    File this note into a project
                  </label>
                  <select
                    id={`file-${note.id}`}
                    defaultValue=""
                    disabled={busy === note.id}
                    onChange={(event) => {
                      if (event.target.value) void file(note.id, event.target.value)
                    }}
                    className="border-edge bg-surface focus:border-accent max-w-40 rounded-lg border px-2 py-1 text-xs outline-none disabled:opacity-50"
                  >
                    <option value="" disabled>
                      File into…
                    </option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Projects() {
  const { projects, loading, error, reload } = useProjects()
  const [unfiled, setUnfiled] = useState<Note[]>([])

  const loadUnfiled = useCallback(async () => {
    try {
      setUnfiled(await listNotes(null))
    } catch {
      // The inbox is secondary; a failure here must not blank the project list.
      setUnfiled([])
    }
  }, [])

  useEffect(() => {
    void loadUnfiled()
  }, [loadUnfiled])

  async function handleFiled() {
    await Promise.all([loadUnfiled(), reload()])
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-safe">
      <header className="flex items-center justify-between py-3">
        <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
        <Link
          to="/projects/new"
          className="bg-accent rounded-xl px-3 py-1.5 text-sm font-medium text-white"
        >
          New
        </Link>
      </header>

      {error && (
        <p role="alert" className="mb-3 text-xs text-amber-300">
          {error}
        </p>
      )}

      {unfiled.length > 0 && (
        <UnfiledNotes notes={unfiled} projects={projects} onFiled={handleFiled} />
      )}

      {loading && projects.length === 0 ? (
        <p className="text-muted py-8 text-center text-sm" role="status">
          Loading…
        </p>
      ) : projects.length === 0 ? (
        <div className="border-edge bg-surface/60 rounded-2xl border border-dashed p-6 text-center">
          <p className="text-sm font-medium">No projects yet</p>
          <p className="text-muted mt-2 text-sm leading-relaxed">
            A project groups your captures, holds the context prompt generation
            uses, and can link a GitHub repo for its issues and README.
          </p>
          <Link
            to="/projects/new"
            className="bg-accent mt-4 inline-block rounded-xl px-4 py-2 text-sm font-medium text-white"
          >
            Create one
          </Link>
        </div>
      ) : (
        <ul className="space-y-2 pb-6">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
