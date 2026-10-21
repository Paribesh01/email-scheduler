import { Link } from 'react-router-dom'
import { Gauge, Star } from 'lucide-react'
import type { EmailItem } from '../../types/api'
import { formatPillDate, preview } from '../../lib/format'
import { StatusBadge } from '../ui/StatusBadge'

export function EmailRow({ email }: { email: EmailItem }) {
  const isPending = email.status === 'SCHEDULED' || email.status === 'SENDING'

  return (
    <Link
      to={`/emails/${email.id}`}
      className="group flex items-center gap-4 border-b border-gray-100 px-6 py-4 transition-colors hover:bg-gray-50"
    >
      <div className="w-56 shrink-0 truncate text-sm">
        <span className="text-gray-500">To: </span>
        <span className="font-medium text-gray-900">{email.toEmail}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <StatusBadge status={email.status} date={isPending ? email.scheduledAt : null} />
        {isPending && email.rateLimited && (
          <span
            title="Hourly limit reached, moved to the next hour window"
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
          >
            <Gauge className="h-3 w-3" />
            Rate limited
          </span>
        )}
      </div>

      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold text-gray-900">{email.subject}</span>
        <span className="text-gray-500"> - {preview(email.body)}</span>
      </p>

      {!isPending && (email.sentAt || email.status === 'FAILED') && (
        <span className="hidden shrink-0 text-xs text-gray-500 md:block">
          {email.sentAt ? formatPillDate(email.sentAt) : formatPillDate(email.scheduledAt)}
        </span>
      )}
      <Star className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-400" />
    </Link>
  )
}
