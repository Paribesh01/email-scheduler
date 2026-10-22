export type EmailStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED'
export type EmailTab = 'scheduled' | 'sent'

export interface EmailFilter {
  status?: EmailStatus
  rateLimited?: boolean
}

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

export interface EmailItem {
  id: string
  campaignId: string
  toEmail: string
  subject: string
  body: string
  status: EmailStatus
  scheduledAt: string
  sentAt: string | null
  previewUrl: string | null
  error: string | null
  rateLimited: boolean
  sender: { email: string; name: string }
}

export interface EmailDetail extends EmailItem {
  attempts: number
  messageId: string | null
  createdAt: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
  source: 'db' | 'elasticsearch'
}

export interface EmailStats {
  scheduled: number
  sent: number
  failed: number
}

export interface Sender {
  id: string
  email: string
  name: string
}

export interface ScheduleRequest {
  subject: string
  body: string
  emails: string[]
  startAt: string
  delayMs: number
  hourlyLimit: number
  senderId?: string
}

export interface ScheduleResponse {
  campaignId: string
  scheduled: number
  startAt: string
}

export interface SlackStatus {
  configured: boolean
  connected: boolean
  connection: { teamName: string | null; channel: string | null; createdAt: string } | null
}

export interface ApiErrorBody {
  error: string
  details?: Record<string, string[] | undefined>
}
