import { useState, useEffect, useCallback } from 'react'
import {
  Badge,
  Button,
  Input,
  LayerCard,
  Banner,
} from '@cloudflare/kumo'
import {
  PlayCircleIcon,
  StopCircleIcon,
  UsersIcon,
  CubeIcon,
  ClockIcon,
  XIcon,
  KeyIcon,
} from '@phosphor-icons/react'
import './App.css'

const STATUS_MAP: Record<number, { label: string; badge: 'success' | 'error' | 'warning' | 'neutral' }> = {
  0: { label: 'Offline', badge: 'error' },
  1: { label: 'Online', badge: 'success' },
  10: { label: 'Preparing…', badge: 'warning' },
  2: { label: 'Starting…', badge: 'warning' },
  3: { label: 'Stopping…', badge: 'warning' },
  5: { label: 'Saving…', badge: 'warning' },
  6: { label: 'Loading…', badge: 'neutral' },
}

type ServerInfo = {
  status: number
  name: string
  ip: string
  dynip: string
  port: number
  address: string
  software: string
  version: string
  players: number
  maxPlayers: number
  playerList: string[]
  motd: string
  queue: { position: number; count: number; time: string }
}

const LS_SESSION = 'aternos_session'
const LS_SERVER = 'aternos_server'

function getSession() { return localStorage.getItem(LS_SESSION) || '' }
function getServerID() { return localStorage.getItem(LS_SERVER) || '' }

async function api(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {}
  const s = getSession()
  const sid = getServerID()
  if (s) headers['X-Aternos-Session'] = s
  if (sid) headers['X-Aternos-Server'] = sid
  const res = await fetch(path, { ...opts, headers: { ...headers, ...opts.headers as Record<string, string> } })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [serverID, setServerID] = useState(getServerID())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleLogin = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (data.session) {
        localStorage.setItem(LS_SESSION, data.session)
        if (data.server) localStorage.setItem(LS_SERVER, data.server)
        else if (serverID) localStorage.setItem(LS_SERVER, serverID)
        onLogin()
      } else {
        throw new Error(data.error || 'Login failed')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-kumo-page p-4">
      <LayerCard className="w-full max-w-sm">
        <LayerCard.Secondary>
          <div className="flex items-center gap-2">
            <KeyIcon size={18} weight="duotone" className="text-kumo-subtle" />
            <span className="text-sm font-medium text-kumo-default">Login to Aternos</span>
          </div>
        </LayerCard.Secondary>
        <LayerCard.Primary>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); handleLogin() }}>
            <Input
              label="Aternos username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="secondary account"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              required
            />
            <Input
              label="Server ID (optional — from Aternos URL)"
              value={serverID}
              onChange={(e) => setServerID(e.target.value)}
              placeholder="e.g. PTuwDuPrarIFkv04"
            />
            {error && (
              <Banner
                variant="error"
                icon={<ClockIcon weight="fill" />}
                title="Error"
                description={error}
                action={
                  <Button size="sm" variant="ghost" shape="square" icon={XIcon} aria-label="Dismiss" onClick={() => setError('')} />
                }
              />
            )}
            <Button className="w-full" type="submit" loading={busy}>
              Login
            </Button>
          </form>
        </LayerCard.Primary>
      </LayerCard>
    </div>
  )
}

