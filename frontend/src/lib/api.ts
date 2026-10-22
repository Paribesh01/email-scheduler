import type {
  ApiErrorBody,
  EmailDetail,
  EmailItem,
  EmailStats,
  EmailTab,
  Paginated,
  ScheduleRequest,
  ScheduleResponse,
  Sender,
  SlackStatus,
  User,
} from '../types/api'

// empty in dev: vite proxies /api to the backend
export const API_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  details?: ApiErrorBody['details']

  constructor(status: number, body: ApiErrorBody) {
    super(body.error || 'Request failed')
    this.status = status
    this.details = body.details
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const body = await res.json().catch(() => ({ error: res.statusText }))
  if (!res.ok) throw new ApiError(res.status, body as ApiErrorBody)
  return body as T
}

export const api = {
  googleLoginUrl: () => `${API_URL}/api/auth/google`,
  queueDashboardUrl: () => `${API_URL}/admin/queues`,

  me: () => request<{ user: User }>('/api/auth/me'),
  emailLogin: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/email', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  listEmails: (params: { type: EmailTab; q?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams({ type: params.type, page: String(params.page ?? 1), limit: String(params.limit ?? 20) })
    if (params.q) qs.set('q', params.q)
    return request<Paginated<EmailItem>>(`/api/emails?${qs}`)
  },
  getEmail: (id: string) => request<{ email: EmailDetail }>(`/api/emails/${id}`),
  stats: () => request<EmailStats>('/api/emails/stats'),
  schedule: (data: ScheduleRequest) =>
    request<ScheduleResponse>('/api/emails/schedule', { method: 'POST', body: JSON.stringify(data) }),
  senders: () => request<{ senders: Sender[] }>('/api/senders'),

  slackStatus: () => request<SlackStatus>('/api/slack/status'),
  slackConnectUrl: () => request<{ url: string }>('/api/slack/connect-url'),
  slackTest: () => request<{ ok: boolean }>('/api/slack/test', { method: 'POST' }),
  slackDisconnect: () => request<{ ok: boolean }>('/api/slack', { method: 'DELETE' }),
}
