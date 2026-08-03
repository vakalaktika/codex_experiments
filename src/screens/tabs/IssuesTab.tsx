import { useGithubIssues } from '../../hooks/useGithub'

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

interface Props {
  projectId: string
  linked: boolean
}

export function IssuesTab({ projectId, linked }: Props) {
  const { data: issues, loading, error, reload } = useGithubIssues(projectId, linked)

  if (loading) {
    return (
      <p className="text-muted py-8 text-center text-sm" role="status">
        Loading issues…
      </p>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p role="alert" className="text-sm text-amber-300">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="border-edge mt-3 rounded-lg border px-3 py-1.5 text-xs"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!issues || issues.length === 0) {
    return (
      <p className="text-muted/70 py-8 text-center text-sm">
        No open issues on this repository.
      </p>
    )
  }

  return (
    <ul className="space-y-2 pb-6">
      {issues.map((issue) => (
        <li key={issue.number} className="border-edge bg-surface/60 rounded-xl border p-3">
          <a href={issue.html_url} target="_blank" rel="noopener noreferrer" className="block">
            <div className="flex items-baseline gap-2">
              <span className="text-muted shrink-0 font-mono text-[11px]">#{issue.number}</span>
              <h3 className="text-sm leading-snug font-medium">{issue.title}</h3>
            </div>
          </a>

          {issue.labels.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {issue.labels.map((label) => (
                <li
                  key={label.name}
                  // GitHub gives a bare hex string; the border keeps low-contrast
                  // label colours legible against the dark surface.
                  style={{ borderColor: `#${label.color}`, color: `#${label.color}` }}
                  className="rounded-full border px-1.5 py-0.5 text-[10px]"
                >
                  {label.name}
                </li>
              ))}
            </ul>
          )}

          <p className="text-muted mt-2 text-[11px]">
            {issue.author ? `${issue.author} · ` : ''}
            {issue.comments} {issue.comments === 1 ? 'comment' : 'comments'} · updated{' '}
            {relativeTime(issue.updated_at)}
          </p>
        </li>
      ))}
    </ul>
  )
}
