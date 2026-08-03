import type { Project } from '../lib/types'

/**
 * Sticky last-used project selector.
 *
 * A native select on purpose: it is keyboard-operable and screen-reader
 * labelled for free, and on iOS it opens the system picker, which is both
 * faster to hit one-handed and familiar. A custom dropdown here would be more
 * code and worse.
 *
 * "Unfiled" is a real option, not a placeholder — a note must never be blocked
 * on choosing a project, and unfiled notes are filed later from the Capture
 * screen's recent list.
 */

const STORAGE_KEY = 'idea-capture:last-project'

/**
 * The Pages origin is shared with every other site under the account, so the
 * key is namespaced. Storage access throws in some private-mode browsers, and
 * a preference is never worth failing a capture over.
 */
export function readLastProjectId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeLastProjectId(projectId: string | null): void {
  try {
    if (projectId === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, projectId)
  } catch {
    /* preference only — losing it costs one extra tap */
  }
}

interface Props {
  projects: Project[]
  value: string | null
  onChange: (projectId: string | null) => void
  id?: string
}

export function ProjectPicker({ projects, value, onChange, id = 'project' }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-muted shrink-0 text-xs">
        Project
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : event.target.value)
        }
        className="border-edge bg-surface focus:border-accent min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
      >
        <option value="">Unfiled</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  )
}
