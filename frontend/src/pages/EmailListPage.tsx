import { useNavigate } from 'react-router-dom'
import { Clock, Send } from 'lucide-react'
import type { EmailTab } from '../types/api'
import { EmailList } from '../components/emails/EmailList'
import { Button } from '../components/ui/Button'

export function EmailListPage({ type }: { type: EmailTab }) {
  const navigate = useNavigate()
  const compose = <Button onClick={() => navigate('/compose')}>Compose New Email</Button>

  return type === 'scheduled' ? (
    <EmailList
      key="scheduled"
      type="scheduled"
      empty={{
        icon: <Clock className="h-6 w-6" />,
        title: 'No scheduled emails',
        description: 'Emails you schedule will wait here until it is their turn to go out.',
        action: compose,
      }}
    />
  ) : (
    <EmailList
      key="sent"
      type="sent"
      empty={{
        icon: <Send className="h-6 w-6" />,
        title: 'No sent emails yet',
        description: 'Once scheduled emails are delivered (or fail), they show up here.',
        action: compose,
      }}
    />
  )
}
