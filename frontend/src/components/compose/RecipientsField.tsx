import { useRef, useState, type KeyboardEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { extractEmails, readLeadsFile } from '../../lib/parseLeads'
import { useToast } from '../../context/ToastContext'

const VISIBLE_CHIPS = 3

interface Props {
  emails: string[]
  onChange: (emails: string[]) => void
}

const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])]

export function RecipientsField({ emails, onChange }: Props) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  const commitDraft = () => {
    const found = extractEmails(draft)
    if (found.length) onChange(merge(emails, found))
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ' ', 'Tab'].includes(e.key) && draft.trim()) {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && !draft && emails.length) {
      onChange(emails.slice(0, -1))
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const found = await readLeadsFile(file)
      if (!found.length) {
        toast.error(`No email addresses found in ${file.name}`)
        return
      }
      onChange(merge(emails, found))
      setFileName(file.name)
      toast.success(`${found.length} email${found.length === 1 ? '' : 's'} detected in ${file.name}`)
    } catch {
      toast.error('Could not read that file')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const hidden = emails.length - VISIBLE_CHIPS

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {emails.slice(0, VISIBLE_CHIPS).map((email) => (
            <span key={email} className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700">
              {email}
              <button type="button" aria-label={`Remove ${email}`} onClick={() => onChange(emails.filter((e) => e !== email))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">+{hidden}</span>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commitDraft}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              const found = extractEmails(text)
              if (found.length > 1) {
                e.preventDefault()
                onChange(merge(emails, found))
              }
            }}
            placeholder={emails.length ? '' : 'recipient@example.com'}
            className="h-7 min-w-[10rem] flex-1 text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <Upload className="h-4 w-4" />
          Upload List
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>

      {emails.length > 0 && (
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
          <span>
            <span className="font-semibold text-gray-800">{emails.length}</span> email address{emails.length === 1 ? '' : 'es'} detected
            {fileName ? ` (from ${fileName})` : ''}
          </span>
          <button type="button" className="text-gray-400 underline hover:text-gray-600" onClick={() => { onChange([]); setFileName(null) }}>
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
