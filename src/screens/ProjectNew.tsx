import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProjects } from '../hooks/useProjects'

/**
 * Accepts what someone actually has to hand: a full GitHub URL, an
 * `owner/repo` pair, or nothing. Returns null when the field is empty and
 * throws with a usable message when it is filled in but unparseable — a
 * silently ignored repo link is worse than a rejected one.
 */
function parseRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
  if (trimmed === '') return null

  const withoutHost = trimmed
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')

  const parts = withoutHost.split('/')
  if (parts.length !== 2) {
    throw new Error('Use owner/repo, or paste the repository URL.')
  }

  const [owner, repo] = parts
  // Mirrors the CHECK constraints in 0001_init.sql, so a bad value is caught
  // here with a readable message rather than as a Postgres constraint error.
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) {
    throw new Error(`"${owner}" is not a valid GitHub owner.`)
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) {
    throw new Error(`"${repo}" is not a valid repository name.`)
  }

  return { owner, repo }
}

export function ProjectNew() {
  const navigate = useNavigate()
  const { create } = useProjects()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [repoInput, setRepoInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    setSaving(true)
    setError(null)
    try {
      const repo = parseRepo(repoInput)
      const project = await create({
        name: trimmedName,
        description: description.trim() || null,
        github_owner: repo?.owner ?? null,
        github_repo: repo?.repo ?? null,
      })
      navigate(`/projects/${project.id}`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the project.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-safe">
      <header className="flex items-center justify-between py-3">
        <Link to="/projects" className="text-muted text-sm">
          ← Back
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">New project</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4 pb-8">
        <div>
          <label htmlFor="name" className="text-muted block text-xs font-medium">
            Name
          </label>
          <input
            id="name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Idea Capture"
            className="border-edge bg-surface placeholder:text-muted/70 focus:border-accent mt-1.5 h-12 w-full rounded-xl border px-3 text-base outline-none"
          />
        </div>

        <div>
          <label htmlFor="description" className="text-muted block text-xs font-medium">
            Description <span className="opacity-60">(optional)</span>
          </label>
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this project is, in a sentence. Prompt generation uses this as context."
            className="border-edge bg-surface placeholder:text-muted/70 focus:border-accent mt-1.5 w-full resize-none rounded-xl border p-3 text-sm leading-relaxed outline-none"
          />
        </div>

        <div>
          <label htmlFor="repo" className="text-muted block text-xs font-medium">
            GitHub repository <span className="opacity-60">(optional)</span>
          </label>
          <input
            id="repo"
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            placeholder="owner/repo"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="border-edge bg-surface placeholder:text-muted/70 focus:border-accent mt-1.5 h-12 w-full rounded-xl border px-3 font-mono text-sm outline-none"
          />
          <p className="text-muted/70 mt-1.5 text-xs">
            Links the Issues and Repo tabs. A full GitHub URL works too.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs text-amber-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="bg-accent h-12 w-full rounded-xl text-base font-medium text-white transition-all active:scale-[0.98] disabled:opacity-30"
        >
          {saving ? 'Creating…' : 'Create project'}
        </button>
      </form>
    </div>
  )
}
