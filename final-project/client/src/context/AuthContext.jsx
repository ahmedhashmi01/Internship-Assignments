/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // `initializing` covers the one-time session restore on mount so the UI can
  // avoid flashing the guest header before we know if a token is still valid.
  // Starts false when there's no token (nothing to restore).
  const [initializing, setInitializing] = useState(Boolean(api.getToken()))

  useEffect(() => {
    if (!api.getToken()) return undefined // initializing already false
    let active = true
    api
      .getMe()
      .then((res) => {
        if (active) setUser(res.user)
      })
      .catch(() => {
        // Expired/invalid token — drop it and continue as a guest.
        api.clearToken()
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setInitializing(false)
      })
    return () => {
      active = false
    }
  }, [])

  const signup = useCallback(async ({ name, email, password }) => {
    const res = await api.signup({ name, email, password })
    api.setToken(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const login = useCallback(async ({ email, password }) => {
    const res = await api.login({ email, password })
    api.setToken(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    api.clearToken()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), initializing, signup, login, logout }),
    [user, initializing, signup, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
