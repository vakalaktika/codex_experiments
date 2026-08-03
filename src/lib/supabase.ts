import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client.
 *
 * Both values are inlined into the public bundle at build time, which is fine
 * for exactly these two: the anon key is guarded by the row level security
 * policies in supabase/migrations/0001_init.sql, not by secrecy. The Anthropic
 * key and GitHub PAT live in edge function secrets and never enter this build.
 *
 * The client is null when the env vars are unset, and that is a supported
 * state rather than a crash: the app ships to GitHub Pages before the backend
 * exists, and a build without the vars must still install, capture, and queue
 * offline. Callers branch on `isSupabaseConfigured` and fall back to the
 * device-local outbox.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const isSupabaseConfigured = url !== '' && anonKey !== ''

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        // The session has to survive a force-quit of the installed app, so it
        // lives in localStorage rather than memory.
        persistSession: true,
        autoRefreshToken: true,
        // Magic links come back on the redirect URL and are exchanged here.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

/**
 * Narrowing helper for the call sites that are only reachable once the backend
 * is configured and the user is signed in. Throwing here is correct: reaching
 * it means a screen rendered outside the auth gate, which is a bug in the
 * caller rather than a runtime condition to recover from.
 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  return supabase
}

/**
 * Where magic links return to — the app root under the Pages subpath. Derived
 * from BASE_URL so it stays correct if the app moves to another repo or domain.
 * This exact URL must also be in the Supabase dashboard's redirect allow list.
 */
export function authRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}
