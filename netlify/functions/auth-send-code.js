import { getStore } from '@netlify/blobs'
import { hashPassword, HEADERS } from './lib/auth.js'

async function sendEmail(to, code) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[AUTH DEV] Kod weryfikacyjny dla ${to}: ${code}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Radar Wojskowy <noreply@radar-wojskowy.netlify.app>',
      to: [to],
      subject: `${code} — kod weryfikacyjny Radar Wojskowy`,
      html: `
        <div style="font-family:monospace;background:#080f1c;color:#e0e8f0;padding:32px;max-width:400px">
          <p style="color:#00ff88;font-size:18px;letter-spacing:2px">◎ RADAR WOJSKOWY</p>
          <p>Twój kod weryfikacyjny:</p>
          <p style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#00ff88">${code}</p>
          <p style="color:#7a9ab5;font-size:12px">Ważny przez 10 minut. Nie udostępniaj go nikomu.</p>
        </div>`,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Email error ${res.status}`)
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { email, password, phone } = JSON.parse(event.body || '{}')

    if (!email || !password)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Wymagane: email, hasło' }) }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Nieprawidłowy format email' }) }

    if (password.length < 8)
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Hasło musi mieć min. 8 znaków' }) }

    const normalizedEmail = email.toLowerCase().trim()

    const usersStore = getStore('auth-users')
    const existing = await usersStore.get(normalizedEmail)
    if (existing)
      return { statusCode: 409, headers: HEADERS, body: JSON.stringify({ error: 'Konto z tym emailem już istnieje' }) }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const passwordHash = await hashPassword(password)

    const pendingStore = getStore('auth-pending')
    await pendingStore.set(normalizedEmail, JSON.stringify({
      email: normalizedEmail,
      phone: phone || null,
      passwordHash,
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
    }))

    await sendEmail(normalizedEmail, code)

    const devMode = !process.env.RESEND_API_KEY
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, devMode }) }
  } catch (err) {
    console.error('auth-send-code:', err)
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message || 'Błąd serwera' }) }
  }
}
