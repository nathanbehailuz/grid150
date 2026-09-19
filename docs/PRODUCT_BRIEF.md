# Grid150 Product Brief

## Product Summary

Grid150 is a competitive accountability dashboard for people completing the NeetCode 150. Everyone follows the same strict problem sequence, logs their work manually, reviews weak problems on schedule, and competes inside one or more groups.

The product does not verify activity through LeetCode or NeetCode integrations. It uses honest self-reporting and makes consistency, independent problem-solving, improvement, and retention visible to the group.

## Product Goal

Help real study groups finish the NeetCode 150 by turning individual practice into a visible, structured competition without becoming a tutoring or chat platform.

## Core Principles

- One shared syllabus: every user and group follows the NeetCode 150.
- Strict progression: new problems are completed in the recommended order.
- Honest logging: members report attempts, hints, confidence, and explanation ability themselves.
- Prove retention: weak solves create mandatory scheduled reviews.
- Group-specific competition: progress and scores begin when a member joins a group.
- Private details, public summaries: groups see results, not private reflections or detailed attempts.
- Accountability over collaboration: the social experience centers on standings, reactions, and analytics.

## Target Users

- Friends preparing for software engineering interviews
- University coding clubs and small cohorts
- Accountability groups working through the NeetCode 150 at different paces
- Individuals who want structured review and friendly competition

## Curriculum

The platform contains one global, seeded NeetCode 150 syllabus. Problems belong to ordered topics and have a fixed global sequence.

### New Problems

- A member may log only their next unlocked new problem.
- Solving independently or with hints unlocks the next problem immediately.
- An unsuccessful attempt does not unlock the next problem.
- Admins cannot skip, reorder, assign, or unlock problems for members.
- Weekly group assignments are pace markers only and never override strict progression.

### Reviews

- Reviews can use any previously completed problem; syllabus order does not apply.
- A review represents the member logging whether they could solve the problem again.
- The platform does not verify that code was executed or submitted elsewhere.
- An overdue required review blocks the member from logging new problems.
- The member can continue logging due reviews until the review queue is cleared.

## Attempt Logging

Every attempt records:

- Problem
- Completion date and time
- Attempt type: new problem or scheduled review
- Outcome: could not solve, solved with hints, or solved independently
- Time spent
- Confidence from 1 to 5
- Could explain aloud: yes or no
- Optional private reflection

"Solved with hints" is a self-reported choice. Grid150 does not attempt to define or detect what constitutes a hint.

### Review Schedule

| Attempt result | Explanation result | Next review |
| --- | --- | ---: |
| Could not solve | Either | 1 day |
| Solved with hints | Cannot explain | 1 day |
| Solved independently | Cannot explain | 2 days |
| Solved with hints | Can explain | 4 days |
| Solved independently | Can explain | 14 days |
| Passed scheduled review independently | Can explain | 30 days |
| Failed scheduled review | Either | 2 days |

When multiple rules apply, the earliest review date wins.

## Groups

Users may create and join multiple groups. Every group follows the same syllabus but controls its own pace, schedule, visibility, and competition.

### Discoverability

- Public groups can appear in search and discovery.
- Private groups are accessible through an invite code or invite link.
- A public group can allow immediate joining or require admin approval.

### Roles

**Owner**

- Edit group settings
- Promote or remove admins
- Transfer ownership
- Remove members
- Delete the group

**Admin**

- Approve join requests
- Manage members
- Configure group pace, deadline, active days, and weekly pace markers
- Invalidate an incorrect attempt after its editing window

**Member**

- Log attempts and reviews
- Set a personal daily target within group rules
- View group summaries, analytics, and leaderboards
- Add preset reactions to eligible activity

Admins cannot alter curriculum order, unlock problems, manufacture progress, or assign out-of-order problems.

### Pace Settings

A group may use any combination of:

- Expected problems per week
- Target completion deadline
- Weekly syllabus section or problem range as a pace marker
- Active practice days

Members set a personal daily new-problem target. A target change takes effect at the beginning of the following week and cannot be applied retroactively.

## Progress Across Multiple Groups

An attempt is logged once and attributed to every group in which the user was an active member at the attempt time.

An attempt counts for a group only when:

```text
attempt.completed_at >= group_membership.joined_at
```

- Attempts never count retroactively for groups joined later.
- A solve can count in several groups when the member belonged to all of them at that time.
- Scores, streaks, targets, rankings, and progress views remain group-specific.
- Each member has one **focused group** at a time: the last group they opened, or their earliest membership if they have never opened a group this session.
- The sidebar Leaderboard rank is the member's rank in the focused group, not a global rank across groups.
- The Groups control lists every membership. Choosing a group sets it as focused and opens that group's standings.
- Create or join is a separate screen: join with an invite code, or create a group by name and receive a generated invite code. The new or joined group becomes focused.
- Leaving a group does not erase historical standings or activity.
- Rejoining does not make activity completed during the absence eligible.
- Reviews remain connected only to groups eligible for the qualifying attempt.

## Targets and Streaks

- A daily target measures new problems, not reviews.
- Groups select the days considered active practice days.
- A streak day is earned by meeting the personal target on an active day.
- Missing the target on an active day breaks the streak.
- There are no streak freezes.
- Reviews are tracked separately and cannot inflate new-problem completion.

## Scoreboard

Each group has weekly and all-time leaderboard views.

### Weekly Score

The weekly score is out of 100:

```text
Weekly score = Progress (50) + Consistency (25) + Improvement (25)
```

**Progress**

