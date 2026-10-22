import { useEffect, useRef, useState } from 'react'
import { toLocalInputValue } from '../../lib/format'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (date: Date) => void
  submitting: boolean
}

function tomorrowAt(hours: number | null) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  if (hours !== null) d.setHours(hours, 0, 0, 0)
  else d.setSeconds(0, 0)
  return d
}

const presets = [
  { label: 'Tomorrow', make: () => tomorrowAt(null) },
  { label: 'Tomorrow, 10:00 AM', make: () => tomorrowAt(10) },
  { label: 'Tomorrow, 11:00 AM', make: () => tomorrowAt(11) },
  { label: 'Tomorrow, 3:00 PM', make: () => tomorrowAt(15) },
]

export function SendLaterPopover({ open, onClose, onConfirm, submitting }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open) return
    setValue(toLocalInputValue(new Date()))
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, onClose])

  if (!open) return null

  const selected = value ? new Date(value) : null

  return (
    <div ref={ref} className="absolute top-full right-0 z-30 mt-2 w-80 rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
      <h3 className="mb-3 text-sm font-semibold">Send Later</h3>

      <label className="mb-1 block text-xs text-gray-500">Pick date &amp; time</label>
      <input
        type="datetime-local"
        value={value}
        min={toLocalInputValue(new Date())}
        onChange={(e) => setValue(e.target.value)}
        className="mb-3 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-500"
        aria-label="Pick date and time"
      />

      <div className="mb-4 flex flex-col">
        {presets.map((p) => {
          const v = toLocalInputValue(p.make())
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setValue(v)}
              className={cn(
                'rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50',
                v === value ? 'font-medium text-brand-700' : 'text-gray-700',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          rounded
          loading={submitting}
          disabled={!selected || Number.isNaN(selected.getTime())}
          onClick={() => selected && onConfirm(selected)}
        >
          Done
        </Button>
      </div>
    </div>
  )
}
