import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders Grid150 shell', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Grid150' })).toBeInTheDocument()
    expect(screen.getByTestId('supabase-status')).toBeInTheDocument()
  })
})
