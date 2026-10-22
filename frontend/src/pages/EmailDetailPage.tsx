import { useNavigate, useParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { AlertTriangle, ArrowLeft, ChevronDown, ExternalLink, Gauge, Star } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { useQuery } from '../hooks/useQuery'
import { formatFullDate, formatShortDate, isHtml } from '../lib/format'
import { Avatar } from '../components/ui/Avatar'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { Spinner } from '../components/ui/Spinner'
import { StatusBadge } from '../components/ui/StatusBadge'
import { AttachmentTile } from '../components/ui/AttachmentTile'

export function EmailDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, error, loading } = useQuery(`email-${id}`, () => api.getEmail(id), { pollMs: 5000 })
  const email = data?.email

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{email?.subject ?? 'Email'}</h1>
        {email && <StatusBadge status={email.status} date={email.scheduledAt} />}
        <IconButton label="Star">
          <Star className="h-4 w-4" />
        </IconButton>
        {user && <Avatar name={user.name} src={user.avatarUrl} className="h-8 w-8" />}
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading && !email ? (
          <div className="flex justify-center py-20 text-brand-600">
            <Spinner className="h-7 w-7" />
          </div>
        ) : error && !email ? (
          <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Email not found" description={error.message} />
        ) : email ? (
          <div className="mx-auto max-w-4xl px-6 py-6">
            <div className="flex items-start gap-3">
              <Avatar name={email.sender.name} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {email.sender.name} <span className="font-normal text-gray-500">&lt;{email.sender.email}&gt;</span>
                </p>
                <p className="flex items-center gap-0.5 text-xs text-gray-500">
                  to {email.toEmail} <ChevronDown className="h-3 w-3" />
                </p>
              </div>
              <p className="text-xs whitespace-nowrap text-gray-500">
                {formatShortDate(email.sentAt ?? email.scheduledAt)}
              </p>
            </div>

            {email.rateLimited && email.status === 'SCHEDULED' && (
              <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <Gauge className="h-4 w-4" />
                The hourly limit was reached, so this email was moved to the next available hour.
              </p>
            )}
            {email.error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                Last error{email.status === 'FAILED' ? '' : ' (will retry)'}: {email.error}
              </p>
            )}

            {isHtml(email.body) ? (
              <div
                className="rich-content mt-6 text-sm leading-relaxed text-gray-800"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(email.body) }}
              />
            ) : (
              <div className="mt-6 text-sm leading-relaxed whitespace-pre-wrap text-gray-800">{email.body}</div>
            )}

            {email.attachments.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-4">
                {email.attachments.map((a) => {
                  const url = api.attachmentUrl(email.id, a.id)
                  return <AttachmentTile key={a.id} {...a} src={url} href={url} />
                })}
              </div>
            )}

            <dl className="mt-10 grid grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-gray-500">Attempts</dt>
                <dd className="mt-1 font-medium">{email.attempts}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="mt-1 font-medium">{formatFullDate(email.createdAt)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-gray-500">Message ID</dt>
                <dd className="mt-1 truncate font-mono font-medium">{email.messageId ?? '—'}</dd>
              </div>
            </dl>

            {email.previewUrl && (
              <a
                href={email.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Open in Ethereal <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
