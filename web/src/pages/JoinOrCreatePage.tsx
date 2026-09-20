import { useState, type FormEvent } from 'react'
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
    if (!supabase) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('create_group', {
        p_name: name.trim(),
        p_visibility: visibility,
        p_join_mode: joinMode,
        p_daily_new_target: Math.max(0, Number(dailyTarget) || 0),
      })
      if (rpcErr) throw rpcErr
      const row = Array.isArray(data) ? data[0] : data
      const invite =
        row && typeof row === 'object' && 'invite_code' in row
          ? String((row as { invite_code: string }).invite_code)
          : null
      setInviteCode(invite)
      setMessage(
        invite
          ? 'Group created and set as focused. Share this invite code:'
          : 'Group created.',
      )
      await onJoined()
      if (!invite) {
        window.setTimeout(() => navigate('/leaderboard'), 800)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
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
