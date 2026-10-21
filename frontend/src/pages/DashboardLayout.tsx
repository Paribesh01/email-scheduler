import { useEffect, useState } from 'react'
import { Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { Menu } from 'lucide-react'
import type { EmailStats } from '../types/api'
import { useStats } from '../hooks/useEmails'
import { Sidebar } from '../components/layout/Sidebar'
import { IconButton } from '../components/ui/IconButton'

interface DashboardContext {
  stats: EmailStats | null
  refreshStats: () => Promise<void>
}

export function DashboardLayout() {
  const { data: stats, refetch } = useStats()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setDrawerOpen(false), [location.pathname])

  return (
    <div className="flex h-full">
      <div className="hidden lg:block">
        <Sidebar stats={stats} />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="h-full shadow-xl">
            <Sidebar stats={stats} />
          </div>
          <button aria-label="Close menu" className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 lg:hidden">
          <IconButton label="Open menu" onClick={() => setDrawerOpen(true)}>
            <Menu className="h-5 w-5" />
          </IconButton>
          <span className="text-lg font-extrabold">ONB</span>
        </div>
        <div className="min-h-0 flex-1">
          <Outlet context={{ stats, refreshStats: refetch } satisfies DashboardContext} />
        </div>
      </main>
    </div>
  )
}

export const useDashboard = () => useOutletContext<DashboardContext>()
