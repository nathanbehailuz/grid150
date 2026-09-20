export type Profile = {
  id: string
  display_name: string
  timezone: string
  focused_group_id: string | null
}

export type GroupRow = {
  id: string
  name: string
}

export type Membership = {
  id: string
  group_id: string
  role: 'owner' | 'admin' | 'member'
  groups: GroupRow
  /** Current-week rank in this group, when known. */
  rank?: number | null
}

export type GroupPace = {
  group_id: string
  problems_per_week: number | null
  deadline: string | null
  active_days: number[]
}


export type Problem = {
  id: string
  title: string
  slug: string
  difficulty: 'easy' | 'medium' | 'hard'
  global_order: number
  topic_id: string
  neetcode_url: string | null
}

export type Topic = {
  id: string
  slug: string
  name: string
  sort_order: number
}

export type ProgressStatus = 'locked' | 'available' | 'completed'

export type ProblemProgress = {
  problem_id: string
  status: ProgressStatus
}

export type ReviewTask = {
  id: string
  problem_id: string
  due_at: string
  status: 'pending' | 'completed' | 'cancelled'
  problems: Pick<Problem, 'id' | 'title' | 'slug' | 'global_order' | 'difficulty'>
}

export type AttemptType = 'new_problem' | 'scheduled_review'

export type AttemptOutcome =
  | 'could_not_solve'
  | 'solved_with_hints'
  | 'solved_independently'

export type WeeklySnapshot = {
  user_id: string
  group_id: string
  week_start: string
  progress: number
  consistency: number
  improvement: number
  total: number
  independent_solves: number
  hint_assisted_solves: number
  profiles?: { display_name: string } | null
}

export type MemberTarget = {
  daily_new_target: number
  group_id: string
}
