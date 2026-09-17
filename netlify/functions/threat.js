// GET /.netlify/functions/threat → bieżący szacunek ryzyka dronowego dla
// wschodnich województw.
//
// Koszt: zero. Cała robota siedzi w lib/threatState.js, wspólnym z cronem
// powiadomień — jedyne wyjście na zewnątrz to ubilling.net.ua/aerialalerts
// (bez klucza), a sygnał ADS-B bierzemy z blobu, który aircraft.js i tak
// zapisuje przy obsłudze klientów.

import { connectLambda } from '@netlify/blobs'
import { corsHeaders } from './lib/security.js'
import { resolveThreatState } from './lib/threatState.js'

export const handler = async (event) => {
  connectLambda(event)
  const headers = corsHeaders(event)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const { state, cached } = await resolveThreatState()

  return {
    statusCode: 200,
    // Klient odpytuje co minutę; CDN sklei równoległe wejścia w jedno trafienie
    // do funkcji, a i tak każde z nich dostałoby ten sam stan z Blobs.
    headers: { ...headers, 'Cache-Control': 'public, max-age=0, s-maxage=45' },
    body: JSON.stringify({ ...state, _cached: cached }),
  }
}
