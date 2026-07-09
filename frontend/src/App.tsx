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
  CheckCircleIcon,
  XCircleIcon,
  ArrowsClockwiseIcon,
  SignOutIcon,
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

type LoginResponse = {
  status: string
  session: string
  servers?: { id: string; name: string }[]
  server?: string
  error?: string
}

const LS_SESSION = 'aternos_session'
const LS_SERVER = 'aternos_server'
const LS_SERVERS = 'aternos_servers'

function getSession() { return localStorage.getItem(LS_SESSION) || '' }
function getServerID() { return localStorage.getItem(LS_SERVER) || '' }
function getServers(): { id: string; name: string }[] {
  try { return JSON.parse(localStorage.getItem(LS_SERVERS) || '[]') } catch { return [] }
}

async function api(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {}
  const s = getSession()
  const sid = getServerID()
  if (s) headers['X-Aternos-Session'] = s
  if (sid) headers['X-Aternos-Server'] = sid
  const res = await fetch(path, { ...opts, headers: { ...headers, ...opts.headers as Record<string, string> } })
  const text = await res.text()
  if (!res.ok) {
    try { const j = JSON.parse(text); throw new Error(j.error || text) } catch { throw new Error(text) }
  }
  return JSON.parse(text)
}

function LoginView({ onLoginSuccess }: { onLoginSuccess: (data: LoginResponse) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
        onLoginSuccess(data)
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
            <CubeIcon size={18} weight="duotone" className="text-kumo-subtle" />
            <span className="text-sm font-medium text-kumo-default">Login to Aternos</span>
          </div>
        </LayerCard.Secondary>
        <LayerCard.Primary>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); handleLogin() }}>
            <Input
              label="Aternos username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
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

function ServerPicker({ servers, onSelect, onLogout }: { servers: { id: string; name: string }[]; onSelect: (id: string) => void; onLogout: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-kumo-page p-4">
      <LayerCard className="w-full max-w-sm">
        <LayerCard.Secondary>
          <div className="flex items-center gap-2">
            <CubeIcon size={18} weight="duotone" className="text-kumo-subtle" />
            <span className="text-sm font-medium text-kumo-default">Select Server</span>
          </div>
        </LayerCard.Secondary>
        <LayerCard.Primary>
          <div className="space-y-2">
            {servers.map((srv) => (
              <Button key={srv.id} className="w-full justify-center" variant="secondary" onClick={() => onSelect(srv.id)}>
                <CubeIcon size={16} className="mr-2" />
                {srv.name}
              </Button>
            ))}
          </div>
          <div className="flex justify-center pt-4">
            <Button size="sm" variant="ghost" icon={SignOutIcon} onClick={onLogout}>
              Logout
            </Button>
          </div>
        </LayerCard.Primary>
      </LayerCard>
    </div>
  )
}

