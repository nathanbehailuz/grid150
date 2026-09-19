import {
  useEffect,
  useState,
  type FormEvent,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import './App.css'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Mode = 'login' | 'signup'

type Profile = {
  display_name: string
  timezone: string
  focused_group_id: string | null
}

function App() {
  const [mode, setMode] = useState<Mode>('login')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null)
      return
    }

    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, timezone, focused_group_id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setMessage(error.message)
        setProfile(null)
        return
      }
      setProfile(data)
    })()

    return () => {
      cancelled = true
    }
  }, [session])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return

    setBusy(true)
    setMessage(null)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() || undefined },
          },
        })
        if (error) throw error
        setMessage(
          'Signed up. If email confirmation is on, check your inbox; otherwise you are ready to log in.',
        )
        setMode('login')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Auth failed')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
    setBusy(false)
  }

  return (
    <main className="shell">
      <h1>Grid150</h1>
      <p className="lede">
        Competitive accountability for the NeetCode 150. P2 auth smoke: email /
        password signup and login against Supabase.
      </p>

      <p className="status" data-testid="supabase-status">
        Supabase:{' '}
        {isSupabaseConfigured ? 'configured' : 'env not set (see .env.example)'}
      </p>

      {!isSupabaseConfigured ? (
        <p className="message" role="status">
          Copy <code>web/.env.example</code> to <code>web/.env.local</code> and
          set the anon URL and key.
        </p>
      ) : session?.user ? (
        <AuthSession
          user={session.user}
          profile={profile}
          busy={busy}
          message={message}
          onLogout={onLogout}
        />
      ) : (
        <AuthForm
          mode={mode}
          email={email}
          password={password}
          displayName={displayName}
          busy={busy}
          message={message}
          onModeChange={setMode}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onDisplayNameChange={setDisplayName}
          onSubmit={onSubmit}
        />
      )}
    </main>
  )
}

function AuthSession({
  user,
  profile,
  busy,
  message,
  onLogout,
}: {
  user: User
  profile: Profile | null
  busy: boolean
  message: string | null
  onLogout: () => void
}) {
  return (
    <section className="panel" data-testid="auth-session">
      <h2>Signed in</h2>
      <dl className="meta">
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Display name</dt>
          <dd data-testid="profile-display-name">
            {profile?.display_name ?? 'Loading profile…'}
          </dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>{profile?.timezone ?? '—'}</dd>
        </div>
      </dl>
      {message ? (
        <p className="message" role="status">
          {message}
        </p>
      ) : null}
      <button type="button" onClick={onLogout} disabled={busy}>
        Log out
      </button>
    </section>
  )
}

function AuthForm({
  mode,
  email,
  password,
  displayName,
  busy,
  message,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onDisplayNameChange,
  onSubmit,
}: {
  mode: Mode
  email: string
  password: string
  displayName: string
  busy: boolean
  message: string | null
  onModeChange: (mode: Mode) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onDisplayNameChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <section className="panel" data-testid="auth-form">
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={mode === 'login' ? 'active' : undefined}
          onClick={() => onModeChange('login')}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          className={mode === 'signup' ? 'active' : undefined}
          onClick={() => onModeChange('signup')}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit}>
        {mode === 'signup' ? (
          <label>
            Display name
            <input
              name="displayName"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="Alex Rivera"
            />
          </label>
        ) : null}
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
        </label>
        {message ? (
          <p className="message" role="status">
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </form>
    </section>
  )
}

export default App
