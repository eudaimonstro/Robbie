# MVP roadmap: an in-person HOA meeting

Status: adopted 2026-10-06; every phase and the whole-app review are merged (through #56, 2026-10-08). This file is the plan, what was built against it, and what is left. The decisions it rests on are in [`decisions.md`](decisions.md); the designs of each part are in [`design/`](design/README.md).

## The bar

Robbie is done as an MVP when it can run a real homeowners' association meeting held in a room: the president chairs from a laptop, a TV or projector shows the room what is going on, homeowners take part on their phones, and the homeowners without a phone or an account still count. Afterward the secretary has minutes and, if the bylaws were amended, a new version of the bylaws.

## What "done" means now

Everything below is built and the acceptance scenario passes end to end in CI (`e2e/tests/annual-meeting.spec.ts`) and in the local demo (`npm run demo`, `docs/demo.md`). What is left before the MVP is done is not code:

1. **The first deploy** to the server, as `docs/deploy.md` describes (host preparation, DNS, the first owner).
2. **Before launch** (`docs/deploy.md`, "Before launch"): the abuse, copyright and privacy mailboxes, the DMCA agent, who provides Robbie, and a lawyer's review of the Terms and the Privacy Policy.
3. **A rehearsal** at the venue on real phones, on its Wi-Fi and on mobile data (`docs/deploy.md`, "The night of a meeting").
4. **A real meeting.** The MVP is done when an HOA has held its meeting on Robbie and the secretary has published its minutes.

## The acceptance scenario

Maple Grove HOA, annual meeting, in the clubhouse. The Playwright scenario and the demo seed reproduce it.

**Before the meeting (Pat, the secretary, on a laptop):**

1. Signs in, accepts the terms, creates "Maple Grove HOA" with its 142 voting members and a 20% quorum.
2. Pastes the bylaws in. Articles and sections are recognized from the headings; Pat fixes one and saves. The bylaws are version 1.
3. Adds the president (Dana), the treasurer and the homeowners by email, with roles; marks the board.
4. Schedules the annual meeting: date, place, presiding officer, an agenda (call to order, approval of the 2025 minutes, treasurer's report, old business: pool resurfacing, new business: amend Section 4.2 to lower the quorum, election of two directors, adjournment), a document attached to the treasurer's report, and sends the notice.

**In the room (Dana chairs from a laptop; the TV shows the display view):**

5. Dana opens the meeting. The display shows the meeting name, the join code and a QR code.
6. Homeowners scan the code, sign in with an emailed code and are present. Dana marks Carmen, who has no phone, present from the roster and enters a headcount of the people without an account. Quorum (20% of the 142 lots) is met and shown.
7. Dana calls the meeting to order and the agenda is adopted. The agenda from the schedule is the live agenda.
8. The 2025 minutes are approved as read.
9. The treasurer presents; the attachment opens from the agenda item.
10. Old business: a homeowner moves to approve the pool contract from their phone, another seconds, two people speak (the queue shows on the display), Dana puts it to a vote: phones vote, Dana enters the show of hands for the rest, closes the vote, and the display announces the result in both parts.
11. New business: the board's proposed amendment to Section 4.2 is moved from a phone, seconded, and passes by two thirds; everyone sees the text voted on, and the bylaws become version 2 with the new text.
12. Election: nominations from the phones and the floor for two seats, one ballot on phones plus the tellers' count of paper ballots, two directors declared elected.
13. Dana adjourns.

**After:**

14. Pat opens the generated minutes, fixes a name, and publishes them. Members can read the minutes and the new bylaws; the public share link shows version 2.

## What was built

The four MVP phases each had a design, an implementation plan (in git history), independent review, a CI replay and a pull request.

| Phase | What                                                                                                                                                                                                                                                                                                                                  | Merged             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| -     | Accounts and sessions: email-code sign-in, users and sessions in Postgres (spec M2, before the roadmap)                                                                                                                                                                                                                               | 2026-10-06, #40    |
| A     | Organization membership: roles on every route and socket action, the terms step, members pages, packets under the organization, the demo seed                                                                                                                                                                                         | 2026-10-07, #41    |
| B     | In the room: meeting roles from the organization, the voting members, roster marking and headcounts, guests, floor tallies, presence that survives a locked phone, the display with its QR code, the deep link, the schedule's agenda live, the chair console, phone view and display on the design brief, and the Playwright harness | 2026-10-07, #42    |
| C     | The secretary's desk: importing bylaws (text, Markdown, Word), print pages, amendment preview, search, and minutes drafted at adjournment, edited, published and approved at the next meeting                                                                                                                                         | 2026-10-07, #43    |
| D     | Ship: the Docker image, Compose with Caddy and backups, the runbook, the full scenario in CI, dependency bumps                                                                                                                                                                                                                        | 2026-10-07, #44    |
| -     | Change or cancel a scheduled meeting; `npm run demo`                                                                                                                                                                                                                                                                                  | 2026-10-07, #45-46 |

Then a whole-app review (2026-10-08: security, meeting rules, screens, reliability under load, code health and product, each by an independent reviewer) and the batches that answered it:

| Batch                    | What                                                                                                                                                                                                                  | Merged          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Abuse and audit          | Preserving and removing reported files (`handleReport`), suspensions, the legal pages, the audit log of deletions, the storage limit                                                                                  | 2026-10-08, #47 |
| B1 server security       | Sign-in codes bound to the browser and limited per email and address, cross-site refusals, per-account write limits, admins-only emails, versions as the record, the live meetings table in the migrations            | 2026-10-08, #48 |
| A1 meeting integrity     | Socket action schemas, a bylaw amendment's text on every screen, moving the board's proposed amendment from a phone, sync fixes                                                                                       | 2026-10-08, #49 |
| E meeting night          | Live meetings in memory with write-through, coalesced slim updates, memory limits; load-tested at 150 phones                                                                                                          | 2026-10-08, #50 |
| D screens                | The documents side's failures, phones' touch targets, Settings, the minutes editor, word-level diffs, axe in e2e                                                                                                      | 2026-10-08, #51 |
| A2 meeting rules         | Fewer motions, each correct end to end (`docs/RONR_IMPLEMENTATION_STATUS.md`)                                                                                                                                         | 2026-10-08, #52 |
| A3 elections, thresholds | Several seats on one ballot, acclamation, write-ins, the organization's bylaw amendment threshold, voice votes and divisions                                                                                          | 2026-10-08, #53 |
| C onboarding             | Quorum at setup, the setup checklist, bulk adding, people added but not signed in on the roster, proxies and absentee ballots in the quorum, open amendments following an imported or new version                     | 2026-10-08, #54 |
| G board meetings, notice | Meetings of the directors with observers, the meeting notice by email and on paper                                                                                                                                    | 2026-10-08, #55 |
| F1 legacy code           | The Expo app out of the workspaces, member-to-member proxies, rule suspensions and the hidden motions' code removed, dead routes and exports, one source for rules the server and the web share, cookie-only sessions | 2026-10-08, #56 |
| F2 legacy docs, tooling  | Stale docs removed, `spec.md` folded into `decisions.md`, the designs in `docs/design`; lint at zero warnings, coverage thresholds, a parallel CI with a migration drift check, region-scoped e2e locators            | 2026-10-09, #57 |

## Known gaps

Accepted for the MVP. Each was checked against the code on 2026-10-08.

**What an HOA may need that Robbie doesn't do:**

- **Voting weight.** One member, one vote. HOAs that vote by lot, unit or share (a member with three lots has three votes) need a weight per member and in the floor counts.
- **Ballots before the meeting.** No mailed or electronic ballots: the chair enters how many proxies and absentee ballots are held (they count toward the quorum), and their votes are counted in the room. No proxy voting on devices.
- **Executive session.** Recess, and summarize it in the minutes.
- **Committees.** Refer stores the committee's name as text; there are no committees with members or reports of their own.
- **Officer titles.** Only the presiding officer of each meeting and the board (directors) are recorded; nobody is "Treasurer" in Robbie.
- **Recurring schedules.** Each meeting is scheduled on its own.
- **Motions left out** (`docs/RONR_IMPLEMENTATION_STATUS.md`): table and take from the table, reconsider, rescind or amend something previously adopted, suspend the rules, divide the question, objection to consideration, orders of the day, fix the time to adjourn to, limit debate. Closing and reopening nominations are the chair's actions, not voted motions. No threshold of the members present.

**In the meeting:**

- The chair can't remove a guest, or close a meeting to guests.

- The debate stances (who spoke for or against) are one list for the meeting, cleared at every decision, rather than kept per motion.
- On an appeal, where a tie sustains the chair, the chair's deciding vote is still offered by the majority rule.

**On the documents side:**

- A version made by a bylaw amendment from a meeting has no effective or adoption date, so history by date doesn't find it by the meeting's date.
- The bylaw sync's outcome isn't stored: a failure is logged and noted in the amendment's description for a secretary, with no retry action, and the vote is kept as JSON on the amendment rather than as a record of its own.
- A proposed amendment with more than one change can't be moved in a meeting as drafted: a member writes the change on the phone instead.
- `Document.currentVersionId` and `Amendment.resultingVersionId` have no foreign keys; documents, versions and sections have no `createdById` or `updatedAt`.

**In the server:**

- An upload's type is the `Content-Type` it was sent with (checked against the allowed types), not sniffed from its bytes.
- A remote Postgres's TLS certificate is verified only with `DATABASE_SSL=verify`; the production stack's database is local, so this matters only on another host.
- The REST schemas still accept snake_case aliases of some fields and aren't strict, so a stale key is dropped rather than refused.
- Two error shapes: routes answer `{ error, code? }`, while validation, Prisma and unexpected errors answer `{ error: { code, message } }`.
- No "send a test email" in Settings; the runbook uses the `sendTestEmail` script.

**In the web app and the tooling:**

- Two error boundaries, neither reporting to the server; Settings shows a hard-coded version, 1.0.0; the phone's lobby gives the start time in the phone's time zone, not the organization's.
- Large files to split: `socket/actionValidator.ts` (1,900 lines), `api/client.ts` (1,100), `shared/types/index.ts` (1,000), `MeetingScheduler.tsx`.
- The check that no control on a page is covered or off-screen at 390px and 1280px (`document.elementFromPoint` at each control's center, from the old spec's M9) wasn't built; the header test checks the header only.
- Page tests mock the API client module (28 files), so a renamed endpoint or a changed response shape passes them.
- Unit and integration coverage are reported apart, not merged; `publish` rebuilds the image rather than pushing the one `image` tested (the build cache makes them the same in practice).
