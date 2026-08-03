import type { PromptStatus } from '../lib/types'

const STYLES: Record<PromptStatus, string> = {
  draft: 'bg-surface-2 text-muted',
  approved: 'bg-accent/20 text-accent-soft',
  sent: 'bg-emerald-500/15 text-emerald-300',
}

const LABELS: Record<PromptStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  sent: 'Sent',
}

export function StatusBadge({ status }: { status: PromptStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}
