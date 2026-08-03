import { useCallback, useEffect, useRef, useState } from 'react'
import { insertQueuedNote } from '../lib/db'
import * as outbox from '../lib/outbox'
import type { QueuedNote } from '../lib/types'
import { useAuth } from './useAuth'
import { useOnline } from './useOnline'

/**
 * Drains the IndexedDB outbox into Postgres.
 *
 * Not Background Sync: Safari doesn't implement it and Safari is the primary
 * target. The queue flushes on reconnect and on app focus instead, which
 * covers the real cases — reopening the installed app, or the network coming
 * back while it's on screen.
 *
 * A note leaves the queue when the insert succeeds *or* when it hits the
 * unique index on (user_id, client_id), because both mean the idea is safely
 * in Postgres.
 */

/** After this many consecutive failures an entry is surfaced, not just retried. */
const STUCK_AFTER_ATTEMPTS = 3

export interface OutboxSync {
  queued: QueuedNote[]
  syncing: boolean
  error: string | null
  /** Entries that have failed repeatedly and need the user to look at them. */
  stuck: QueuedNote[]
  refresh(): Promise<void>
  flush(): Promise<void>
}

export function useOutboxSync(): OutboxSync {
  const { session } = useAuth()
  const online = useOnline()
  const [queued, setQueued] = useState<QueuedNote[]>([])
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A flush can be triggered by focus and by `online` at almost the same
  // moment; without this the same rows race each other into the unique index.
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    setQueued(await outbox.list())
  }, [])

  const flush = useCallback(async () => {
    if (inFlight.current) return
    if (!session || !navigator.onLine) {
      await refresh()
      return
    }

    inFlight.current = true
    setSyncing(true)
    setError(null)

    try {
      // Oldest first, so the ideas land in the order they were had.
      const pending = (await outbox.list()).reverse()

      for (const note of pending) {
        try {
          await insertQueuedNote(note)
          await outbox.remove(note.client_id)
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : 'Sync failed for an unknown reason.'
          await outbox.markFailed(note.client_id, message)
          setError(message)
          // One failure is almost always the connection rather than the row,
          // so stop the pass instead of burning the whole queue's retry count.
          break
        }
      }
    } finally {
      inFlight.current = false
      setSyncing(false)
      await refresh()
    }
  }, [session, refresh])

  useEffect(() => {
    void flush()
  }, [flush, online])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flush()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [flush])

  return {
    queued,
    syncing,
    error,
    stuck: queued.filter((note) => note.attempts >= STUCK_AFTER_ATTEMPTS),
    refresh,
    flush,
  }
}
