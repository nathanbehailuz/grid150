import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './components/AppShell'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Profile } from './lib/types'

vi.mock('./lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('./lib/supabase')>(
    './lib/supabase',
  )
  return {
    ...actual,
    supabase: null,
    isSupabaseConfigured: false,
  }
})

const stubProfile: Profile = {
  id: '00000000-0000-0000-0000-000000000001',
  display_name: 'Test User',
  timezone: 'UTC',
  focused_group_id: null,
}

const stubFocused = {
  memberships: [],
  focusedGroupId: null,
  focusedGroup: null,
  focusedRole: null as 'owner' | 'admin' | 'member' | null,
  rank: null,
  snapshot: null,
  completedCount: 0,
  independentCount: 0,
  assistedCount: 0,
  dueReviewCount: 0,
  topicsDone: 0,
  topicsTotal: 18,
  loading: false,
  error: null,
  reload: async () => {},
  setFocusedGroup: async () => {},
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('AppShell', () => {
  it('renders chrome nav and brand', () => {
    render(
      <MemoryRouter>
        <AppShell
          profile={stubProfile}
          email="test@example.com"
          focused={stubFocused}
          onSignOut={() => {}}
        >
          <p>Page body</p>
        </AppShell>
      </MemoryRouter>,
    )
    expect(screen.getByText('Grid')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0)
    expect(screen.getByText('Page body')).toBeInTheDocument()
  })
})

describe('supabase client module', () => {
  it('exposes configured flag', () => {
    // Mocked off in this file so shell tests stay offline.
    expect(isSupabaseConfigured).toBe(false)
    expect(supabase).toBeNull()
  })
})
