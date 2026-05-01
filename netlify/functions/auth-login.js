import { getStore } from '@netlify/blobs'
import { verifyPassword, signJWT, HEADERS } from './lib/auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { email, password } = JSON.parse(event.body || '{}')

    if (!email || !password)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Wymagane: email, hasło' }) }

    const normalizedEmail = email.toLowerCase().trim()

    // Test account via env vars (no registration needed)
    const testEmail = (process.env.TEST_USER_EMAIL || '').toLowerCase()
    const testPassword = process.env.TEST_USER_PASSWORD || ''
    if (testEmail && testPassword && normalizedEmail === testEmail && password === testPassword) {
      const token = await signJWT(
        { email: normalizedEmail, test: true, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 },
        process.env.JWT_SECRET
      )
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ ok: true, token, user: { email: normalizedEmail, test: true } }),
      }
    }

    const usersStore = getStore('auth-users')
    const userRaw = await usersStore.get(normalizedEmail)

    if (!userRaw)
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Nieprawidłowy email lub hasło' }) }

    const user = JSON.parse(userRaw)
    const ok = await verifyPassword(password, user.passwordHash)

    if (!ok)
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Nieprawidłowy email lub hasło' }) }

    const token = await signJWT(
      { email: user.email, phone: user.phone, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 },
      process.env.JWT_SECRET
    )

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ok: true, token, user: { email: user.email, phone: user.phone } }),
    }
  } catch (err) {
    console.error('auth-login:', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message || 'Błąd serwera' }) }
  }
}
