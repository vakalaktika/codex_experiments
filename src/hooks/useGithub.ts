import { useCallback, useEffect, useState } from 'react'
import { fetchIssues, fetchReadme } from '../lib/functions'
import type { GithubIssue } from '../lib/types'

/**
 * Issues and README for a linked project, via the github-proxy edge function.
 *
 * `linked` is passed in rather than inferred so an unlinked project costs no
 * request at all — the proxy would only answer 400, and burning a round trip
 * to learn that would happen on every tab switch.
 */

interface GithubState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload(): Promise<void>
}

function useGithubResource<T>(
  projectId: string | undefined,
  linked: boolean,
  fetcher: (projectId: string) => Promise<T>,
): GithubState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!projectId || !linked) {
      setData(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      setData(await fetcher(projectId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach GitHub.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, linked, fetcher])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, loading, error, reload }
}

export function useGithubIssues(projectId: string | undefined, linked: boolean) {
  return useGithubResource<GithubIssue[]>(projectId, linked, fetchIssues)
}

export function useGithubReadme(projectId: string | undefined, linked: boolean) {
  return useGithubResource<string>(projectId, linked, fetchReadme)
}
