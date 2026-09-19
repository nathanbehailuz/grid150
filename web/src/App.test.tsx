import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { isSupabaseConfigured, supabase } from './lib/supabase'

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('renders Grid150 shell and auth entry', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Grid150' })).toBeInTheDocument()
    expect(screen.getByTestId('supabase-status')).toBeInTheDocument()
    if (isSupabaseConfigured) {
      expect(screen.getByTestId('auth-form')).toBeInTheDocument()
    }
  })
})

describe('supabase client', () => {
  it('has auth API when configured', () => {
    if (!isSupabaseConfigured) {
      expect(supabase).toBeNull()
      return
    }
    expect(supabase?.auth).toBeTruthy()
    expect(typeof supabase?.auth.signInWithPassword).toBe('function')
  })
})
