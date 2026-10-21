import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { FullPageLoader } from './FullPageLoader'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
