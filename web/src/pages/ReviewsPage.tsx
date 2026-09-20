import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatShortDate, isOverdue } from '../lib/dates'
import type { Profile, ReviewTask } from '../lib/types'

type Props = {
  profile: Profile
  userId: string
}

export function ReviewsPage({ profile, userId }: Props) {
  const [reviews, setReviews] = useState<ReviewTask[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: rErr } = await supabase
        .from('review_tasks')
        .select(
          'id, problem_id, due_at, status, problems!inner(id, title, slug, global_order, difficulty)',
        )
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_at', { ascending: true })
      if (rErr) throw rErr

      const mapped = (data ?? []).map((row) => ({
        id: row.id as string,
        problem_id: row.problem_id as string,
        due_at: row.due_at as string,
        status: row.status as ReviewTask['status'],
        problems: row.problems as unknown as ReviewTask['problems'],
      }))

      mapped.sort((a, b) => {
        const ao = isOverdue(a.due_at) ? 0 : 1
        const bo = isOverdue(b.due_at) ? 0 : 1
        if (ao !== bo) return ao - bo
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
      })
      setReviews(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Review queue</h1>
        <p>Overdue first. Log each as a scheduled review.</p>
      </header>
      {error ? <p className="message error">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}
      <section className="panel">
        {reviews.length === 0 && !loading ? (
          <p className="muted">No pending reviews.</p>
        ) : (
          <div className="row-list">
            {reviews.map((r) => {
              const overdue = isOverdue(r.due_at)
              return (
                <Link
                  key={r.id}
                  className="row-link"
                  to={`/log?problem=${r.problem_id}&type=scheduled_review`}
                >
                  <div>
                    <div className="title">
                      #{r.problems.global_order} {r.problems.title}
                    </div>
                    <div className="meta">
                      Due {formatShortDate(r.due_at, profile.timezone)} ·{' '}
                      {r.problems.difficulty}
                    </div>
                  </div>
                  <span className={`badge${overdue ? ' overdue' : ' due'}`}>
                    {overdue ? 'Overdue' : 'Scheduled'}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
