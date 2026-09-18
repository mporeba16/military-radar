// „47 min" albo „1:23 h" — krótko, żeby zmieścić trzecią kolumnę na karcie.
// `start` = { ts, partial } z App. Przy `partial` znamy tylko chwilę, od
// której maszyna jest na radarze w tej sesji — pokazujemy „≥ 12 min”, a przy
// pierwszej minucie „—”, bo „0 min” wyglądało jak świeży start.
export function formatFlightTime(start, now = Date.now()) {
  if (start?.ts == null) return null
  const min = Math.max(0, Math.floor((now - start.ts) / 60000))
  if (start.partial && min < 1) return null
  const prefix = start.partial ? '≥' : ''
  if (min < 60) return { val: `${prefix}${min}`, unit: 'min' }
  return { val: `${prefix}${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`, unit: 'h' }
}
