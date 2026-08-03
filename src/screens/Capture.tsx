import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MicButton } from '../components/MicButton'
import {
  ProjectPicker,
  readLastProjectId,
  writeLastProjectId,
} from '../components/ProjectPicker'
import { useAuth } from '../hooks/useAuth'
import { useDictation } from '../hooks/useDictation'
import { useOutboxSync } from '../hooks/useOutboxSync'
import { useProjects } from '../hooks/useProjects'
import { listRecentNotes } from '../lib/db'
import * as outbox from '../lib/outbox'
import type { Note } from '../lib/types'

const RECENT_LIMIT = 15

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function Capture() {
  const { configured, session } = useAuth()
  const { projects } = useProjects()
  const sync = useOutboxSync()
  const dictation = useDictation()

  const [text, setText] = useState('')
  const [projectId, setProjectId] = useState<string | null>(readLastProjectId)
  const [flash, setFlash] = useState<string | null>(null)
  const [recent, setRecent] = useState<Note[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Dictated text streams into the same field it would have been typed into,
  // so editing before saving works identically either way.
  const dictatedRef = useRef('')
  useEffect(() => {
    if (!dictation.listening && !dictation.transcript) return
    const live = dictation.transcript + dictation.interim
    if (!live) return
    setText((current) => {
      const withoutPrevious = current.slice(
        0,
        current.length - dictatedRef.current.length,
      )
      dictatedRef.current = live
      return withoutPrevious + live
    })
  }, [dictation.transcript, dictation.interim, dictation.listening])

  // A project deleted on another device must not stay selected, or captures
  // would fail their foreign key on the next flush.
  useEffect(() => {
    if (projectId && projects.length > 0 && !projects.some((p) => p.id === projectId)) {
      setProjectId(null)
      writeLastProjectId(null)
    }
  }, [projects, projectId])

  const loadRecent = useCallback(async () => {
    if (!configured || !session) {
      setRecent([])
      return
    }
    try {
      setRecent(await listRecentNotes(RECENT_LIMIT))
    } catch {
      // The history is a convenience; a failure here must not disturb capture.
      setRecent([])
    }
  }, [configured, session])

  // Re-read once the queue drains, so a note moves from "on this device" to
  // synced without a manual refresh.
  useEffect(() => {
    void loadRecent()
  }, [loadRecent, sync.queued.length])

  async function save() {
    const raw = text.trim()
    if (!raw) return

    if (dictation.listening) dictation.stop()

    await outbox.enqueue({
      raw_text: raw,
      source: dictatedRef.current.trim() ? 'voice' : 'text',
      project_id: projectId,
    })

    setText('')
    dictatedRef.current = ''
    setFlash(session ? 'Saved — syncing' : 'Saved on this device')
    window.setTimeout(() => setFlash(null), 2200)

    // Deliberately not awaited: the capture is already durable in IndexedDB,
    // and the ten-second target is measured tap → saved, not tap → synced.
    void sync.flush()
  }

  function handleProjectChange(next: string | null) {
    setProjectId(next)
    writeLastProjectId(next)
  }

  function toggleMic() {
    if (dictation.listening) {
      dictation.stop()
      textareaRef.current?.focus()
    } else {
      dictatedRef.current = ''
      dictation.start()
    }
  }

  const projectName = (id: string | null) =>
    id === null ? 'Unfiled' : (projects.find((p) => p.id === id)?.name ?? 'Unfiled')

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col px-4 pt-safe">
      <header className="flex items-baseline justify-between py-3">
        <h1 className="text-lg font-semibold tracking-tight">Capture</h1>
        <span className="text-muted text-xs">
          {sync.syncing
            ? 'Syncing…'
            : sync.queued.length > 0
              ? `${sync.queued.length} waiting to sync`
              : 'All synced'}
        </span>
      </header>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's the idea?"
        autoCapitalize="sentences"
        aria-label="Idea"
        className="border-edge bg-surface placeholder:text-muted/70 focus:border-accent min-h-40 w-full resize-none rounded-2xl border p-4 text-base leading-relaxed outline-none"
      />

      {session && projects.length > 0 && (
        <div className="mt-3">
          <ProjectPicker
            projects={projects}
            value={projectId}
            onChange={handleProjectChange}
          />
        </div>
      )}

      {dictation.error && (
        <p className="mt-2 text-xs text-amber-300">{dictation.error}</p>
      )}
      {!dictation.supported && (
        <p className="text-muted mt-2 text-xs">
          Dictation isn't available in this browser — typing works the same.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <MicButton
          listening={dictation.listening}
          disabled={!dictation.supported}
          onClick={toggleMic}
        />
        <button
          type="button"
          onClick={save}
          disabled={!text.trim()}
          className="bg-accent h-14 flex-1 rounded-2xl text-base font-medium text-white transition-all active:scale-[0.98] disabled:opacity-30"
        >
          Save
        </button>
      </div>

      <p className="text-muted mt-3 h-4 text-center text-xs" role="status">
        {flash ?? (dictation.listening ? 'Listening…' : '')}
      </p>

      {sync.stuck.length > 0 && (
        <p className="mt-2 text-center text-xs text-amber-300">
          {sync.stuck.length} capture{sync.stuck.length === 1 ? '' : 's'} couldn't sync.{' '}
          <button type="button" onClick={() => void sync.flush()} className="underline">
            Retry
          </button>
        </p>
      )}

      {configured && !session && (
        <p className="text-muted mt-2 text-center text-xs">
          <Link to="/login" className="text-accent-soft underline">
            Sign in
          </Link>{' '}
          to sync these across devices.
        </p>
      )}

      <section className="min-h-0 flex-1 overflow-y-auto pt-4">
        {sync.queued.length === 0 && recent.length === 0 ? (
          <p className="text-muted/70 pt-8 text-center text-sm">
            Captures land here first, online or not.
          </p>
        ) : (
          <ul className="space-y-2 pb-6">
            {sync.queued.map((note) => (
              <li
                key={note.client_id}
                className="border-edge bg-surface/60 rounded-xl border p-3"
              >
                <p className="line-clamp-3 text-sm leading-relaxed">{note.raw_text}</p>
                <div className="text-muted mt-2 flex items-center gap-2 text-[11px]">
                  <span>{note.source === 'voice' ? 'Voice' : 'Text'}</span>
                  <span aria-hidden>·</span>
                  <span>{relativeTime(note.created_at)}</span>
                  <span aria-hidden>·</span>
                  <span>On this device</span>
                </div>
              </li>
            ))}

            {recent.map((note) => (
              <li
                key={note.id}
                className="border-edge/60 bg-surface/30 rounded-xl border p-3"
              >
                <p className="line-clamp-3 text-sm leading-relaxed">{note.raw_text}</p>
                <div className="text-muted mt-2 flex items-center gap-2 text-[11px]">
                  <span>{note.source === 'voice' ? 'Voice' : 'Text'}</span>
                  <span aria-hidden>·</span>
                  <span>{relativeTime(note.created_at)}</span>
                  <span aria-hidden>·</span>
                  <span>{projectName(note.project_id)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
