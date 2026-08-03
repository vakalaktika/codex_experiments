import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = email.trim()
    if (!address) return

    setStatus('sending')
    setError(null)
    try {
      await signIn(address)
      setStatus('sent')
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'Could not send the link.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="mx-auto flex h-full max-w-sm flex-col justify-center px-6 pt-safe">
        <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-muted mt-3 text-sm leading-relaxed">
          A sign-in link is on its way to <span className="text-white">{email.trim()}</span>.
          Open it on this device so the session lands in this app.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="text-accent-soft mt-6 self-start text-sm"
        >
          Use a different address
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-sm flex-col justify-center px-6 pt-safe">
      <h1 className="text-xl font-semibold tracking-tight">Idea Capture</h1>
      <p className="text-muted mt-2 text-sm leading-relaxed">
        Sign in to sync your captures. There is no password — we email you a link.
      </p>

      <form onSubmit={handleSubmit} className="mt-8">
        <label htmlFor="email" className="text-muted block text-xs font-medium">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="border-edge bg-surface placeholder:text-muted/70 focus:border-accent mt-2 h-14 w-full rounded-2xl border px-4 text-base outline-none"
        />

        {error && (
          <p role="alert" className="mt-3 text-xs text-amber-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'sending' || !email.trim()}
          className="bg-accent mt-4 h-14 w-full rounded-2xl text-base font-medium text-white transition-all active:scale-[0.98] disabled:opacity-30"
        >
          {status === 'sending' ? 'Sending…' : 'Email me a link'}
        </button>
      </form>

      <p className="text-muted/70 mt-6 text-xs leading-relaxed">
        Captures you make before signing in are held on this device and sync
        once you are in.
      </p>
    </div>
  )
}
