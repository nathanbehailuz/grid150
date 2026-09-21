import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  authRedirectTo,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase'

type Mode = 'login' | 'signup'

export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, ''),
    )
    const authError = params.get('error_description') ?? params.get('error')
    if (authError) {
      setMessage(decodeURIComponent(authError.replace(/\+/g, ' ')))
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [location.hash])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: authRedirectTo(),
            data: { display_name: displayName.trim() || undefined },
          },
        })
        if (error) throw error
        if (data.session) {
          navigate('/', { replace: true })
        } else {
          setMessage(
            'Account created. Check your email to confirm, then log in.',
          )
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        navigate('/', { replace: true })
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Auth failed')
    } finally {
      setBusy(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <img
            src="/brand.png"
            alt="Grid150"
            className="auth-brand"
            width={192}
            height={38}
          />
          <p className="message error">
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to web/.env.local.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" data-testid="auth-form">
        <img
          src="/brand.png"
          alt="Grid150"
          className="auth-brand"
          width={192}
          height={38}
        />
        <p className="lede">
          Competitive accountability for the NeetCode 150.
        </p>
        <div className="auth-tabs">
          <Link
            to="/login"
            className={mode === 'login' ? 'active' : undefined}
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className={mode === 'signup' ? 'active' : undefined}
          >
            Sign up
          </Link>
        </div>
        <form className="form-grid" onSubmit={onSubmit}>
          {mode === 'signup' ? (
            <label>
              Display name
              <input
                name="displayName"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
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
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
      </div>
    </div>
  )
}
