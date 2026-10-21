export function EmailListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading emails">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 border-b border-gray-100 px-6 py-5">
          <div className="h-3 w-48 rounded bg-gray-200" />
          <div className="h-5 w-28 rounded-full bg-gray-100" />
          <div className="h-3 flex-1 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  )
}
