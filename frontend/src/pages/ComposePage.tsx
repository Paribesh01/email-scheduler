import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Clock, Paperclip } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { htmlToText } from '../lib/format'
import { useQuery } from '../hooks/useQuery'
import { useToast } from '../context/ToastContext'
import { useDashboard } from './DashboardLayout'
import { Button } from '../components/ui/Button'
import { IconButton } from '../components/ui/IconButton'
import { FormRow } from '../components/ui/FormRow'
import { Input } from '../components/ui/Input'
import { RecipientsField, type RecipientsFieldHandle } from '../components/compose/RecipientsField'
import { SendLaterPopover } from '../components/compose/SendLaterPopover'
import { RichTextEditor } from '../components/compose/RichTextEditor'

interface FormState {
  senderId: string
  subject: string
  body: string
  emails: string[]
  delaySeconds: string
  hourlyLimit: string
}

type Errors = Partial<Record<keyof FormState, string>>

const ROTATE = ''
const initialState: FormState = {
  senderId: ROTATE,
  subject: '',
  body: '',
  emails: [],
  delaySeconds: '',
  hourlyLimit: '',
}

function validate(f: FormState): Errors {
  const errors: Errors = {}
  if (!f.emails.length) errors.emails = 'Add at least one recipient or upload a list'
  if (!f.subject.trim()) errors.subject = 'Subject is required'
  if (!htmlToText(f.body).trim()) errors.body = 'Write something in the email body'
  const delay = Number(f.delaySeconds || 0)
  if (!Number.isFinite(delay) || delay < 0) errors.delaySeconds = 'Delay must be 0 or more seconds'
  const limit = Number(f.hourlyLimit)
  if (!f.hourlyLimit || !Number.isInteger(limit) || limit < 1) errors.hourlyLimit = 'Set an hourly limit of at least 1'
  return errors
}

export function ComposePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { refreshStats } = useDashboard()
  const { data: senderData } = useQuery('senders', api.senders)
  const recipientsRef = useRef<RecipientsFieldHandle>(null)

  const [form, setForm] = useState<FormState>(initialState)
  const [errors, setErrors] = useState<Errors>({})
  const [showLater, setShowLater] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const submit = async (startAt: Date) => {
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) {
      setShowLater(false)
      toast.error(Object.values(found)[0]!)
      return
    }

    setSubmitting(true)
    try {
      const res = await api.schedule({
        subject: form.subject.trim(),
        body: form.body,
        emails: form.emails,
        startAt: startAt.toISOString(),
        delayMs: Math.round(Number(form.delaySeconds || 0) * 1000),
        hourlyLimit: Number(form.hourlyLimit),
        senderId: form.senderId || undefined,
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
      setSubmitting(false)
    }
  }

  const senders = senderData?.senders ?? []

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-6 py-4">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="flex-1 text-lg font-semibold">Compose New Email</h1>

        <IconButton label="Upload list" onClick={() => recipientsRef.current?.openFilePicker()}>
          <Paperclip className="h-4 w-4" />
        </IconButton>
        <div className="relative flex items-center gap-2">
          <IconButton label="Schedule" onClick={() => setShowLater((s) => !s)}>
            <Clock className="h-4 w-4" />
          </IconButton>
          <Button variant="outline" rounded size="sm" className="h-9 px-5" disabled={submitting} onClick={() => setShowLater((s) => !s)}>
            Send Later
          </Button>
          <SendLaterPopover
            open={showLater}
            onClose={() => setShowLater(false)}
            submitting={submitting}
            onConfirm={(d) => void submit(d)}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 pb-8">
          <FormRow label="From">
            <label className="relative inline-flex items-center">
              <select
                value={form.senderId}
                onChange={(e) => set('senderId', e.target.value)}
                className="h-8 appearance-none rounded-lg bg-gray-50 py-1 pr-8 pl-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-100"
                aria-label="Sender"
              >
                <option value={ROTATE}>
                  {senders.length ? `Rotate across ${senders.length} senders` : 'Loading senders…'}
                </option>
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-gray-400" />
            </label>
          </FormRow>

          <FormRow label="To" error={errors.emails}>
            <RecipientsField ref={recipientsRef} emails={form.emails} onChange={(v) => set('emails', v)} />
          </FormRow>

          <FormRow label="Subject" error={errors.subject}>
            <input
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="Subject"
              className="h-8 w-full text-sm outline-none placeholder:text-gray-400"
            />
          </FormRow>

          <div className="flex flex-wrap items-center gap-x-10 gap-y-3 py-4">
            <label className="flex items-center gap-3 text-sm whitespace-nowrap text-gray-700">
              Delay between 2 emails
              <Input
                type="number"
                min={0}
                step="0.5"
                placeholder="00"
                title="Seconds between two emails"
                value={form.delaySeconds}
                onChange={(e) => set('delaySeconds', e.target.value)}
                error={errors.delaySeconds}
                className="h-9 w-16 text-center"
              />
            </label>
            <label className="flex items-center gap-3 text-sm whitespace-nowrap text-gray-700">
              Hourly Limit
              <Input
                type="number"
                min={1}
                placeholder="00"
                title="Max emails from this batch per hour"
                value={form.hourlyLimit}
                onChange={(e) => set('hourlyLimit', e.target.value)}
                error={errors.hourlyLimit}
                className="h-9 w-16 text-center"
              />
            </label>
            {(errors.delaySeconds || errors.hourlyLimit) && (
              <p className="w-full text-xs text-red-500">{errors.delaySeconds ?? errors.hourlyLimit}</p>
            )}
          </div>

          <RichTextEditor value={form.body} onChange={(v) => set('body', v)} error={Boolean(errors.body)} />
          {errors.body && <p className="mt-1 text-xs text-red-500">{errors.body}</p>}
        </div>
      </div>
    </div>
  )
}