function ServerView({ onLogout }: { onLogout: () => void }) {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<'start' | 'stop' | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api('/api/status')
      setInfo(data)
      setError('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleAction = async (action: 'start' | 'stop') => {
    setActionLoading(action)
    setError('')
    try {
      await api(`/api/${action}`, { method: 'POST' })
      await new Promise((r) => setTimeout(r, 2000))
      await fetchStatus()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to ${action} server`)
    } finally {
      setActionLoading(null)
    }
  }

  const st = info ? STATUS_MAP[info.status] ?? { label: 'Unknown', badge: 'neutral' as const } : null
  const isTransitioning = info && ![0, 1].includes(info.status)
  const q = info?.queue

  return (
    <div className="flex min-h-dvh items-center justify-center bg-kumo-page p-4">
      <LayerCard className="w-full max-w-md">
        <LayerCard.Secondary>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CubeIcon size={18} weight="duotone" className="text-kumo-subtle" />
              <span className="text-sm font-medium text-kumo-default">{info?.name || 'Minecraft Server'}</span>
            </div>
            {st && (
              <Badge variant={st.badge} appearance="dot">
                {st.label}
              </Badge>
            )}
          </div>
        </LayerCard.Secondary>

        <LayerCard.Primary>
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-kumo-subtle">
              <ClockIcon size={18} className="mr-2 animate-spin" weight="bold" />
              Loading…
            </div>
          )}

          {error && !loading && (
            <Banner
              variant="error"
              icon={<ClockIcon weight="fill" />}
              title="Error"
              description={error}
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" shape="square" icon={XIcon} aria-label="Dismiss" onClick={() => setError('')} />
                  {error.toLowerCase().includes('unauthenticated') && (
                    <Button size="sm" variant="secondary" onClick={onLogout}>
                      Re-login
                    </Button>
                  )}
                </div>
              }
            />
          )}

          {info && !loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <span className="text-kumo-subtle">IP</span>
                <span className="truncate text-right font-mono">{info.dynip || info.ip || '-'}</span>
                <span className="text-kumo-subtle">Port</span>
                <span className="text-right font-mono">{info.port || '25565'}</span>
                <span className="text-kumo-subtle">Address</span>
                <span className="truncate text-right font-mono">{info.address || '-'}</span>
                <span className="text-kumo-subtle">Version</span>
                <span className="text-right">{info.software ? `${info.software} ${info.version}` : info.version || '-'}</span>
                <span className="text-kumo-subtle">Players</span>
                <span className="text-right">{info.players} / {info.maxPlayers}</span>
              </div>

              {info.playerList && info.playerList.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <UsersIcon size={14} className="text-kumo-subtle" weight="duotone" />
                  {info.playerList.map((p) => (
                    <Badge key={p} variant="secondary">{p}</Badge>
                  ))}
                </div>
              )}

              {q && q.count > 0 && (
                <div className="rounded-lg bg-kumo-fill px-3 py-2 text-sm">
                  <div className="flex items-center justify-between text-kumo-subtle">
                    <span>Queue</span>
                    <span>{q.position} / {q.count}</span>
                  </div>
                  {q.time && <div className="text-xs text-kumo-subtle">{q.time}</div>}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  variant="primary"
                  className="flex-1"
                  icon={PlayCircleIcon}
                  loading={actionLoading === 'start'}
                  disabled={info.status !== 0 || actionLoading !== null}
                  onClick={() => handleAction('start')}
                >
                  Start
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  icon={StopCircleIcon}
                  loading={actionLoading === 'stop'}
                  disabled={info.status !== 1 || actionLoading !== null}
                  onClick={() => handleAction('stop')}
                >
                  Stop
                </Button>
              </div>

              {isTransitioning && (
                <div className="rounded-lg bg-kumo-fill px-3 py-2 text-center text-xs text-kumo-subtle">
                  Server is {st?.label.toLowerCase()}. Please wait…
                </div>
              )}

              <div className="flex justify-center pt-2">
                <Button size="sm" variant="ghost" icon={KeyIcon} onClick={onLogout}>
                  Switch account
                </Button>
              </div>
            </div>
          )}
        </LayerCard.Primary>
      </LayerCard>
    </div>
  )
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getSession())

  if (!loggedIn) {
    return <LoginView onLogin={() => setLoggedIn(true)} />
  }

  return (
    <ServerView onLogout={() => {
      localStorage.removeItem(LS_SESSION)
      setLoggedIn(false)
    }} />
  )
}
