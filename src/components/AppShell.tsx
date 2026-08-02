import { NavLink, Outlet } from 'react-router-dom'
import { useOnline } from '../hooks/useOnline'

function TabIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const TABS = [
  { to: '/', label: 'Capture', icon: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2' },
  { to: '/projects', label: 'Projects', icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
]

export function AppShell() {
  const online = useOnline()

  return (
    <div className="flex h-full flex-col">
      {!online && (
        <div className="bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-200 pt-safe">
          Offline — captures are saved on this device and sync later.
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <nav className="border-edge bg-surface/95 flex shrink-0 border-t backdrop-blur pb-safe">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 pt-3 text-[11px] transition-colors ${
                isActive ? 'text-accent-soft' : 'text-muted'
              }`
            }
          >
            <TabIcon d={tab.icon} />
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
