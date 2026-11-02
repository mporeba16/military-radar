// Stabilny, losowy identyfikator urządzenia z localStorage. Używają go
// subskrypcja push (serwer sprząta stary endpoint po rotacji — inaczej to samo
// urządzenie dostaje zdublowane powiadomienia) i anonimowy licznik
// użytkowników (serwer zapisuje tylko jego skrót).
export function getDeviceId() {
  try {
    let id = localStorage.getItem('radar.deviceId')
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      localStorage.setItem('radar.deviceId', id)
    }
    return id
  } catch { return null }
}
