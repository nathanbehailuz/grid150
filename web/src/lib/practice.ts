import {
  addDaysToLocalDate,
  localDateInTz,
  weekdayFromLocalDate,
  weekStartInTz,
} from './dates'
import type { AttemptOutcome } from './types'

export type DayCounts = Record<string, number>

export type DaySolveSplit = {
  independent: number
  hint: number
}

/** Count attempts per local calendar day. */
export function aggregateAttemptsByDay(
  attempts: { completed_at: string }[],
  timezone: string,
): DayCounts {
  const out: DayCounts = {}
  for (const a of attempts) {
    const key = localDateInTz(timezone, new Date(a.completed_at))
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

/** Successful new-problem solves per local day (for streak / today target). */
export function successfulNewSolveDays(
  attempts: { completed_at: string; outcome: string; attempt_type: string }[],
  timezone: string,
): Set<string> {
  const days = new Set<string>()
  for (const a of attempts) {
    if (a.attempt_type !== 'new_problem') continue
    if (
      a.outcome !== 'solved_independently' &&
      a.outcome !== 'solved_with_hints'
    ) {
      continue
    }
    days.add(localDateInTz(timezone, new Date(a.completed_at)))
  }
  return days
}

/**
 * Longest contiguous streak of active days that have a successful new solve.
 * activeDays: Postgres-style 0=Sun … 6=Sat.
 */
export function bestStreakDays(
  solveDays: Set<string>,
  activeDays: number[],
  timezone: string,
  lookbackDays = 400,
): number {
  const active = new Set(activeDays)
  const today = localDateInTz(timezone)
  let best = 0
  let run = 0
  for (let i = lookbackDays; i >= 0; i--) {
    const date = addDaysToLocalDate(today, -i)
    const dow = weekdayFromLocalDate(date)
    if (!active.has(dow)) continue
    if (solveDays.has(date)) {
      run += 1
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

export function countSolvesOnLocalDay(
  attempts: { completed_at: string; outcome: string; attempt_type: string }[],
  timezone: string,
  localDay: string,
  attemptType: 'new_problem' | 'scheduled_review' = 'new_problem',
): number {
  let n = 0
  for (const a of attempts) {
    if (a.attempt_type !== attemptType) continue
    if (
      a.outcome !== 'solved_independently' &&
      a.outcome !== 'solved_with_hints'
    ) {
      continue
    }
    if (localDateInTz(timezone, new Date(a.completed_at)) === localDay) n += 1
  }
  return n
}

/** Mon–Sun indep/hint counts for the ISO week containing `at`. */
export function weekDailySplits(
  attempts: {
    completed_at: string
    outcome: AttemptOutcome | string
    attempt_type: string
  }[],
  timezone: string,
  at = new Date(),
): { date: string; label: string; independent: number; hint: number }[] {
  const start = weekStartInTz(timezone, at)
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const days = labels.map((label, i) => ({
    date: addDaysToLocalDate(start, i),
    label,
    independent: 0,
    hint: 0,
  }))
  const index = new Map(days.map((d, i) => [d.date, i]))
  for (const a of attempts) {
    if (a.attempt_type !== 'new_problem') continue
    const key = localDateInTz(timezone, new Date(a.completed_at))
    const idx = index.get(key)
    if (idx == null) continue
    if (a.outcome === 'solved_independently') days[idx].independent += 1
    else if (a.outcome === 'solved_with_hints') days[idx].hint += 1
  }
  return days
}

export type DayState = 'practiced' | 'missed' | 'rest' | 'today' | 'future' | 'empty'

export function dayState(
  date: string | null,
  today: string,
  counts: DayCounts,
  activeDays: number[],
): DayState {
  if (!date) return 'empty'
  if (date > today) return 'future'
  const dow = weekdayFromLocalDate(date)
  const isActive = activeDays.includes(dow)
  if (date === today) return 'today'
  if (!isActive) return 'rest'
  if ((counts[date] ?? 0) > 0) return 'practiced'
  return 'missed'
}
