import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { useQuery } from '../../hooks/useQuery'
import { useToast } from '../../context/ToastContext'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'

const SLACK_RESULT_MESSAGES: Record<string, [ok: boolean, msg: string]> = {
  connected: [true, 'Slack connected. Rate limit alerts will show up there.'],
  denied: [false, 'Slack authorization was cancelled.'],
  invalid: [false, 'Slack connection link expired, please try again.'],
  error: [false, 'Could not connect Slack. Please try again.'],
}

function SlackLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#E01E5A" d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5Z" />
      <path fill="#36C5F0" d="M9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5Z" />
      <path fill="#2EB67D" d="M19 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5Z" />
      <path fill="#ECB22E" d="M15 19a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5Z" />
    </svg>
  )
}

export function SlackConnect() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const { data, loading, refetch } = useQuery('slack-status', api.slackStatus)
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'test' | null>(null)

  // result of the oauth round trip comes back as ?slack=...
  useEffect(() => {
    const result = params.get('slack')
    if (!result) return
    const entry = SLACK_RESULT_MESSAGES[result]
    if (entry) (entry[0] ? toast.success : toast.error)(entry[1])
    params.delete('slack')
    setParams(params, { replace: true })
    void refetch()
  }, [params, setParams, toast, refetch])

  const connect = async () => {
    setBusy('connect')
    try {
      const { url } = await api.slackConnectUrl()
      window.location.href = url
    } catch (err) {
      toast.error((err as Error).message)
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy('disconnect')
    try {
      await api.slackDisconnect()
      toast.info('Slack disconnected')
      await refetch()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const sendTest = async () => {
    setBusy('test')
    try {
      await api.slackTest()
      toast.success('Test message sent to Slack')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <SlackLogo />
        Slack alerts
        {loading && <Spinner className="ml-auto h-3.5 w-3.5 text-gray-400" />}
      </div>

      {data?.connected ? (
        <>
          <p className="mb-2 truncate text-xs text-gray-500">
            Connected to <span className="font-medium text-gray-700">{data.connection?.channel ?? 'Slack'}</span>
            {data.connection?.teamName ? ` · ${data.connection.teamName}` : ''}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="flex-1 border border-gray-200" loading={busy === 'test'} onClick={sendTest}>
              Test
            </Button>
            <Button size="sm" variant="danger" className="flex-1" loading={busy === 'disconnect'} onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-500">Get notified when a sender hits its hourly limit.</p>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            loading={busy === 'connect'}
            disabled={data ? !data.configured : true}
            title={data && !data.configured ? 'Slack app not configured on the server' : undefined}
            onClick={connect}
          >
            Connect Slack
          </Button>
        </>
      )}
    </div>
  )
}