function ServerView({ onLogout, onPickServer }: { onLogout: () => void; onPickServer: () => void }) {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
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

  const doAction = async (action: string) => {
    setActionLoading(action)
    setError('')
    try {
      await api(`/api/${action}`, { method: 'POST' })
      if (action === 'start' || action === 'confirm') {
        await new Promise((r) => setTimeout(r, 2000))
      }
      await fetchStatus()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`)
    } finally {
      setActionLoading(null)
    }
  }

  const st = info ? STATUS_MAP[info.status] ?? { label: 'Unknown', badge: 'neutral' as const } : null
  const q = info?.queue
  const inQueue = info?.status === 10 && q && q.count > 0
  const needsConfirm = info?.status === 10 && (!q || q.count === 0)

  return (
    <div className="flex min-h-dvh items-center justify-center bg-kumo-page p-4">
      <LayerCard className="w-full max-w-md">
        <LayerCard.Secondary>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CubeIcon size={18} weight="duotone" className="text-kumo-subtle" />
              <span className="text-sm font-medium text-kumo-default">{info?.name || 'Minecraft Server'}</span>
            </div>
            <div className="flex items-center gap-2">
              {st && (
                <Badge variant={st.badge} appearance="dot">
                  {st.label}
                </Badge>
              )}
              <Button size="sm" variant="ghost" shape="square" aria-label="Refresh" icon={ArrowsClockwiseIcon} onClick={fetchStatus} loading={loading}>
              </Button>
            </div>
          </div>
        </LayerCard.Secondary>

        <LayerCard.Primary>
          {loading && !info && (
            <div className="flex items-center justify-center py-8 text-sm text-kumo-subtle">
              <ClockIcon size={18} className="mr-2 animate-spin" weight="bold" />
              Loading…
            </div>
          )}

          {error && (
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

          {info && (
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

              {inQueue && q && (
                <div className="rounded-lg bg-kumo-fill px-4 py-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-kumo-subtle">Queue position</span>
                    <span className="font-semibold">{q.position} / {q.count}</span>
                  </div>
                  {q.time && <div className="text-xs text-kumo-subtle">Est. time: {q.time}</div>}
                </div>
              )}

              {needsConfirm && (
                <Banner
                  variant="alert"
                  icon={<ClockIcon weight="fill" />}
                  title="Ready to start"
                  description="Server is ready. Confirm to start."
                />
              )}

              <div className="flex flex-col gap-2 pt-1">
                <div className="flex gap-2">
                  {info.status === 0 && (
                    <Button
                      variant="primary"
                      className="flex-1 justify-center py-2"
                      icon={PlayCircleIcon}
                      loading={actionLoading === 'start'}
                      onClick={() => doAction('start')}
                    >
                      Start
                    </Button>
                  )}
                  {info.status === 1 && (
                    <Button
                      variant="destructive"
                      className="flex-1 justify-center py-2"
                      icon={StopCircleIcon}
                      loading={actionLoading === 'stop'}
                      onClick={() => doAction('stop')}
                    >
                      Stop
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {needsConfirm && (
                    <Button
                      variant="primary"
                      className="flex-1 justify-center py-2"
                      icon={CheckCircleIcon}
                      loading={actionLoading === 'confirm'}
                      onClick={() => doAction('confirm')}
                    >
                      Confirm
                    </Button>
                  )}
                  {inQueue && (
                    <Button
                      variant="destructive"
                      className="flex-1 justify-center py-2"
                      icon={XCircleIcon}
                      loading={actionLoading === 'cancel-queue'}
                      onClick={() => doAction('cancel-queue')}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              <hr className="border-kumo-line" />

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1 justify-center"
                  icon={CubeIcon}
                  onClick={onPickServer}
                >
                  Change server
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 justify-center"
                  icon={SignOutIcon}
                  onClick={onLogout}
                >
                  Logout
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
  const savedServers = getServers()
  const [step, setStep] = useState<'login' | 'picker' | 'server'>(
    getSession() && getServerID() ? 'server' : getSession() && savedServers.length > 0 ? 'picker' : getSession() ? 'server' : 'login'
  )
  const [pendingServers, setPendingServers] = useState<{ id: string; name: string }[]>(savedServers)

  const handleLoginSuccess = (data: LoginResponse) => {
    const servers = data.servers || []
    localStorage.setItem(LS_SERVERS, JSON.stringify(servers))
    if (data.server && servers.length <= 1) {
      localStorage.setItem(LS_SERVER, data.server)
      setStep('server')
    } else if (servers.length > 1) {
      setPendingServers(servers)
      setStep('picker')
    } else {
      setStep('login')
    }
  }

  const handleServerSelect = (id: string) => {
    localStorage.setItem(LS_SERVER, id)
    setStep('server')
  }

  const handleLogout = () => {
    localStorage.removeItem(LS_SESSION)
    localStorage.removeItem(LS_SERVER)
    localStorage.removeItem(LS_SERVERS)
    setStep('login')
    setPendingServers([])
  }

  const handlePickServer = () => {
    const servers = getServers()
    if (servers.length > 0) {
      setPendingServers(servers)
      setStep('picker')
    }
  }

  if (step === 'login') {
    return <LoginView onLoginSuccess={handleLoginSuccess} />
  }

  if (step === 'picker' && pendingServers.length > 0) {
    return <ServerPicker servers={pendingServers} onSelect={handleServerSelect} onLogout={handleLogout} />
  }

  return (
    <ServerView onLogout={handleLogout} onPickServer={handlePickServer} />
  )
}
