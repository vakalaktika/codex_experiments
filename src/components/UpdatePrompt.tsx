import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * `registerType: 'prompt'` means a new build never activates mid-capture — the
 * user chooses when to reload. Silent auto-reloads are how half-typed ideas
 * disappear.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="border-edge bg-surface-2 fixed inset-x-3 bottom-24 z-50 flex items-center gap-3 rounded-2xl border p-3 shadow-lg">
      <p className="flex-1 text-sm">A new version is ready.</p>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="text-muted px-2 py-1 text-sm"
      >
        Later
      </button>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="bg-accent rounded-lg px-3 py-1.5 text-sm font-medium text-white"
      >
        Reload
      </button>
    </div>
  )
}
