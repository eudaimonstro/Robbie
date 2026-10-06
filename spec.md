# Robbie-Bylawyer: Finishing Spec

Status: draft, revised 2026-10-05 after a full code audit, and 2026-10-06 after a bug scan of every module

## 1. What this project is

Robbie-Bylawyer is a governance platform for organizations that run on Robert's Rules of Order (RONR).

- **Robbie** runs live meetings: roles (chair, participant, admin), motion stack with precedence, speaker queue, quorum, voting, proxies, elections, agenda, minutes. Real-time over Socket.io. The server is authoritative: it runs the pure shared `meetingReducer` (`shared/`) with version-checked writes and broadcasts state.
- **Bylawyer** is version control for governing documents: documents, versions, hierarchical sections, amendments (draft, proposed, passed/failed), diffs, history by date, meeting packets, attachments, public share links.
- **The integration is the product's reason to exist.** A bylaw amendment motion that passes in a live meeting becomes a passed Amendment and a new document Version, with the vote record and minutes attached. Everything else supports that loop.

### Current state (verified 2026-10-05)

| Check                                                   | Result                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `tsc --noEmit` (shared, backend-node, frontend-unified) | Pass                                                                   |
| `npm run build`                                         | Pass                                                                   |
| shared tests                                            | 239 pass (10 files)                                                    |
| backend-node tests                                      | 226 pass, but only 3 files (validator, permission guard, rate limiter) |
| frontend-unified tests                                  | **0 test files, step exits 1**                                         |
| `npm run lint`                                          | **140 errors, 60 warnings**                                            |
| `npm run format:check`                                  | **377 files unformatted**                                              |

CI as written would fail on format, lint, and frontend tests. All 510 items in `features/*.json` are marked `passes: true`, so that checklist no longer reflects reality.

The integration loop exists only partially. A passed `bylawAmendment` motion creates an Amendment and a Version. It does not create a Bylawyer `Vote`, it does not carry amended text, and `minutesService.ts` (the minutes-to-document path) is never imported.

## 2. Goals and non-goals

**Goals:** a secure, multi-organization, deployable product. A real organization can hold a meeting, pass a bylaw amendment under correct RONR rules, and see the updated bylaws and published minutes, with confidence the data is theirs alone and history cannot be silently altered.

**Non-goals for this spec:** native mobile parity with web (M10 is deliberately small), real-time multi-user document editing, billing, i18n, SSO providers beyond email codes, horizontal scaling (v1 runs on a single VPS node), cloud object storage.

## 3. Milestones

Ordered by dependency. M1 through M4 block any real use.

### M1. Land in-flight work and make CI honest

**Status: done 2026-10-05.** All CI steps pass when replayed from a fresh clone against Postgres 16. Lint has 0 errors (68 warnings, two React Compiler rules downgraded pending M9).

- Commit the current working tree in logical commits (validation and middleware, Prisma migration, tooling and CI, socket changes).
- Run Prettier once across the repo in its own commit. Fix the 140 lint errors (or downgrade specific rules deliberately, with a comment).
- Add at least a smoke test to frontend-unified so the CI step is meaningful. Port the orphaned hook tests from `frontend-robbie/src/__tests__/hooks/` (`useQuorumStatus`, `useVoteResults`, `useSortedSpeakerQueue`).
- Make CI run `prisma migrate deploy` against its Postgres service before backend tests.
- Done when: CI is green on `main` with every step above actually exercising code.

### M2. Identity and persistent users

Auth today is in memory only (`auth/authController.ts:125-127`). Restarting the server loses every user and restarts `nextUserId` at 1, so an old 24-hour JWT can resolve to a different person.

- Store users and verification codes in Postgres (the `users` and `email_verifications` tables already exist and are unused). Move them under Prisma (see M5).
- Per-email and per-code attempt limits on verification, not only per-IP. Invalidate the code after N failures.
- Remove the global `lastGeneratedCode` and `GET /api/auth/dev-code`. Replace with a test-only email transport that tests read directly. Never log codes at `info`.
- Stop returning the JWT in the JSON body; httpOnly cookie only for web. Mobile gets a separate bearer token flow and actually restores it on launch (`mobile/context/SocketContext.tsx` never calls `getToken`).
- One web session for the whole app. Sign in once, not per meeting.
- Fix the test-role key mismatch (`authController.ts:351` vs `joinHandler.ts:83`) or delete the test-role endpoint. Even with the key fixed, permission checks read `socket.data.role`, which is only set on join, so a role change doesn't take effect until the user rejoins.
- Done when: a server restart does not log anyone out or reassign identities, and there is no endpoint that reveals a code.

### M3. Organization authorization (REST and socket)

`requireAuth` (`auth/authMiddleware.ts:16`) is never mounted. Every REST route is open, including deleting an organization (which cascades to all documents, versions, amendments, meetings, and votes) and `/api/robbie/sync-motion` (which creates passed amendments and applies them).

