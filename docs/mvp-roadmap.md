# MVP roadmap: an in-person HOA meeting

Status: adopted 2026-10-06. This file is the working plan for the MVP and is updated as phases finish.

## The bar

Robbie is done as an MVP when it can run a real homeowners' association meeting held in a room: the president chairs from a laptop, a TV or projector shows the room what is going on, homeowners take part on their phones, and the homeowners without a phone or an account still count. Afterward the secretary has minutes and, if the bylaws were amended, a new version of the bylaws.

Decisions made on 2026-10-06, when the owner handed over product decisions:

- **Product name: Robbie.** "Robbie-Bylawyer" was the monorepo's name, not a product name. The app says Robbie everywhere; the documents side is a section of it, not a second product.
- **Phones use the web app.** Participants open a link or scan a QR code and use the responsive web app. The Expo app stays building and minimally working (it gets the terms step) but gets no new features in the MVP. Spec M10 is deferred.
- **People without a device are first-class.** Most of an HOA's homeowners will never have an account, so the organization records how many eligible voting members it has (the quorum denominator, for example 142 lots), and the chair or secretary enters a headcount of people in the room without a device, with names when they want them in the minutes. Members with accounts are present when their device is connected or when they are marked present from the roster. Quorum is device-present plus marked-present plus the headcount, over the eligible count. Votes work the same way: device votes count one each, and the chair enters show-of-hands counts for the rest. The counts the chair enters are kept apart from device data, summed at the moment of decision, and shown separately on the display so the room can check them.
- **Phones lock.** A locked phone must not cost its owner their vote. Presence survives a short disconnection, and reconnecting during a vote restores the right to vote in it.
- **Meeting roles come from the organization.** A meeting is created from an organization by a secretary or above; its creator chairs unless they hand over. Organization members join as members; anyone else with the code joins as a non-voting guest. `ADMIN_EMAILS` goes away.
- **One design language for the whole app.** The token and utility system in `frontend-unified/src/styles/index.css` already exists and the documents side uses it; the live meeting screens (chair console, phone view, display view) are designed fresh on it, and the rest of the meetings module moves off raw palette classes.
- **The wire protocol stays.** `JOIN_MEETING { meetingCode }` does not change; the server derives the role from the organization and the meeting's packet. That is what keeps the mobile app working without new features.

## The acceptance scenario

Maple Grove HOA, annual meeting, in the clubhouse. This is what a Playwright test and the demo seed reproduce.

**Before the meeting (Pat, the secretary, on a laptop):**

1. Signs in, accepts the terms, creates "Maple Grove HOA".
2. Pastes the bylaws in. Articles and sections are recognized from the headings; Pat fixes one and saves. The bylaws are version 1.
3. Adds the president (Dana), the treasurer and twelve homeowners by email, with roles.
4. Schedules the annual meeting: date, place, an agenda (call to order, approval of the 2025 minutes, treasurer's report, old business: pool resurfacing, new business: amend Section 4.2 to lower the quorum, election of two directors, adjournment), the budget PDF attached.

**In the room (Dana chairs from a laptop; the TV shows the display view):**

5. Dana opens the meeting. The display shows the meeting name, the join code and a QR code.
6. Homeowners scan the code, sign in with an emailed code and are present. Pat marks three homeowners without phones present from the roster. Quorum (20% of the 142 lots) is met and shown.
7. Dana calls the meeting to order. The agenda from the schedule is the live agenda.
8. The 2025 minutes are approved by unanimous consent.
9. The treasurer presents; the budget attachment opens from the agenda item.
10. Old business: a homeowner moves to approve the pool contract from their phone, another seconds, two people speak (the queue shows on the display), Dana puts it to a vote: phones vote, Dana enters the show of hands for the rest, closes the vote, and the display announces the result.
11. New business: the bylaw amendment to Section 4.2 is moved, seconded, debated and passes by two thirds; the bylaws become version 2 with the new text.
12. Election: nominations from the floor, a ballot on phones plus floor counts, two directors declared elected.
13. Dana adjourns.

**After:**

14. Pat opens the generated minutes, fixes a name, and publishes them. Members can read the minutes and the new bylaws; the public share link shows version 2.

## Phases

Each phase is a design (docs/superpowers/specs), a plan (docs/superpowers/plans), execution by a fresh subagent per task, independent review, a CI replay, a PR and a merge to main.

| Phase | What                                                                                                                                                                                                                                                                                                                                                                          | State           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| A     | Organization membership in the clients: switcher, members page, terms step (web and mobile), scheduling creates packets under the organization. Merges `feat/org-membership`.                                                                                                                                                                                                 | done 2026-10-06 |
| B     | Design system: tokens, typography, the core components, the shell (sidebar, header, sign-in), a style guide page, dark mode.                                                                                                                                                                                                                                                  | next            |
| C     | In the room: meeting roles from the organization, roster and marking people present, guests, floor tallies in votes, quorum as a share of the roster, display view with QR, deep link `/meetings/:code`, the schedule's agenda becoming the live agenda, elections reachable from the chair's screen, persisted roles. Redesigned chair console, phone view and display view. |                 |
| D     | Bylaws for real: paste or upload (.docx, Markdown, text) to sections, print-ready export, amendment preview, search that works.                                                                                                                                                                                                                                               |                 |
| E     | Minutes: generated at adjournment, edited and published by the secretary as a minutes document, approved with corrections at the next meeting, exported.                                                                                                                                                                                                                      |                 |
| F     | Ship: demo seed, Dockerfile and compose with Caddy, deploy runbook, the Playwright scenario above in CI, dependency bumps.                                                                                                                                                                                                                                                    |                 |

## Known gaps accepted for the MVP

- Proxies stay as they are (members who once joined can grant one). HOA proxy forms on paper are handled by marking the holder present and counting their votes in the floor tally.
- The exotic motions (division of a question, reconsider, rescind) keep their current state. The scenario uses main motions, amendments, unanimous consent and elections.
- Mobile app: no new features.
