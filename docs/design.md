# Grid150 Feature Map

Feature inventory derived from `mockups/`. This document describes **what each screen does**, not how it looks.

## Page files

| File | Nav label | Product brief screen |
| --- | --- | --- |
| `mockups/personal_dashboard.html` | Today | Personal Dashboard |
| `mockups/neetcode_150_syllabus.html` | Roadmap | Syllabus |
| `mockups/group_standings.html` | Leaderboard | Group Dashboard (standings only) |
| `mockups/join_or_create_group.html` | Create or join | Join with code or create a group |
| `mockups/log_attempt.html` | (from Today / Log) | Honor-based attempt log |
| `mockups/index.html` | - | Redirects to Today |

Sidebar Today / Roadmap / Leaderboard, Groups dropdown, Log attempt, and Create or join now go to these files. There is no auth, settings, review-queue, or group-admin screen. `my_study_groups.html` is leftover and not in nav.

---

## Shared chrome

Present on every page.

**Sidebar**

- Logo and Grid150 name (home)
- Global NeetCode 150 completion (count and percent, independent vs assisted)
- Primary navigation: Today, Roadmap, Leaderboard
- Leaderboard accessory is the member's rank in the **focused group**
- Groups is a dropdown of current memberships; choosing one opens that group's standings and sets it as focused
- Create or join at the bottom of the Groups dropdown
- Profile switcher: display name and how many groups the user belongs to

**Top bar**

- Search (affordance only; no search screen in the mockup)
- Notifications (affordance only; no notification screen in the mockup)
- Log attempt — opens the honor-based log screen

**Mobile**

- Bottom nav: Today, Roadmap, Leaderboard, Groups
- Center log-attempt action (same log screen)

---

## Today

Personal dashboard for the current day and current week. This is the home screen.

**Status**

- Date and greeting
- Current week number

**Questions today**

- Next new problem and any reviews due now
- Each row opens the log screen, scrolled to that question
- New problems stay locked on the log screen until the due review is saved

**Personal summary (left half)**

- Daily new-problem target vs completed today
- Current streak and personal-best streak
- Weekly score vs last week, with independent vs hint-assisted counts
- Rank in the focused group, including movement and gap to first

**Practice calendar (right half)**

- Month view of practice history
- Month navigation
- Each day shows how many questions were completed
- Day states: practiced, missed active day, rest day, today, future

**This week**

- Weekly score out of 100
- Score breakdown:
  - Progress, with independent vs hint-assisted counts
  - Consistency, as targets met vs active days
  - Improvement vs recent baseline
- Daily chart of independent vs hint-assisted solves
- Link to the Leaderboard page

---

## Roadmap

Ordered NeetCode 150 syllabus. New problems unlock in sequence; reviews can revisit completed problems.

**Overview**

- Total completed of 150
- Search completed problems
- Filter: All, Due, Completed

**Topics**

Each topic shows:

- State: complete, currently active, or locked
- Problems completed vs total in the topic
- Mastery percentage (or none if locked)
- Review-due indicator when that topic has a scheduled review

**Current topic detail**

- Topic name and remaining work
- Independent solve count
- Hint-assisted solve count
- Review pass rate

The mockup lists topics but does not include a per-problem drill-down screen. Mastery still appears as a per-topic percent; the definition banner is gone.

---

## Leaderboard

Group competition for the currently focused group.

**Period**

- This week vs all time
- Switching the period updates the standings title and the user’s displayed score
- Weekly view uses weekly score
- All-time view uses average weekly score

**Group summary**

- Your rank and rank movement vs last week
- Your score for the selected period
- Group pace (expected problems per week)
- Group deadline and days remaining

**Standings table**

Each member row includes:

- Rank
- Name and NeetCode 150 completion since progress is group-visible
- Progress: independent solves and hint-assisted solves
- Streak in days and targets met this period
- Improvement indicator (up, down, or flat)
- Score
- Current user highlighted

**Other**

- Score details affordance (no details panel in the mockup)
- Opening a group from the Groups dropdown lands here

---

## Groups

Memberships live in the sidebar dropdown, not a list page. `my_study_groups.html` is leftover.

Each dropdown row includes:

- Group name
- User's rank in that group
- Opens that group's Leaderboard and sets it as focused

**Create or join** (`join_or_create_group.html`)

- Join: enter a 6-character invite code
- Create: enter a group name and receive a generated invite code
- The joined or created group becomes the focused group

The mockup does not include group settings, member management, invite management, public discovery, or join-request approval.

---

## Log attempt

Honor-based logging for today's questions (`log_attempt.html`).

- Review form: outcome, time, confidence 1-5, could explain, optional private reflection
- New-problem form: same fields, locked until the due review is saved
- Header Log attempt and Questions today both open this page

The mockup does not include editing, deleting, or invalidating an attempt after save.

---

## What exists only as chrome, not as a page

These controls appear but have no dedicated screen:

- Search
- Notifications
- Profile / account menu

---

## Gaps vs `docs/PRODUCT_BRIEF.md`

Missing **screens** from the brief:

- Authentication and profiles
- Dedicated **Review Queue** (overdue first, reason, previous outcome, next review date)
- **Group Management** (visibility, open vs approval join, invite codes, members/roles, pace/schedule, attempt invalidation)
- Public-group discovery
- Attempt correction (10-minute member edit/delete, admin invalidation, audit log)

Missing **Personal Dashboard** pieces:

- Recent private attempts
- Calendar day detail (new vs review vs plan result). The calendar shows counts and rest/missed, but selecting a day does not open that breakdown.

Missing **Syllabus** pieces:

- Logging a new problem from the roadmap (the aside CTA is “Execute LRU Cache Review,” not an attempt form)
- Locked / available / completed / review-due states are shown at topic level; per-problem logging still is not a flow

Missing **Group Dashboard** analytics from the brief:

- Active practice days
- Weekly pace marker as a syllabus range (standings show problems/week and a deadline only)
- Member progress comparison beyond the table
- Independent-solve trend
- Consistency heatmap
- Topic mastery distribution
- Group-wide weak topics
- Recent milestones with preset reactions (not in the standings mockup)

**Conflicts** (mockup shows something the brief rejects):

- Standings “Score Metric Matrix” uses accumulated points (independent +10, review +8, hint +4, streak +2/day). The brief’s weekly score is out of 100: Progress 50 + Consistency 25 + Improvement 25. All-time is average weekly score, not a point sum.
- Groups copy on leftover `my_study_groups.html` may still mention live discussions. The brief has no chat, comments, or shared solutions.

Honor-based logging and create/join by invite code are now mockup pages. Calendar day selection and a working weekly/all-time score switch are still not implemented.
