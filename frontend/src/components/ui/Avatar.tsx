import { useState } from 'react'
import { cn } from '../../lib/cn'
import { initials } from '../../lib/format'

interface Props {
  name: string
  src?: string | null
  className?: string
}

export function Avatar({ name, src, className }: Props) {
  const [broken, setBroken] = useState(false)
  const base = cn('h-10 w-10 shrink-0 rounded-full', className)

  if (src && !broken) {
    return <img src={src} alt={name} referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn(base, 'object-cover')} />
  }
  return (
    <span className={cn(base, 'flex items-center justify-center bg-brand-100 text-sm font-semibold text-brand-700')}>
      {initials(name) || '?'}
    </span>
  )
}
