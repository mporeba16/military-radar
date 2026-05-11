import { useState, useEffect, useRef } from 'react'

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return typeof initial === 'function' ? initial() : initial
      return JSON.parse(raw)
    } catch {
      return typeof initial === 'function' ? initial() : initial
    }
  })

  const keyRef = useRef(key)
  useEffect(() => { keyRef.current = key }, [key])

  useEffect(() => {
    try { localStorage.setItem(keyRef.current, JSON.stringify(value)) } catch {}
  }, [value])

  return [value, setValue]
}
