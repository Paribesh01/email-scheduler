const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "Tue 9:15:30 AM" style used in the list pills */
export function formatPillDate(iso: string) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  if (sameDay(d, new Date())) return `Today ${time}`
  const day = d.toLocaleDateString([], { weekday: 'short' })
  const diffDays = Math.abs(d.getTime() - Date.now()) / 86_400_000
  return diffDays < 6 ? `${day} ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** value for <input type="datetime-local"> in the user's timezone */
export function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function preview(text: string, max = 90) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}
