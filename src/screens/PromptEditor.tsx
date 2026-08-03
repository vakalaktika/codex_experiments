import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CopyButton } from '../components/CopyButton'
import { StatusBadge } from '../components/StatusBadge'
import { deletePrompt, getPrompt, updatePrompt } from '../lib/db'
import type { FeaturePrompt, PromptStatus } from '../lib/types'

const STATUSES: PromptStatus[] = ['draft', 'approved', 'sent']

export function PromptEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [prompt, setPrompt] = useState<FeaturePrompt | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const found = await getPrompt(id)
      setPrompt(found)
      // The generated text is the starting point; edits are stored separately
      // so the original draft is never lost.
      setText(found ? (found.edited_text ?? found.generated_text) : '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the prompt.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = prompt !== null && text !== (prompt.edited_text ?? prompt.generated_text)

  async function save(status?: PromptStatus) {
    if (!prompt) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updatePrompt(prompt.id, {
        // Storing null when the text matches the original keeps "was this
        // edited?" answerable without diffing two long strings.
        edited_text: text === prompt.generated_text ? null : text,
        ...(status ? { status } : {}),
      })
      setPrompt(updated)
      setFlash('Saved')
      window.setTimeout(() => setFlash(null), 1800)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the prompt.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!prompt) return
    if (!window.confirm('Delete this prompt? The original note is kept.')) return
    try {
      await deletePrompt(prompt.id)
      navigate(`/projects/${prompt.project_id}?tab=prompts`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the prompt.')
    }
  }

  if (loading) {
    return (
      <p className="text-muted p-6 text-center text-sm" role="status">
        Loading…
      </p>
    )
  }

  if (!prompt) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-safe">
        <p className="text-muted py-8 text-center text-sm">
          That prompt no longer exists.{' '}
          <Link to="/projects" className="text-accent-soft underline">
            Back to projects
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col px-4 pt-safe">
      <header className="flex items-center justify-between gap-3 py-3">
        <Link to={`/projects/${prompt.project_id}?tab=prompts`} className="text-muted text-sm">
          ← Back
        </Link>
        <StatusBadge status={prompt.status} />
      </header>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Feature prompt"
        spellCheck
        className="border-edge bg-surface focus:border-accent min-h-64 w-full flex-1 resize-none rounded-2xl border p-4 font-mono text-sm leading-relaxed outline-none"
      />

      {error && (
        <p role="alert" className="mt-2 text-xs text-amber-300">
          {error}
        </p>
      )}

      <div className="text-muted mt-2 flex items-center gap-2 text-[11px]">
        {prompt.model && <span>Drafted by {prompt.model}</span>}
        {prompt.edited_text !== null && (
          <>
            <span aria-hidden>·</span>
            <span>Edited</span>
          </>
        )}
        <span className="flex-1" />
        <span aria-live="polite">{flash ?? (dirty ? 'Unsaved changes' : '')}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <CopyButton text={text} className="flex-1 text-center" />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="border-edge rounded-xl border px-4 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-30"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 pb-6">
        <span className="text-muted text-xs">Status</span>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => void save(status)}
            disabled={saving}
            aria-pressed={prompt.status === status}
            className={`rounded-lg px-2.5 py-1 text-xs capitalize transition-colors disabled:opacity-40 ${
              prompt.status === status ? 'bg-accent text-white' : 'border-edge text-muted border'
            }`}
          >
            {status}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void remove()}
          className="text-xs text-red-400/80 underline"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
