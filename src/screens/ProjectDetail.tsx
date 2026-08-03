import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { deleteProject, getProject } from '../lib/db'
import type { Project } from '../lib/types'
import { IssuesTab } from './tabs/IssuesTab'
import { NotesTab } from './tabs/NotesTab'
import { PromptsTab } from './tabs/PromptsTab'
import { RepoInfoTab } from './tabs/RepoInfoTab'

const TABS = ['notes', 'prompts', 'issues', 'repo'] as const
type Tab = (typeof TABS)[number]

const LABELS: Record<Tab, string> = {
  notes: 'Notes',
  prompts: 'Prompts',
  issues: 'Issues',
  repo: 'Repo',
}

function isTab(value: string | null): value is Tab {
  return value !== null && (TABS as readonly string[]).includes(value)
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // The tab lives in the URL so a deep link opens the right one and Back
  // steps between tabs rather than leaving the project.
  const [searchParams, setSearchParams] = useSearchParams()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setProject(await getProject(id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the project.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const requested = searchParams.get('tab')
  const linked = Boolean(project?.github_owner && project?.github_repo)
  const available: readonly Tab[] = linked ? TABS : (['notes', 'prompts'] as const)
  // An unlinked project has no Issues/Repo tab, so a stale ?tab=issues link
  // falls back rather than rendering an empty shell.
  const active: Tab =
    isTab(requested) && available.includes(requested) ? requested : 'notes'

  async function remove() {
    if (!project) return
    if (
      !window.confirm(
        `Delete "${project.name}"? Its notes and prompts are deleted too. This cannot be undone.`,
      )
    ) {
      return
    }
    try {
      await deleteProject(project.id)
      navigate('/projects', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the project.')
    }
  }

  if (loading) {
    return (
      <p className="text-muted p-6 text-center text-sm" role="status">
        Loading…
      </p>
    )
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-safe">
        <p className="text-muted py-8 text-center text-sm">
          That project no longer exists.{' '}
          <Link to="/projects" className="text-accent-soft underline">
            Back to projects
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col px-4 pt-safe">
      <header className="py-3">
        <div className="flex items-center justify-between gap-3">
          <Link to="/projects" className="text-muted text-sm">
            ← Projects
          </Link>
          <button
            type="button"
            onClick={() => void remove()}
            className="text-xs text-red-400/80 underline"
          >
            Delete
          </button>
        </div>

        <h1 className="mt-2 text-lg font-semibold tracking-tight">{project.name}</h1>
        {project.description && (
          <p className="text-muted mt-1 text-sm leading-relaxed">{project.description}</p>
        )}
        {linked && (
          <a
            href={`https://github.com/${project.github_owner}/${project.github_repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-soft mt-2 inline-block font-mono text-[11px] underline"
          >
            {project.github_owner}/{project.github_repo}
          </a>
        )}
      </header>

      {error && (
        <p role="alert" className="mb-2 text-xs text-amber-300">
          {error}
        </p>
      )}

      <nav className="border-edge flex shrink-0 gap-1 border-b" aria-label="Project sections">
        {available.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSearchParams({ tab }, { replace: true })}
            aria-current={active === tab ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              active === tab ? 'border-accent text-accent-soft' : 'text-muted border-transparent'
            }`}
          >
            {LABELS[tab]}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        {active === 'notes' && <NotesTab projectId={project.id} />}
        {active === 'prompts' && <PromptsTab projectId={project.id} />}
        {active === 'issues' && <IssuesTab projectId={project.id} linked={linked} />}
        {active === 'repo' && <RepoInfoTab projectId={project.id} linked={linked} />}
      </div>
    </div>
  )
}