- Add `OrganizationMember` (`userId`, `organizationId`, `role`: owner, admin, secretary, member, viewer). Creator becomes owner.
- Mount auth on every `/api` router except `/api/auth`, `/api/health`, and `/api/share/*`.
- `requireOrgRole(minRole)` resolves the org from the resource (document, version, section, amendment, meeting, packet, attachment) and enforces role. Reads need viewer, edits need secretary, member management and settings need admin, delete org needs owner.
- `/api/robbie/sync-motion` becomes internal only (called from the socket layer, not exposed), or requires the meeting's chair. Remove the duplicate sync path so only `bylawSyncService` remains.
- `GET /documents/:id/share` requires admin. Public share responses omit `annotation`, internal notes, and unrelated versions.
- Socket: org members joining a linked meeting get their member role. Anyone else with the meeting code may join as a **guest** after email verification. The meeting creator becomes chair, and an admin can reassign the chair. Today no one can become chair unless listed in `ADMIN_EMAILS`.
- **Guest role (non-voting):**
  - Guests can see the meeting state, the agenda, the pending motion, the speaker queue and results.
  - Guests can request the floor. The chair grants or denies it, per RONR treatment of non-members.
  - Guests cannot make, second or withdraw motions. They cannot vote, answer roll call, hold or grant proxies, be nominated, or raise points of order or appeals.
  - Guests don't count toward quorum or toward "entire membership" thresholds. They appear separately from members in attendance and minutes.
  - The server enforces all of this in `permissionGuard` and the validator, not only the UI. The chair can remove a guest.
  - A per-meeting setting lets the chair close the meeting to guests.
- Socket identity: the enricher must overwrite every actor field from the authenticated socket, not only when the key is present. Covers `requesterId` (withdraw, modify), `member` on `RAISE_HAND`/`LOWER_HAND`, `memberId` on `RESPOND_ROLL_CALL`, and the caller on proxy and nomination responses. `ADD_MEMBER` and `SET_MEMBER_PRESENCE` become truly server-only.
- Persist socket participant roles (`meetingStorage.ts:213` keeps them in memory, so after restart state and socket roles disagree).
- Don't reset rate-limit buckets on disconnect.
- Member management UI in Settings (invite by email, change role, remove). The org switcher shows only the user's orgs.
- **Route-test harness (prerequisite for the matrix):** split `src/index.ts` into `app.ts` (Express app, no listen) and `index.ts` (HTTP server, Socket.io, start). Add supertest, and run integration tests only when an explicit opt-in variable such as `INTEGRATION_DATABASE_URL` is set. CI sets it; local runs never write to whatever `DATABASE_URL` points at. Start with a contract test: the main GETs return no snake_case keys.
- Done when: an integration test matrix proves 401 for unauthenticated calls and 403/404 for cross-org calls on every route, a test proves a client cannot act as another member, and a test proves every guest-forbidden action is rejected server-side and that guests are excluded from quorum and vote totals.

### M4. Security fixes that stand alone

- **Path traversal:** `X-Robbie-Code` flows into `path.join(UPLOAD_DIR, robbieCode)` (`services/fileStorage.ts:117`). Validate it against the meeting code format and against the packet's `robbieCode`.
- Sniff file content type rather than trusting the `Content-Type` header.
- Delete stored files when a packet, agenda item, or attachment is deleted (`routes/packets.ts:197` TODO; `cleanupMeetingFiles` is never called).
- CORS: require `CLIENT_ORIGIN` in production instead of falling back to any localhost origin (`index.ts:43-45`).
- Never return raw `error.message` as `details` to clients.
- Unknown `/api/*` paths return JSON 404 instead of falling through to the SPA catch-all (`index.ts:117`), which currently returns `index.html` with status 200.
- Postgres TLS: `rejectUnauthorized: false` (`db/client.ts:22`) only when explicitly configured. Also, only a URL containing "localhost" disables SSL, so a non-TLS Postgres at `127.0.0.1` or a Docker service name fails to connect (`db/client.ts:20`).
- Section `parent_id` is unchecked on create and update (`routes/sections.ts:120,187`): it can be the section itself, a descendant, or a section in another version. A cycle hides the subtree from the tree endpoints, and `GET /sections/:id/path` (`:263-282`) then loops forever with a query per iteration, which pins a request and a DB connection.

### M5. One data model

Today the database is split. Prisma manages Bylawyer tables. Robbie tables are created by embedded `CREATE TABLE IF NOT EXISTS` in `db/meetingStorage.ts:7-80`, with no migrations, and `prisma migrate dev` will see them as drift and offer to reset the database. `db/schema.sql` is stale and unused.

