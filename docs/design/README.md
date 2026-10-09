# Designs

Each part of Robbie was designed before it was built; these documents keep the reasons. They are history, not a description of the code as it is now: later work changed some details, and where a design and the code disagree, the code wins (CLAUDE.md describes it as it is). Older ones cite `spec.md` sections (M2, M3, M12); that spec's decisions are in `docs/decisions.md`, and git history keeps it.

In the order they were built:

1. [Accounts and sessions](2026-10-06-accounts-and-sessions-design.md) (#40): email-code sign-in, server-side sessions and users in Postgres, replacing in-memory auth.
2. [Organization membership](2026-10-06-organization-membership-design.md) (#41): roles from viewer to owner, a role check on every route and socket action, adding people by email.
3. [In the room](2026-10-06-in-the-room-design.md) (#42): meeting roles from the organization, people without a device counted, floor tallies, the chair console, phone view and display.
4. [The secretary's desk](2026-10-07-secretarys-desk-design.md) (#43): importing bylaws, print pages, amendment preview, search, and minutes drafted at adjournment.
5. [Ship](2026-10-07-ship-design.md) (#44): the Docker image, Compose with Caddy and backups, the runbook, and the Playwright scenario in CI.
6. [Change a scheduled meeting](2026-10-08-change-a-scheduled-meeting-design.md) (#45): changing a meeting's details, agenda and files from Live Meetings until the call to order, and canceling it.
7. [Abuse handling](2026-10-08-abuse-handling-design.md) (#47): preserving and removing reported files, suspensions, and the legal pages.
8. [Meeting rules](2026-10-08-meeting-rules-design.md) (#52): fewer motions, each correct end to end in the state, the screens and the minutes.
9. [Elections and thresholds](2026-10-08-elections-and-thresholds-design.md) (#53): several seats on one ballot, acclamation, write-ins, the organization's bylaw threshold, and voice votes.
10. [Onboarding](2026-10-08-onboarding-design.md) (#54): quorum at setup, a setup checklist, bulk adding, the roster's people who haven't signed in, and proxies in the quorum.
11. [Board meetings and notice](2026-10-09-board-meetings-and-notice-design.md) (#55): meetings of the directors with observers, and the meeting notice by email and on paper.
