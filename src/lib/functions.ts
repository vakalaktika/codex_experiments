import { FunctionsHttpError } from '@supabase/supabase-js'
import { requireSupabase } from './supabase'
import type { FeaturePrompt, GithubIssue } from './types'

/**
 * Calls into the edge functions.
 *
 * `functions.invoke` attaches the session's JWT, which is what both functions
 * verify before spending the Anthropic quota or the GitHub rate limit.
 */

/**
 * The functions answer errors as `{ error: string }` with a real status code.
 * supabase-js surfaces that as a FunctionsHttpError whose message is only
 * "Edge Function returned a non-2xx status code", so the useful text has to be
 * read out of the response body — otherwise every failure looks identical.
 */
async function describeError(cause: unknown): Promise<Error> {
  if (cause instanceof FunctionsHttpError) {
    try {
      const body = (await cause.context.json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error !== '') return new Error(body.error)
    } catch {
      /* body wasn't JSON — fall through to the generic message below */
    }
  }
  return cause instanceof Error ? cause : new Error('The request failed.')
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke<T>(name, { body })
  if (error) throw await describeError(error)
  if (!data) throw new Error('The server returned an empty response.')
  return data
}

export async function generatePrompt(noteId: string): Promise<FeaturePrompt> {
  const { prompt } = await invoke<{ prompt: FeaturePrompt; reused: boolean }>(
    'generate-prompt',
    { note_id: noteId },
  )
  return prompt
}

export async function fetchIssues(projectId: string): Promise<GithubIssue[]> {
  const { issues } = await invoke<{ issues: GithubIssue[] }>('github-proxy', {
    project_id: projectId,
    resource: 'issues',
  })
  return issues
}

export async function fetchReadme(projectId: string): Promise<string> {
  const { readme } = await invoke<{ readme: string }>('github-proxy', {
    project_id: projectId,
    resource: 'readme',
  })
  return readme
}
