import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type PublicGroup = {
  id: string
  name: string
  join_mode: 'open' | 'approval'
  member_count: number
  created_at: string
  problems_per_week: number | null
  deadline: string | null
}

type Props = {
  onJoined?: () => Promise<void> | void
}

export function DiscoverGroupsPage({ onJoined }: Props) {
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<PublicGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())

  const load = useCallback(async (q: string) => {
    if (!supabase) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('list_public_groups', {
        p_query: q.trim() || null,
      })
      if (rpcErr) throw rpcErr
      setGroups(
        ((data ?? []) as PublicGroup[]).map((g) => ({
          ...g,
          member_count: Number(g.member_count),
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups')
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    void load(query)
  }

  async function requestJoin(groupId: string, joinMode: 'open' | 'approval') {
    if (!supabase) return
    setBusyId(groupId)
    setError(null)
    setMessage(null)
    try {
      if (joinMode === 'approval') {
        const { error: rpcErr } = await supabase.rpc('request_join_group', {
          p_group_id: groupId,
        })
        if (rpcErr) throw rpcErr
        setRequestedIds((prev) => new Set(prev).add(groupId))
        setMessage(
          'Request sent. An admin must approve before this group becomes focused.',
        )
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Not signed in')
        const { error: insErr } = await supabase
          .from('group_memberships')
          .insert({ group_id: groupId, user_id: user.id, role: 'member' })
        if (insErr) throw insErr
        await supabase.from('member_targets').upsert(
          {
            user_id: user.id,
            group_id: groupId,
            daily_new_target: 1,
          },
          { onConflict: 'user_id,group_id' },
        )
        setRequestedIds((prev) => new Set(prev).add(groupId))
        setMessage('Joined. Refreshing your groups…')
        await onJoined?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Join failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Discover groups</h1>
        <p>
          Browse public cohorts. Private groups still join via{' '}
          <Link to="/groups/join">invite code</Link>.
        </p>
      </header>

      <form className="form-grid" onSubmit={onSearch}>
        <label>
          Search by name
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. FAANG"
          />
        </label>
        <button type="submit" disabled={loading}>
          Search
        </button>
      </form>

      {error ? <p className="message error">{error}</p> : null}
      {message ? <p className="message">{message}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}

      {!loading && groups.length === 0 ? (
        <p className="muted">No public groups match.</p>
      ) : null}

      {groups.length > 0 ? (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Members</th>
                  <th>Join</th>
                  <th>Pace</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const paceParts: string[] = []
                  if (g.problems_per_week != null) {
                    paceParts.push(`${g.problems_per_week}/wk`)
                  }
                  if (g.deadline) {
                    paceParts.push(`by ${g.deadline}`)
                  }
                  const requested = requestedIds.has(g.id)
                  return (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{g.member_count}</td>
                      <td>{g.join_mode}</td>
                      <td>{paceParts.length ? paceParts.join(' · ') : '—'}</td>
                      <td>
                        <button
                          type="button"
                          disabled={busyId === g.id || requested}
                          onClick={() => void requestJoin(g.id, g.join_mode)}
                        >
                          {requested
                            ? g.join_mode === 'open'
                              ? 'Joined'
                              : 'Requested'
                            : g.join_mode === 'open'
                              ? 'Join'
                              : 'Request to join'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
