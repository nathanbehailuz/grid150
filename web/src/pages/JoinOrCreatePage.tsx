import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Props = {
  onCreated: () => Promise<void> | void
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function JoinOrCreatePage({ onCreated }: Props) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [joinMode, setJoinMode] = useState<'open' | 'approval'>('approval')
  const [dailyTarget, setDailyTarget] = useState('1')
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const creatingRef = useRef(false)

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
    if (activeDays.length === 0) {
      setError('Choose at least one active day.')
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
        p_active_days: activeDays,
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
      await onCreated()
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
        <h1>Create group</h1>
        <p>Set the group’s access, daily target, and active days.</p>
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

      <section className="panel">
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
          <div>
            <span className="muted" style={{ fontSize: '0.8125rem' }}>
              Active days
            </span>
            <div className="outcome-chips" style={{ marginTop: '0.35rem' }}>
              {DOW_LABELS.map((label, dow) => (
                <button
                  key={dow}
                  type="button"
                  className={activeDays.includes(dow) ? 'active' : undefined}
                  aria-pressed={activeDays.includes(dow)}
                  onClick={() =>
                    setActiveDays((prev) =>
                      prev.includes(dow)
                        ? prev.filter((day) => day !== dow)
                        : [...prev, dow].sort(),
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p
              className="muted"
              style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem' }}
            >
              Unselected days are rest days for streaks and consistency.
            </p>
          </div>
          <button type="submit" disabled={busy || activeDays.length === 0}>
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </form>
      </section>
    </div>
  )
}
