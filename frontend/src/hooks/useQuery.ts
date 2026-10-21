import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** refetch silently on this interval (ms) */
  pollMs?: number
  enabled?: boolean
}

/**
 * Tiny fetch hook: loading for the first load / key change, silent refreshes
 * after that so polling doesn't flash spinners.
 */
export function useQuery<T>(key: string, fetcher: () => Promise<T>, { pollMs, enabled = true }: Options = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const keyRef = useRef(key)

  const run = useCallback(async (silent: boolean) => {
    const runKey = keyRef.current
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const result = await fetcherRef.current()
      if (runKey === keyRef.current) {
        setData(result)
        setError(null)
      }
    } catch (err) {
      if (runKey === keyRef.current) setError(err as Error)
    } finally {
      if (runKey === keyRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    keyRef.current = key
    void run(false)
  }, [key, enabled, run])

  useEffect(() => {
    if (!enabled || !pollMs) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void run(true)
    }, pollMs)
    return () => clearInterval(t)
  }, [pollMs, enabled, run])

  const refetch = useCallback(() => run(true), [run])
  return { data, error, loading, refreshing, refetch }
}
