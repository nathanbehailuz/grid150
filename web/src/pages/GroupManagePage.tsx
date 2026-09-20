import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatShortDate } from '../lib/dates'
import type { Membership, Profile } from '../lib/types'

type Props = {
  profile: Profile
  userId: string
  focusedGroupId: string | null
  focusedGroupName: string | null
  focusedRole: Membership['role'] | null
  onRefresh: () => Promise<void> | void
}

type Invite = {
  id: string
  code: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
}

type MemberRow = {
  id: string
  user_id: string
  role: Membership['role']
  joined_at: string
  display_name: string
}

type JoinReq = {
  id: string
  user_id: string
  created_at: string
  display_name: string
}

type InvalidateRow = {
  id: string
  user_id: string
  problem_id: string
  attempt_type: string
  outcome: string
  completed_at: string
  invalidated_at: string | null
  display_name: string
  problem_title: string
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function GroupManagePage({
  profile,
  userId,
  focusedGroupId,
  focusedGroupName,
  focusedRole,
  onRefresh,
}: Props) {
  const isAdmin =
    focusedRole === 'owner' || focusedRole === 'admin'

  const [name, setName] = useState(focusedGroupName ?? '')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [joinMode, setJoinMode] = useState<'open' | 'approval'>('approval')
  const [invites, setInvites] = useState<Invite[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [requests, setRequests] = useState<JoinReq[]>([])
  const [pacePerWeek, setPacePerWeek] = useState('')
  const [deadline, setDeadline] = useState('')
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [paceMarkerTopicId, setPaceMarkerTopicId] = useState('')
  const [paceMarkerNote, setPaceMarkerNote] = useState('')
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([])
  const [dailyTarget, setDailyTarget] = useState('1')
  const [invalidateRows, setInvalidateRows] = useState<InvalidateRow[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase || !focusedGroupId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: group, error: gErr } = await supabase
        .from('groups')
        .select('id, name, visibility, join_mode')
        .eq('id', focusedGroupId)
        .single()
      if (gErr) throw gErr
      setName(group.name as string)
      setVisibility(group.visibility as 'private' | 'public')
      setJoinMode(group.join_mode as 'open' | 'approval')

      const [invRes, memRes, paceRes, targetRes, reqRes, topicsRes] =
        await Promise.all([
        supabase
          .from('group_invites')
          .select('id, code, created_at, expires_at, revoked_at')
          .eq('group_id', focusedGroupId)
          .order('created_at', { ascending: false }),
        supabase
          .from('group_memberships')
          .select('id, user_id, role, joined_at, profiles!inner(display_name)')
          .eq('group_id', focusedGroupId)
          .is('left_at', null)
          .order('joined_at', { ascending: true }),
        supabase
          .from('group_pace_settings')
          .select(
            'problems_per_week, deadline, active_days, pace_marker_topic_id, pace_marker_note',
          )
          .eq('group_id', focusedGroupId)
          .maybeSingle(),
        supabase
          .from('member_targets')
          .select('daily_new_target')
          .eq('group_id', focusedGroupId)
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('group_join_requests')
          .select('id, user_id, created_at, profiles!inner(display_name)')
          .eq('group_id', focusedGroupId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true }),
        supabase
          .from('topics')
          .select('id, name')
          .order('sort_order', { ascending: true }),
      ])

      if (invRes.error) throw invRes.error
      if (memRes.error) throw memRes.error
      if (paceRes.error) throw paceRes.error
      if (targetRes.error) throw targetRes.error
      if (reqRes.error) throw reqRes.error
      if (topicsRes.error) throw topicsRes.error

      setInvites((invRes.data ?? []) as Invite[])
      setMembers(
        (memRes.data ?? []).map((m) => {
          const profiles = m.profiles as unknown as { display_name: string }
          return {
            id: m.id as string,
            user_id: m.user_id as string,
            role: m.role as Membership['role'],
            joined_at: m.joined_at as string,
            display_name: profiles.display_name,
          }
        }),
      )
      setRequests(
        (reqRes.data ?? []).map((r) => {
          const profiles = r.profiles as unknown as { display_name: string }
          return {
            id: r.id as string,
            user_id: r.user_id as string,
            created_at: r.created_at as string,
            display_name: profiles.display_name,
          }
        }),
      )

      if (paceRes.data) {
        setPacePerWeek(
          paceRes.data.problems_per_week != null
            ? String(paceRes.data.problems_per_week)
            : '',
        )
        setDeadline((paceRes.data.deadline as string | null) ?? '')
        setActiveDays(
          (paceRes.data.active_days as number[]) ?? [1, 2, 3, 4, 5],
        )
        setPaceMarkerTopicId(
          (paceRes.data.pace_marker_topic_id as string | null) ?? '',
        )
        setPaceMarkerNote(
          (paceRes.data.pace_marker_note as string | null) ?? '',
        )
      }
      setTopics(
        (topicsRes.data ?? []).map((t) => ({
          id: t.id as string,
          name: t.name as string,
        })),
      )
      setDailyTarget(String(targetRes.data?.daily_new_target ?? 1))

      if (isAdmin) {
        const { data: meta, error: mErr } = await supabase.rpc(
          'attempt_invalidation_meta_for_admin',
          { p_group_id: focusedGroupId },
        )
        if (mErr) throw mErr
        const rows = (meta ?? []) as {
          id: string
          user_id: string
          problem_id: string
          attempt_type: string
          outcome: string
          completed_at: string
          invalidated_at: string | null
        }[]
        const userIds = [...new Set(rows.map((r) => r.user_id))]
        const problemIds = [...new Set(rows.map((r) => r.problem_id))]
        const [{ data: profiles }, { data: problems }] = await Promise.all([
          userIds.length
            ? supabase.from('profiles').select('id, display_name').in('id', userIds)
            : Promise.resolve({ data: [] }),
          problemIds.length
            ? supabase
                .from('problems')
                .select('id, title, global_order')
                .in('id', problemIds)
            : Promise.resolve({ data: [] }),
        ])
        const nameMap = new Map(
          (profiles ?? []).map((p) => [p.id as string, p.display_name as string]),
        )
        const titleMap = new Map(
          (problems ?? []).map((p) => [
            p.id as string,
            `#${p.global_order} ${p.title}`,
          ]),
        )
        setInvalidateRows(
          rows.map((r) => ({
            ...r,
            display_name: nameMap.get(r.user_id) ?? 'Member',
            problem_title: titleMap.get(r.problem_id) ?? r.problem_id.slice(0, 8),
          })),
        )
      } else {
        setInvalidateRows([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group')
    } finally {
      setLoading(false)
    }
  }, [focusedGroupId, userId, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(ok)
      await load()
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (!focusedGroupId) {
    return (
      <div className="stack">
        <header className="page-head">
          <h1>Manage group</h1>
          <p>Focus a group first.</p>
        </header>
        <p className="muted">
          <Link to="/groups/join">Create or join</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Manage group</h1>
        <p>
          {focusedGroupName} · {focusedRole ?? 'member'}
        </p>
      </header>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message ok">{message}</p> : null}

      {!isAdmin ? (
        <section className="panel">
          <p className="muted">
            You are a member. Owners and admins manage settings, invites, and
            invalidation. You can update your daily target and leave the group.
          </p>
          <form
            className="form-grid"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              void run(async () => {
                if (!supabase) return
                const { error: rpcErr } = await supabase.rpc('set_daily_target', {
                  p_group_id: focusedGroupId,
                  p_daily_new_target: Number(dailyTarget),
                })
                if (rpcErr) throw rpcErr
              }, 'Daily target queued for next week (or set).')
            }}
          >
            <label>
              Your daily new-problem target
              <input
                type="number"
                min={0}
                value={dailyTarget}
                onChange={(e) => setDailyTarget(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              Save target
            </button>
          </form>
          <button
            type="button"
            className="btn"
            style={{ marginTop: '0.75rem' }}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!supabase) return
                const mine = members.find((m) => m.user_id === userId)
                if (!mine) throw new Error('Membership not found')
                const { error: uErr } = await supabase
                  .from('group_memberships')
                  .update({ left_at: new Date().toISOString() })
                  .eq('id', mine.id)
                if (uErr) throw uErr
              }, 'Left group.')
            }
          >
            Leave group
          </button>
        </section>
      ) : null}

      {isAdmin ? (
        <>
          <section className="panel">
            <h2>Settings</h2>
            <form
              className="form-grid"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                void run(async () => {
                  if (!supabase) return
                  const { error: uErr } = await supabase
                    .from('groups')
                    .update({
                      name: name.trim(),
                      visibility,
                      join_mode: joinMode,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', focusedGroupId)
                  if (uErr) throw uErr
                }, 'Settings saved.')
              }}
            >
              <label>
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
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
              <button type="submit" disabled={busy}>
                Save settings
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Invites</h2>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!supabase) return
                  const { data, error: rpcErr } = await supabase.rpc(
                    'create_group_invite',
                    { p_group_id: focusedGroupId },
                  )
                  if (rpcErr) throw rpcErr
                  setMessage(`Invite created: ${String(data)}`)
                }, 'Invite created.')
              }
            >
              Create invite code
            </button>
            <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invites.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No invites yet.
                      </td>
                    </tr>
                  ) : (
                    invites.map((inv) => (
                      <tr key={inv.id}>
                        <td
                          style={{
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.08em',
                          }}
                        >
                          {inv.code}
                        </td>
                        <td>
                          {formatShortDate(inv.created_at, profile.timezone)}
                        </td>
                        <td>
                          {inv.revoked_at
                            ? 'Revoked'
                            : inv.expires_at &&
                                new Date(inv.expires_at) < new Date()
                              ? 'Expired'
                              : 'Active'}
                        </td>
                        <td>
                          {!inv.revoked_at ? (
                            <button
                              type="button"
                              className="ghost"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  if (!supabase) return
                                  const { error: rpcErr } = await supabase.rpc(
                                    'revoke_group_invite',
                                    { p_invite_id: inv.id },
                                  )
                                  if (rpcErr) throw rpcErr
                                }, 'Invite revoked.')
                              }
                            >
                              Revoke
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>Members</h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className={m.user_id === userId ? 'me' : undefined}>
                      <td>{m.display_name}</td>
                      <td>
                        {focusedRole === 'owner' && m.user_id !== userId ? (
                          <select
                            value={m.role}
                            disabled={busy}
                            onChange={(e) => {
                              const role = e.target.value as Membership['role']
                              void run(async () => {
                                if (!supabase) return
                                const { error: uErr } = await supabase
                                  .from('group_memberships')
                                  .update({ role })
                                  .eq('id', m.id)
                                if (uErr) throw uErr
                              }, 'Role updated.')
                            }}
                          >
                            <option value="member">member</option>
                            <option value="admin">admin</option>
                            <option value="owner">owner</option>
                          </select>
                        ) : (
                          m.role
                        )}
                      </td>
                      <td>
                        {formatShortDate(m.joined_at, profile.timezone)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>Pace</h2>
            <form
              className="form-grid"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                void run(async () => {
                  if (!supabase) return
                  const { error: uErr } = await supabase
                    .from('group_pace_settings')
                    .update({
                      problems_per_week: pacePerWeek
                        ? Number(pacePerWeek)
                        : null,
                      deadline: deadline || null,
                      active_days: activeDays,
                      pace_marker_topic_id: paceMarkerTopicId || null,
                      pace_marker_note: paceMarkerNote.trim() || null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('group_id', focusedGroupId)
                  if (uErr) throw uErr
                }, 'Pace saved.')
              }}
            >
              <label>
                Problems per week
                <input
                  type="number"
                  min={1}
                  value={pacePerWeek}
                  onChange={(e) => setPacePerWeek(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Deadline
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
              <label>
                Pace marker topic
                <select
                  value={paceMarkerTopicId}
                  onChange={(e) => setPaceMarkerTopicId(e.target.value)}
                >
                  <option value="">None</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pace marker note
                <input
                  type="text"
                  value={paceMarkerNote}
                  onChange={(e) => setPaceMarkerNote(e.target.value)}
                  placeholder="Where the cohort should be"
                  maxLength={200}
                />
              </label>
              <div>
                <span className="muted" style={{ fontSize: '0.8125rem' }}>
                  Active days
                </span>
                <div
                  className="outcome-chips"
                  style={{ marginTop: '0.35rem' }}
                >
                  {DOW_LABELS.map((label, dow) => (
                    <button
                      key={dow}
                      type="button"
                      className={
                        activeDays.includes(dow) ? 'active' : undefined
                      }
                      onClick={() =>
                        setActiveDays((prev) =>
                          prev.includes(dow)
                            ? prev.filter((d) => d !== dow)
                            : [...prev, dow].sort(),
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={busy || activeDays.length === 0}>
                Save pace
              </button>
            </form>
            <form
              className="form-grid"
              style={{ marginTop: '1rem' }}
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                void run(async () => {
                  if (!supabase) return
                  const { error: rpcErr } = await supabase.rpc(
                    'set_daily_target',
                    {
                      p_group_id: focusedGroupId,
                      p_daily_new_target: Number(dailyTarget),
                    },
                  )
                  if (rpcErr) throw rpcErr
                }, 'Your daily target saved.')
              }}
            >
              <label>
                Your daily new-problem target
                <input
                  type="number"
                  min={0}
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(e.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                Save my target
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Join requests</h2>
            {requests.length === 0 ? (
              <p className="muted">No pending requests.</p>
            ) : (
              <div className="row-list">
                {requests.map((r) => (
                  <div key={r.id} className="row-link" style={{ cursor: 'default' }}>
                    <div>
                      <div className="title">{r.display_name}</div>
                      <div className="meta">
                        {formatShortDate(r.created_at, profile.timezone)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            if (!supabase) return
                            const { error: rpcErr } = await supabase.rpc(
                              'resolve_join_request',
                              { p_request_id: r.id, p_approve: true },
                            )
                            if (rpcErr) throw rpcErr
                          }, 'Request approved.')
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            if (!supabase) return
                            const { error: rpcErr } = await supabase.rpc(
                              'resolve_join_request',
                              { p_request_id: r.id, p_approve: false },
                            )
                            if (rpcErr) throw rpcErr
                          }, 'Request rejected.')
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Invalidate attempts</h2>
            <p className="muted">
              Metadata only. Private reflections and confidence are never shown.
              Members should edit within 10 minutes; after that, admins
              invalidate.
            </p>
            <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Problem</th>
                    <th>Type</th>
                    <th>Outcome</th>
                    <th>When</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invalidateRows.filter((r) => !r.invalidated_at).length ===
                  0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        No active attempts to invalidate.
                      </td>
                    </tr>
                  ) : (
                    invalidateRows
                      .filter((r) => !r.invalidated_at)
                      .map((r) => {
                        const inWindow =
                          new Date(r.completed_at).getTime() >
                          Date.now() - 10 * 60 * 1000
                        return (
                          <tr key={r.id}>
                            <td>{r.display_name}</td>
                            <td>{r.problem_title}</td>
                            <td>{r.attempt_type}</td>
                            <td>{r.outcome}</td>
                            <td>
                              {formatShortDate(r.completed_at, profile.timezone)}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ghost"
                                disabled={busy || inWindow}
                                title={
                                  inWindow
                                    ? 'Edit window still open'
                                    : 'Invalidate'
                                }
                                onClick={() =>
                                  void run(async () => {
                                    if (!supabase) return
                                    const { error: rpcErr } =
                                      await supabase.rpc('invalidate_attempt', {
                                        p_attempt_id: r.id,
                                      })
                                    if (rpcErr) throw rpcErr
                                  }, 'Attempt invalidated.')
                                }
                              >
                                {inWindow ? 'In window' : 'Invalidate'}
                              </button>
                            </td>
                          </tr>
                        )
                      })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <p className="muted">
        <Link to="/leaderboard">Leaderboard</Link>
        {' · '}
        <Link to="/attempts">Recent attempts</Link>
      </p>
    </div>
  )
}
