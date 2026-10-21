import type { ReactNode } from 'react'

/** label-on-the-left row used throughout the compose screen */
export function FormRow({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="border-b border-gray-100 py-3">
      <div className="flex items-center gap-4">
        <span className="w-16 shrink-0 text-sm text-gray-500">{label}</span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {error && <p className="mt-1 pl-20 text-xs text-red-500">{error}</p>}
    </div>
  )
}
