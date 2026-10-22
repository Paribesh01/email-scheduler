import { useEffect, useRef, useState } from 'react'
import { Check, ListFilter, RefreshCw, Search } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { cn } from '../../lib/cn'

export interface FilterOption {
  id: string
  label: string
}

interface Props {
  search: string
  onSearch: (v: string) => void
  onRefresh: () => void
  refreshing: boolean
  filters: FilterOption[]
  filter: string
  onFilter: (id: string) => void
}

export function ListToolbar({ search, onSearch, onRefresh, refreshing, filters, filter, onFilter }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = filter !== filters[0]?.id

  return (
    <div className="flex items-center gap-1 px-6 py-3">
      <label className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg bg-gray-50 px-3 text-sm focus-within:ring-2 focus-within:ring-brand-100">
        <Search className="h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search"
          className="h-full flex-1 bg-transparent outline-none placeholder:text-gray-400"
        />
      </label>

      <div ref={ref} className="relative">
        <IconButton label="Filter" onClick={() => setOpen((o) => !o)} className={cn(filtered && 'text-brand-600')}>
          <ListFilter className="h-4 w-4" />
        </IconButton>
        {open && (
          <div className="absolute top-full left-0 z-20 mt-1 w-44 rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  onFilter(f.id)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {f.label}
                {f.id === filter && <Check className="h-4 w-4 text-brand-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <IconButton label="Refresh" onClick={onRefresh}>
        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
      </IconButton>
    </div>
  )
}
