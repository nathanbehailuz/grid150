# Build Log: Grid150

## Goal & scope decision

- Building a competitive accountability dashboard for groups finishing the NeetCode 150. The product is honor-based self-reporting, not LeetCode/NeetCode sync, and not a tutoring or chat app.
- Left out of MVP: code execution, shared solutions, comments/DMs, live study sessions, custom syllabi, AI coaching, native mobile apps.
- 2026-09-19: Wrote `docs/design.md` as a feature map of the mockups (which page includes what). Skipped styling and layout on purpose; the mockup look is not the visual source of truth.
- 2026-09-19: Linked the four Stitch HTML mockups to each other and gap-checked them against the product brief. Did not add missing screens; documented gaps in `docs/design.md` instead.
- 2026-09-19: Calmed the mockup UI across all pages. Neon greens/oranges/purples, glows, pulse dots, and fake HUD copy were making a dark theme feel loud. Kept Geist + JetBrains Mono only.
- 2026-09-19: Today is questions of the day plus a split stats/calendar. Sidebar Groups is a membership dropdown; create/join is its own screen. Sidebar Leaderboard rank is the focused group.
- 2026-09-19: Removed the Roadmap "Review timing" bar chart. Topic list already shows due/mastery; the spark matrix was extra chrome.
- 2026-09-19: Removed the Roadmap Mastery definition banner. It restated a product rule already in the brief.
- 2026-09-19: Dropped the top-right header avatar. Profile stays in the sidebar only.
- 2026-09-19: Replaced the header Grid150 wordmark with a grid mark. No product name in chrome.
- 2026-09-19: Removed the Roadmap "Dependency Graph Link" card. It was decorative and had no destination.
- 2026-09-19: Removed fire emojis and the Reactions column from Leaderboard. Streak stays as days of text.
- 2026-09-19: Moved the logo to the sidebar top-left and put Grid150 beside it. Header is search, notifications, and Log attempt only.
- 2026-09-19: Removed the sidebar "Pages" label. Nav items sit under the progress card.

## Stack & tooling

- Planned: React + TypeScript frontend, Supabase (Postgres, Auth, RLS, Realtime, Edge Functions).
- Implementation has not started. Current repo is product definition plus linked HTML mockups in `mockups/`.

## Key decisions & trade-offs

- Decision: one global NeetCode 150 syllabus in strict order because groups need a shared sequence they can compete on (alternative considered: custom or per-group syllabi).
- Decision: reviews can revisit any completed problem and overdue reviews block new-problem logging because retention is a first-class goal, not just completion count.
- Decision: weekly score is Progress 50 + Consistency 25 + Improvement 25; all-time rank is average weekly score, not accumulated points, so late joiners are not permanently behind.
- Decision: attempts count only for groups the user already belonged to at log time because retroactive credit would let people join, dump history, and distort standings.
- Decision: social layer is preset reactions only (alternative considered: comments/chat) to keep the product accountability-focused.
- Decision: `docs/design.md` inventories mockup **features** only. Visual design will be redone; do not treat mockup CSS as the UI spec.
- Decision: always update this build log after meaningful work so assignment history stays current instead of being reconstructed at the end.
- Decision: mockup visual language is muted sage on charcoal, two typefaces, no em dashes, and no fake version/live chrome (alternative considered: leaving the Stitch defaults).
- Decision: chrome rank is the focused group (last opened, else earliest membership) because a global rank across groups is undefined (alternative considered: average rank or hiding the number).

## Hard parts / dead ends

- Today’s review modal used both `hidden` and `flex`, so the overlay sat on top of the page and ate clicks. Removed the conflicting `flex` until the modal is opened.

## How I verified it works

- Served `mockups/` locally and loaded Today, Roadmap, Leaderboard, Groups. Confirmed sidebar `data-path` hrefs point at the four HTML files, brand goes to Today, and group/standings CTAs go to Leaderboard.
- Compared those pages to `docs/PRODUCT_BRIEF.md` primary screens and logged gaps in `docs/design.md`. Did not click-test create/join stubs beyond noting they are modals.
- Rechecked all four pages after the mute pass: icons render as outlined symbols, v2.4/LIVE/glows are gone, type is Geist + JetBrains Mono.
- After the Today rebuild, checked questions-of-the-day links, Groups dropdown, create/join, and log screens.
- Reloaded Roadmap after dropping Review timing and confirmed the bar chart is gone while topics and the current-topic panel remain.
- Reloaded Roadmap after dropping the Mastery banner; search/filters sit under the progress strip.
- Reloaded Today after dropping the header avatar; Log attempt is the last control in the top bar.
- Reloaded Today after swapping the header wordmark for `logo.svg`.
- Reloaded Roadmap after dropping Dependency Graph Link; the page ends on the Log LRU Cache review CTA.
- Reloaded Leaderboard after dropping fire emojis and the Reactions column.
- Reloaded Today after moving the logo and Grid150 name to the top of the sidebar.
- Reloaded Today after dropping the Pages label.

## Known limitations

- Mockups still missing: auth, review queue, group admin, recent private attempts, group analytics (heatmap, weak topics, mastery distribution), and 10-minute edit / invalidation.
- Standings mockup score tooltip contradicts the brief (point sum vs weekly score out of 100).
- Search and notifications still go nowhere. `my_study_groups.html` is leftover and not in nav.
- GitHub CLI on this machine had an invalid token for `nathanbehailuz`; terminal auth still needs `gh auth login` if pushing.
- Git commit identity is still the old global name/email unless changed to `nathanbehailuz` / `nz2212@nyu.edu`.

## Time spent

- Product definition / brief: majority of current work.
- Mockup review → `docs/design.md`, then a visual pass to mute color, copy, and type.
- Implementation: 0.
