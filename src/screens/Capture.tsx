import { useEffect, useRef, useState } from 'react'
import { MicButton } from '../components/MicButton'
import { useDictation } from '../hooks/useDictation'
import * as outbox from '../lib/outbox'
import type { QueuedNote } from '../lib/types'

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function Capture() {
  const [text, setText] = useState('')
  const [queued, setQueued] = useState<QueuedNote[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation()

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

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    setQueued(await outbox.list())
  }

  async function save() {
    const raw = text.trim()
    if (!raw) return

    if (dictation.listening) dictation.stop()

    await outbox.enqueue({
      raw_text: raw,
      source: dictatedRef.current.trim() ? 'voice' : 'text',
      project_id: null,
    })

    setText('')
    dictatedRef.current = ''
    setFlash('Saved on this device')
    void refresh()
    window.setTimeout(() => setFlash(null), 2200)
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

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col px-4 pt-safe">
      <header className="flex items-baseline justify-between py-3">
        <h1 className="text-lg font-semibold tracking-tight">Capture</h1>
        <span className="text-muted text-xs">
          {queued.length > 0 ? `${queued.length} waiting to sync` : 'Nothing queued'}
        </span>
      </header>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's the idea?"
        autoCapitalize="sentences"
        className="border-edge bg-surface placeholder:text-muted/70 focus:border-accent min-h-40 w-full resize-none rounded-2xl border p-4 text-base leading-relaxed outline-none"
      />

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

      <p className="text-muted mt-3 h-4 text-center text-xs">
        {flash ?? (dictation.listening ? 'Listening…' : '')}
      </p>

      <section className="min-h-0 flex-1 overflow-y-auto pt-4">
        {queued.length === 0 ? (
          <p className="text-muted/70 pt-8 text-center text-sm">
            Captures land here first, online or not.
          </p>
        ) : (
          <ul className="space-y-2 pb-6">
            {queued.map((note) => (
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
          </ul>
        )}
      </section>
    </div>
  )
}
