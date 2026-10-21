import { RefreshCw, Search } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { cn } from '../../lib/cn'

interface Props {
  search: string
  onSearch: (v: string) => void
  onRefresh: () => void
  refreshing: boolean
}

export function ListToolbar({ search, onSearch, onRefresh, refreshing }: Props) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-3">
      <label className="flex h-10 flex-1 items-center gap-2 rounded-lg bg-gray-50 px-3 text-sm focus-within:ring-2 focus-within:ring-brand-100">
        <Search className="h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by email, subject or content"
          className="h-full flex-1 bg-transparent outline-none placeholder:text-gray-400"
        />
      </label>
      <IconButton label="Refresh" onClick={onRefresh}>
        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
      </IconButton>
    </div>
  )
}
