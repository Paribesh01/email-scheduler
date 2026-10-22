import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'
import { FullPageLoader } from '../components/layout/FullPageLoader'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Your sign-in session expired. Please try again.',
  google_failed: 'Google sign-in failed. Please try again.',
  no_profile: 'Google did not share your profile details.',
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function LoginPage() {
  const { user, loading, login, loginWithEmail } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const oauthError = params.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (loading) return <FullPageLoader />
  if (user) return <Navigate to="/dashboard" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!email.trim() || !password) {
      setFormError('Enter your email and password')
      return
    }
    setSubmitting(true)
    try {
      await loginWithEmail(email.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const details = err instanceof ApiError ? err.details : undefined
      const fieldMsg = details && Object.values(details).find((v) => v?.length)?.[0]
      setFormError(fieldMsg ?? (err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const error = formError ?? (oauthError ? (ERRORS[oauthError] ?? 'Sign-in failed.') : null)

  return (
    <div className="flex min-h-full items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 px-8 py-10 shadow-sm">
        <h1 className="mb-8 text-center text-3xl font-semibold">Login</h1>

        <button
          type="button"
          onClick={login}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-brand-50 text-sm font-medium text-gray-800 transition-colors hover:bg-brand-100"
        >
          <GoogleLogo />
          Login with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          or sign up through email
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            type="email"
            autoComplete="email"
            placeholder="Email ID"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full bg-gray-50"
          />
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full bg-gray-50"
          />

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <Button type="submit" size="lg" loading={submitting} className="w-full">
            Login
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">New here? A new email creates your account.</p>
      </div>
    </div>
  )
}
