import { Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { EmailStatus } from '../../types/api'
import { cn } from '../../lib/cn'
import { formatPillDate } from '../../lib/format'

interface Props {
  status: EmailStatus
  date?: string | null
  className?: string
}

export function StatusBadge({ status, date, className }: Props) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap'

  switch (status) {
    case 'SCHEDULED':
      return (
        <span className={cn(base, 'bg-orange-50 text-orange-600', className)}>
          <Clock className="h-3.5 w-3.5" />
          {date ? formatPillDate(date) : 'Scheduled'}
        </span>
      )
    case 'SENDING':
      return (
        <span className={cn(base, 'bg-blue-50 text-blue-600', className)}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Sending
        </span>
      )
    case 'SENT':
      return (
        <span className={cn(base, 'bg-gray-100 text-gray-700', className)}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Sent
        </span>
      )
    case 'FAILED':
      return (
        <span className={cn(base, 'bg-red-50 text-red-600', className)}>
          <XCircle className="h-3.5 w-3.5" />
          Failed
        </span>
      )
  }
}
