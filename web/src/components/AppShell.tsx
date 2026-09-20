import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { Profile } from '../lib/types'
import type { useFocusedGroup } from '../hooks/useFocusedGroup'
import './AppShell.css'

type Focused = ReturnType<typeof useFocusedGroup>

type Props = {
  profile: Profile
  email: string | undefined
  focused: Focused
  onSignOut: () => void
  children: ReactNode
}

export function AppShell({
  profile,
  email,
  focused,
  onSignOut,
  children,
}: Props) {
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const navigate = useNavigate()

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setGroupsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pct = Math.round((focused.completedCount / 150) * 1000) / 10
  const indepPct =
    focused.completedCount > 0
      ? Math.round((focused.independentCount / 150) * 1000) / 10
      : 0
  const assistPct =
    focused.completedCount > 0
      ? Math.round((focused.assistedCount / 150) * 1000) / 10
      : 0

  async function pickGroup(groupId: string) {
    setGroupsOpen(false)
    setMobileNav(false)
    await focused.setFocusedGroup(groupId)
    navigate('/leaderboard')
  }

  const sidebar = (
    <>
      <div className="shell-brand-block">
        <Link to="/" className="shell-brand" onClick={() => setMobileNav(false)}>
          <img src="/logo.svg" alt="" width={32} height={32} />
          <span>
            Grid<span className="accent">150</span>
          </span>
        </Link>
      </div>

      <div className="shell-progress">
        <div className="shell-progress-head">
          <span>NeetCode 150</span>
          <span className="accent-text">{pct}%</span>
        </div>
        <div className="shell-progress-count">
          <strong>{focused.completedCount}</strong>
          <span>/ 150 Solved</span>
        </div>
        <div className="shell-progress-bar" aria-hidden>
          <div className="indep" style={{ width: `${indepPct}%` }} />
          <div className="assist" style={{ width: `${assistPct}%` }} />
        </div>
        <div className="shell-progress-legend">
          <span>
            <i className="dot indep" /> Independent
          </span>
          <span>
            <i className="dot assist" /> Assisted
          </span>
        </div>
      </div>

      <nav className="shell-nav" aria-label="Primary">
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? 'active' : undefined)}
          onClick={() => setMobileNav(false)}
        >
          <span>Today</span>
          {focused.dueReviewCount > 0 ? (
            <span className="nav-badge">{focused.dueReviewCount} Due</span>
          ) : null}
        </NavLink>
        <NavLink
          to="/roadmap"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
          onClick={() => setMobileNav(false)}
        >
          <span>Roadmap</span>
          <span className="nav-meta">
            {focused.topicsDone}/{focused.topicsTotal}
          </span>
        </NavLink>
        <NavLink
          to="/reviews"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
          onClick={() => setMobileNav(false)}
        >
          <span>Reviews</span>
        </NavLink>
        <NavLink
          to="/leaderboard"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
          onClick={() => setMobileNav(false)}
        >
          <span>Leaderboard</span>
          {focused.rank != null ? (
            <span className="nav-meta">#{focused.rank}</span>
          ) : null}
        </NavLink>

        <div className="groups-menu" ref={menuRef}>
          <button
            type="button"
            className="groups-toggle"
            aria-expanded={groupsOpen}
            aria-controls={menuId}
            onClick={() => setGroupsOpen((o) => !o)}
          >
            <span>Groups</span>
            <span className="nav-meta">
              {focused.focusedGroup?.name?.slice(0, 12) ?? 'None'}
            </span>
          </button>
          {groupsOpen ? (
            <div id={menuId} className="groups-dropdown" role="menu">
              {focused.memberships.length === 0 ? (
                <p className="groups-empty">No groups yet</p>
              ) : (
                focused.memberships.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    className={
                      m.group_id === focused.focusedGroupId ? 'current' : undefined
                    }
                    onClick={() => void pickGroup(m.group_id)}
                  >
                    <span>{m.groups.name}</span>
                    {m.rank != null ? (
                      <span className="nav-meta">#{m.rank}</span>
                    ) : null}
                  </button>
                ))
              )}
              <Link
                to="/groups/discover"
                role="menuitem"
                onClick={() => {
                  setGroupsOpen(false)
                  setMobileNav(false)
                }}
              >
                Discover
              </Link>
              <Link
                to="/groups/join"
                role="menuitem"
                onClick={() => {
                  setGroupsOpen(false)
                  setMobileNav(false)
                }}
              >
                Create or join
              </Link>
              {focused.focusedRole === 'owner' ||
              focused.focusedRole === 'admin' ? (
                <Link
                  to="/groups/manage"
                  role="menuitem"
                  onClick={() => {
                    setGroupsOpen(false)
                    setMobileNav(false)
                  }}
                >
                  Manage group
                </Link>
              ) : focused.focusedGroupId ? (
                <Link
                  to="/groups/manage"
                  role="menuitem"
                  onClick={() => {
                    setGroupsOpen(false)
                    setMobileNav(false)
                  }}
                >
                  Group settings
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="shell-profile">
        <Link to="/profile" onClick={() => setMobileNav(false)}>
          <strong>{profile.display_name}</strong>
          <span>
            {focused.focusedRole
              ? focused.focusedRole.charAt(0).toUpperCase() +
                focused.focusedRole.slice(1)
              : 'Member'}
            {' · '}
            {focused.memberships.length} group
            {focused.memberships.length === 1 ? '' : 's'}
          </span>
        </Link>
        <Link
          to="/attempts"
          className="shell-attempts-link"
          onClick={() => setMobileNav(false)}
        >
          Recent attempts
        </Link>
        <button type="button" className="ghost" onClick={onSignOut}>
          Log out
        </button>
        {email ? <span className="shell-email">{email}</span> : null}
      </div>
    </>
  )

  return (
    <div className={`app-shell${mobileNav ? ' nav-open' : ''}`}>
      <aside className="shell-sidebar desktop">{sidebar}</aside>
      {mobileNav ? (
        <div className="shell-drawer" role="dialog" aria-label="Navigation">
          <aside className="shell-sidebar">{sidebar}</aside>
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close menu"
            onClick={() => setMobileNav(false)}
          />
        </div>
      ) : null}

      <div className="shell-main">
        <header className="shell-header">
          <button
            type="button"
            className="menu-btn"
            aria-label="Open menu"
            onClick={() => setMobileNav(true)}
          >
            Menu
          </button>
          <div className="header-actions">
            <button type="button" className="chrome-inert" disabled title="Coming later">
              Search
            </button>
            <button
              type="button"
              className="chrome-inert alerts-btn"
              disabled
              title="Coming later"
            >
              Alerts
              {focused.dueReviewCount > 0 ? (
                <span className="alert-badge">{focused.dueReviewCount}</span>
              ) : null}
            </button>
            <Link to="/log" className="btn-primary">
              Log attempt
            </Link>
          </div>
        </header>
        <main className="shell-content">{children}</main>
      </div>

      <nav className="mobile-bottom" aria-label="Mobile">
        <NavLink to="/" end>
          Today
        </NavLink>
        <NavLink to="/roadmap">Roadmap</NavLink>
        <Link to="/log" className="mobile-log">
          Log
        </Link>
        <NavLink to="/leaderboard">Board</NavLink>
        <NavLink to="/groups/join">Groups</NavLink>
      </nav>
    </div>
  )
}
