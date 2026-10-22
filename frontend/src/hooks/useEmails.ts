import { api } from '../lib/api'
import type { EmailFilter, EmailTab } from '../types/api'
import { useQuery } from './useQuery'

const POLL_MS = 5000

export function useEmails(type: EmailTab, q: string, page: number, filter: EmailFilter = {}) {
  const key = `${type}|${q}|${page}|${filter.status ?? ''}|${filter.rateLimited ?? ''}`
  return useQuery(key, () => api.listEmails({ type, q: q || undefined, page, ...filter }), { pollMs: POLL_MS })
}

export function useStats() {
  return useQuery('stats', api.stats, { pollMs: POLL_MS })
}
