# In the room (MVP Phase B)

Status: design, 2026-10-06. Phase B of `docs/mvp-roadmap.md`; it also closes the "part 3" items left open by the accounts and organization-membership designs.

## Why

A live meeting today assumes that everyone in it has a signed-in device and that the room has nothing else: nobody can enter a show of hands, a homeowner without a phone cannot be counted, a locked phone makes its owner absent, nothing is made for a projector, the agenda typed into the schedule never reaches the meeting, elections cannot be started from the chair's screen, and the only way to get a chair is an environment variable. Roles are also kept in memory, so a restart turns the chair into a member while the state still says chair.

This design makes the live meeting fit a room: roles come from the organization, attendance and votes can be counted for people without devices, the display shows the room what is happening, and the schedule is the meeting.

## Decisions

- **A live meeting is a scheduled meeting.** The `MeetingPacket` is the meeting: it has a code, an organization, a title, a date, a presiding officer and an agenda. Joining a code that has no packet fails ("No meeting with that code"). `JOIN_MEETING` no longer creates meetings.
- **Meeting roles are derived from the organization at every join**, never stored in memory or chosen by env var. `ADMIN_EMAILS` is removed.
- **Attendance is three numbers**: members present on a device, members marked present by the chair or secretary, and a headcount of people without an account. Quorum is judged against the organization's eligible voting count, not against who has an account.
- **Votes are two tallies**: device votes (one per member) and a floor tally the chair enters for the rest, summed when the vote closes and shown separately so the room can check them.
- **The wire protocol is unchanged for existing clients.** `JOIN_MEETING { meetingCode }` works as before; new fields are optional. The mobile app keeps working with no new features.
- **The meeting screens are designed fresh**: a chair console, a phone view and a display view, all on the existing design tokens.

## Roles in a meeting

A `Member.role` becomes `'chair' | 'admin' | 'member' | 'guest'`. At every join the server derives it:

| Who                                                                       | Meeting role | Can                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The packet's presiding officer (`MeetingPacket.chairUserId`)              | chair        | Run the meeting: everything the chair does today, plus attendance and floor tallies                                                                                                        |
| Organization secretary, admin or owner (who is not the presiding officer) | admin        | Everything a chair can do except preside by default, plus settings, member management, appointing the chair. Admins vote like members.                                                     |
| Organization member                                                       | member       | Move, second, debate, vote, nominate, be nominated                                                                                                                                         |
| Organization viewer, or anyone else who signs in with the code            | guest        | Follow along, request the floor, ask an inquiry. Guests cannot move, second, vote, answer roll call, hold or grant proxies, or be nominated, and never count toward quorum or vote totals. |

- The presiding officer is set when the meeting is scheduled (default: the person scheduling it) and can be changed on the schedule by a secretary or above, or in the meeting by `SET_MEMBER_ROLE` with `newRole: 'chair'` (sent by the chair or an admin). Either path writes `MeetingPacket.chairUserId`, so the chair survives a restart. `SET_MEMBER_ROLE` can no longer grant `admin` or `member`; organization roles decide those.
- The in-memory `participantRoles` map and the legacy `meeting_participants` table are no longer read or written.
- A rejoin refreshes the member's name and role in the state from the derivation (today a stale state role survives a restart). Sign-in names are used; a socket whose user has no name is refused with "Set your name first" rather than falling back to the email.
- `permissionGuard` gains `guest` and the table above. `ADD_MEMBER` and `SET_MEMBER_PRESENCE` are server-only (no client role may send them); clients use the attendance actions below.

The enricher overwrites every actor field from the socket: `voterId`, `moverId`, `seconderId`, `askerId`, `nominatorId`, `castById`, `requestedBy`, `revokedBy`, `acceptedBy`, `declinedBy`, `cancelledBy`, `renamedBy`, `requesterId` (withdraw, modify), `member`/`memberId` on `RAISE_HAND`, `LOWER_HAND`, `YIELD_FLOOR` and `RESPOND_ROLL_CALL`, and the names that go with them.

## Attendance

### Organization settings