- Move `users`, `meetings`, `meeting_participants`, `meeting_actions`, `email_verifications` into `schema.prisma` with a baseline migration that adopts the existing tables without data loss. Delete the embedded DDL and `schema.sql`.
- Unify meetings. There are three concepts today: Prisma `Meeting`, raw `meetings` (code, live state, `bylawyer_org_id`), and `MeetingPacket.robbieCode`. Make one `Meeting` record per meeting with a unique code, the live state JSON, org FK, schedule, status, and `endedAt`. Packets and votes relate to it by FK.
- Real foreign keys for `Document.currentVersionId`, `Amendment.resultingVersionId`, `meetings.bylawyer_org_id`.
- **Organization settings (thresholds are per organization, not per document type):** vote threshold for bylaw amendments (two-thirds, majority of entire membership, or two-thirds with previous notice), previous notice period, quorum rule (fixed number or percent of members), and the member roster used for quorum and "entire membership" thresholds.
- **Audit fields:** `createdById` and `updatedAt` on Document, Version, Section, Amendment, Meeting, Vote. Write `meeting_actions` (the `logAction` function exists and is never called).
- **Immutability:** adopted Versions and their Sections are read-only. Remove or restrict `PUT`/`DELETE /sections/:id` and `PUT`/`DELETE /versions/:id` for adopted versions. Edits happen only through amendments or a new draft version.
- **Deletion:** soft-delete organizations and documents (owner only, with a confirmation step). Votes and adopted versions are never hard-deleted. Replace `ON DELETE CASCADE` on history tables with restrict.
- Done when: `prisma migrate status` is clean on a database created by the old code, and the old code's data is preserved.

### M6. Reliable amendment sync and applying amendments

- **Fixed 2026-10-06:** sync from a live meeting works. Motion IDs (about 1.8e15) overflowed the INTEGER `Amendment.robbieMotionId`, so every sync failed on its first query; the column is now BIGINT. The sync also stamped amendments with `new Date("12:47:25 AM")` (a display time of day), which Prisma rejected. Verified end to end in a browser: a bylaw amendment made, seconded and passed in a linked meeting creates the amendment and a new version with the amended text.
- Wrap `applyAmendment` in a single `prisma.$transaction` (there is none anywhere today). Compute the next version number inside it.
- If the target section is missing from the current version, fail with `conflict` instead of silently creating an unchanged version (`amendmentService.ts:169-204`). This is the normal outcome, not an edge case: of two amendments drafted against v1, the second applies as a no-op (or adds at the root) once the first has made v2.
- A multi-change amendment that deletes a parent and then changes one of its children fails partway through apply (the child is already cascade-deleted). The new version is left orphaned, the amendment stays unapplied, and every retry fails the same way and burns another version number. `previewAmendment` handles the same sequence, so preview and apply disagree.
- `applyAmendment` overwrites `decidedAt` with the apply time, replacing the vote's date.
- Recording a vote (`POST /meetings/:id/votes`, `routes/meetings.ts:193-195`) ignores `requires`, so a two-thirds amendment passes on a simple majority. The vote and the amendment status update are not in a transaction.
- Honor `parentSectionId` for `add` changes (currently dropped).
- Set `adoptedAt` and `effectiveDate` on synced versions (default: adoption time, overridable by the motion), so history-by-date includes them.
- Create a real Bylawyer `Vote` linked to the unified Meeting, with tallies and, for roll-call votes only, per-member choices.
- Persist sync status (`pending`, `applied`, `failed`, `conflict`) with error text. Run sync after the state broadcast, not inline before it, with bounded automatic retry and a chair or secretary "Retry sync" action. On `conflict`, an admin chooses "apply to latest" or "discard".
- Treat the unique-constraint race as success (already synced), not failure.
- Show sync status on the completed motion and on the amendment page, with links both ways.
- Done when: an integration test drives create motion, second, debate, amend, vote, pass, and asserts the new Version (with amended text), Amendment, Vote, and no duplicates on a re-delivered CLOSE_VOTING; a failure-injection test asserts `failed` and then a successful retry.

### M7. Parliamentary correctness

Verified defects:

