/** "Tue 9:15:30 AM" style used in the list pills */
export function formatPillDate(iso: string) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
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

/** "Nov 5, 10:23 AM" like the email detail header in the design */
export function formatShortDate(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const looksLikeHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s)

/** bodies coming from the rich text editor are HTML */
export function htmlToText(body: string) {
  if (!looksLikeHtml(body)) return body
  const doc = new DOMParser().parseFromString(body.replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, '$& '), 'text/html')
  return doc.body.textContent ?? ''
}

export function isHtml(body: string) {
  return looksLikeHtml(body)
}

export function preview(text: string, max = 90) {
  const flat = htmlToText(text).replace(/\s+/g, ' ').trim()
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
