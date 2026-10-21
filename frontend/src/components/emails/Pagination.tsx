import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '../ui/IconButton'

interface Props {
  page: number
  limit: number
  total: number
  onChange: (page: number) => void
}

export function Pagination({ page, limit, total, onChange }: Props) {
  if (total <= limit) return null
  const pages = Math.ceil(total / limit)
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="flex items-center justify-end gap-2 px-6 py-3 text-xs text-gray-500">
      <span>
        {from}–{to} of {total}
      </span>
      <IconButton label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} className="disabled:opacity-30">
        <ChevronLeft className="h-4 w-4" />
      </IconButton>
      <IconButton label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)} className="disabled:opacity-30">
        <ChevronRight className="h-4 w-4" />
      </IconButton>
    </div>
  )
}
