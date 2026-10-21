import { Spinner } from '../ui/Spinner'

export function FullPageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-brand-600">
      <Spinner className="h-8 w-8" />
    </div>
  )
}
