import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { Profile } from '../lib/types'
import type { useFocusedGroup } from '../hooks/useFocusedGroup'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import './AppShell.css'

type Focused = ReturnType<typeof useFocusedGroup>

type Props = {
  profile: Profile
  email: string | undefined
  focused: Focused
  profileError?: string | null
  onSignOut: () => void
  children: ReactNode
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AppShell({
  profile,
  email,
  focused,
  profileError,
  onSignOut,
  children,
}: Props) {
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const profileMenuId = useId()
  const navigate = useNavigate()
  const online = useOnlineStatus()

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (!menuRef.current?.contains(t)) setGroupsOpen(false)
      if (!profileRef.current?.contains(t)) setProfileOpen(false)
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
                <p className="groups-empty">
                  No groups yet.{' '}
                  <Link to="/groups/join" onClick={() => setGroupsOpen(false)}>
                    Create or join
                  </Link>
                </p>
              ) : (
                focused.memberships.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    className={
                      m.group_id === focused.focusedGroupId
                        ? 'current'
                        : undefined
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
              ) : null}
            </div>
          ) : null}
        </div>
      </nav>

      <div className="shell-profile" ref={profileRef}>
        {profileOpen ? (
          <div
            id={profileMenuId}
            className="profile-menu"
            role="menu"
            aria-label="Account"
          >
            <div className="profile-menu-head">
              <span className="profile-avatar" aria-hidden>
                {initials(profile.display_name)}
              </span>
              <div>
                <strong>{profile.display_name}</strong>
                {email ? <span>{email}</span> : null}
              </div>
            </div>
            <Link
              to="/profile"
              role="menuitem"
              onClick={() => {
                setProfileOpen(false)
                setMobileNav(false)
              }}
            >
              Profile
            </Link>
            <Link
              to="/attempts"
              role="menuitem"
              onClick={() => {
                setProfileOpen(false)
                setMobileNav(false)
              }}
            >
              Recent attempts
            </Link>
            <button
              type="button"
              role="menuitem"
              className="profile-logout"
              onClick={() => {
                setProfileOpen(false)
                onSignOut()
              }}
            >
              Log out
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="profile-trigger"
          aria-expanded={profileOpen}
          aria-controls={profileMenuId}
          onClick={() => setProfileOpen((o) => !o)}
        >
          <span className="profile-avatar" aria-hidden>
            {initials(profile.display_name)}
          </span>
          <span className="profile-trigger-text">
            <strong>{profile.display_name}</strong>
          </span>
        </button>
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
            <Link to="/groups/discover" className="header-link">
              Discover
            </Link>
            <Link to="/groups/join" className="header-link">
              Create / join
            </Link>
            <Link to="/log" className="btn-primary">
              Log attempt
            </Link>
          </div>
        </header>
        {!online ? (
          <div className="shell-banner shell-banner-warn" role="status">
            You are offline. Changes will fail until the connection returns.
          </div>
        ) : null}
        {profileError ? (
          <div className="shell-banner shell-banner-error" role="alert">
            Session profile error: {profileError}. Try signing out and back in.
          </div>
        ) : null}
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
        <NavLink to="/groups/discover">Discover</NavLink>
      </nav>
    </div>
  )
}
