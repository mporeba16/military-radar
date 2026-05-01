import { useState, useRef } from 'react'
import './AuthScreen.css'

export default function AuthScreen({ onLogin }) {
  const [view, setView] = useState('login') // 'login' | 'register' | 'verify'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devMode, setDevMode] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [verifyEmail, setVerifyEmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const codeRefs = useRef([])

  function handleCodeChange(i, val) {
    if (!/^\d?$/.test(val)) return
    const next = [...code]
    next[i] = val
    setCode(next)
    if (val && i < 5) codeRefs.current[i + 1]?.focus()
  }

  function handleCodeKeyDown(i, e) {
    if (e.key === 'Backspace' && !code[i] && i > 0) codeRefs.current[i - 1]?.focus()
  }

  function handleCodePaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setCode(text.split(''))
      codeRefs.current[5]?.focus()
      e.preventDefault()
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      onLogin(data.token, data.user)
    } catch {
      setError('Błąd połączenia z serwerem')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/auth-send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, phone }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setVerifyEmail(email)
      setDevMode(data.devMode || false)
      setView('verify')
    } catch {
      setError('Błąd połączenia z serwerem')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    const fullCode = code.join('')
    if (fullCode.length < 6) { setError('Wprowadź pełny 6-cyfrowy kod'); return }
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/auth-verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail, code: fullCode }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      onLogin(data.token, data.user)
    } catch {
      setError('Błąd połączenia z serwerem')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-bg" />

      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">◎</span>
          <span className="auth-logo-name">RADAR WOJSKOWY</span>
        </div>

        {view === 'login' && (
          <form className="auth-form" onSubmit={handleLogin}>
            <h2 className="auth-title">Logowanie</h2>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="twoj@email.com" required autoComplete="email" />
            </div>
            <div className="auth-field">
              <label>Hasło</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '◌ Logowanie…' : 'Zaloguj się'}
            </button>
            <p className="auth-switch">
              Nie masz konta?{' '}
              <button type="button" className="auth-link" onClick={() => { setView('register'); setError('') }}>
                Zarejestruj się
              </button>
            </p>
          </form>
        )}

        {view === 'register' && (
          <form className="auth-form" onSubmit={handleRegister}>
            <h2 className="auth-title">Rejestracja</h2>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="twoj@email.com" required autoComplete="email" />
            </div>
            <div className="auth-field">
              <label>Hasło <span className="auth-hint">(min. 8 znaków)</span></label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="new-password" minLength={8} />
            </div>
            <div className="auth-field">
              <label>Numer telefonu <span className="auth-hint">(opcjonalnie)</span></label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+48 123 456 789" autoComplete="tel" />
            </div>
            <p className="auth-info">Na podany email wyślemy kod weryfikacyjny.</p>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '◌ Wysyłanie…' : 'Wyślij kod na email'}
            </button>
            <p className="auth-switch">
              Masz konto?{' '}
              <button type="button" className="auth-link" onClick={() => { setView('login'); setError('') }}>
                Zaloguj się
              </button>
            </p>
          </form>
        )}

        {view === 'verify' && (
          <form className="auth-form" onSubmit={handleVerify}>
            <h2 className="auth-title">Weryfikacja email</h2>
            <p className="auth-info">
              Wysłaliśmy 6-cyfrowy kod na adres<br />
              <strong>{verifyEmail}</strong>
            </p>
            {devMode && (
              <p className="auth-dev-info">
                ◌ Tryb dev — kod widoczny w logach serwera (netlify dev)
              </p>
            )}
            <div className="auth-code-row" onPaste={handleCodePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={el => codeRefs.current[i] = el}
                  className="auth-code-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleCodeChange(i, e.target.value)}
                  onKeyDown={e => handleCodeKeyDown(i, e)}
                />
              ))}
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '◌ Weryfikacja…' : 'Zweryfikuj'}
            </button>
            <p className="auth-switch">
              <button type="button" className="auth-link"
                onClick={() => { setView('register'); setError(''); setCode(['','','','','','']) }}>
                ← Wróć i wyślij ponownie
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
