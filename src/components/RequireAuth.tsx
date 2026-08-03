import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Route guard for everything that needs the backend.
 *
 * Capture is deliberately *not* behind this. The core promise is that an idea
 * can be captured in under ten seconds with no network and no account, so the
 * index route stays open and writes to the device-local outbox. Projects,
 * prompts, and GitHub views have nothing to show without a session, so they
 * are guarded.
 *
 * When Supabase is unconfigured there is nothing to sign in to, so this
 * explains that state rather than bouncing to a login form that cannot work.
 */
export function RequireAuth() {
  const { configured, ready, session } = useAuth()
  const location = useLocation()

  if (!configured) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-safe">
        <div className="border-edge bg-surface/60 mt-6 rounded-2xl border border-dashed p-6 text-center">
          <p className="text-sm font-medium">Not connected yet</p>
          <p className="text-muted mt-2 text-sm leading-relaxed">
            This build has no backend configured, so there are no projects or
            prompts to show. Capture still works — notes are held on this device
            and sync as soon as a backend is connected.
          </p>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="text-muted grid h-full place-items-center text-sm" role="status">
        Loading…
      </div>
    )
  }

  if (!session) {
    // `state` lets Login send the user back where they were headed.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
