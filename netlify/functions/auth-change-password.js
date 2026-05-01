import { getStore } from '@netlify/blobs'
import { verifyPassword, hashPassword, HEADERS } from './lib/auth.js'

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { email, currentPassword, newPassword } = JSON.parse(event.body || '{}')

    if (!email || !currentPassword || !newPassword)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Wymagane: email, currentPassword, newPassword' }) }

    if (newPassword.length < 8)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Nowe hasło musi mieć min. 8 znaków' }) }

    const normalizedEmail = email.toLowerCase().trim()

    // Test account — cannot change password via API
    const testEmail = (process.env.TEST_USER_EMAIL || '').toLowerCase()
    if (normalizedEmail === testEmail)
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Konto testowe — nie można zmieniać hasła' }) }

    const usersStore = getStore('auth-users')
    const userRaw = await usersStore.get(normalizedEmail)

    if (!userRaw)
      return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Konto nie istnieje' }) }

    const user = JSON.parse(userRaw)
    const ok = await verifyPassword(currentPassword, user.passwordHash)

    if (!ok)
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Nieprawidłowe obecne hasło' }) }

    const newHash = await hashPassword(newPassword)
    await usersStore.set(normalizedEmail, JSON.stringify({ ...user, passwordHash: newHash }))

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('auth-change-password:', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message || 'Błąd serwera' }) }
  }
}
