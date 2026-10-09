# Board meetings and meeting notice

Status: design, 2026-10-09. The last product batch of the whole-app review (`product.md` recommendations 2 and 3). Builds on the onboarding batch (voting members and quorum set at setup, the roster, people added by email) and the elections batch (vote thresholds).

## Why

An HOA meets as a membership once a year and as a board every month. Robbie runs the annual meeting; without board meetings it is a once-a-year tool, which is hard to adopt and easy to forget. Board meetings are also the easiest first real meeting to try: five people, low stakes. And every meeting needs notice: owners have to learn the date, place and agenda before the meeting, and arriving with a phone already signed in is what makes the night smooth.

## Decisions

### Kinds of meeting

- A scheduled meeting (`MeetingPacket`) has a `kind`: `members` (an annual or special meeting of the members, today's behavior and the default) or `board`. Chosen in the scheduler ("Who votes: All members / The board"), shown on Live Meetings, the console's top bar ("Board meeting"), the TV and the minutes' heading ("Minutes of the meeting of the Board of Directors").
- **Directors** are members of the organization marked as directors: `OrganizationMember.isDirector` (a Prisma-generated migration), set by admins on the Members page ("Board member" toggle), at most a reasonable number (say 25). An organization with no directors can't hold a board meeting (the scheduler says why and links to Members). Officers' titles (president, treasurer) are out of scope.
- **Roles in a board meeting** (`deriveMeetingRole`): the packet's presiding officer chairs as today; directors are voting members; secretaries and admins who aren't directors keep the console (admin role) but don't vote; every other member of the organization joins as an **observer**: they see what a member sees (minutes text included), can't move, second, vote or ask for the floor, and their phone says "You're observing this board meeting." Guests (signed in, outside the organization) are as today. The observer is a new meeting role or a member flag; choose the one that keeps permissionGuard simplest and say why.
- **Attendance and quorum in a board meeting:** the eligible voters are the organization's directors (the count at the call to order is recorded); quorum is a majority of the directors unless the organization sets "Board quorum" (a number) in Settings' Attendance card. The headcount, people-without-accounts and proxies don't apply (directors vote in person; proxies aren't allowed for directors in most states): the console hides them in a board meeting. Observers are listed separately ("Also present") and never count.
- **Votes and minutes:** votes are directors' only; floor tallies stay available (a director without a phone), capped at the directors not voting on a device. The minutes list "Directors present", "Directors absent" and "Also present", and say "a quorum of the board was present".
- **Bylaw amendments** can't be moved in a board meeting (members amend the bylaws); the motion list leaves them out and the server refuses. Elections work (a board electing its officers), using the A3 machinery.
- **Executive session** is out of scope; the runbook says to recess and type the summary into the minutes.

### Meeting notice

- From a scheduled meeting not yet held, a secretary chooses **Send notice**: a preview of the email, then Send. It emails every member of the organization with an email (accounts and pending additions; for a board meeting, the notice still goes to all members, since owners may attend board meetings in many states; the email says it's a board meeting they may observe) with the meeting's title, kind, date and time in the organization's zone, place, agenda, attachments' names, the link to the meeting (`/meetings/CODE`, which signs them in first) and a line: "Sign in before the meeting so your phone is ready." It records `noticeSentAt` and who sent it on the packet (Prisma-generated migration); sending again asks first and says when it was last sent.
- A **printable notice** (`/meetings/:code/notice`, print page like the minutes' print, signed in, secretary) for posting and mailing to owners without email: the same content, a QR code to the meeting link, and a short "How to take part with your phone" box.
- A footer on both: "This is a courtesy notice. Your bylaws and state law set the official notice requirements." Robbie doesn't claim to satisfy statutory notice.
- Sending is a server job with the existing email provider, batched (e.g. 50 at a time with a pause), with per-recipient failures logged and a summary returned ("Sent to 138; 4 couldn't be delivered"); a per-organization limit (e.g. 3 notices a day) so it can't be used to spam; the email is plain text, names the organization and the secretary who sent it, and carries no user-controlled HTML. The suppression of suspended accounts applies.

## Out of scope

Committee meetings, officer titles, executive session, voting weight by lot, mailed or electronic ballots, recurring schedules (a "Schedule the next one" shortcut that copies the last board meeting's agenda is a cheap nicety; include it only if trivial).

## Tests

Unit: role derivation in a board meeting (director, admin non-director, member observer, guest), quorum of the board, permissions refusing observers, bylaw amendments refused, minutes for a board meeting. Integration: scheduling a board meeting, joining as each role, the notice route (limits, recipients, suppression, noticeSentAt), the print page data. e2e: a board meeting with three directors and an observer through a motion and a vote; sending a notice (with email captured by the test provider).
