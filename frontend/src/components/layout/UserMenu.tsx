import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../ui/Avatar'

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!user) return null

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left transition-colors hover:bg-gray-100"
        aria-expanded={open}
      >
        <Avatar name={user.name} src={user.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-gray-500">{user.email}</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