`Organization` gains:

- `eligibleVoters Int?`: how many voting members the organization has (for an HOA, lots or units). Null means "the members in the roster with the member role or above".
- `quorumPercent Int?` and `quorumCount Int?`: one of them is set. Quorum is `ceil(eligibleVoters * quorumPercent / 100)` or `quorumCount`. A new organization starts with `quorumCount = 3`, matching today's meeting default, and Settings shows it.

Admins edit these in Settings ("Voting members" and "Quorum").

### Meeting state

- `Member` gains `presentBy?: 'device' | 'chair'`. A member is present because their device is connected (`'device'`) or because the chair or secretary marked them (`'chair'`). The disconnect handler and the presence reconciler only ever clear `'device'` presence; a marked member stays present until the chair marks them absent.
- `MeetingState` gains `headcount: number` and `headcountNames: string[]`: people in the room with no account, entered by the chair or an admin. Names are optional and go into the minutes.
- `MeetingState.quorum` is set from the organization's settings when the live state is created, and can still be changed in the meeting by the chair or an admin (`SET_QUORUM`), for example when a bylaw says otherwise for a special meeting.
- `MeetingState` gains `organizationId`, `title` and `scheduledFor` copied from the packet, for the display and the minutes.

New actions (chair and admin):

- `MARK_PRESENT { userId }`: the server resolves the user from the organization roster (role, name) and applies `ADD_MEMBER` if needed and `SET_MEMBER_PRESENCE { present: true, presentBy: 'chair' }`. A user who is not in the roster is refused.
- `MARK_ABSENT { memberId, excused }` exists; it now also clears `presentBy` and is allowed for a device-present member only when the device is gone (otherwise the member is still in the room).
- `SET_HEADCOUNT { count, names }`: replaces both fields.

One shared function decides attendance everywhere: `attendanceSummary(state)` in `shared/utils/attendance.ts` returns `{ devicePresent, markedPresent, headcount, proxies, present, quorum, hasQuorum, guests }`, where `present = devicePresent + markedPresent + headcount (+ proxies if proxiesCountForQuorum)`. The server's quorum check, the chair console, the phone view, the display and the minutes all use it; the client-side `useQuorumStatus` becomes a thin wrapper.

### The roster

`GET /api/packets/:code/roster` (viewer) returns the organization's members `{ userId, name, email, orgRole }` and pending invites `{ email, role }` to admins; everyone else gets the members as `{ userId, name, orgRole }` and no invites, so emails stay with admins. The chair console's attendance panel merges it with `state.members` to show, for every person: connected, marked present, absent, or not joined, with "Mark present" and "Mark absent" buttons, plus the headcount field. Guests show in their own list.

### Phones that lock

- A disconnect starts a grace period of 90 seconds before the member is marked absent (`PRESENCE_GRACE_MS`, in `roomManager`, one timer per member). Reconnecting within it cancels the timer and changes nothing; a reconnect after it marks the member present again as today. A locked phone during debate therefore costs nothing, and a member who reconnects during a vote can vote.
- Socket.io `connectionStateRecovery` is enabled (2 minutes), so a brief loss of signal resumes the same session and missed state updates are replayed.
- After a server restart there are no timers, so the reconciler waits the grace period before marking anyone absent, instead of running on the first join.

## Votes

### State

- `MeetingState` gains `floorVotes: Votes` (reset when voting opens) and `votingMethod` gains `'voice'`.
- `CompletedMotion` gains `deviceVotes: Votes`, `floorVotes: Votes` and `method`. `CLOSE_VOTING` records every decided motion in `completedMotions` (today only motions that can be reconsidered are recorded, so most votes leave no record but a log line).

### Methods

