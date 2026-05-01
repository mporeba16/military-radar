import { useState, useEffect } from 'react'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const token = localStorage.getItem('rw_token')
      const userStr = localStorage.getItem('rw_user')
      if (token && userStr) setUser(JSON.parse(userStr))
    } catch {}
    setLoading(false)
  }, [])

  function login(token, userData) {
    localStorage.setItem('rw_token', token)
    localStorage.setItem('rw_user', JSON.stringify(userData))
    setUser(userData)
  }

  function logout() {
    localStorage.removeItem('rw_token')
    localStorage.removeItem('rw_user')
    setUser(null)
  }

  return { user, loading, login, logout }
}
