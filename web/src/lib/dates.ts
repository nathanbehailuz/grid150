/** Local calendar date YYYY-MM-DD in an IANA timezone. */
export function localDateInTz(timezone: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** ISO-week Monday (YYYY-MM-DD) for the user's local calendar date. */
export function weekStartInTz(timezone: string, at = new Date()): string {
  const local = localDateInTz(timezone, at)
  const [y, m, d] = local.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12))
  const dow = utcNoon.getUTCDay() // 0 Sun … 6 Sat
  const daysFromMonday = (dow + 6) % 7
  utcNoon.setUTCDate(utcNoon.getUTCDate() - daysFromMonday)
  return utcNoon.toISOString().slice(0, 10)
}

/** Prior ISO-week Monday relative to a week_start YYYY-MM-DD. */
export function priorWeekStart(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  dt.setUTCDate(dt.getUTCDate() - 7)
  return dt.toISOString().slice(0, 10)
}

/** ISO week number (1–53) for a local calendar date in timezone. */
export function isoWeekNumber(timezone: string, at = new Date()): number {
  const local = localDateInTz(timezone, at)
  const [y, m, d] = local.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    )
  return week
}

export function formatShortDate(iso: string, timezone: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

export function formatLongDate(timezone: string, at = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(at)
}

export function greetingForHour(timezone: string, at = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(at),
  )
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function isOverdue(dueAt: string, now = new Date()): boolean {
  return new Date(dueAt).getTime() < now.getTime()
}

/** JS weekday 0=Sun…6=Sat for a YYYY-MM-DD local date. */
export function weekdayFromLocalDate(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function daysBetweenLocal(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const aMs = Date.UTC(ay, am - 1, ad)
  const bMs = Date.UTC(by, bm - 1, bd)
  return Math.round((bMs - aMs) / 86400000)
}

export type CalendarCell = {
  date: string | null
  day: number | null
  inMonth: boolean
}

/** Month grid Monday-first; leading/trailing nulls for padding. */
export function monthGrid(year: number, monthIndex: number): CalendarCell[] {
  const first = new Date(Date.UTC(year, monthIndex, 1, 12))
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const startDow = (first.getUTCDay() + 6) % 7 // Mon=0
  const cells: CalendarCell[] = []
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: null, day: null, inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ date, day, inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, day: null, inMonth: false })
  }
  return cells
}

export function parseYearMonth(localDate: string): { year: number; month: number } {
  const [y, m] = localDate.split('-').map(Number)
  return { year: y, month: m - 1 }
}

export function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'solved_independently':
      return 'solved independently'
    case 'solved_with_hints':
      return 'solved with a hint'
    case 'could_not_solve':
      return 'could not solve'
    default:
      return outcome
  }
}
