import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Caller verification.
 *
 * `verify_jwt` is off in config.toml for both functions so that a bad token
 * produces the same JSON error shape as every other failure, rather than the
 * gateway's bare 401 that the client can't parse. The verification itself is
 * not skipped — it happens here, against GoTrue.
 *
 * The returned client carries the caller's Authorization header, so every
 * query it makes runs under that user's RLS policies. These functions never
 * touch the service-role key: a bug in a filter then leaks nothing, because
 * Postgres is still enforcing ownership.
 */

export interface Caller {
  userId: string
  /** RLS-scoped to the caller. Never a service-role client. */
  db: SupabaseClient
}

export async function authenticate(request: Request): Promise<Caller | null> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set on the function.')
  }

  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Validates the signature and expiry server-side — decoding the JWT locally
  // would trust a token anyone can forge.
  const { data, error } = await db.auth.getUser()
  if (error || !data.user) return null

  return { userId: data.user.id, db }
}
