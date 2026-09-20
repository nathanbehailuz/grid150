import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatShortDate, isOverdue, outcomeLabel } from '../lib/dates'
import type { AttemptOutcome, Problem } from '../lib/types'
import { useSession } from '../hooks/useSession'

const OUTCOMES: { value: AttemptOutcome; label: string }[] = [
  { value: 'solved_independently', label: 'Solved independently' },
  { value: 'solved_with_hints', label: 'Solved with hints' },
  { value: 'could_not_solve', label: 'Could not solve' },
]

type ReviewItem = {
  id: string
  problem: Problem & { topicName?: string }
  due_at: string
  lastOutcome?: string | null
  lastAt?: string | null
}

function AttemptFields({
  outcome,
  setOutcome,
  confidence,
  setConfidence,
  couldExplain,
  setCouldExplain,
  minutes,
  setMinutes,
  reflection,
  setReflection,
  disabled,
}: {
  outcome: AttemptOutcome
  setOutcome: (v: AttemptOutcome) => void
  confidence: number
  setConfidence: (v: number) => void
  couldExplain: boolean
  setCouldExplain: (v: boolean) => void
  minutes: string
  setMinutes: (v: string) => void
  reflection: string
  setReflection: (v: string) => void
  disabled?: boolean
}) {
  return (
    <>
      <div>
        <span className="muted" style={{ fontSize: '0.8125rem' }}>
          Outcome
        </span>
        <div className="outcome-chips" style={{ marginTop: '0.35rem' }}>
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              className={outcome === o.value ? 'active' : undefined}
              onClick={() => setOutcome(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <label>
        Confidence (1–5)
        <input
          type="number"
          min={1}
          max={5}
          value={confidence}
          disabled={disabled}
          onChange={(e) => setConfidence(Number(e.target.value))}
          required
        />
      </label>
      <label>
        Could explain to a peer?
        <select
          value={couldExplain ? 'yes' : 'no'}
          disabled={disabled}
          onChange={(e) => setCouldExplain(e.target.value === 'yes')}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label>
        Time spent (minutes)
        <input
          type="number"
          min={0}
          value={minutes}
          disabled={disabled}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="Optional"
        />
      </label>
      <label>
        Private reflection
        <textarea
          value={reflection}
          disabled={disabled}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="Only you can see this"
        />
      </label>
    </>
  )
}

export function LogAttemptPage() {
  const { profile, user } = useSession()
  const [params] = useSearchParams()
  const location = useLocation()
  const problemParam = params.get('problem')
  const reviewRef = useRef<HTMLElement>(null)
  const newRef = useRef<HTMLElement>(null)

  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [nextProblem, setNextProblem] = useState<
    (Problem & { topicName?: string }) | null
  >(null)
  const [blocked, setBlocked] = useState(false)
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null)

  const [revOutcome, setRevOutcome] =
    useState<AttemptOutcome>('solved_independently')
  const [revConfidence, setRevConfidence] = useState(3)
  const [revExplain, setRevExplain] = useState(true)
  const [revMinutes, setRevMinutes] = useState('')
  const [revReflection, setRevReflection] = useState('')

  const [newOutcome, setNewOutcome] =
    useState<AttemptOutcome>('solved_independently')
  const [newConfidence, setNewConfidence] = useState(3)
  const [newExplain, setNewExplain] = useState(true)
  const [newMinutes, setNewMinutes] = useState('')
  const [newReflection, setNewReflection] = useState('')

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const timezone = profile?.timezone ?? 'UTC'
  const userId = user?.id

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: nextId } = await supabase.rpc('next_unlocked_problem')
      if (nextId) {
        const { data } = await supabase
          .from('problems')
          .select(
            'id, title, slug, difficulty, global_order, topic_id, neetcode_url, topics!inner(name)',
          )
          .eq('id', nextId)
          .maybeSingle()
        if (data) {
          const topics = data.topics as unknown as { name: string }
          setNextProblem({
            id: data.id as string,
            title: data.title as string,
            slug: data.slug as string,
            difficulty: data.difficulty as Problem['difficulty'],
            global_order: data.global_order as number,
            topic_id: data.topic_id as string,
            neetcode_url: data.neetcode_url as string | null,
            topicName: topics.name,
          })
        }
      } else {
        setNextProblem(null)
      }

      const { data: reviewRows, error: rErr } = await supabase
        .from('review_tasks')
        .select(
          'id, problem_id, due_at, problems!inner(id, title, slug, difficulty, global_order, topic_id, neetcode_url, topics!inner(name))',
        )
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_at', { ascending: true })
      if (rErr) throw rErr

      const items: ReviewItem[] = (reviewRows ?? []).map((row) => {
        const p = row.problems as unknown as Problem & {
          topics: { name: string }
        }
        return {
          id: row.id as string,
          due_at: row.due_at as string,
          problem: {
            id: p.id,
            title: p.title,
            slug: p.slug,
            difficulty: p.difficulty,
            global_order: p.global_order,
            topic_id: p.topic_id,
            neetcode_url: p.neetcode_url,
            topicName: p.topics?.name,
          },
        }
      })

      const dueItems = items.filter(
        (r) => new Date(r.due_at).getTime() <= Date.now() + 24 * 60 * 60 * 1000,
      )
      const show = dueItems.length > 0 ? dueItems : items.slice(0, 3)

      const pids = show.map((r) => r.problem.id)
      const lastMap = new Map<string, { outcome: string; at: string }>()
      if (pids.length > 0) {
        const { data: recent } = await supabase
          .from('attempts')
          .select('problem_id, outcome, completed_at')
          .eq('user_id', userId)
          .in('problem_id', pids)
          .is('invalidated_at', null)
          .order('completed_at', { ascending: false })
        for (const a of recent ?? []) {
          const pid = a.problem_id as string
          if (!lastMap.has(pid)) {
            lastMap.set(pid, {
              outcome: a.outcome as string,
              at: a.completed_at as string,
            })
          }
        }
      }

      const enriched = show.map((r) => {
        const last = lastMap.get(r.problem.id)
        return {
          ...r,
          lastOutcome: last?.outcome ?? null,
          lastAt: last?.at ?? null,
        }
      })
      setReviews(enriched)
      const overdue = enriched.some((r) => isOverdue(r.due_at))
      setBlocked(overdue)

      let pick =
        enriched.find((r) => r.problem.id === problemParam)?.id ??
        enriched.find((r) => isOverdue(r.due_at))?.id ??
        enriched[0]?.id ??
        null
      setActiveReviewId(pick)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load log')
    } finally {
      setLoading(false)
    }
  }, [userId, problemParam])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const hash = location.hash.replace('#', '')
    const t = window.setTimeout(() => {
      if (hash === 'new') newRef.current?.scrollIntoView({ behavior: 'smooth' })
      else if (hash === 'review')
        reviewRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => window.clearTimeout(t)
  }, [location.hash, loading])

  async function submit(
    problemId: string,
    attemptType: 'new_problem' | 'scheduled_review',
    fields: {
      outcome: AttemptOutcome
      confidence: number
      couldExplain: boolean
      minutes: string
      reflection: string
    },
  ) {
    if (!supabase) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { error: rpcErr } = await supabase.rpc('log_attempt', {
        p_problem_id: problemId,
        p_attempt_type: attemptType,
        p_outcome: fields.outcome,
        p_confidence: fields.confidence,
        p_could_explain: fields.couldExplain,
        p_time_spent_minutes: fields.minutes ? Number(fields.minutes) : null,
        p_private_reflection: fields.reflection.trim() || null,
      })
      if (rpcErr) throw rpcErr
      setMessage(
        'Attempt saved. You can edit or delete it for 10 minutes on Recent attempts.',
      )
      await load()
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Log failed'
      const friendly = /overdue review/i.test(raw)
        ? 'Overdue review blocks new problems. Clear reviews first.'
        : /next unlocked|can only log/i.test(raw)
          ? 'You can only log the next unlocked new problem.'
          : /no pending review/i.test(raw)
            ? 'No pending review for this problem.'
            : raw
      setError(friendly)
    } finally {
      setBusy(false)
    }
  }

  function onReviewSubmit(e: FormEvent) {
    e.preventDefault()
    const item = reviews.find((r) => r.id === activeReviewId) ?? reviews[0]
    if (!item) return
    void submit(item.problem.id, 'scheduled_review', {
      outcome: revOutcome,
      confidence: revConfidence,
      couldExplain: revExplain,
      minutes: revMinutes,
      reflection: revReflection,
    })
  }

  function onNewSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nextProblem || blocked) return
    void submit(nextProblem.id, 'new_problem', {
      outcome: newOutcome,
      confidence: newConfidence,
      couldExplain: newExplain,
      minutes: newMinutes,
      reflection: newReflection,
    })
  }

  const activeReview =
    reviews.find((r) => r.id === activeReviewId) ?? reviews[0] ?? null

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Log attempt</h1>
        <p>Honor-based self-report. Private notes stay private.</p>
      </header>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message ok">{message}</p> : null}

      <div className="dual-log">
        <section
          ref={reviewRef}
          id="review"
          className="log-section form-grid"
        >
          <h2 style={{ margin: 0 }}>Review</h2>
          {reviews.length === 0 ? (
            <p className="muted">No pending reviews due right now.</p>
          ) : (
            <form className="form-grid" onSubmit={onReviewSubmit}>
              {reviews.length > 1 ? (
                <label>
                  Problem
                  <select
                    value={activeReview?.id ?? ''}
                    onChange={(e) => setActiveReviewId(e.target.value)}
                  >
                    {reviews.map((r) => (
                      <option key={r.id} value={r.id}>
                        #{r.problem.global_order} {r.problem.title}
                        {isOverdue(r.due_at) ? ' (overdue)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div>
                  <div
                    style={{
                      color: 'var(--color-bright)',
                      fontWeight: 500,
                    }}
                  >
                    #{activeReview!.problem.global_order}{' '}
                    {activeReview!.problem.title}
                  </div>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    Due {formatShortDate(activeReview!.due_at, timezone)}
                    {activeReview!.lastOutcome && activeReview!.lastAt
                      ? ` · last outcome: ${outcomeLabel(activeReview!.lastOutcome)} ${formatShortDate(activeReview!.lastAt, timezone)}`
                      : ''}
                  </p>
                </div>
              )}
              {activeReview?.problem.neetcode_url ? (
                <p className="muted">
                  <a
                    href={activeReview.problem.neetcode_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on NeetCode
                  </a>
                </p>
              ) : null}
              <AttemptFields
                outcome={revOutcome}
                setOutcome={setRevOutcome}
                confidence={revConfidence}
                setConfidence={setRevConfidence}
                couldExplain={revExplain}
                setCouldExplain={setRevExplain}
                minutes={revMinutes}
                setMinutes={setRevMinutes}
                reflection={revReflection}
                setReflection={setRevReflection}
              />
              <button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save review'}
              </button>
            </form>
          )}
        </section>

        <section
          ref={newRef}
          id="new"
          className={`log-section form-grid${blocked ? ' locked' : ''}`}
        >
          <h2 style={{ margin: 0 }}>New problem</h2>
          {!nextProblem ? (
            <p className="muted">No unlocked new problem right now.</p>
          ) : (
            <form className="form-grid" onSubmit={onNewSubmit}>
              <div>
                <div
                  style={{ color: 'var(--color-bright)', fontWeight: 500 }}
                >
                  #{nextProblem.global_order} {nextProblem.title}
                </div>
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  {nextProblem.difficulty}
                  {nextProblem.topicName ? ` · ${nextProblem.topicName}` : ''}
                </p>
              </div>
              {nextProblem.neetcode_url ? (
                <p className="muted">
                  <a
                    href={nextProblem.neetcode_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on NeetCode
                  </a>
                </p>
              ) : null}
              <AttemptFields
                outcome={newOutcome}
                setOutcome={setNewOutcome}
                confidence={newConfidence}
                setConfidence={setNewConfidence}
                couldExplain={newExplain}
                setCouldExplain={setNewExplain}
                minutes={newMinutes}
                setMinutes={setNewMinutes}
                reflection={newReflection}
                setReflection={setNewReflection}
                disabled={blocked}
              />
              <button type="submit" disabled={busy || blocked}>
                {busy ? 'Saving…' : 'Save new attempt'}
              </button>
            </form>
          )}
        </section>
      </div>

      <p className="muted">
        <Link to="/reviews">Review queue</Link> · <Link to="/attempts">Recent attempts</Link> ·{' '}
        <Link to="/">Today</Link>
      </p>
    </div>
  )
}
