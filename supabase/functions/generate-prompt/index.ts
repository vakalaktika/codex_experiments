import Anthropic from 'npm:@anthropic-ai/sdk@0.71.0'
import { authenticate } from '../_shared/auth.ts'
import { fail, json, preflight } from '../_shared/cors.ts'

/**
 * note_id -> Claude -> a structured feature prompt, saved as a draft.
 *
 * This is an edge function rather than a client-side call for one reason: the
 * Anthropic key. A PWA is a static bundle, so there is no such thing as a
 * private key in it. See docs/ARCHITECTURE.md §2.
 */

/**
 * Default differs from ARCHITECTURE.md §5, which named claude-sonnet-5.
 * Generation already runs behind the save rather than blocking it, so the
 * latency argument for the smaller model is weak, and the draft quality is
 * what the user actually edits. Override per deployment with ANTHROPIC_MODEL.
 */
const DEFAULT_MODEL = 'claude-opus-5'

/** Thinking counts against this, so it needs headroom beyond the template. */
const MAX_TOKENS = 8000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SYSTEM_PROMPT = `You turn a raw, half-formed product idea into a structured feature prompt an engineer can act on.

Output EXACTLY these headings, in this order, with no preamble, no closing
remarks, and no markdown fences:

Context: [the project this belongs to, in one or two sentences]
Feature: [a short derived title]
Problem: [what the note implies is being solved, and for whom]
Proposed approach: [derived from the note; concrete, not aspirational]
Acceptance criteria: [a "- " bulleted list of observable, checkable outcomes]
Open questions: [a "- " bulleted list of genuine ambiguities the author must resolve]

Rules:
- Stay faithful to the note. Infer what is strongly implied; do not invent
  requirements, scope, or technical decisions the note does not support.
- If the note is too thin to fill a section honestly, say what is missing in
  that section rather than padding it.
- Write plainly. No filler, no restating the headings back in the prose.`

interface NoteRow {
  id: string
  raw_text: string
  project_id: string
  projects: { name: string; description: string | null } | null
}

function userPrompt(note: NoteRow): string {
  const project = note.projects
  const description = project?.description?.trim()

  return [
    `Project: ${project?.name ?? 'Unknown project'}`,
    description ? `Project description: ${description}` : null,
    '',
    'Raw captured idea:',
    note.raw_text,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options

  if (request.method !== 'POST') return fail(request, 'Use POST.', 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    // A missing secret is a deployment fault, not a caller fault, and the
    // message must not hint at what the secret is.
    console.error('ANTHROPIC_API_KEY is not set on this function.')
    return fail(request, 'Prompt generation is not configured.', 503)
  }

  const caller = await authenticate(request)
  if (!caller) return fail(request, 'Sign in to generate a prompt.', 401)

  let noteId: unknown
  try {
    const body = await request.json()
    noteId = (body as { note_id?: unknown })?.note_id
  } catch {
    return fail(request, 'Expected a JSON body.', 400)
  }

  if (typeof noteId !== 'string' || !UUID.test(noteId)) {
    return fail(request, 'note_id must be a uuid.', 400)
  }

  // RLS scopes this to the caller's own notes, so a note id belonging to
  // someone else reads as "not found" rather than leaking its existence.
  const { data: note, error: noteError } = await caller.db
    .from('notes')
    .select('id, raw_text, project_id, projects (name, description)')
    .eq('id', noteId)
    .maybeSingle<NoteRow>()

  if (noteError) {
    console.error('note lookup failed', noteError.message)
    return fail(request, 'Could not load that note.', 500)
  }
  if (!note) return fail(request, 'Note not found.', 404)
  if (!note.project_id) {
    return fail(request, 'File this note into a project before generating a prompt.', 400)
  }

  // Generation is not free and the client retries on a flaky connection, so
  // an existing draft is returned rather than a second one being billed for.
  const { data: existing, error: existingError } = await caller.db
    .from('feature_prompts')
    .select(
      'id, note_id, project_id, generated_text, edited_text, status, model, created_at, updated_at',
    )
    .eq('note_id', note.id)
    .maybeSingle()

  if (existingError) {
    console.error('prompt lookup failed', existingError.message)
    return fail(request, 'Could not check for an existing prompt.', 500)
  }
  if (existing) return json(request, { prompt: existing, reused: true })

  const model = Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL

  let generatedText: string
  try {
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      // Low effort: this is short-form drafting against a fixed template, and
      // the result is editable by design. Thinking stays on — disabling it is
      // the path that leaks internal tags into the visible text.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: userPrompt(note) }],
    })

    if (message.stop_reason === 'refusal') {
      return fail(request, 'That note could not be turned into a prompt.', 422)
    }

    generatedText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()
  } catch (cause) {
    console.error('anthropic call failed', cause)
    return fail(request, 'The model was unreachable. Try again in a moment.', 502)
  }

  if (!generatedText) {
    return fail(request, 'The model returned an empty prompt. Try again.', 502)
  }

  const { data: saved, error: saveError } = await caller.db
    .from('feature_prompts')
    .insert({
      note_id: note.id,
      project_id: note.project_id,
      generated_text: generatedText,
      model,
    })
    .select(
      'id, note_id, project_id, generated_text, edited_text, status, model, created_at, updated_at',
    )
    .single()

  if (saveError) {
    console.error('prompt insert failed', saveError.message)
    return fail(request, 'The prompt was generated but could not be saved.', 500)
  }

  return json(request, { prompt: saved, reused: false })
})
