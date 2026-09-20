import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatShortDate, outcomeLabel } from '../lib/dates'
import type { AttemptOutcome, Profile } from '../lib/types'

type Props = {
  profile: Profile
  userId: string
}

type AttemptRow = {
  id: string
  problem_id: string
  attempt_type: string
  outcome: AttemptOutcome
  completed_at: string
  time_spent_minutes: number | null
  confidence: number
  could_explain: boolean
  private_reflection: string | null
  invalidated_at: string | null
  problem_title: string
}

const EDIT_MS = 10 * 60 * 1000

const OUTCOMES: { value: AttemptOutcome; label: string }[] = [
  { value: 'solved_independently', label: 'Solved independently' },
  { value: 'solved_with_hints', label: 'Solved with hints' },
  { value: 'could_not_solve', label: 'Could not solve' },
]

function remainingMs(completedAt: string): number {
  return new Date(completedAt).getTime() + EDIT_MS - Date.now()
}

export function RecentAttemptsPage({ profile, userId }: Props) {
  const [rows, setRows] = useState<AttemptRow[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<AttemptOutcome>('solved_independently')
  const [confidence, setConfidence] = useState(3)
  const [couldExplain, setCouldExplain] = useState(true)
  const [minutes, setMinutes] = useState('')
  const [reflection, setReflection] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: aErr } = await supabase
        .from('attempts')
        .select(
          'id, problem_id, attempt_type, outcome, completed_at, time_spent_minutes, confidence, could_explain, private_reflection, invalidated_at, problems!inner(title, global_order)',
        )
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })
        .limit(40)
      if (aErr) throw aErr
      setRows(
        (data ?? []).map((row) => {
          const problems = row.problems as unknown as {
            title: string
            global_order: number
          }
          return {
            id: row.id as string,
            problem_id: row.problem_id as string,
            attempt_type: row.attempt_type as string,
            outcome: row.outcome as AttemptOutcome,
            completed_at: row.completed_at as string,
            time_spent_minutes: row.time_spent_minutes as number | null,
            confidence: row.confidence as number,
            could_explain: row.could_explain as boolean,
            private_reflection: row.private_reflection as string | null,
            invalidated_at: row.invalidated_at as string | null,
            problem_title: `#${problems.global_order} ${problems.title}`,
          }
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attempts')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  function startEdit(row: AttemptRow) {
    setEditingId(row.id)
    setOutcome(row.outcome)
    setConfidence(row.confidence)
    setCouldExplain(row.could_explain)
    setMinutes(
      row.time_spent_minutes != null ? String(row.time_spent_minutes) : '',
    )
    setReflection(row.private_reflection ?? '')
    setMessage(null)
    setError(null)
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !editingId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { error: rpcErr } = await supabase.rpc('edit_attempt', {
        p_attempt_id: editingId,
        p_outcome: outcome,
        p_confidence: confidence,
        p_could_explain: couldExplain,
        p_time_spent_minutes: minutes ? Number(minutes) : null,
        p_private_reflection: reflection.trim() || null,
      })
      if (rpcErr) throw rpcErr
      setMessage('Attempt updated.')
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Edit failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    if (!supabase) return
    if (!window.confirm('Delete this attempt? This cannot be undone.')) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { error: rpcErr } = await supabase.rpc('delete_attempt', {
        p_attempt_id: id,
      })
      if (rpcErr) throw rpcErr
      setMessage('Attempt deleted.')
      if (editingId === id) setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Recent attempts</h1>
        <p>
          Edit or delete for 10 minutes after logging. After that, ask a group
          admin to invalidate.
        </p>
      </header>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message ok">{message}</p> : null}

      <div className="row-list">
        {rows.length === 0 && !loading ? (
          <p className="muted">
            No attempts yet. <Link to="/log">Log one</Link>.
          </p>
        ) : null}
        {rows.map((row) => {
          const left = remainingMs(row.completed_at)
          const editable =
            !row.invalidated_at && left > 0
          const minsLeft = Math.max(0, Math.ceil(left / 60_000))
          return (
            <div key={row.id} className="panel" style={{ padding: '0.85rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{ color: 'var(--color-bright)', fontWeight: 500 }}
                  >
                    {row.problem_title}
                  </div>
                  <div className="meta">
                    {row.attempt_type} · {outcomeLabel(row.outcome)} ·{' '}
                    {formatShortDate(row.completed_at, profile.timezone)}
                    {row.invalidated_at ? ' · invalidated' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  {editable ? (
                    <>
                      <span className="badge ok">{minsLeft}m left</span>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => void onDelete(row.id)}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <span className="badge">
                      {row.invalidated_at ? 'Invalidated' : 'Locked'}
                    </span>
                  )}
                </div>
              </div>

              {editingId === row.id ? (
                <form
                  className="form-grid"
                  style={{ marginTop: '0.85rem' }}
                  onSubmit={onSave}
                >
                  <label>
                    Outcome
                    <select
                      value={outcome}
                      onChange={(e) =>
                        setOutcome(e.target.value as AttemptOutcome)
                      }
                    >
                      {OUTCOMES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Confidence (1–5)
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={confidence}
                      onChange={(e) => setConfidence(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Could explain?
                    <select
                      value={couldExplain ? 'yes' : 'no'}
                      onChange={(e) =>
                        setCouldExplain(e.target.value === 'yes')
                      }
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                  <label>
                    Time (minutes)
                    <input
                      type="number"
                      min={0}
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                    />
                  </label>
                  <label>
                    Private reflection
                    <textarea
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" disabled={busy}>
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          )
        })}
      </div>

      <p className="muted">
        <Link to="/log">Log attempt</Link>
        {' · '}
        <Link to="/">Today</Link>
      </p>
    </div>
  )
}