- **Fixed 2026-10-06:** two-thirds now passes at exactly two-thirds (`yea * 3 >= total * 2`; a 6-3 vote used to fail), and an appeal tie sustains the chair (it used to overturn).
- **Fixed 2026-10-06:** secondary amendments (amend the amendment) are offered, and accepted by the server, exactly when a primary amendment is the immediately pending question. Its numeric precedence (2.5, below `amend` at 3) had hidden it from the menu, made the server reject it on an amendment, and let the server accept it on a bare main motion. Adopting an amendment still doesn't change the motion's text; see Missing effects below.
- `'none'` vote motions (points, privilege) are decided by the chair, not put to a vote. Whether the vote calculator should treat `'none'` as a majority is a design question, not a confirmed bug.
- Mover withdraws a seconded motion unilaterally (RONR: needs the assembly's permission once stated by the chair).
- Lay on the Table leaves the motion on the stack and drops its adhering amendments.
- Division of a Question only ever considers part 1.
- **Fixed 2026-10-06:** after a chair ruling, the motion the point interrupted is pending again (`CHAIR_RULING` used to clear `currentMotion` while the stack still held it). A ruling and any new motion are rejected while a vote is open, and a motion is rejected while another awaits a second: a point of order made during a vote took over the votes already cast, and a second motion replaced the first.
- **Fixed 2026-10-06:** Main Motion, Bylaw Amendment, Take from the Table and Reconsider are offered to members; the motion picker never listed main motions, so members could bring no new business. A defeated bylaw amendment now bars only the same change (document, section, change type and wording); it used to bar every later bylaw amendment in the meeting.
- **Fixed 2026-10-06:** an election in which no one reaches the required vote opens another ballot with the same candidates (RONR). It used to stay closed with no one elected, and nothing could move it on.
- Renewal check blocks by motion type only, so one defeated Take from the Table blocks all later ones.
- Rebuilt reconsidered motions force `needsSecond`, `debatable`, `amendable` to true and replace the original mover.
- Quorum is a fixed number (default 3), never enforced, and `proxiesCountForQuorum` is unused.
- `CAST_VOTE` does not check `votingOpen`, membership, or presence, and trusts client-sent `isChairDecidingVote`.
- Ballot votes are not secret: `voterChoices` are stored and exported in minutes.
- Purity: `generateId()` runs inside the reducer at CLOSE_VOTING. Move ID generation before dispatch.

Found by the 2026-10-06 bug scan, not yet fixed:

- Single-action rule suspensions never expire, except `second-requirement`, so they last the whole meeting (`ruleSuspensionHelper.ts:23`).
- Members can't change a vote: the UI says "You may change your vote" and the reducer supports it, but the validator rejects any second `CAST_VOTE` (`actionValidator.ts:125-127`). Pick one behavior.
- The chair can't vote on a secret ballot: the panel says "Chair votes like other members" but shows no buttons, and the validator rejects a chair vote without `isChairDecidingVote`. The tie-break offer also appears at 0-0, before anyone has voted.
- `CLOSE_VOTING` and unanimous consent leave the speaker queue, recognized speaker, timer and `lastSpeakerStance` from the motion just decided. `debatePositions` is global rather than per motion, so the side-switch rule is wrong across amendments.
- Unanimous consent on a Reconsider ignores `reconsideredMotionId` and restores nothing.
- An out-of-range agenda reorder inserts `undefined` into `agenda`, and every later agenda action then throws in the server reducer (`agendaHandlers.ts:33-35`; the validator has no range check).
- A proxy vote silently replaces the absent member's own direct vote (`proxyHandlers.ts:148-174`), and a present member can grant a proxy.
- Elections: with zero ballots, plurality elects the only candidate with 0 votes, and two or more candidates at 0 loop through runoffs. A second non-member nominee for a position is rejected as a duplicate (both have `nomineeId` 0).
- Adjourning by stage (`ADVANCE`/`SET` to `adjourned`) leaves `meetingActive` true and the suspensions in place, and advancing past it re-logs "Meeting adjourned".
- Smaller state bookkeeping: `currentAgendaItem.status` reads `pending` while the agenda entry is `active`; `COMPLETE_AGENDA_ITEM` clears the current item even for a different id; `MODIFY_MOTION` checks the wrong motion's `moverHasSpoken`; a motion that skips its second (rule suspended) stays `pending`; `SET_MEMBER_ROLE` can leave two chairs; roll call leaves non-responders' presence unchanged.

Missing effects (adoption currently only pops the stack):

- Amend and Amend the Amendment change the pending motion's text, including `bylawAmendment.newContent`. Add structured insert, strike, and strike-and-insert fields.
- Previous Question closes debate and moves to the vote. Limit Debate stores and enforces limits. Postpone Definitely and Indefinitely remove the motion and record when it returns. Refer to Committee records the committee. Recess and Adjourn change meeting state. Fix the Time to Which to Adjourn records the time.

Missing motions: Rescind / Amend Something Previously Adopted, Division of the Assembly, Close and Reopen Nominations as voted motions.

Bylaw amendments use the organization's configured threshold and previous-notice rule (M5), checked against the roster when the threshold is "entire membership".

Unenforced suspendable rules: pro-con alternation, motion renewal, chair voting restriction, mover cannot second, order of business. Either enforce them or remove them from the suspend list.

Done when: a table-driven test suite covers every motion in `constants/motions.ts` with in-order, out-of-order, pass, and fail cases. The three tests that lock in bugs are corrected, and the table is reviewed against RONR (12th ed.) section references.

### M8. Minutes

- Record every disposition: motions adopted by unanimous consent, procedural motions (recess, suspend rules, take from table, objection, divide), withdrawn motions, motions that died for lack of a second, chair rulings and appeals, points of order, rule suspensions.
- Correct mover and seconder (currently hard-coded empty), timestamps (currently Invalid Date from parsing `toLocaleTimeString`), roll-call vote listings, election candidates and ballot results, adjournment time, members who left early.
- Quorum at each vote, not only when minutes are generated.
- Flow: generate draft, secretary edits, approve at the next meeting (`MinutesApprovalPanel`), then publish to Bylawyer as a versioned document linked to the meeting. Wire up `minutesService.ts` (currently dead code) for the publish step.
- Export as Markdown and PDF.

### M9. Web client completion

**Fixed 2026-10-05 (was the M9 blocker):** joining a live meeting looped on reconnects. `SocketProvider`'s `handleInvalidToken` depended on the whole `useAuth()` object, which is new every render. It is a dependency of the socket effect, so every render tore down the socket and opened a new one, about every 15ms, and the server logged hundreds of `Concurrency conflict` retries per second. It now depends on the stable `clearAuth`. `SocketContext.test.tsx` covers this, and a live join was checked in a browser: one WebSocket, zero conflicts, and the meeting can be called to order.

API mismatches (the client calls endpoints that don't exist):

- **Fixed 2026-10-06:** the public share page loads from `/share/:token` and switches versions.
- Header search calls `/search`, which doesn't exist, and the error is swallowed.
- HTML and PDF export call routes that don't exist (only Markdown exists).
- **Fixed 2026-10-06:** agenda item and attachment reordering (the `reorder` routes are now registered before `/:id`).
- `VITE_SERVER_URL` falls back to `http://localhost:3001` in the meetings module. Use same-origin `/api` everywhere.
- **Fixed 2026-10-06:** the API is now camelCase end to end. The documents UI typed every field in snake_case while most responses were camelCase, so every date showed "Invalid Date", the version picker was empty, and the amendment page requested `/api/documents/undefined`. The same fix covered: effective dates showing a day early west of UTC, every recorded vote displaying as Failed (the UI read a `passed` field the API never sends), and API errors showing as a bare "HTTP 4xx".

Other work:

- Dashboard after sign-in: upcoming meetings, open amendments awaiting action, recent versions.
- Draft amendment editor: create, move, renumber, delete sections, with a rendered preview of the resulting version. Expose `amendments/:id/preview` (backend exists, no UI).
- Loading, empty, and error states on every page.
- **Fixed 2026-10-06:** the document page header overflowed under the Pending Amendments panel. At 1280px "Propose Amendment" was unclickable, at 1024px four controls were, and on phones all six were, with the 320px panel covering the content. The header now wraps, and below 1280px the panel stacks under the content. The M9 Playwright smoke tests should assert at 390px and 1280px that no control in `main` is covered or off-screen (`document.elementFromPoint` at each control's center).
- **Fixed 2026-10-06:** the meeting code no longer changes when the chair starts the meeting. `START_MEETING` used to carry a new random code into the state, which broke org linking (bylaw sync), meeting documents, minutes and the DEMO test switcher.
- Request schemas accept both snake_case and camelCase (`number_label || numberLabel`). Now that the client sends camelCase, drop the snake_case keys and make the schemas `.strict()`, so a stale key returns 400 instead of being silently stripped. `AmendmentChangeCreate.position` is accepted in neither style today.
- **Fixed 2026-10-06:** the New Version form has an optional effective-date field, so UI-created versions appear in the version picker with their date and in history-by-date.
- **Fixed 2026-10-06** (found by the bug scan):
  - A spurious "Action timed out" error appeared 10 seconds after every action (web and mobile): the timer was never cleared.
  - Vote results never showed and the chair script never said "The motion has carried": both parsed "Motion CARRIED", which the reducer never writes. Their tests used hand-written logs in that format; they now run a vote through the reducer.
  - An admin presiding without a chair couldn't close a vote, answer inquiries, run elections, put an agenda item to a vote, or restore a rule. These panels looked for a member with the chair role.
  - Members couldn't nominate or vote in elections on the web; those panels were only in the chair and admin views.
  - "Call for the Orders of the Day" left the chair with no buttons, blocking the meeting.
  - Changing the meeting stage or quorum always failed with "Unknown action type". The validator now fails to compile when an action type has no case.
  - Moving between documents kept the previous document's version, so Add Section wrote into the wrong document. With no current version, the oldest was selected.
  - The response cache survived writes that change other resources (applying an amendment left the old current version for 30 seconds); any write now clears it.
  - The Edit Amendment form undid every keystroke in the title. The Compare page opened on the two oldest versions, newer on the left.
- Found by the 2026-10-06 bug scan, not yet fixed:
  - Organizations: a rename doesn't show until reload; deleting the current organization leaves none selected; switching organization leaves the old organization's page on screen (and recording a vote on it then fails).
  - Clearing a field is ignored: empty section fields and the amendment description are sent as `undefined`, and the backend uses `??` for `null` (`routes/sections.ts:187-192`, also version dates and notes), so nothing can be cleared and a section can't move to the root.
  - The Add Change form sends hidden fields from a previously selected type (a stale `targetSectionId` becomes the parent of an add), and an add can't choose a parent.
  - Meeting dates shift by the UTC offset on each edit (naive `datetime-local` values parsed in the server's timezone).
  - The sidebar document list never refreshes; Add Section with no version silently does nothing; old versions are editable, which rewrites history.
  - The Compare page reloads itself (full-page spinner) on every selection and a slow diff can overwrite a newer one. The Amendments page keeps a stale document filter. Each action on the amendment and meeting pages replaces the page with a spinner and loses scroll position.
  - Version diff keys sections by `numberLabel` only (`routes/versions.ts:279-342`): duplicate labels under different parents overwrite each other, and unlabeled or renumbered sections show as delete plus add.
  - REST error handling: omitted or invalid optional dates return 500 (meeting `scheduledDate`, version dates); `PUT /documents/:id` passes the body to Prisma, so `doc_type` returns 500; agenda item and attachment positions use `count()` and collide after a delete; reorder with an unknown id, a change without a type, concurrent packet creation and the organization slug race all return 500.
  - Live meetings: a disconnect after socket.io gives up (or a failed join) leaves a permanent "Connecting" spinner, since the Reconnect and Logout buttons are inside the unmounted view. The self-second check compares names, not ids. `AdminView` treats the first admin in the list as the current user.
- Replace `alert()` validation. Keep `TestRoleSwitcher` out of production builds (its hooks-order bug is fixed). Delete the unused mobile-layout components or use them.
- Refactor the 6 "reset state when a prop changes" effects (Sidebar, SpeakerQueuePanel, VotingPanel, AgendaItemEditor, MeetingApp, ParticipantView) to derived state or `key` resets, and fix the 2 manual-memoization warnings (ElectionPanel, useQuorumStatus). Then restore `react-hooks/set-state-in-effect` and `preserve-manual-memoization` to errors in `eslint.config.mjs`.
- Accessibility: keyboard operation of voting, speaker queue, and the section tree; ARIA live regions for meeting state changes; labels on icon buttons and the search input; contrast in dark mode.
- Settings: real version and environment instead of hard-coded "1.0.0" and "Development", members (M3), org rules (M5), account.
- Done when: Playwright smoke tests cover sign in, create org and document, invite a member, draft and propose an amendment, run a meeting with a two-thirds vote, view the resulting version, approve minutes, open the public share link, in both light and dark themes.

### M10. Mobile (participant only)

- Scope: join, raise hand, speaker queue, vote, view agenda and current motion, make in-order motions. Chair and admin stay web-only.
- Filter the motion list to motions currently in order (today it lists all of them).
- Mount the proxy request and acceptance UI or remove it.
- Restore the session on launch. Use `shared/types/socket` instead of redefined event types.
- Found by the 2026-10-06 bug scan: mobile disables voting when quorum is not met (web and the server allow it, with a warning); auth errors lose the server's message (it reads `error.message`, the API sends `error`); and special motions (take from the table, reconsider, suspend rules, bylaw amendment, amend agenda) are sent without their payload, with empty text.
- **Done 2026-10-05:** the existing breakage is fixed. `tsc` is clean, jest runs all 53 tests (it previously found none), the app is on Expo SDK 57, and CI type-checks and tests mobile.
- Done when: a participant can join, queue, make a motion, and vote against a dev backend, with jest coverage of the join and vote flows.

### M11. Cleanup and documentation

**Progress 2026-10-05:** the legacy apps and the stale per-workspace lockfiles are deleted. `frontend-robbie/AGENTS.md` and `BEST_PRACTICES.md` moved to `docs/`. CLAUDE.md and README no longer reference the legacy apps. The rest of this milestone remains.

- Delete `backend-bylawyer/`, `frontend-robbie/`, `frontend-bylawyer/`. First move the useful parts of `frontend-robbie/AGENTS.md` (RONR implementation status) and `BEST_PRACTICES.md` into `docs/`, and port the hook tests (M1).
- Rewrite `README.md` and `docs/INTEGRATION_PLAN.md` for the single backend, Postgres, ports 3001/5173, and the real sync design.
- Fix `CLAUDE.md`. It lists scripts that don't exist (`dev:legacy`, `dev:robbie`, `dev:bylawyer`, `build:backends`, `build:frontends`), says tests run frontend-robbie, calls `db:push` safe (it isn't until M5), omits `DIRECT_URL`, and claims versions are immutable.
- Archive `features/*.json`, or replace it with this spec's acceptance criteria.
- `.env.example` documents all 19 variables the backend reads (today it lists 5).

### M12. Production readiness (self-hosted VPS, single node)

Target: one VPS running Docker Compose. Single node is accepted for v1, so in-memory room state (`roomManager.ts`) and the per-process rate limiter are fine. No Redis adapter.

- Multi-stage Dockerfile for the backend that also serves the built frontend. Same-origin `/api` and Socket.io, so no CORS is needed in production.
- `docker-compose.prod.yml` with `app` and `postgres` services. Postgres is not exposed publicly, data lives on a named volume, and uploads are on a named volume mounted at `UPLOAD_DIR`.
- Reverse proxy with automatic TLS (Caddy recommended) in front of `app`. It must pass WebSocket upgrades through and set `trust proxy` in Express so IP-based rate limits see real client IPs.
- Release flow: build the image, run `prisma migrate deploy` as a one-shot step before `app` starts, then restart. Never `db push`. Document rollback to the previous image tag.
- File storage stays on local disk behind a small interface. No S3 driver in v1.
- Nightly `pg_dump` plus an uploads tarball, kept on the VPS and copied off-host. The restore steps are documented and tested once.
- A real transactional email provider is required in production, and the app refuses to start without one. The VPS should not send mail directly.
- Boot-time config validation (zod) and a `/api/health` that checks the database, used as the compose healthcheck. Pino logs to stdout with Docker log rotation, and dependency audit runs in CI.

**Dependency status (2026-10-05, branch `chore/dependency-updates`):** everything is on its latest version except where a concrete constraint applies.

- **Updated:** Node 24 (current LTS), Express 5, Prisma 7, TypeScript 6.0, React 19.2, React Router 7, Vite 8, Vitest 5, Tailwind 4, Expo SDK 57 (React Native 0.86), nodemailer 10, lucide-react 1, react-markdown 10, jsdom 30, concurrently 10, GitHub Actions v7.
- **Held, and why:**
  - React 19.2.3 rather than 19.3 for the web app too: Expo SDK 57 pins React exactly, and React Native's renderer requires the same React it resolves, so the repo shares one copy. Move both when Expo moves.
  - React Native 0.86 and its native modules (async-storage 2.2, screens, safe-area): pinned by Expo SDK 57.
  - jest 29: jest-expo 57 is built on it. This is also why the only npm-deprecated packages (`glob` 7, `inflight`, `rimraf` 3) remain.
  - TypeScript 7: typescript-eslint doesn't support it yet; 6.0 is the newest it supports.
  - `@types/node` 24: matches the Node 24 runtime. Node 26 becomes LTS on 2026-10-28, so revisit then.
  - Prisma 8: still a release candidate.
- **Remaining audit (66: 0 critical, 50 high, 16 moderate):** almost all are inside Expo's and jest's own pinned dependency trees. Prisma 7.10's CLI pins `deepmerge-ts` 7 and `mysql2` 3.15; these are dev-time only, and this is a Postgres project. Wait for upstream releases; forcing `overrides` broke the dependency tree when tried.
- Graceful shutdown on SIGTERM: stop accepting sockets, flush meeting state, close the DB pool. Deploys mid-meeting then reconnect clients cleanly.
- **Fixed 2026-10-06:** concurrent actions were dropped. Every write re-read the state and retried a version conflict at most three times, so when many members voted or joined at once the rest failed with "State was modified by another user". Writes to a meeting now run through a per-meeting queue (fine on a single node), and a refreshed page no longer leaves its member marked absent. The action enricher also replaced the IDs on actions that refer to an existing item, so nominees couldn't decline and the chair's answers to inquiries were dropped, and it recorded every proxy the chair granted as the chair's own.
- Real-time issues found by the 2026-10-06 bug scan, not yet fixed:
  - Clients apply every `STATE_UPDATE` without checking `stateVersion`, and the server broadcasts after awaiting post-action work (role changes, bylaw sync), so an older state can arrive last and roll every screen back. A failed join also broadcasts its stale snapshot to the whole room.
  - Presence is never reset after a server restart, so members who don't come back count toward quorum forever.
  - Server-stamped names (`mover`, `seconder` and the rest) come from the JWT, so a renamed member keeps the old name. A socket that joins a second meeting stays in the first one's room.
- Done when: a fresh VPS goes from the documented steps to a running HTTPS deployment, passes the M9 smoke tests, survives `docker compose restart` mid-meeting, and a backup restores to a clean instance.
  **Target VPS (surveyed 2026-10-05):**

| Item         | Value                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Provider     | DigitalOcean droplet, public IP 157.245.128.187                                                                                           |
| OS           | Ubuntu 24.04.5 LTS, kernel 6.8                                                                                                            |
| Size         | 1 vCPU, 1.9 GiB RAM, 48 GB disk (4 GB used), no swap checked                                                                              |
| Admin access | sshd on port 4444, bound to the Tailscale address only (`100.118.73.91`, tailnet name `vps`), key plus TOTP (`sshd_config.d/99-2fa.conf`) |
| Firewall     | ufw active (rules not yet reviewed)                                                                                                       |
| Ports 80/443 | Free. No nginx, Caddy, or Apache installed                                                                                                |
| Postgres     | Not installed on the host                                                                                                                 |
| Docker       | Engine 29.1.3 from Ubuntu's `docker.io` package. **Compose plugin missing.** `steve` is not in the `docker` group                         |
| fail2ban     | Installed but in a failed state                                                                                                           |

Host prep before the first deploy:

- `sudo apt install docker-compose-v2`.
- Decide how to run Docker without sudo. The `docker` group is root-equivalent, so prefer a dedicated `deploy` user over adding `steve`.
- Add a 2 GB swap file. With 1.9 GiB RAM, Node, Postgres and Caddy fit at runtime, but there is little headroom.
- **Do not build images on the VPS.** The Vite and TypeScript builds can exhaust memory on this box. Build in CI or on the workstation, push to a registry (GHCR), and have the VPS only pull and run.
- `sudo ufw allow 80,443/tcp` for Caddy. Keep 4444 reachable only through Tailscale.
- Run Postgres in the compose stack, not on the host, so the volume and backups stay self-contained.
- Fix or remove fail2ban. sshd isn't publicly reachable, so it adds little; if kept, it likely needs `backend = systemd` for Ubuntu 24.04's journal-only logging.
- Remove the stale `AuthenticationMethods publickey` at `sshd_config:135`. It has no effect, because sshd keeps the first value and `99-2fa.conf` is included first, but it misleads anyone reading the file.
- Automated deploys need a non-interactive path past the TOTP prompt. Use a `deploy` user exempted from keyboard-interactive only for tailnet source addresses (`Match User deploy Address 100.64.0.0/10`), with CI joining the tailnet via a Tailscale auth key.

**Domain:** `robbie.scouch.dev`.

- `scouch.dev` is registered at Name.com and expires 2026-12-10, so keep auto-renew on.
- DNS is on Cloudflare. The root domain serves GitHub Pages through Cloudflare's proxy.
- `A robbie -> 157.245.128.187` exists in Cloudflare as DNS-only (gray cloud), verified resolving on 2026-10-05. Caddy gets its Let's Encrypt certificate directly over HTTP-01, which requires ufw to allow 80/443.
- Optionally switch to proxied later. That requires SSL/TLS mode Full (strict), a Cloudflare Origin Certificate or Caddy's Cloudflare DNS plugin for the origin certificate, and ufw limiting 80/443 to Cloudflare IP ranges so the origin can't be reached directly.
- Production config: `CLIENT_ORIGIN=https://robbie.scouch.dev`. The mobile `app.config.js` API and socket URLs change from Railway to `https://robbie.scouch.dev`.

**Email: Resend** (decided 2026-10-05).

- **Verified sending domain:** `robbie.scouch.dev`, a subdomain so the app's sending reputation is isolated from `scouch.dev`.
  - Add Resend's DKIM (`resend._domainkey.robbie`), SPF and bounce MX (`send.robbie`) records in Cloudflare, either with Resend's Cloudflare auto-configure or by hand.
  - Add a DMARC record (`_dmarc.robbie`, starting at `p=none`). `scouch.dev` has none today.
- **Production env:** `RESEND_API_KEY` from a sending-only API key scoped to that domain, and `EMAIL_FROM="Robbie <noreply@robbie.scouch.dev>"`.
  - The code's fallback sender is `noreply@robbie.app`, a domain we don't own, so boot validation must reject a missing `EMAIL_FROM` in production.
- **Blocked SMTP ports:** DigitalOcean blocks outbound SMTP ports 465 and 587 on this droplet (verified 2026-10-05). Resend's 2465, 2587 and HTTPS 443 are open.
  - `emailService.ts:82-92` sends through Resend over SMTP on port 465, so **email would fail silently in production as written**.
  - **Done 2026-10-05:** the Resend provider now uses the `resend` SDK over HTTPS, and `npm run email:test -w backend-node -- <email>` sends a test message. The SDK requires Node 20+, so CI moved to Node 22.
  - Remaining: an admin-only "send test email" action in Settings.

## 4. Release criteria

1. M1 through M9, M11, and M12 are done. M10 is done or explicitly deferred in writing.
2. CI is green on `main`: format, lint, type-check, unit, integration, Playwright smoke, build.
3. The M3 authorization matrix and the socket identity spoofing tests pass.
4. On staging, the full loop works: sign in, meeting, bylaw amendment with a secondary amendment, two-thirds vote at exactly two-thirds, new bylaw version containing the amended text, Vote record, approved and published minutes, public share link of the updated bylaws.
5. A server restart mid-meeting loses no users, roles, or meeting state.
6. A guest in a live meeting can follow along and request the floor but cannot vote, move, or second, and is never counted in quorum or vote totals.

## 5. Decisions

Decided 2026-10-05:

- **Hosting:** the owner's DigitalOcean VPS at `robbie.scouch.dev`, Docker Compose, one node (M12). The mobile `app.config.js` still points at Railway URLs and must be updated to the VPS domain.
- **Vote thresholds:** set per organization (M5).
- **Guests:** anyone with the meeting code may join as a non-voting guest (M3).
- **Scale:** a single server is fine for v1.
- **Email:** Resend, sending from `robbie.scouch.dev` over its HTTPS API (M12).

Still open:

- Whether mobile ships in v1 (assumed: yes, participant-only).
