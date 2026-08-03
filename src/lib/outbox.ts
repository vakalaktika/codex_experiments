import { openDB, type IDBPDatabase } from 'idb'
import type { NoteSource, QueuedNote } from './types'

/**
 * Offline capture queue.
 *
 * Captures land here first, always — online or not. That keeps the tap-to-saved
 * path off the network entirely, which is what makes the sub-10-second target
 * hold on a bad connection. A sync pass drains the queue into Postgres later.
 *
 * Deliberately not Background Sync: Safari doesn't implement it, and Safari is
 * the primary target. The queue flushes on `online` and on app focus instead.
 */

const DB_NAME = 'idea-capture'
const DB_VERSION = 1
const STORE = 'outbox'

let dbPromise: Promise<IDBPDatabase> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          const store = database.createObjectStore(STORE, { keyPath: 'client_id' })
          store.createIndex('created_at', 'created_at')
        }
      },
    })
  }
  return dbPromise
}

function newId(): string {
  // randomUUID needs a secure context; Pages is HTTPS, but dev over a LAN IP
  // may not be, and a capture must never fail over an id.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function enqueue(input: {
  raw_text: string
  source: NoteSource
  project_id: string | null
}): Promise<QueuedNote> {
  const note: QueuedNote = {
    client_id: newId(),
    raw_text: input.raw_text.trim(),
    source: input.source,
    project_id: input.project_id,
    created_at: new Date().toISOString(),
    attempts: 0,
  }
  await (await db()).put(STORE, note)
  return note
}

/** Newest first, matching how the capture history reads on screen. */
export async function list(): Promise<QueuedNote[]> {
  const all = (await (await db()).getAll(STORE)) as QueuedNote[]
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function remove(clientId: string): Promise<void> {
  await (await db()).delete(STORE, clientId)
}

/**
 * Record a failed flush so the entry can be backed off and, once it has failed
 * enough times, surfaced rather than silently retried forever.
 *
 * A missing entry is not an error: a concurrent flush may already have synced
 * and removed it.
 */
export async function markFailed(clientId: string, message: string): Promise<void> {
  const database = await db()
  const existing = (await database.get(STORE, clientId)) as QueuedNote | undefined
  if (!existing) return

  await database.put(STORE, {
    ...existing,
    attempts: existing.attempts + 1,
    last_error: message,
  })
}

export async function count(): Promise<number> {
  return (await db()).count(STORE)
}