- Independent solve weight: 1.0
- Hint-assisted solve weight: 0.6
- Unsuccessful attempt weight: 0
- Weighted progress is compared with the member's personal target.
- Above-target credit is capped at 120% to provide a small bonus without rewarding target manipulation.

**Consistency**

```text
Active days where target was met / configured active days
```

**Improvement**

- Measures the increase in independently solved problems.
- Uses the member's previous three completed weeks as the baseline.
- Early members use available previous weeks; the first week receives a neutral improvement score.
- The result is bounded to prevent one unusual week from dominating the leaderboard.

### All-Time Ranking

- Rank members by average weekly score, not accumulated points.
- Show total completed weeks beside the average to provide context.
- Require at least one completed week to appear in all-time rankings.
- Preserve weekly score history and rank movement.

### Visible Leaderboard Data

- Rank and rank movement
- Weekly or average weekly score
- Independent solves
- Hint-assisted solves
- Current streak
- Improvement indicator
- Eligible NeetCode progress since joining

## Social Layer

Grid150 is intentionally not a study chat or tutoring platform.

- Members can add small preset reactions to milestones and leaderboard activity.
- There are no free-form comments, direct messages, help requests, shared solutions, or study-session tools.
- Suggested reactions: applause, fire, respect, comeback, and challenge.
- Reaction totals are lightweight recognition and do not affect scores.

## Privacy

Group members can see:

- Scores and ranking
- Streaks
- Completion totals
- Topic-level progress
- Independent and hint-assisted solve totals
- Improvement and retention summaries

Only the member can see:

- Private reflections
- Confidence ratings for individual attempts
- Exact attempt history and unsuccessful attempt details
- Explanation responses for individual problems

Owners and admins can see only the metadata needed to invalidate suspicious or accidental entries; they do not gain access to private reflections.

## Primary Screens

### Personal Dashboard

- Questions today: the next new problem and any reviews due now; opening one goes to the log screen
- Combined personal summary: daily new-problem target, streak, weekly score, and focused-group rank
- Practice calendar
- Weekly score component breakdown
- NeetCode 150 completion in the sidebar

### Syllabus

- Ordered NeetCode 150 roadmap
- Locked, available, completed, and review-due states
- Topic progress and mastery
- Problem logging flow

### Review Queue

- Overdue and due-today reviews first
- Review reason and previous outcome
- Log-review action
- Next review date after submission

### Group Dashboard

- Weekly and all-time leaderboard toggle
- Group pace, active days, and deadline
- Weekly pace marker
- Member progress comparison
- Independent-solve trend
- Consistency heatmap
- Topic mastery distribution
- Group-wide weak topics
- Recent milestones with preset reactions

### Join or Create Group

- Join with an invite code
- Create a group by name and receive a generated invite code
- The new or joined group becomes the focused group

### Group Management

- Public/private visibility
- Open joining or approval mode
- Invite code management
- Member and role management
- Pace and schedule settings
- Attempt invalidation tools

## Attempt Corrections

- Members may edit or delete an accidental attempt for 10 minutes after logging it.
- After 10 minutes, an owner or admin may invalidate the attempt.
- Invalidated attempts remain in an audit log but no longer affect progress, reviews, scores, or streaks.
- Score and progress projections must be recalculated after an edit or invalidation.

## Backend Responsibilities

The backend must perform meaningful application logic:

- Authentication and authorization
- Row-level access control for private data
- Global syllabus ordering and unlock validation
- Review scheduling and new-problem blocking
- Attempt attribution across active group memberships
- Group-specific progress snapshots
- Weekly score calculation and historical snapshots
- Average weekly leaderboard calculation
- Streak calculation using group active days and timezone
- Delayed target changes
- Attempt edit-window enforcement and invalidation audit trail
- Realtime leaderboard and activity updates

## Suggested Data Model

- `profiles`
- `topics`
- `problems`
- `groups`
- `group_memberships`
- `group_join_requests`
- `group_invites`
- `group_pace_settings`
- `member_targets`
- `attempts`
- `attempt_group_attributions`
- `problem_progress`
- `review_tasks`
- `weekly_score_snapshots`
- `reactions`
- `attempt_audit_log`

## Recommended Stack

- Frontend: React with TypeScript
- Backend: Supabase
- Database: PostgreSQL
- Authentication: Supabase Auth
- Security: Supabase Row Level Security
- Realtime: Supabase Realtime
- Server logic: PostgreSQL functions and Supabase Edge Functions where appropriate
- Charts: the project's existing React-compatible chart library

## MVP Scope

The first usable release includes:

- Authentication and profiles
- Seeded ordered NeetCode 150 syllabus
- Manual attempt logging
- Review scheduling and blocking
- Personal targets and strict streaks
- Public and private groups
- Open and approval-based joining
- Owner, admin, and member roles
- Multi-group attempt attribution
- Weekly and average-weekly leaderboards
- Core personal and group analytics
- Ten-minute attempt correction and admin invalidation
- Preset reactions
- Responsive dashboard UI

## Out of Scope

- LeetCode or NeetCode account synchronization
- Code execution or submission verification
- Free-form chat, comments, or direct messages
- Shared solutions or tutoring tools
- Live study sessions
- Custom syllabi or out-of-order progression
- AI-generated hints or coaching
- Native mobile applications

## Success Criteria

- A new user can create an account, join or create a group, set a target, and log their first attempt without guidance.
- The system never unlocks a new problem out of order.
- An overdue review reliably blocks new-problem logging.
- One attempt is correctly attributed only to groups the user belonged to at that moment.
- Weekly scores can be explained from visible component values.
- Private attempt details are inaccessible to other members.
- The dashboard remains useful for an actual study group over the full NeetCode 150 journey.

