import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { DashboardLayout } from './pages/DashboardLayout'
import { EmailListPage } from './pages/EmailListPage'
import { ComposePage } from './pages/ComposePage'
import { EmailDetailPage } from './pages/EmailDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Navigate to="/dashboard/scheduled" replace />} />
              <Route path="/dashboard/scheduled" element={<EmailListPage type="scheduled" />} />
              <Route path="/dashboard/sent" element={<EmailListPage type="sent" />} />
              <Route path="/compose" element={<ComposePage />} />
              <Route path="/emails/:id" element={<EmailDetailPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
