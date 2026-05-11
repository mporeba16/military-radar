import { getStore, connectLambda } from '@netlify/blobs'
import crypto from 'crypto'

export const handler = async (event) => {
  connectLambda(event)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch (err) {
    console.error('[subscribe] JSON parse failed:', err.message)
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-json', detail: err.message }) }
  }

  const { subscription, lat, lon, radius } = body

  if (!subscription?.endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing-endpoint' }) }
  }

  let key
  try {
    key = crypto.createHash('sha256')
      .update(subscription.endpoint)
      .digest('hex')
      .slice(0, 32)
  } catch (err) {
    console.error('[subscribe] Hash failed:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'hash-failed', detail: err.message }) }
  }

  let store
  try {
    store = getStore('push-subscriptions')
  } catch (err) {
    console.error('[subscribe] getStore failed:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'blobs-init-failed', detail: err.message }) }
  }

  let existing = null
  try {
    existing = await store.get(key, { type: 'json' })
  } catch (err) {
    console.error('[subscribe] get existing failed:', err.message)
    // continue — treat as no existing record
  }

  const newLat = lat ?? existing?.lat ?? null
  const newLon = lon ?? existing?.lon ?? null
  const hasGps = newLat != null && newLon != null

  const record = {
    subscription,
    lat: newLat,
    lon: newLon,
    radius: radius ?? existing?.radius ?? 100,
    updatedAt: lat != null ? Date.now() : (existing?.updatedAt ?? Date.now()),
    createdAt: existing?.createdAt ?? Date.now(),
  }

  let serialized
  try {
    serialized = JSON.stringify(record)
  } catch (err) {
    console.error('[subscribe] serialize failed:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'serialize-failed', detail: err.message }) }
  }

  try {
    await store.set(key, serialized)
  } catch (err) {
    console.error('[subscribe] store.set failed:', err.message, err.stack)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'blobs-write-failed',
        detail: err.message,
        bytes: serialized.length,
      }),
    }
  }

  console.log(`[subscribe] OK key=${key} hasGps=${hasGps} lat=${newLat} lon=${newLon} radius=${record.radius}`)
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, key, hasGps }),
  }
}
