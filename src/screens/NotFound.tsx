import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-safe">
      <div className="pt-16 text-center">
        <h1 className="text-lg font-semibold">Nothing here</h1>
        <p className="text-muted mt-2 text-sm">That page doesn't exist.</p>
        <Link
          to="/"
          className="bg-surface-2 text-accent-soft mt-6 inline-block rounded-xl px-4 py-2 text-sm"
        >
          Go to Capture
        </Link>
      </div>
    </div>
  )
}
