import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { authRedirectUrl, isSupabaseConfigured, supabase } from '../lib/supabase'

/**
 * Auth state, shared through context so the session is fetched and subscribed
 * to once rather than per screen.
 *
 * `configured: false` is a first-class state, not an error. The app is
 * deployed before the backend exists and must still capture offline, so every
 * consumer has to handle "there is no backend to sign in to".
 */
interface AuthValue {
  configured: boolean
  /** False until the initial session lookup settles — avoids a login flash. */
  ready: boolean
  session: Session | null
  userId: string | null
  signIn(email: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return

    let active = true

    // getSession resolves from localStorage first, then refreshes in the
    // background, so an installed app opens straight into Capture offline.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      configured: isSupabaseConfigured,
      ready,
      session,
      userId: session?.user.id ?? null,
      async signIn(email) {
        if (!supabase) throw new Error('Supabase is not configured.')
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: authRedirectUrl() },
        })
        if (error) throw error
      },
      async signOut() {
        if (!supabase) return
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [ready, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
