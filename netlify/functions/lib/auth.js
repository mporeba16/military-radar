export function base64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

export async function signJWT(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const input = `${header}.${body}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  return `${input}.${base64url(Buffer.from(sig))}`
}

// OWASP 2024 recommends at least 600k iterations of PBKDF2-HMAC-SHA256
// for password hashing. Older hashes (iter=100000) are migrated lazily
// on next successful verify.
const PBKDF2_ITER_DEFAULT = 600_000

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER_DEFAULT, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return `${PBKDF2_ITER_DEFAULT}:${Buffer.from(salt).toString('hex')}:${Buffer.from(bits).toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const parts = stored.split(':')
  // Legacy two-part format `<salt>:<hash>` defaults to 100k iter.
  // New three-part format `<iter>:<salt>:<hash>` carries the count.
  const iter = parts.length === 3 ? Number(parts[0]) : 100_000
  const saltHex = parts.length === 3 ? parts[1] : parts[0]
  const hashHex = parts.length === 3 ? parts[2] : parts[1]
  const salt = new Uint8Array(Buffer.from(saltHex, 'hex'))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return Buffer.from(bits).toString('hex') === hashHex
}

export function normalizePhone(phone) {
  let p = phone.replace(/[\s\-().]/g, '')
  if (/^\d{9}$/.test(p)) p = '+48' + p
  else if (/^48\d{9}$/.test(p)) p = '+' + p
  else if (!p.startsWith('+')) p = '+' + p
  return p
}

export const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
}
