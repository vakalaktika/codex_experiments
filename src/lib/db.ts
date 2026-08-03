import { requireSupabase } from './supabase'
import type { FeaturePrompt, Note, Project, PromptStatus, QueuedNote } from './types'

/**
 * Typed wrappers over supabase-js.
 *
 * Every call runs under the caller's RLS context, so none of these filter by
 * user_id — the policies in 0001_init.sql do it, and `user_id` defaults to
 * auth.uid() on insert. Adding a client-side user filter here would look like
 * defence in depth but would really just be a second place to get it wrong.
 */

const PROJECT_COLUMNS =
  'id, name, description, github_owner, github_repo, created_at, updated_at'
const NOTE_COLUMNS = 'id, project_id, raw_text, source, created_at'
const PROMPT_COLUMNS =
  'id, note_id, project_id, generated_text, edited_text, status, model, created_at, updated_at'

/** Postgres unique_violation. On notes it means the outbox already synced this. */
const UNIQUE_VIOLATION = '23505'

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`)
}

// ------------------------------------------------------------------ projects

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await requireSupabase()
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('updated_at', { ascending: false })

  if (error) fail('Could not load projects', error)
  return (data ?? []) as Project[]
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await requireSupabase()
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) fail('Could not load the project', error)
  return (data as Project | null) ?? null
}

export interface ProjectInput {
  name: string
  description: string | null
  github_owner: string | null
  github_repo: string | null
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const { data, error } = await requireSupabase()
    .from('projects')
    .insert(input)
    .select(PROJECT_COLUMNS)
    .single()

  if (error) fail('Could not create the project', error)
  return data as Project
}

export async function updateProject(
  id: string,
  patch: Partial<ProjectInput>,
): Promise<Project> {
  const { data, error } = await requireSupabase()
    .from('projects')
    .update(patch)
    .eq('id', id)
    .select(PROJECT_COLUMNS)
    .single()

  if (error) fail('Could not update the project', error)
  return data as Project
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await requireSupabase().from('projects').delete().eq('id', id)
  if (error) fail('Could not delete the project', error)
}

// --------------------------------------------------------------------- notes

/** Pass `null` for the unfiled inbox — notes captured before a project existed. */
export async function listNotes(projectId: string | null): Promise<Note[]> {
  const query = requireSupabase()
    .from('notes')
    .select(NOTE_COLUMNS)
    .order('created_at', { ascending: false })

  const { data, error } = await (projectId === null
    ? query.is('project_id', null)
    : query.eq('project_id', projectId))

  if (error) fail('Could not load notes', error)
  return (data ?? []) as Note[]
}

/**
 * Most recent notes across every project, for the Capture screen's history.
 * Without this the list would empty out the moment a capture syncs, which
 * reads as "my note disappeared".
 */
export async function listRecentNotes(limit: number): Promise<Note[]> {
  const { data, error } = await requireSupabase()
    .from('notes')
    .select(NOTE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) fail('Could not load recent notes', error)
  return (data ?? []) as Note[]
}

/**
 * Flush one outbox entry. Resolves to false when the row was already there —
 * the unique index on (user_id, client_id) is what makes a retried flush after
 * a flaky reconnect idempotent rather than duplicating the idea.
 */
export async function insertQueuedNote(note: QueuedNote): Promise<boolean> {
  const { error } = await requireSupabase().from('notes').insert({
    client_id: note.client_id,
    project_id: note.project_id,
    raw_text: note.raw_text,
    source: note.source,
    created_at: note.created_at,
  })

  if (!error) return true
  if (error.code === UNIQUE_VIOLATION) return false
  fail('Could not sync a note', error)
}

export async function assignNote(id: string, projectId: string | null): Promise<Note> {
  const { data, error } = await requireSupabase()
    .from('notes')
    .update({ project_id: projectId })
    .eq('id', id)
    .select(NOTE_COLUMNS)
    .single()

  if (error) fail('Could not move the note', error)
  return data as Note
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await requireSupabase().from('notes').delete().eq('id', id)
  if (error) fail('Could not delete the note', error)
}

// ----------------------------------------------------------- feature prompts

export async function listPrompts(projectId: string): Promise<FeaturePrompt[]> {
  const { data, error } = await requireSupabase()
    .from('feature_prompts')
    .select(PROMPT_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) fail('Could not load prompts', error)
  return (data ?? []) as FeaturePrompt[]
}

export async function getPrompt(id: string): Promise<FeaturePrompt | null> {
  const { data, error } = await requireSupabase()
    .from('feature_prompts')
    .select(PROMPT_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) fail('Could not load the prompt', error)
  return (data as FeaturePrompt | null) ?? null
}

/** Note ids that already have a prompt, so the list can hide "Generate". */
export async function promptedNoteIds(projectId: string): Promise<Set<string>> {
  const { data, error } = await requireSupabase()
    .from('feature_prompts')
    .select('note_id')
    .eq('project_id', projectId)

  if (error) fail('Could not load prompts', error)
  return new Set((data ?? []).map((row) => (row as { note_id: string }).note_id))
}

export async function updatePrompt(
  id: string,
  patch: { edited_text?: string | null; status?: PromptStatus },
): Promise<FeaturePrompt> {
  const { data, error } = await requireSupabase()
    .from('feature_prompts')
    .update(patch)
    .eq('id', id)
    .select(PROMPT_COLUMNS)
    .single()

  if (error) fail('Could not save the prompt', error)
  return data as FeaturePrompt
}

export async function deletePrompt(id: string): Promise<void> {
  const { error } = await requireSupabase().from('feature_prompts').delete().eq('id', id)
  if (error) fail('Could not delete the prompt', error)
}
