import { useCallback, useEffect, useRef, useState } from 'react'
import { isSpeechSupported, startDictation, type DictationHandle } from '../lib/speech'

export function useDictation() {
  const [supported] = useState(isSpeechSupported)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const handle = useRef<DictationHandle | null>(null)

  const stop = useCallback(() => {
    handle.current?.stop()
    handle.current = null
    setListening(false)
    setInterim('')
  }, [])

  const start = useCallback(() => {
    setError(null)
    setTranscript('')
    setInterim('')

    const h = startDictation({
      onTranscript: (final, partial) => {
        setTranscript(final)
        setInterim(partial)
      },
      onError: (message) => {
        setError(message)
        setListening(false)
        setInterim('')
      },
      onEnd: () => {
        setListening(false)
        setInterim('')
        handle.current = null
      },
    })

    if (!h) {
      setError('Dictation is unavailable on this device — type instead.')
      return
    }
    handle.current = h
    setListening(true)
  }, [])

  // Backgrounding the app mid-dictation leaves the mic indicator on in iOS.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') stop()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      handle.current?.stop()
    }
  }, [stop])

  return { supported, listening, transcript, interim, error, start, stop }
}
