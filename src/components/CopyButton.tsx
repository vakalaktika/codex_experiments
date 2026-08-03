import { useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/clipboard'

interface Props {
  text: string
  label?: string
  className?: string
}

/**
 * Copy-to-clipboard with inline confirmation.
 *
 * The result is surfaced rather than assumed: the iOS fallback path in
 * lib/clipboard can genuinely fail, and silently pretending it worked is how
 * someone pastes nothing into their editor and loses the idea.
 */
export function CopyButton({ text, label = 'Copy', className = '' }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function handleClick() {
    const ok = await copyText(text)
    setState(ok ? 'copied' : 'failed')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className={`bg-accent rounded-xl px-4 py-2 text-sm font-medium text-white transition-all active:scale-[0.98] ${className}`}
    >
      <span aria-live="polite">
        {state === 'copied'
          ? 'Copied'
          : state === 'failed'
            ? 'Press and hold to copy'
            : label}
      </span>
    </button>
  )
}
