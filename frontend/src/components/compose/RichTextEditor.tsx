import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bold,
  Italic,
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  AlignLeft,
  AlignCenter,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { htmlToText } from '../../lib/format'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  error?: boolean
}

type Command = { cmd: string; arg?: string; icon: ReactNode; label: string; track?: boolean }

// execCommand is deprecated on paper but still the simplest dependency-free
// way to get a basic formatting toolbar on a contentEditable
const groups: Command[][] = [
  [
    { cmd: 'undo', icon: <Undo2 className="h-4 w-4" />, label: 'Undo' },
    { cmd: 'redo', icon: <Redo2 className="h-4 w-4" />, label: 'Redo' },
  ],
  [{ cmd: 'formatBlock', arg: 'h3', icon: <Type className="h-4 w-4" />, label: 'Heading' }],
  [
    { cmd: 'bold', icon: <Bold className="h-4 w-4" />, label: 'Bold', track: true },
    { cmd: 'italic', icon: <Italic className="h-4 w-4" />, label: 'Italic', track: true },
    { cmd: 'underline', icon: <Underline className="h-4 w-4" />, label: 'Underline', track: true },
  ],
  [
    { cmd: 'justifyLeft', icon: <AlignLeft className="h-4 w-4" />, label: 'Align left' },
    { cmd: 'justifyCenter', icon: <AlignCenter className="h-4 w-4" />, label: 'Align center' },
  ],
  [
    { cmd: 'insertUnorderedList', icon: <List className="h-4 w-4" />, label: 'Bullet list', track: true },
    { cmd: 'insertOrderedList', icon: <ListOrdered className="h-4 w-4" />, label: 'Numbered list', track: true },
    { cmd: 'outdent', icon: <IndentDecrease className="h-4 w-4" />, label: 'Outdent' },
    { cmd: 'indent', icon: <IndentIncrease className="h-4 w-4" />, label: 'Indent' },
    { cmd: 'formatBlock', arg: 'blockquote', icon: <Quote className="h-4 w-4" />, label: 'Quote' },
  ],
  [{ cmd: 'strikeThrough', icon: <Strikethrough className="h-4 w-4" />, label: 'Strikethrough', track: true }],
]

export function RichTextEditor({ value, onChange, placeholder = 'Type Your Reply...', error }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<Record<string, boolean>>({})

  // only push value into the DOM when it changed from outside (e.g. reset),
  // otherwise the caret would jump on every keystroke
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value
  }, [value])

  const refreshActive = useCallback(() => {
    const next: Record<string, boolean> = {}
    for (const c of groups.flat()) if (c.track) next[c.cmd] = document.queryCommandState(c.cmd)
    setActive(next)
  }, [])

  useEffect(() => {
    const onSel = () => {
      if (ref.current?.contains(document.getSelection()?.anchorNode ?? null)) refreshActive()
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [refreshActive])

  const run = (c: Command) => {
    ref.current?.focus()
    if (c.cmd === 'formatBlock') {
      // toggle back to a paragraph when the block already has that format
      const current = String(document.queryCommandValue('formatBlock')).toLowerCase()
      document.execCommand('formatBlock', false, current === c.arg ? 'p' : `<${c.arg}>`)
    } else {
      document.execCommand(c.cmd, false, c.arg)
    }
    onChange(ref.current?.innerHTML ?? '')
    refreshActive()
  }

  const isEmpty = htmlToText(value).trim() === '' && !/<(li|img)/i.test(value)

  return (
    <div className={cn('rounded-xl border bg-gray-50/70', error ? 'border-red-400' : 'border-gray-100')}>
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-100 px-3 py-2">
        {groups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5 pr-2 not-last:border-r not-last:border-gray-200">
            {group.map((c) => (
              <button
                key={c.label}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={c.track ? Boolean(active[c.cmd]) : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(c)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-gray-900',
                  active[c.cmd] && 'bg-white text-gray-900 shadow-sm',
                )}
              >
                {c.icon}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="relative">
        {isEmpty && <span className="pointer-events-none absolute top-4 left-4 text-sm text-gray-400">{placeholder}</span>}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label="Email body"
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          className="rich-content min-h-72 px-4 py-4 text-sm leading-relaxed outline-none"
        />
      </div>
    </div>
  )
}
