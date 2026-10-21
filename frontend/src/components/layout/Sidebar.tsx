import { NavLink, useNavigate } from 'react-router-dom'
import { Clock, ExternalLink, Send, SquarePen } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EmailStats } from '../../types/api'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { UserMenu } from './UserMenu'
import { SlackConnect } from '../slack/SlackConnect'

function NavItem({ to, icon, label, count }: { to: string; icon: ReactNode; label: string; count?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-brand-50 font-semibold text-gray-900' : 'text-gray-600 hover:bg-gray-50',
        )
      }
    >
      <span className="text-gray-500">{icon}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs font-medium text-gray-500">{count}</span>}
    </NavLink>
  )
}

export function Sidebar({ stats }: { stats: EmailStats | null }) {
  const navigate = useNavigate()

  return (
    <aside className="flex h-full w-72 flex-col gap-6 border-r border-gray-100 bg-white p-4">
      <div className="px-2 pt-2 text-2xl font-extrabold tracking-tight">ONB</div>

      <UserMenu />

      <Button variant="outline" rounded size="lg" icon={<SquarePen className="h-4 w-4" />} onClick={() => navigate('/compose')}>
        Compose
      </Button>

      <nav className="flex flex-col gap-1">
        <p className="px-3 pb-1 text-xs font-semibold tracking-wider text-gray-400">CORE</p>
        <NavItem to="/dashboard/scheduled" icon={<Clock className="h-4 w-4" />} label="Scheduled" count={stats?.scheduled} />
        <NavItem to="/dashboard/sent" icon={<Send className="h-4 w-4" />} label="Sent" count={stats?.sent} />
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <SlackConnect />
        <a
          href={api.queueDashboardUrl()}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 text-xs text-gray-500 hover:text-gray-800"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Live queue dashboard
        </a>
      </div>
    </aside>
  )
}
