const API_BASE = '/.netlify/functions'

export async function fetchMilitaryAircraft(center, radiusKm) {
  const [lat, lon] = center
  const url = `${API_BASE}/aircraft?lat=${lat}&lon=${lon}&radius=${radiusKm}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
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
