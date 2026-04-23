// Endpoint do zapisywania subskrypcji Web Push.
// W wersji produkcyjnej zapisywałby do bazy (FaunaDB, Supabase, itp.)
// i scheduler wysyłałby notyfikacje przez web-push.
// Tu zwracamy 200 OK żeby frontend działał poprawnie.

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const sub = JSON.parse(event.body)
    console.log('Push subscription received:', sub.endpoint?.slice(0, 60))
    // TODO: zapisz sub do bazy danych
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid body' }) }
  }
}
