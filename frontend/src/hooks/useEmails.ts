import { api } from '../lib/api'
import type { EmailTab } from '../types/api'
import { useQuery } from './useQuery'

const POLL_MS = 5000

export function useEmails(type: EmailTab, q: string, page: number) {
  return useQuery(`${type}|${q}|${page}`, () => api.listEmails({ type, q: q || undefined, page }), { pollMs: POLL_MS })
}

export function useStats() {
  return useQuery('stats', api.stats, { pollMs: POLL_MS })
}
