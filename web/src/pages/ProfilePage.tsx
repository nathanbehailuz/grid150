import { useEffect, useState, type FormEvent } from 'react'
import type { Profile } from '../lib/types'

const COMMON_TZ = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
]

type Props = {
  profile: Profile
  onSave: (patch: Partial<Pick<Profile, 'display_name' | 'timezone'>>) => Promise<unknown>
}

export function ProfilePage({ profile, onSave }: Props) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [timezone, setTimezone] = useState(profile.timezone)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDisplayName(profile.display_name)
    setTimezone(profile.timezone)
  }, [profile])

  const tzOptions = Array.from(
    new Set([...COMMON_TZ, profile.timezone, timezone].filter(Boolean)),
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await onSave({
        display_name: displayName.trim() || profile.display_name,
        timezone,
      })
      setMessage('Profile saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Profile</h1>
        <p>Display name and timezone drive streaks and weekly boundaries.</p>
      </header>
      <section className="panel">
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
          <label>
            Timezone
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          {message ? (
            <p
              className={`message${message.includes('saved') ? ' ok' : ''}`}
              role="status"
            >
              {message}
            </p>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>
    </div>
  )
}
