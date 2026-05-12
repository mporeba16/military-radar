const API_BASE = '/.netlify/functions'

export async function fetchMilitaryAircraft(center, radiusKm, signal) {
  const [lat, lon] = center
  const url = `${API_BASE}/aircraft?lat=${lat}&lon=${lon}&radius=${radiusKm}`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    // Don't surface the raw response body (often a multi-line Netlify HTML
    // error page) — it ends up in `setError(err.message)` and looks awful.
    const label = res.status === 429 ? 'limit zapytań'
      : res.status >= 500 ? 'serwer niedostępny'
      : 'błąd API'
    throw new Error(`${label} (HTTP ${res.status})`)
  }
  const data = await res.json()
  return {
    aircraft: data.aircraft || [],
    source: data._source || (data._demo ? 'demo' : 'unknown'),
    isDemo: !!data._demo,
  }
}

export async function subscribePush(subscription) {
  const res = await fetch(`${API_BASE}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
  })
  if (!res.ok) throw new Error('Subskrypcja push nie powiodła się')
  return res.json()
}
