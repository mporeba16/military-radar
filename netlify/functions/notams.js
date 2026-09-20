// NOTAM-y dla Rzeszowa, Lublina i polskich baz wojskowych z autorouter.aero.
//
// Dostęp do API przyznany na koncie autorouter (zgłoszenie do supportu).
// Logowanie OAuth2 „client credentials”: e-mail i hasło konta jako client_id
// i client_secret — trzymane WYŁĄCZNIE w zmiennych środowiskowych Netlify.
// Token żyje godzinę; dokumentacja prosi, by nie brać nowego, dopóki stary
// jest ważny, więc trzymamy go w instancji.
//
// Jedno zapytanie na wszystkie lotniska, wynik w pamięci 15 min plus CDN —
// tak, jak zapowiedzieliśmy autorouterowi (ok. 100 zapytań na dobę).

import { corsHeaders } from './lib/security.js'
import { MIL_BASES_PL } from '../../src/airfields.js'
import { WATCHED_EAST, groupNotams } from '../../src/lib/notams.js'

const API = 'https://api.autorouter.aero/v1.0'
const FRESH_MS = 15 * 60 * 1000
const STALE_MAX_MS = 6 * 60 * 60 * 1000
const MAX_PAGES = 5
export const AIRPORTS = [...new Set([...WATCHED_EAST, ...MIL_BASES_PL.map(b => b.icao)])]

let token = null   // { value, exp }
let cache = null   // { at, body }

async function getToken() {
  if (token && Date.now() < token.exp - 5 * 60 * 1000) return token.value
  const user = process.env.AUTOROUTER_USER
  const pass = process.env.AUTOROUTER_PASS
  if (!user || !pass) throw Object.assign(new Error('not-configured'), { code: 'not-configured' })
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: user, client_secret: pass }),
  })
  if (!res.ok) throw new Error(`token http-${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('token missing')
  token = { value: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 }
  return token.value
}

async function fetchRows() {
  const bearer = await getToken()
  const rows = []
  const now = Math.floor(Date.now() / 1000)
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      itemas: JSON.stringify(AIRPORTS),
      offset: String(page * 100),
      limit: '100',
      startvalidity: String(now),
      endvalidity: String(now + 24 * 3600),
    })
    const res = await fetch(`${API}/notam?${q}`, {
      signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
    })
    if (res.status === 401) { token = null; throw new Error('notam http-401') }
    if (!res.ok) throw new Error(`notam http-${res.status}`)
    const data = await res.json()
    rows.push(...(data.rows || []))
    if (rows.length >= (data.total || 0) || !(data.rows || []).length) break
  }
  return rows
}

export const handler = async (event) => {
  const headers = corsHeaders(event)
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const now = Date.now()
  if (!cache || now - cache.at > FRESH_MS) {
    try {
      const airports = groupNotams(await fetchRows(), AIRPORTS, now)
      cache = { at: now, body: JSON.stringify({ updated: new Date(now).toISOString(), airports }) }
    } catch (err) {
      if (err.code === 'not-configured') {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'not-configured' }) }
      }
      if (!cache || now - cache.at > STALE_MAX_MS) {
        console.error('[notams]', err.message)
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'upstream' }) }
      }
    }
  }

  return {
    statusCode: 200,
    headers: { ...headers, 'Cache-Control': 'public, max-age=300, s-maxage=900' },
    body: cache.body,
  }
}
