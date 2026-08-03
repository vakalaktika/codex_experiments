import { useCallback, useEffect, useState } from 'react'
import { createProject, listProjects, type ProjectInput } from '../lib/db'
import type { Project } from '../lib/types'
import { useAuth } from './useAuth'

export interface ProjectsState {
  projects: Project[]
  loading: boolean
  error: string | null
  reload(): Promise<void>
  create(input: ProjectInput): Promise<Project>
}

/**
 * Projects for the signed-in user.
 *
 * Resolves to an empty list rather than throwing when there is no session or
 * no backend — the Capture screen mounts this for its project picker and must
 * keep working in exactly those states.
 */
export function useProjects(): ProjectsState {
  const { session, configured } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!configured || !session) {
      setProjects([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      setProjects(await listProjects())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load projects.')
    } finally {
      setLoading(false)
    }
  }, [configured, session])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = useCallback(async (input: ProjectInput) => {
    const project = await createProject(input)
    setProjects((current) => [project, ...current])
    return project
  }, [])

  return { projects, loading, error, reload, create }
}
