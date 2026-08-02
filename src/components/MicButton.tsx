interface Props {
  listening: boolean
  disabled?: boolean
  onClick: () => void
}

export function MicButton({ listening, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? 'Stop dictation' : 'Start dictation'}
      className={`grid h-16 w-16 shrink-0 place-items-center rounded-full transition-all active:scale-95 disabled:opacity-30 ${
        listening ? 'listening bg-accent text-white' : 'bg-surface-2 text-accent-soft'
      }`}
    >
      {listening ? (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
          <rect x="7" y="7" width="10" height="10" rx="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z M5 11a7 7 0 0 0 14 0 M12 18v3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
