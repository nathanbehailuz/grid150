import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Props = {
  onJoined: () => Promise<void> | void
}

export function JoinOrCreatePage({ onJoined }: Props) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [joinMode, setJoinMode] = useState<'open' | 'approval'>('approval')
  const [dailyTarget, setDailyTarget] = useState('1')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const creatingRef = useRef(false)

  async function onJoin(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('join_group_by_code', {
        p_code: code.trim(),
      })
      if (rpcErr) throw rpcErr
      setMessage(`Joined. Focused group updated.`)
      await onJoined()
      window.setTimeout(() => navigate('/leaderboard'), 800)
      void data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Join failed')
    } finally {
      setBusy(false)
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!supabase || creatingRef.current) return

    const cleanName = name.trim()
    const target = Number(dailyTarget)
    if (cleanName.length < 2 || cleanName.length > 80) {
      setError('Group name must be between 2 and 80 characters.')
      return
    }
    if (!Number.isInteger(target) || target < 0 || target > 20) {
      setError('Daily target must be a whole number between 0 and 20.')
      return
    }

    creatingRef.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    setInviteCode(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('create_group', {
        p_name: cleanName,
        p_visibility: visibility,
        p_join_mode: joinMode,
        p_daily_new_target: target,
      })
      if (rpcErr) throw rpcErr
      const row = Array.isArray(data) ? data[0] : data
      const invite =
        row &&
        typeof row === 'object' &&
        typeof (row as { invite_code?: unknown }).invite_code === 'string'
          ? (row as { invite_code: string }).invite_code
          : null
      setInviteCode(invite)
      setName('')
      setMessage(
        invite
          ? 'Group created and set as focused. Share this invite code:'
          : 'Group created and set as focused.',
      )
      await onJoined()
      if (!invite) {
        window.setTimeout(() => navigate('/leaderboard'), 800)
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Create failed'
      setError(
        /already taken|unique/i.test(raw)
          ? 'That group name is already taken.'
          : /not authenticated/i.test(raw)
            ? 'Your session expired. Please log in again.'
            : raw,
      )
    } finally {
      creatingRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Join or create</h1>
        <p>Join with an invite code, or start a new group.</p>
      </header>

      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message ok">{message}</p> : null}
      {inviteCode ? (
        <section className="panel">
          <p className="muted">Invite code</p>
          <p className="invite-code">{inviteCode}</p>
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/leaderboard')}
          >
            Go to leaderboard
          </button>
        </section>
      ) : null}

      <div className="join-split">
        <section className="panel">
          <h2>Join with code</h2>
          <form className="form-grid" onSubmit={onJoin}>
            <label>
              Invite code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FAANG1"
                required
                minLength={4}
                maxLength={12}
                autoCapitalize="characters"
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Joining…' : 'Join group'}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Create group</h2>
          <form className="form-grid" onSubmit={onCreate}>
            <label>
              Group name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                placeholder="FAANG Grind Club"
              />
            </label>
            <label>
              Visibility
              <select
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as 'private' | 'public')
                }
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </label>
            <label>
              Join mode
              <select
                value={joinMode}
                onChange={(e) =>
                  setJoinMode(e.target.value as 'open' | 'approval')
                }
              >
                <option value="approval">Approval</option>
                <option value="open">Open</option>
              </select>
            </label>
            <label>
              Daily new problems (default)
              <input
                type="number"
                min={0}
                max={20}
                step={1}
                value={dailyTarget}
                onChange={(e) => setDailyTarget(e.target.value)}
                required
              />
            </label>
            <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
              New members start at this target. Anyone can schedule a lower
              personal target for next week on the Leaderboard.
            </p>
            <button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create group'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
