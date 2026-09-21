import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { EmptyState } from '../components/EmptyState'
import { PageSkeleton } from '../components/PageSkeleton'
import { StatusBanner } from '../components/StatusBanner'
import {
  allTimeAverage,
  allTimeStanding,
  standingDelta,
} from '../lib/standings'
import { countSolvesOnLocalDay } from '../lib/practice'
import { isoWeekNumber, weekStartInTz } from '../lib/dates'

describe('EmptyState', () => {
  it('renders title and link CTA', () => {
    render(
      <MemoryRouter>
        <EmptyState
          title="Nothing here"
          hint="Try again"
          actionLabel="Go log"
          actionTo="/log"
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go log' })).toHaveAttribute(
      'href',
      '/log',
    )
  })
})

describe('PageSkeleton', () => {
  it('marks busy for assistive tech', () => {
    render(<PageSkeleton rows={2} label="Loading standings" />)
    expect(screen.getByLabelText('Loading standings')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })
})

describe('StatusBanner', () => {
  it('exposes retry for errors', () => {
    const calls: number[] = []
    render(
      <StatusBanner
        tone="error"
        message="Failed"
        onRetry={() => calls.push(1)}
      />,
    )
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(calls).toEqual([1])
  })
})

describe('standings helpers', () => {
  it('averages weekly totals for a user', () => {
    expect(
      allTimeAverage(
        [
          { user_id: 'u1', total: 80 },
          { user_id: 'u1', total: 60 },
          { user_id: 'u2', total: 10 },
        ],
        'u1',
      ),
    ).toBe(70)
  })

  it('ranks by all-time average weekly score', () => {
    const info = allTimeStanding(
      [
        { user_id: 'sam', total: 40 },
        { user_id: 'sam', total: 37 },
        { user_id: 'jordan', total: 50 },
        { user_id: 'jordan', total: 34.2 },
      ],
      'sam',
    )
    expect(info.rank).toBe(2)
    expect(info.of).toBe(2)
    expect(info.score).toBeCloseTo(38.5)
    expect(info.movement).toBeNull()
  })

  it('computes standing movement', () => {
    const thisWeek = [
      {
        user_id: 'a',
        group_id: 'g',
        week_start: '2026-09-15',
        progress: 40,
        consistency: 20,
        improvement: 10,
        total: 70,
        independent_solves: 5,
        hint_assisted_solves: 1,
      },
      {
        user_id: 'b',
        group_id: 'g',
        week_start: '2026-09-15',
        progress: 30,
        consistency: 15,
        improvement: 10,
        total: 55,
        independent_solves: 3,
        hint_assisted_solves: 1,
      },
    ]
    const lastWeek = [
      {
        user_id: 'b',
        group_id: 'g',
        week_start: '2026-09-08',
        progress: 40,
        consistency: 20,
        improvement: 10,
        total: 70,
        independent_solves: 5,
        hint_assisted_solves: 0,
      },
      {
        user_id: 'a',
        group_id: 'g',
        week_start: '2026-09-08',
        progress: 20,
        consistency: 10,
        improvement: 10,
        total: 40,
        independent_solves: 2,
        hint_assisted_solves: 1,
      },
    ]
    const delta = standingDelta(thisWeek, lastWeek, 'a')
    expect(delta.rank).toBe(1)
    expect(delta.movement).toBe(1)
  })
})

describe('practice helpers', () => {
  it('counts new and review solves on a local day', () => {
    const attempts = [
      {
        completed_at: '2026-09-21T15:00:00.000Z',
        outcome: 'solved_independently',
        attempt_type: 'new_problem',
      },
      {
        completed_at: '2026-09-21T16:00:00.000Z',
        outcome: 'solved_with_hints',
        attempt_type: 'scheduled_review',
      },
      {
        completed_at: '2026-09-20T15:00:00.000Z',
        outcome: 'solved_independently',
        attempt_type: 'scheduled_review',
      },
    ]
    expect(countSolvesOnLocalDay(attempts, 'UTC', '2026-09-21')).toBe(1)
    expect(
      countSolvesOnLocalDay(attempts, 'UTC', '2026-09-21', 'scheduled_review'),
    ).toBe(1)
  })
})

describe('dates helpers', () => {
  it('returns an ISO week number', () => {
    expect(typeof isoWeekNumber('UTC')).toBe('number')
  })

  it('returns a Monday week start string', () => {
    const ws = weekStartInTz('UTC')
    expect(ws).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
