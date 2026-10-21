import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { EmailTab } from '../../types/api'
import { useEmails } from '../../hooks/useEmails'
import { useDebounce } from '../../hooks/useDebounce'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { EmailRow } from './EmailRow'
import { EmailListSkeleton } from './EmailListSkeleton'
import { ListToolbar } from './ListToolbar'
import { Pagination } from './Pagination'

interface Props {
  type: EmailTab
  empty: { icon: ReactNode; title: string; description: string; action?: ReactNode }
}

/** shared by the Scheduled and Sent tabs, only the data source + empty copy differ */
export function EmailList({ type, empty }: Props) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounce(search.trim(), 300)
  const { data, error, loading, refreshing, refetch } = useEmails(type, q, page)

  useEffect(() => setPage(1), [q, type])

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
    content = q ? (
      <EmptyState icon={empty.icon} title="No matches" description={`Nothing found for "${q}".`} />
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
      <ListToolbar search={search} onSearch={setSearch} onRefresh={() => void refetch()} refreshing={refreshing || loading} />
      <div className="flex-1 overflow-y-auto">{content}</div>
    </div>
  )
}
