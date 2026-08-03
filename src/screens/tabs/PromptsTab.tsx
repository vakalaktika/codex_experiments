import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CopyButton } from '../../components/CopyButton'
import { StatusBadge } from '../../components/StatusBadge'
import { listPrompts } from '../../lib/db'
import type { FeaturePrompt } from '../../lib/types'

function bodyOf(prompt: FeaturePrompt): string {
  return prompt.edited_text ?? prompt.generated_text
}

/** The template's first line is "Feature: …" — a usable title without a column for one. */
function titleOf(prompt: FeaturePrompt): string {
  const match = bodyOf(prompt).match(/^Feature:\s*(.+)$/m)
  return match?.[1]?.trim() || 'Untitled prompt'
}

export function PromptsTab({ projectId }: { projectId: string }) {
  const [prompts, setPrompts] = useState<FeaturePrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPrompts(await listPrompts(projectId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load prompts.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <p className="text-muted py-8 text-center text-sm" role="status">
        Loading…
      </p>
    )
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-xs text-amber-300">
          {error}
        </p>
      )}

      {prompts.length === 0 ? (
        <p className="text-muted/70 py-8 text-center text-sm">
          No prompts yet. Generate one from a note in the Notes tab.
        </p>
      ) : (
        <ul className="space-y-2 pb-6">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="border-edge bg-surface/60 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/prompts/${prompt.id}`} className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{titleOf(prompt)}</h3>
                  <p className="text-muted mt-1 line-clamp-2 text-xs leading-relaxed">
                    {bodyOf(prompt)}
                  </p>
                </Link>
                <StatusBadge status={prompt.status} />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Link
                  to={`/prompts/${prompt.id}`}
                  className="border-edge rounded-lg border px-2.5 py-1 text-xs"
                >
                  Edit
                </Link>
                <span className="flex-1" />
                <CopyButton text={bodyOf(prompt)} className="px-3 py-1 text-xs" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
