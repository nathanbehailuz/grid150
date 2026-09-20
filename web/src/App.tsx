import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useFocusedGroup } from './hooks/useFocusedGroup'
import { useSession } from './hooks/useSession'
import { AuthPage } from './pages/AuthPage'
import { DiscoverGroupsPage } from './pages/DiscoverGroupsPage'
import { GroupManagePage } from './pages/GroupManagePage'
import { JoinOrCreatePage } from './pages/JoinOrCreatePage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { LogAttemptPage } from './pages/LogAttemptPage'
import { ProfilePage } from './pages/ProfilePage'
import { RecentAttemptsPage } from './pages/RecentAttemptsPage'
import { ReviewsPage } from './pages/ReviewsPage'
import { RoadmapPage } from './pages/RoadmapPage'
import { TodayPage } from './pages/TodayPage'
import './components/AppShell.css'

export default function App() {
  const {
    user,
    profile,
    loading,
    refreshProfile,
    updateProfile,
    signOut,
  } = useSession()

  const focused = useFocusedGroup({
    userId: user?.id ?? null,
    profile,
    onProfileRefresh: refreshProfile,
  })

  if (loading) {
    return (
      <div className="auth-shell">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <AppShell
      profile={profile}
      email={user.email}
      focused={focused}
      onSignOut={() => void signOut()}
    >
      <Routes>
        <Route
          path="/"
          element={
            <TodayPage
                  profile={profile}
                  userId={user.id}
                  focusedGroupId={focused.focusedGroupId}
                />
          }
        />
        <Route path="/roadmap" element={<RoadmapPage userId={user.id} />} />
        <Route
          path="/reviews"
          element={<ReviewsPage profile={profile} userId={user.id} />}
        />
        <Route path="/log" element={<LogAttemptPage />} />
        <Route
          path="/attempts"
          element={
            <RecentAttemptsPage profile={profile} userId={user.id} />
          }
        />
        <Route
          path="/groups/manage"
          element={
            <GroupManagePage
              profile={profile}
              userId={user.id}
              focusedGroupId={focused.focusedGroupId}
              focusedGroupName={focused.focusedGroup?.name ?? null}
              focusedRole={focused.focusedRole}
              onRefresh={focused.reload}
            />
          }
        />
        <Route
          path="/leaderboard"
          element={
            <LeaderboardPage
              profile={profile}
              userId={user.id}
              focusedGroupId={focused.focusedGroupId}
              focusedGroupName={focused.focusedGroup?.name ?? null}
              memberships={focused.memberships}
              onSwitchGroup={focused.setFocusedGroup}
            />
          }
        />
        <Route
          path="/groups/discover"
          element={
            <DiscoverGroupsPage
              onJoined={async () => {
                await refreshProfile()
                await focused.reload()
              }}
            />
          }
        />
        <Route
          path="/groups/join"
          element={
            <JoinOrCreatePage
              onJoined={async () => {
                await refreshProfile()
                await focused.reload()
              }}
            />
          }
        />
        <Route
          path="/profile"
          element={<ProfilePage profile={profile} onSave={updateProfile} />}
        />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
