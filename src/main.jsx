import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { t } from './i18n'
import './index.css'

// Any render-time exception AFTER mount would otherwise leave a dead screen
// (the index.html boot fallback only fires within the first 10 s). This catches
// it and offers a reload instead.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error, info) {
    console.error('[app] uncaught render error:', error, info)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div role="alert" style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 24px',
        textAlign: 'center', color: '#ff7a55', fontFamily: "'Courier New', monospace",
      }}>
        <div style={{ fontSize: 15 }}>{t('BOOT_ERROR_TITLE')}</div>
        <div style={{ fontSize: 12, opacity: 0.8, color: '#ccd' }}>{t('BOOT_ERROR_HINT')}</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 6, background: '#00ff88', color: '#003020', border: 'none',
            padding: '8px 16px', fontFamily: "'Courier New', monospace", fontSize: 12,
            fontWeight: 'bold', letterSpacing: '0.8px', borderRadius: 3, cursor: 'pointer',
          }}>
          {t('UPDATE_RELOAD')}
        </button>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// Show a "new version available" prompt when the service worker swaps
// underneath us. vite-plugin-pwa is configured with registerType:
// 'autoUpdate' — the new SW takes over via skipWaiting + controllerchange.
// We don't want the page silently running mismatched JS, so we offer a
// reload button instead of a hard reload.
if ('serviceWorker' in navigator) {
  const hadControllerOnLoad = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First install fires controllerchange too — only prompt on real updates.
    if (!hadControllerOnLoad) return
    showUpdateToast()
  })
}

function showUpdateToast() {
  if (document.getElementById('sw-update-toast')) return
  const el = document.createElement('div')
  el.id = 'sw-update-toast'
  el.setAttribute('role', 'status')
  el.innerHTML = `<span>${t('UPDATE_AVAILABLE')}</span><button type="button" aria-label="${t('UPDATE_RELOAD')}">${t('UPDATE_RELOAD')}</button>`
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    background: 'rgba(0, 255, 136, 0.18)',
    border: '1px solid #00ff88',
    color: '#dffff0',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    letterSpacing: '0.5px',
    padding: '8px 12px',
    borderRadius: '4px',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
  })
  const btn = el.querySelector('button')
  Object.assign(btn.style, {
    background: '#00ff88',
    color: '#003020',
    border: 'none',
    padding: '6px 12px',
    fontFamily: "'Courier New', monospace",
    fontSize: '11px',
    fontWeight: 'bold',
    letterSpacing: '0.8px',
    borderRadius: '3px',
    cursor: 'pointer',
  })
  btn.addEventListener('click', () => {
    btn.disabled = true
    btn.textContent = '◌'
    window.location.reload()
  })
  document.body.appendChild(el)
}
