import { getStore } from '@netlify/blobs'
import { signJWT, HEADERS } from './lib/auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { email, code } = JSON.parse(event.body || '{}')

    if (!email || !code)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Wymagane: email, code' }) }

    const normalizedEmail = email.toLowerCase().trim()
    const pendingStore = getStore('auth-pending')
    const pendingRaw = await pendingStore.get(normalizedEmail)

    if (!pendingRaw)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Brak oczekującej rejestracji dla tego emaila' }) }

    const pending = JSON.parse(pendingRaw)

    if (Date.now() > pending.expiresAt) {
      await pendingStore.delete(normalizedEmail)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Kod wygasł — zarejestruj się ponownie' }) }
    }

    if (pending.code !== code.trim())
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Nieprawidłowy kod weryfikacyjny' }) }

    const usersStore = getStore('auth-users')
    await usersStore.set(normalizedEmail, JSON.stringify({
      email: normalizedEmail,
      phone: pending.phone,
      passwordHash: pending.passwordHash,
      createdAt: Date.now(),
    }))

    await pendingStore.delete(normalizedEmail)

    const token = await signJWT(
      { email: normalizedEmail, phone: pending.phone, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 },
      process.env.JWT_SECRET
    )

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ok: true, token, user: { email: normalizedEmail, phone: pending.phone } }),
    }
  } catch (err) {
    console.error('auth-verify-code:', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message || 'Błąd serwera' }) }
  }
}
