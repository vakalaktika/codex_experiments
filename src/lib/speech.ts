/**
 * Web Speech API wrapper.
 *
 * Support is genuinely uneven: Android Chrome is solid, desktop Chrome is fine,
 * and iOS Safari exposes `webkitSpeechRecognition` but is unreliable in
 * standalone (home-screen) mode — which is the mode this app is built for. So
 * the text fallback is a first-class path, not an edge case: callers must treat
 * `isSpeechSupported()` returning false as normal.
 */

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
}

type Ctor = new () => SpeechRecognitionLike

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function isSpeechSupported(): boolean {
  return getCtor() !== null
}

export interface DictationHandle {
  stop(): void
}

export interface DictationCallbacks {
  /** Fires continuously: `final` is settled text, `interim` is still changing. */
  onTranscript(final: string, interim: string): void
  onError(message: string): void
  onEnd(): void
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Enable it in Settings, or type instead.',
  'service-not-allowed': 'Dictation is unavailable here — type instead.',
  'no-speech': "Didn't catch that. Try again, or type instead.",
  network: 'Dictation needs a connection. Your text is still saved offline.',
  aborted: '',
}

export function startDictation(cb: DictationCallbacks): DictationHandle | null {
  const Ctor = getCtor()
  if (!Ctor) return null

  const recognition = new Ctor()
  recognition.lang = navigator.language || 'en-US'
  recognition.continuous = true
  recognition.interimResults = true

  let settled = ''

  recognition.onresult = (event: any) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) settled += result[0].transcript
      else interim += result[0].transcript
    }
    cb.onTranscript(settled, interim)
  }

  recognition.onerror = (event: any) => {
    const message = ERRORS[event?.error] ?? 'Dictation stopped unexpectedly — type instead.'
    if (message) cb.onError(message)
  }

  recognition.onend = () => cb.onEnd()

  try {
    recognition.start()
  } catch {
    // Chrome throws if start() is called while already running.
    return null
  }

  return {
    stop() {
      try {
        recognition.stop()
      } catch {
        /* already stopped */
      }
    },
  }
}
