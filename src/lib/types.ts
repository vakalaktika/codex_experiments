/**
 * App-level types. Once the Supabase schema is applied these get replaced by
 * (or checked against) generated database types — the field names below
 * deliberately match the columns in supabase/migrations/0001_init.sql.
 */

export type NoteSource = 'voice' | 'text'
export type PromptStatus = 'draft' | 'approved' | 'sent'

export interface Project {
  id: string
  name: string
  description: string | null
  github_owner: string | null
  github_repo: string | null
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  project_id: string | null
  raw_text: string
  source: NoteSource
  created_at: string
}

export interface FeaturePrompt {
  id: string
  note_id: string
  project_id: string
  generated_text: string
  edited_text: string | null
  status: PromptStatus
  model: string | null
  created_at: string
  updated_at: string
}

/**
 * A capture that has not reached Postgres yet. `client_id` is the idempotency
 * key the notes table uniquely indexes, so a retried flush after a flaky
 * reconnect updates rather than duplicates.
 */
export interface QueuedNote {
  client_id: string
  project_id: string | null
  raw_text: string
  source: NoteSource
  created_at: string
  /** Bumped each failed flush, for backoff and for surfacing stuck items. */
  attempts: number
  last_error?: string
}
