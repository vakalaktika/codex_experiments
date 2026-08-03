import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteNote, listNotes, promptedNoteIds } from '../../lib/db'
import { generatePrompt } from '../../lib/functions'
import type { Note } from '../../lib/types'

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function NotesTab({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const [notes, setNotes] = useState<Note[]>([])
  const [prompted, setPrompted] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rows, withPrompts] = await Promise.all([
        listNotes(projectId),
        promptedNoteIds(projectId),
      ])
      setNotes(rows)
      setPrompted(withPrompts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load notes.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function generate(noteId: string) {
    setBusy(noteId)
    setError(null)
    try {
      // The function returns the existing draft when there already is one, so
      // this button is safe to press twice and doubles as "open prompt".
      const prompt = await generatePrompt(noteId)
      navigate(`/prompts/${prompt.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate a prompt.')
    } finally {
      setBusy(null)
    }
  }

  async function remove(noteId: string) {
    if (!window.confirm('Delete this note? Any prompt generated from it goes too.')) return
    try {
      await deleteNote(noteId)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the note.')
    }
  }

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

      {notes.length === 0 ? (
        <p className="text-muted/70 py-8 text-center text-sm">
          No notes in this project yet. Captures land here once you file them.
        </p>
      ) : (
        <ul className="space-y-2 pb-6">
          {notes.map((note) => (
            <li key={note.id} className="border-edge bg-surface/60 rounded-xl border p-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.raw_text}</p>

              <div className="mt-2 flex items-center gap-2">
                <span className="text-muted text-[11px]">
                  {note.source === 'voice' ? 'Voice' : 'Text'} · {relativeTime(note.created_at)}
                </span>
                <span className="flex-1" />

                <button
                  type="button"
                  onClick={() => void remove(note.id)}
                  className="text-muted/70 text-[11px] underline"
                >
                  Delete
                </button>

                <button
                  type="button"
                  onClick={() => void generate(note.id)}
                  disabled={busy === note.id}
                  className="bg-accent rounded-lg px-2.5 py-1 text-xs font-medium text-white transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  {busy === note.id
                    ? 'Generating…'
                    : prompted.has(note.id)
                      ? 'Open prompt'
                      : 'Generate prompt'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