| Method   | Devices             | Floor tally              | Use                                                                                                                                                                                                                                                    |
| -------- | ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| standard | yes                 | yes                      | The usual hybrid vote                                                                                                                                                                                                                                  |
| voice    | no                  | yes                      | Voice vote or show of hands with nobody on a device; the chair enters the counts, or just yea or nay when it was clear                                                                                                                                 |
| ballot   | yes, choices hidden | yes (the tellers' count) | Secret ballots; the server hides the running totals, individual choices, proxy choices and who-just-voted while a ballot is open (only `voters`, for the count of ballots received, and the tellers' count go out), and keeps no choices in the record |
| rollcall | yes, by name        | yes                      | Recorded votes: device votes are logged by name; members without a device are counted in the floor tally and the chair reads their names into the record                                                                                               |

### Actions

- `SET_FLOOR_TALLY { yea, nay, abstain }` (chair, admin; while voting is open): replaces `floorVotes`. Entering it is not cumulative, so a correction is just a new entry.
- `CLOSE_VOTING` computes the result from `votes + floorVotes` with the existing `calculateVoteResult`. The chair's deciding vote (`canChairVoteDecide`) is judged on the combined totals. The log line and the display show both parts: "On devices 12 to 3, in the room 9 to 2: 21 to 5, carried".
- `CAST_VOTE` is refused for `'voice'` votes (`VOTING_METHOD`), and always for guests.
- Elections get the same: `currentElection.floorBallots: Record<string, number>` and `SET_FLOOR_BALLOTS { counts }`; `CLOSE_ELECTION` adds them to `ballotResults` and `votersWhoVoted.length`.

The floor tally is the chair's count of the people in the room who are not voting on a device. The display shows it as its own line so members can object if it is wrong; the minutes record both parts.

## The schedule is the meeting

- `MeetingPacket` gains `chairUserId Int?` (relation to `User`, set null on delete) and `startedAt`, `endedAt DateTime?`.
- When the first person joins, the live state is created from the packet: `meetingCode`, `organizationId`, `title`, `scheduledFor`, `quorum` from the organization settings, and `agenda` from the packet's agenda items in position order. Each live `AgendaItem` gains `packetItemId?: string` so attachments can be shown next to the item.
- While the meeting is not yet active, the chair or an admin can `RELOAD_AGENDA`, a REST call (`POST /api/packets/:code/reload-agenda`, secretary) that replaces the live agenda from the packet. Once the meeting is active the live agenda is edited in the meeting as today.
- `START_MEETING` sets `startedAt` on the packet and `END_MEETING` sets `endedAt`, so the schedule shows which meetings happened.
- The Live Meetings page lists the organization's scheduled meetings (upcoming first) with "Join" (and "Start" for the presiding officer), and keeps the code box for guests. The home page's "upcoming meetings" come from packets, not from the manual meeting records.

## The display view

Route `/meetings/:code/display`, for a TV or projector. It requires a signed-in user with at least the viewer role in the meeting's organization (the chair opens it in a second window and moves it to the external screen). It connects with `JOIN_MEETING { meetingCode, display: true }`: the socket joins the room and receives state, but is not added as a member and does not affect presence. `display` is optional on the wire, so existing clients are unaffected.

What it shows, in large type on a dark background, always with the meeting title and the organization name:

- **Before the meeting:** "Join at `<APP_URL>/meetings/CODE`", the code, a QR code of that link, and attendance: present, quorum needed, met or not.
- **In session:** the current agenda item; the pending question (the motion text, moved by, seconded by) and whatever is immediately pending on top of it; the speaker queue with the recognized speaker and the timer; a vote in progress ("Voting on: ...", votes received, and the floor tally when entered; totals hidden until closed for ballots); the result of the last vote, in both parts; nominations and election results; the last chair ruling or unanimous consent request.
- **Adjourned:** "Meeting adjourned at 8:42 PM", the number of items decided, and where to find the minutes.

The chair console shows a "Display" button that opens this route, and the join information (code, link, QR) in its own card so it can be read out even without a TV.

## Deep link and QR

