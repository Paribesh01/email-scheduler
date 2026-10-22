import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { User } from '../types/api'

interface AuthState {
  user: User | null
  loading: boolean
  login: () => void
  loginWithEmail: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(() => {
    window.location.href = api.googleLoginUrl()
  }, [])

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const res = await api.emailLogin(email, password)
    setUser(res.user)
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, loginWithEmail, logout }),
    [user, loading, login, loginWithEmail, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
