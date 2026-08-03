import { useGithubReadme } from '../../hooks/useGithub'

interface Props {
  projectId: string
  linked: boolean
}

export function RepoInfoTab({ projectId, linked }: Props) {
  const { data: readme, loading, error, reload } = useGithubReadme(projectId, linked)

  if (loading) {
    return (
      <p className="text-muted py-8 text-center text-sm" role="status">
        Loading README…
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

  if (!readme) {
    return (
      <p className="text-muted/70 py-8 text-center text-sm">This repository has no README.</p>
    )
  }

  return (
    <article className="pb-6">
      {/*
        Rendered as source rather than parsed to HTML. A markdown renderer here
        would mean injecting a third party's document into the page, and the
        README is reference material while writing a prompt — reading it as
        source is enough, and costs no dependency and no XSS surface.
      */}
      <pre className="border-edge bg-surface/40 overflow-x-auto rounded-xl border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {readme}
      </pre>
    </article>
  )
}
