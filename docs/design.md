# Grid150 Feature Map

Feature inventory derived from `mockups/`. This document describes **what each screen does**, not how it looks.

The mockup is a logged-in app with four primary pages, shared chrome, and one attempt-logging overlay. There is no auth, settings, review-queue, or group-admin screen in the mockup.

---

## Shared chrome

Present on every page.

**Sidebar**

- App home / brand
- Primary navigation: Today, Roadmap, Leaderboard, Groups
- Global NeetCode 150 completion (count and percent)
- Profile switcher: display name and how many groups the user belongs to

**Top bar**

- Current page title
- Search (affordance only; no search screen in the mockup)
- Notifications (affordance only; no notification screen in the mockup)
- Log attempt — opens the attempt dialog for the next unlocked new problem

**Mobile**

- Bottom nav: Today, Roadmap, Leaderboard, Groups
- Center log-attempt action (same new-problem dialog)

---

## Today

Personal dashboard for the current day and current week. This is the home screen.

**Status**

- Date and greeting
- Current week number and this week’s score out of 100
- Review-required blocker when a scheduled review is due: problem name, why it is due, and a Start review action
- Start review opens the attempt dialog in scheduled-review mode
- While a required review is outstanding, the next new problem stays locked

**Personal metrics**

- Daily new-problem target vs completed today
- Remaining new problems needed to hit today’s target
- Current streak in days, plus personal-best streak
- Weekly score vs last week
- Rank in the currently focused group, including rank movement

**Practice calendar**

- Month view of practice history
- Month navigation
- Each day shows how many questions were completed
- Day states: practiced, missed active day, rest day, today, future
- Selecting a day shows:
  - Date
  - Total questions completed
  - New problems vs reviews
  - That day’s plan / target
  - Result: plan met, partial, missed, or rest day
- Streak explanation tied to the last missed active day

**This week**

- Weekly score out of 100
- Score breakdown:
  - Progress, with independent vs hint-assisted counts
  - Consistency, as targets met vs active days
  - Improvement vs recent baseline
- Daily chart of independent vs hint-assisted solves
- Link to the Leaderboard page

**Up next**

- Next unlocked NeetCode problem
- Difficulty
- Topic and progress within that topic
- Locked state when a review is blocking new-problem logging

**Current group snapshot**

- Mini leaderboard for the focused group (top members this week)
- Each row: rank, name, independent-solve count, weekly score
- Current user highlighted
- Link to the full Leaderboard page

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

**Mastery definition**

- Mastery is independent solves plus successful scheduled reviews, not completion alone

The mockup lists topics but does not include a per-problem drill-down screen.

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
- Preset reaction on other members (count can be incremented)
- Current user highlighted; the current user has no self-reaction control

**Other**

- Score details affordance (no details panel in the mockup)
- Opening a group from the Groups page lands here

---

## Groups

List of groups the user belongs to, plus entry points to create or join.

**Group list**

Each group card includes:

- Name
- Visibility: public or private
- Member count
- User’s role: owner, admin, or member
- User’s rank in that group
- Average weekly score
- Current pace marker: topic and week
- Pace progress
- Open group — goes to that group’s Leaderboard

**Actions**

- Create group (affordance only; no create flow in the mockup)
- Find a group: browse public groups or join with an invite code (affordance only; no discovery/join flow in the mockup)

The mockup does not include group settings, member management, invite management, or join-request approval.

---

## Log attempt overlay

Shared dialog for both new problems and scheduled reviews. Opened from the top bar, mobile log button, or Start review on Today.

**Context**

- Mode: New problem or Scheduled review
- Problem title (next unlocked problem, or the due review)

**Fields**

- Outcome:
  - Couldn’t solve
  - Solved with hint
  - Independent
- Time spent, in minutes
- Confidence, 1–5
- Could explain out loud (yes/no; this affects the next review date)
- Optional private reflection

**Result**

- Cancel or save
- Saving confirms that progress and scores were updated

The mockup does not include editing, deleting, or invalidating an attempt after save.

---

## What exists only as chrome, not as a page

These controls appear in the mockup but have no dedicated screen:

- Search
- Notifications
- Profile / account menu
- Create group
- Find / join a group
- Leaderboard score-details panel
- Topic problem list inside Roadmap
