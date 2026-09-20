import type { WeeklySnapshot } from './types'

export type RankInfo = {
  rank: number | null
  of: number
  score: number | null
  gapToFirst: number | null
  movement: number | null
}

export function rankFromSnapshots(
  snaps: WeeklySnapshot[],
  userId: string,
): { rank: number | null; of: number; score: number | null; firstScore: number | null } {
  const sorted = [...snaps].sort((a, b) => Number(b.total) - Number(a.total))
  const of = sorted.length
  const idx = sorted.findIndex((s) => s.user_id === userId)
  const mine = idx >= 0 ? sorted[idx] : null
  const first = sorted[0] ?? null
  return {
    rank: idx >= 0 ? idx + 1 : null,
    of,
    score: mine != null ? Number(mine.total) : null,
    firstScore: first != null ? Number(first.total) : null,
  }
}

export function standingDelta(
  thisWeek: WeeklySnapshot[],
  lastWeek: WeeklySnapshot[],
  userId: string,
): RankInfo {
  const cur = rankFromSnapshots(thisWeek, userId)
  const prev = rankFromSnapshots(lastWeek, userId)
  const gap =
    cur.score != null && cur.firstScore != null
      ? Math.max(0, cur.firstScore - cur.score)
      : null
  const movement =
    cur.rank != null && prev.rank != null ? prev.rank - cur.rank : null
  return {
    rank: cur.rank,
    of: cur.of,
    score: cur.score,
    gapToFirst: gap,
    movement,
  }
}

export function allTimeAverage(
  snaps: { user_id: string; total: number | string }[],
  userId: string,
): number | null {
  const mine = snaps.filter((s) => s.user_id === userId)
  if (mine.length === 0) return null
  const sum = mine.reduce((n, s) => n + Number(s.total), 0)
  return sum / mine.length
}

export function daysUntil(deadline: string | null, todayLocal: string): number | null {
  if (!deadline) return null
  const [ay, am, ad] = todayLocal.split('-').map(Number)
  const [by, bm, bd] = deadline.split('-').map(Number)
  const aMs = Date.UTC(ay, am - 1, ad)
  const bMs = Date.UTC(by, bm - 1, bd)
  return Math.round((bMs - aMs) / 86400000)
}
