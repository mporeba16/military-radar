// Cisza nocna: między 1:00 a 6:00 czasu polskiego serwer nie wysyła push.
// `notify` kończy wtedy przebieg od razu, więc nie zużywa też czasu funkcji.
// Liczone w strefie Europe/Warsaw, bo serwer Netlify chodzi w UTC.
export const QUIET_FROM_H = 1
export const QUIET_TO_H = 6

export function warsawHour(date = new Date()) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: 'numeric', hourCycle: 'h23' }).format(date)
  return Number(h)
}

export function isQuietHours(date = new Date()) {
  const h = warsawHour(date)
  return h >= QUIET_FROM_H && h < QUIET_TO_H
}
