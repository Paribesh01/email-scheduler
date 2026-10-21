import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

export const Input = forwardRef<HTMLInputElement, Props>(({ className, error, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 rounded-lg border bg-white px-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
      error ? 'border-red-400' : 'border-gray-200',
      className,
    )}
    {...rest}
  />
))
Input.displayName = 'Input'
