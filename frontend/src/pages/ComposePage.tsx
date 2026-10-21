import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, Send } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { useQuery } from '../hooks/useQuery'
import { useToast } from '../context/ToastContext'
import { useDashboard } from './DashboardLayout'
import { Button } from '../components/ui/Button'
import { IconButton } from '../components/ui/IconButton'
import { FormRow } from '../components/ui/FormRow'
import { Input } from '../components/ui/Input'
import { RecipientsField } from '../components/compose/RecipientsField'
import { SendLaterPopover } from '../components/compose/SendLaterPopover'

interface FormState {
  subject: string
  body: string
  emails: string[]
  delaySeconds: string
  hourlyLimit: string
}

type Errors = Partial<Record<keyof FormState, string>>

const initialState: FormState = { subject: '', body: '', emails: [], delaySeconds: '2', hourlyLimit: '50' }

function validate(f: FormState): Errors {
  const errors: Errors = {}
  if (!f.emails.length) errors.emails = 'Add at least one recipient or upload a list'
  if (!f.subject.trim()) errors.subject = 'Subject is required'
  if (!f.body.trim()) errors.body = 'Write something in the email body'
  const delay = Number(f.delaySeconds)
  if (!Number.isFinite(delay) || delay < 0) errors.delaySeconds = 'Delay must be 0 or more seconds'
  const limit = Number(f.hourlyLimit)
  if (!Number.isInteger(limit) || limit < 1) errors.hourlyLimit = 'Hourly limit must be at least 1'
  return errors
}

export function ComposePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { refreshStats } = useDashboard()
  const { data: senderData } = useQuery('senders', api.senders)

  const [form, setForm] = useState<FormState>(initialState)
  const [errors, setErrors] = useState<Errors>({})
  const [showLater, setShowLater] = useState(false)
  const [submitting, setSubmitting] = useState<'now' | 'later' | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const submit = async (startAt: Date, mode: 'now' | 'later') => {
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) {
      setShowLater(false)
      toast.error(Object.values(found)[0]!)
      return
    }

    setSubmitting(mode)
    try {
      const res = await api.schedule({
        subject: form.subject.trim(),
        body: form.body,
        emails: form.emails,
        startAt: startAt.toISOString(),
        delayMs: Math.round(Number(form.delaySeconds) * 1000),
        hourlyLimit: Number(form.hourlyLimit),
      })
      toast.success(`${res.scheduled} email${res.scheduled === 1 ? '' : 's'} scheduled`)
      void refreshStats()
      navigate('/dashboard/scheduled')
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const first = Object.entries(err.details).find(([, v]) => v?.length)
        toast.error(first ? `${first[0]}: ${first[1]![0]}` : err.message)
      } else {
        toast.error((err as Error).message)
      }
    } finally {
      setSubmitting(null)
    }
  }

  const senders = senderData?.senders ?? []

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="flex-1 text-lg font-semibold">Compose New Email</h1>

        <Button
          variant="ghost"
          className="hidden border border-gray-200 sm:inline-flex"
          icon={<Send className="h-4 w-4" />}
          loading={submitting === 'now'}
          disabled={submitting !== null}
          onClick={() => void submit(new Date(), 'now')}
        >
          Send Now
        </Button>
        <div className="relative">
          <Button
            variant="outline"
            rounded
            icon={<Clock className="h-4 w-4" />}
            disabled={submitting !== null}
            onClick={() => setShowLater((s) => !s)}
          >
            Send Later
          </Button>
          <SendLaterPopover
            open={showLater}
            onClose={() => setShowLater(false)}
            submitting={submitting === 'later'}
            onConfirm={(d) => void submit(d, 'later')}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <FormRow label="From">
            <span className="inline-flex items-center rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-700">
              {senders.length
                ? `${senders.length} Ethereal sender${senders.length === 1 ? '' : 's'} (rotated per email)`
                : 'Loading senders…'}
            </span>
          </FormRow>

          <FormRow label="To" error={errors.emails}>
            <RecipientsField emails={form.emails} onChange={(v) => set('emails', v)} />
          </FormRow>

          <FormRow label="Subject" error={errors.subject}>
            <input
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="Subject"
              className="h-8 w-full text-sm outline-none placeholder:text-gray-400"
            />
          </FormRow>

          <div className="flex flex-wrap items-start gap-x-10 gap-y-3 border-b border-gray-100 py-3">
            <label className="flex items-center gap-3 text-sm text-gray-500">
              Delay between 2 emails
              <Input
                type="number"
                min={0}
                step="0.5"
                value={form.delaySeconds}
                onChange={(e) => set('delaySeconds', e.target.value)}
                error={errors.delaySeconds}
                className="h-9 w-20 text-center"
              />
              <span className="text-xs">sec</span>
            </label>
            <label className="flex items-center gap-3 text-sm text-gray-500">
              Hourly Limit
              <Input
                type="number"
                min={1}
                value={form.hourlyLimit}
                onChange={(e) => set('hourlyLimit', e.target.value)}
                error={errors.hourlyLimit}
                className="h-9 w-20 text-center"
              />
            </label>
            {(errors.delaySeconds || errors.hourlyLimit) && (
              <p className="w-full text-xs text-red-500">{errors.delaySeconds ?? errors.hourlyLimit}</p>
            )}
          </div>

          <div className="mt-4">
            <textarea
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              placeholder="Type your reply..."
              rows={14}
              className={`w-full resize-y rounded-xl border bg-gray-50/60 p-4 text-sm outline-none focus:border-brand-500 focus:bg-white ${
                errors.body ? 'border-red-400' : 'border-gray-100'
              }`}
            />
            {errors.body && <p className="mt-1 text-xs text-red-500">{errors.body}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
