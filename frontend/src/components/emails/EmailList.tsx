import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { EmailFilter, EmailTab } from '../../types/api'
import { useEmails } from '../../hooks/useEmails'
import { useDebounce } from '../../hooks/useDebounce'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { EmailRow } from './EmailRow'
import { EmailListSkeleton } from './EmailListSkeleton'
import { ListToolbar, type FilterOption } from './ListToolbar'
import { Pagination } from './Pagination'

const FILTERS: Record<EmailTab, Array<FilterOption & { value: EmailFilter }>> = {
  scheduled: [
    { id: 'all', label: 'All scheduled', value: {} },
    { id: 'rate', label: 'Rate limited', value: { rateLimited: true } },
    { id: 'sending', label: 'Sending now', value: { status: 'SENDING' } },
  ],
  sent: [
    { id: 'all', label: 'All', value: {} },
    { id: 'sent', label: 'Sent', value: { status: 'SENT' } },
    { id: 'failed', label: 'Failed', value: { status: 'FAILED' } },
  ],
}

interface Props {
  type: EmailTab
  empty: { icon: ReactNode; title: string; description: string; action?: ReactNode }
}

/** shared by the Scheduled and Sent tabs, only the data source + empty copy differ */
export function EmailList({ type, empty }: Props) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterId, setFilterId] = useState('all')
  const q = useDebounce(search.trim(), 300)
  const filter = FILTERS[type].find((f) => f.id === filterId)?.value ?? {}
  const { data, error, loading, refreshing, refetch } = useEmails(type, q, page, filter)

  useEffect(() => setPage(1), [q, type, filterId])

  let content: ReactNode
  if (loading && !data) {
    content = <EmailListSkeleton />
  } else if (error && !data) {
    content = (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Couldn't load emails"
        description={error.message}
        action={<Button variant="outline" onClick={() => void refetch()}>Try again</Button>}
      />
    )
  } else if (!data || data.items.length === 0) {
    content = q || filterId !== 'all' ? (
      <EmptyState
        icon={empty.icon}
        title="No matches"
        description={q ? `Nothing found for "${q}".` : 'Nothing matches this filter.'}
      />
    ) : (
      <EmptyState {...empty} />
    )
  } else {
    content = (
      <>
        {data.items.map((email) => (
          <EmailRow key={email.id} email={email} />
        ))}
        <Pagination page={page} limit={data.limit} total={data.total} onChange={setPage} />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ListToolbar
        search={search}
        onSearch={setSearch}
        onRefresh={() => void refetch()}
        refreshing={refreshing || loading}
        filters={FILTERS[type]}
        filter={filterId}
        onFilter={setFilterId}
      />
      <div className="flex-1 overflow-y-auto">{content}</div>
    </div>
  )
}