- `/meetings/:code` joins that meeting after sign-in (the sign-in page's `next` already carries it). An unknown or closed code shows a message with the join box.
- QR codes are generated in the browser with the `qrcode` package, encoding `${window.location.origin}/meetings/CODE`. They appear on the display, in the chair console's join card, and on the schedule page.

## Elections from the chair's screen

`ChairView` always renders the nominations panel with an "Open nominations for ..." form (position, required vote), not only when nominations are already open. Nominees can be any present member (including marked-present members) or a typed name for someone not in the meeting. Election ballots on devices plus the floor ballots above.

## Persistence and the server

- The live `meetings` table keeps the state JSON as today; `meeting_participants` and `ADMIN_EMAILS` go away. `getOrCreateMeeting` becomes `getOrCreateMeetingFromPacket(packet)`; a code without a packet is refused at join with `MEETING_NOT_FOUND`.
- `presentBy`, `headcount`, `floorVotes` and the new actions go through the reducer, validator, permission guard and enricher like everything else (all three are exhaustive over the action union, so a missed one fails to compile).
- Rate limiting, the per-meeting write queue and the bylaw sync are unchanged.

## Screens

Three screens are designed with the frontend-design skill and built on the existing tokens (`frontend-unified/src/styles/index.css`): no raw palette classes, full dark mode. The rest of the meetings module moves to the same tokens and components (buttons, cards, badges, dialogs) in the same phase, but is not redesigned.

**Chair console** (laptop): a persistent top bar with the meeting title, stage, elapsed time, attendance and quorum ("38 present of 142, quorum 29, met"), and the Display and Join-info buttons. A "Now" column: the current agenda item with its attachments, the pending question with the chair's actions for it (second pending, open debate, call the question, unanimous consent, rulings), the vote in progress with device counts, the floor tally entry and Close, the speaker queue with Recognize and Yield. A side column: the agenda with Call and Complete, the attendance panel, nominations and elections, and a collapsed "More" area for proxies, settings and the log. The chair script stays as a collapsible line under the pending question.

**Phone view** (participants and guests): one thing at a time, top to bottom: what is happening now (the item and the pending question), the one action that matters (Vote with three large buttons; Second; Raise hand with a stance; Nominate; Ballot), then the agenda and the queue. Guests see the same without the actions they cannot take, and a small "Guest" badge. Members who are marked present but joined later see the same as anyone else. The old `components/mobile/*` dead code is deleted.

**Display**: described above.

## Polish after the live check (2026-10-07)

A live run of the full scenario (chair console, two phones, a guest, the display) turned up one bug and a set of things a chair or a homeowner would trip over. They are fixed before Phase B merges.

### The meeting record

- **Election tallies.** `CLOSE_ELECTION` writes the merged device and floor ballots back to `ballotResults` when it elects someone, as it already does on a runoff; today the winner's branch drops them, so the stamp, `DECLARE_ELECTED`'s check and the minutes see zeros.
- **Business from the floor.** Many people in the room have no phone. The chair records what they do:
  - `MAKE_FLOOR_MOTION { motionType, text, moverName, moverMemberId? }` (presiding): a motion made by someone in the room. The mover is the named member when `moverMemberId` is a member of the meeting, otherwise the typed name; it is never the chair. It goes through the same validation as `MAKE_MOTION` (in order, renewal) except the mover check.
  - `SECOND_FROM_FLOOR { seconderName? }` (presiding): seconds the motion awaiting a second, recorded as seconded by the named person or "a member in the room". The mover-can't-second rule applies when a member is named.
  - `NOMINATE` sent by the chair with `fromFloor: true` records "Nominated from the floor" instead of the chair's name.
  - "Put the item to a vote" records the motion as "Put by the chair" (no mover), since the question comes from the agenda.
- **The agenda's first and last items.** At `START_MEETING`, an agenda item titled "Call to order" (case-insensitive, first item) is marked completed. The "Adjournment" item is completed by `END_MEETING`, as Adjourn already does with any active item.
- **Handing over the chair** is offered only to members present on a device: the new chair needs a screen to run the meeting.

### The chair console

- **Adjourn asks first.** Adjourn opens a short confirmation ("Adjourn the meeting? Items not reached: 4 to 7.") with Adjourn and Keep going. At the last item it stays the primary action.
- **After adjournment** the console is read-only: no headcount form, no Mark present or absent, no Call on agenda items; it shows "Adjourned at 8:42 PM" and a link to the minutes once they exist (Phase C).
- **The stage label** in the top bar follows the meeting, not the old stage machine: "Not yet called to order", the current agenda item's title while one is active, "In session" between items, "Adjourned". The order-of-business panel in More keeps its controls, in sentence case.
- **Results stay up.** The last result (a vote's stamp, or an election's ELECTED with its tally) stays on the console and the display until the next question is stated, including after the chair declares the winner.
- **One election card.** Nominations, the ballot and the result live in one card in the side column, in that order. The chair's own ballot buttons read "Vote for Carmen Diaz" and sit apart from "Declare elected".
- **Calling an item** from the side agenda scrolls the Now column to the top so the item and its actions are in view.
- **Floor actions** sit in the question card's toolbar: "A motion from the floor" when nothing is pending (a short form: kind of motion, text, who moved it from the roster or a typed name), "Seconded from the floor" next to "No second", and "Nominate from the floor" in the election card.
- **Small things.** Saving the headcount shows a toast. The script line during a vote with devices says "Those in favor, vote on your phone or raise your hand", not "say Aye".

### The phone

- **One header.** On a live meeting route on a phone, the app header is hidden; the meeting header carries the title, the current item and Leave, and a menu button opens the app drawer.
- **The result first.** After a vote closes, the top of the phone shows the result card (stamp and tally) until the next question is stated, above any form.
- **Plain words.** The member's motion block is "Make a motion" with a text box for a main motion; other motions sit under "Other motions" in sentence case with a one-line explanation each ("Refer to a committee: send the question to a committee to study"), and the button says "Move". "Ask a question" becomes "Ask the chair" with two plain choices ("About the rules", "For information") and no RONR footnote. Members and guests both see "Ask to speak" (with For, Against, Neutral for members).
- **After adjournment** the phone scrolls to the top and shows one card: "The meeting was adjourned at 8:42 PM", with every form gone.

### The display

- Before the meeting it shows the scheduled start ("Tuesday, October 20, 7:00 PM") under the title.

## Testing

- Shared: reducer tests for `MARK_PRESENT` effects, `SET_HEADCOUNT`, `SET_FLOOR_TALLY`, `CLOSE_VOTING` with combined totals (including exactly two thirds across both parts), `voice` votes, elections with floor ballots, every decided motion recorded, `attendanceSummary`.
- Server: role derivation for each organization role and the presiding officer (unit, with a stubbed roster); join refused without a packet; a guest's vote, motion and second are rejected and guests are excluded from quorum; the enricher overwrites every actor field (table-driven over the action union); the grace period (fake timers); `voterChoices` redacted during a ballot; `MARK_PRESENT` refused for a non-roster user; chair transfer persists to the packet; agenda imported from the packet; integration tests for the roster route and reload-agenda.
- Web: the chair console's attendance panel and floor tally, the phone view's guest mode, the display view's three states, the deep link.
- **Playwright harness** (new, `e2e/` at the repo root with `@playwright/test`, run in CI against the CI Postgres on port 5432 there and the throwaway one locally): one scenario with four browser contexts (chair, two phones, display): schedule a meeting from the seed organization, join from a phone link, mark a third person present, enter a headcount, call to order, move and second from the phones, enter a floor tally, close the vote, check the display's result line and the quorum line. This scenario grows in later phases.

## Out of scope

- Proxies beyond today's behavior.
- Minutes generation and publishing (Phase C), though this phase keeps writing what the generator needs and records every decided motion.
- Bylaws import and export (Phase C).
- Guests upgrading to members during a meeting: membership is managed in the organization.

## Known limits

- The headcount is the chair's word. The display shows it, and the minutes record it, but nothing verifies it.
- A floor tally for a ballot vote is a tellers' count entered by the chair; the paper ballots themselves are outside the app.
- Members marked present by the chair cannot vote on a device unless they sign in; their votes are part of the floor tally.
- A device-present member who leaves the room with their phone connected stays present until they disconnect; the chair can mark them absent only once the device is gone.
