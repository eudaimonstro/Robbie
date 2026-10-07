# In the Room (Screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three meeting screens of the design brief on the server's new meeting model: a chair console for the laptop (the question card, only the actions that are in order, a vote panel with the device counts and the chair's floor tally, attendance with the roster, the headcount and guests, elections always reachable, and a "More" area that takes in the old admin view), a phone view that shows one thing to do at a time (with a guest mode), and a display view for the TV (before the meeting, in session, adjourned), plus the presiding officer on the schedule, the organization's voting members and quorum in Settings, and a Playwright scenario with four browsers that runs a vote from the phones to the display.

**Architecture:**

- **The connection knows the room.** `SocketProvider` (from the UI foundation plan) gains `display`: a display joins with `JOIN_MEETING { meetingCode, display: true }` and gets the state without becoming a member. The context adds `myRole` (the signed-in user's `Member.role` in the state, `null` on a display), `attendance` (`attendanceSummary(state)` from shared), `isDisplay` and `joinError` (the server's message and `errorCode`), so a link to a meeting that doesn't exist shows the code box with "No meeting with that code".
- **Shared pieces.** `describeQuestion(state)` turns whatever is pending (a motion awaiting a second, the motion before the assembly, nominations, an election ballot) into one shape that `QuestionCard` draws at three sizes (laptop, phone, display). `Stamp` draws CARRIED, FAILED or ELECTED with the tally beneath; `parseVoteResult` reads the last vote's log line, both parts included (`On devices 12 to 3, in the room 9 to 2: 21 to 5`), and `currentResult` decides when a result is the latest thing that happened. `AttendanceBlock` is the three numbers (present, quorum, eligible) with the quorum line.
- **Chair console** (`views/ChairConsole.tsx`, for the chair and admins): a 56px top bar, a "Now" column (columns 1 to 8 at 1280px: the current agenda item with its attachments, the question card with `chairActions(state)` as a toolbar and the chair script line, the stamp, the vote panel, the speaker queue) and a side column (attendance, the agenda, nominations and elections, inquiries, and "More": proxies, meeting settings, the people in the meeting with rename and hand over the chair, the agenda from the schedule, the bylaws link, documents, the log). `ChairView`, `AdminView` and the view switcher are deleted.
- **Phone view** (`views/PhoneView.tsx`, for members and guests): a sticky header, the question card, then exactly one action block chosen by `phoneMoment(state, me)`, then the queue, the agenda and the last result. Guests get "Request the floor" and "Ask the chair" only.
- **Display view** (`/meetings/:code/display`, outside the app layout, always the evening palette): joins as a display and draws one of three states with nothing to click.
- **Schedule and settings**: the scheduler picks the presiding officer and shows the join card (code, link, QR); Settings gets "Voting members" and "Quorum" for admins.
- **Playwright**: `e2e/tests/meeting.spec.ts` drives four browser contexts (Dana chairing, Alice and Ben on phones, Pat's display) and Sam as a guest through a scheduled meeting's first vote.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4.3 on the brief's tokens, Vitest 5 with Testing Library, socket.io-client 4.8, `qrcode` 1.5.4 (through plan 1's `QrCode`), `@playwright/test` 1.63.0; Node 24.

**Design:** `docs/superpowers/specs/2026-10-06-in-the-room-design.md` (Phase B of `docs/mvp-roadmap.md`), sections "Screens", "The display view", "Deep link and QR", "Elections from the chair's screen", "Attendance" (the roster panel), "Votes" (the floor tally), "Roles in a meeting" (the presiding officer on the schedule) and "Testing" (the web tests and the Playwright scenario); the visual language is `docs/design-brief.md`, authoritative for look and feel, in particular "The three screens", "Surfaces and components" and "Motion". Two plans come before this one and are done when it starts: the server and shared half, `docs/superpowers/plans/2026-10-06-in-the-room-server.md`, and the UI foundation, `docs/superpowers/plans/2026-10-06-in-the-room-ui-foundation.md` (tokens, the palette check, `/meetings/:code`, `QrCode`, `joinUrl`, the Live Meetings page, the Playwright harness, and the demo seed with Dana presiding over 142 voting members and a 20% quorum).

**Server API this plan uses** (all from the server plan; this plan changes nothing on the server):

| Call                                                                    | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JOIN_MEETING { meetingCode, display? }`                                | `{ success, state, stateVersion, members }`, or `{ success: false, error, errorCode }`: `'No meeting with that code'` with `MEETING_NOT_FOUND`, `'Set your name first'` with `NAME_REQUIRED`, and for a display outside the organization `PERMISSION_DENIED`                                                                                                                                                                                |
| State                                                                   | `Member.role` is `'chair' \| 'admin' \| 'member' \| 'guest'` (`MeetingRole`), `Member.presentBy?: 'device' \| 'chair'`; `organizationId`, `title`, `scheduledFor`, `headcount`, `headcountNames`, `floorVotes`; `votingMethod` may be `'voice'`; `currentElection.floorBallots`; `AgendaItem.packetItemId`; completed motions carry `deviceVotes`, `floorVotes`, `method`, `reconsiderable`; `voterChoices` is empty during a secret ballot |
| `MARK_PRESENT { userId }`, `MARK_ABSENT { memberId, excused }`          | Chair and admins. `MARK_ABSENT` is refused with `MEMBER_CONNECTED` while the member's device is connected                                                                                                                                                                                                                                                                                                                                   |
| `SET_HEADCOUNT { count, names }`                                        | Chair and admins; replaces both; at most one name per person counted                                                                                                                                                                                                                                                                                                                                                                        |
| `SET_FLOOR_TALLY { yea, nay, abstain }`, `SET_FLOOR_BALLOTS { counts }` | Chair and admins, while the vote or the ballot is open; each replaces the last entry                                                                                                                                                                                                                                                                                                                                                        |
| `SET_MEMBER_ROLE { targetMemberId, newRole: 'chair' }`                  | Hands over the chair (saved on the packet); any other `newRole` is refused                                                                                                                                                                                                                                                                                                                                                                  |
| Guests                                                                  | May `RAISE_HAND`, `LOWER_HAND`, `YIELD_FLOOR`, `ASK_INQUIRY` and `RENAME_MEMBER` only                                                                                                                                                                                                                                                                                                                                                       |
| The vote's log line                                                     | `Vote: Yea 21, Nay 5. CARRIED.`, followed by ` On devices 12 to 3, in the room 9 to 2.` when the chair entered a floor tally (not for a voice vote)                                                                                                                                                                                                                                                                                         |
| `GET /api/packets/:code/roster`                                         | Viewer and above: `{ members: [{ userId, name, email, orgRole }], invites: [{ email, role }] }`                                                                                                                                                                                                                                                                                                                                             |
| `POST /api/packets/:code/reload-agenda`                                 | Secretary and above, or the presiding officer, before the meeting starts: `{ live, agenda }`; 409 once it has started                                                                                                                                                                                                                                                                                                                       |
| `GET /api/packets/:code`                                                | The packet with `chairUserId`, `startedAt`, `endedAt` and its agenda items with their attachments                                                                                                                                                                                                                                                                                                                                           |
| `POST /api/organizations/:orgId/packets`, `PUT /api/packets/:id`        | Take `chairUserId` (a member of the organization with the member role or above, or `null`); creating defaults it to the creator                                                                                                                                                                                                                                                                                                             |
| `GET /api/organizations/:id/members`                                    | Viewer and above: the members `{ userId, name, email, role }`                                                                                                                                                                                                                                                                                                                                                                               |
| `GET /api/organizations`, `PUT /api/organizations/:id`                  | Organizations carry `eligibleVoters`, `quorumPercent`, `quorumCount`; the update (admin) takes `eligibleVoters` (or `null`) and one of `quorumPercent` or `quorumCount`, which clears the other                                                                                                                                                                                                                                             |

**Conventions:**

- Paths are from the repository root. Run commands from the repository root unless a step says `cd frontend-unified &&`. Use `&&` between commands, never `;`.
- Use Node 24. The system `node` is 22; put Node 24 first on the PATH in each shell, and check that `node --version` prints `v24.21.0`:

  ```bash
  export PATH=/tmp/claude-1000/-home-steve-workspace-robbie/943dc342-9d15-4cdf-b298-60456f7372f0/scratchpad/node24/node-v24.21.0-linux-x64/bin:$PATH
  ```

- Web tests: `cd frontend-unified && TZ=America/Chicago npx vitest run <path>`; the whole suite is `npm run test:run -w frontend-unified`. The web Vitest config has no `clearMocks`, so each test file clears its own mocks (`vi.clearAllMocks()` in `beforeEach`). Type-check: `cd frontend-unified && npx tsc --noEmit -p .` (it includes the tests).
- The server plan and the UI foundation plan are done. If `shared/dist` is older than `shared/types/index.ts`, run `npm run build:shared` before type-checking the web app.
- Never point anything at port 5432 (another project's database; `backend-node/.env` points there). The Playwright harness and the live check use the throwaway Postgres on port 55432. Start it once if `docker ps --filter name=robbie-ci-pg` doesn't list it:

  ```bash
  docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine
  ```

  CI's Postgres service is on port 5432 inside the runner; that is the only place 5432 appears.

- Before/after snippets show the code as it is when the task starts, that is as the UI foundation plan left it. That plan's codemod rewrote the class names of every meetings file, so this plan never patches class names: a file whose markup changes is replaced whole, and a snippet is only ever a line of logic, an import or a comment the codemod did not touch. Prettier formats this plan's code blocks, so a fragment may show less indentation than the file has: match a snippet by its text and keep the file's indentation.
- Before each commit, run `npx prettier --write` on the files you changed; CI checks formatting. `npm run lint` runs the palette check (`scripts/check-palette.sh`): every class in this plan is a token class, never a raw Tailwind palette class, `white` or `black`, and no emoji is used as an icon (lucide only).
- Another agent may be committing on this branch. `git add` only the paths each commit step lists (and `git rm` the files a step deletes), and never run `git checkout`, `git stash` or `git reset`.
- Commit messages carry no `Co-Authored-By` or other attribution lines.
- No emdashes and American spelling in code, comments and copy. Use the brief's token names and its voice: labels are nouns ("Attendance", "Agenda"), buttons are verbs ("Call to order", "Open the vote", "Mark present"), results are declarations ("Carried", "Failed", "Elected").
- The mobile app is not touched by this plan.

---

## File structure

**Web** (`frontend-unified/src/`; meetings paths are under `modules/meetings/`):

| File                                                                                                   | Responsibility                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types/socket.ts`                                                                                      | `JOIN_MEETING` takes `display`; the join's `errorCode`; `JoinError`; `SocketContextValue` gains `joinError`, `isDisplay`, `myRole`, `attendance`                                                                                                                                                              |
| `hooks/useSocketConnection.ts`                                                                         | Display joins; `joinError`                                                                                                                                                                                                                                                                                    |
| `context/SocketContext.tsx`                                                                            | `SocketProvider({ meetingCode, display })`, `myRole`, `attendance`                                                                                                                                                                                                                                            |
| `hooks/useQuorumStatus.ts`                                                                             | A thin wrapper of `attendanceSummary`                                                                                                                                                                                                                                                                         |
| `index.tsx`                                                                                            | A meeting that doesn't exist shows the code box with the reason                                                                                                                                                                                                                                               |
| `api/client.ts` (app)                                                                                  | Attendance settings on `Organization`; `meetingPackets.roster`, `meetingPackets.reloadAgenda`, `RosterMember`, `MeetingRoster`                                                                                                                                                                                |
| `utils/attendance.ts`, `hooks/useRoster.ts`, `hooks/useEligibleVoters.ts`                              | Roster rows, the eligible count, the quorum line and chip; the roster and the eligible count for a meeting                                                                                                                                                                                                    |
| `components/attendance/AttendanceBlock.tsx`, `HeadcountForm.tsx`, `AttendancePanel.tsx`                | The three numbers; the headcount with names; the roster with Mark present and Mark absent, and the guests                                                                                                                                                                                                     |
| `utils/question.ts`, `components/QuestionCard.tsx`, `components/Stamp.tsx`, `components/TimerLine.tsx` | The pending question in one shape and its card; the stamp; the 2px timer line                                                                                                                                                                                                                                 |
| `hooks/useVoteResults.ts`                                                                              | `parseVoteResult` with both parts and the tally line; `currentResult`                                                                                                                                                                                                                                         |
| `utils/chairActions.ts`                                                                                | The chair's actions that are in order now, in order                                                                                                                                                                                                                                                           |
| `hooks/usePacket.ts`, `components/scheduling/types.ts`                                                 | The meeting's packet (attachments, `startedAt`); the packet's presiding officer and meeting times                                                                                                                                                                                                             |
| `components/console/*`                                                                                 | `ConsoleTopBar`, `JoinInfoCard`, `ActionToolbar`, `ChairScriptLine`, `CurrentItemLine`, `VoteControl`, `ConsoleAgenda`, `MoreArea`                                                                                                                                                                            |
| `components/NominationsPanel.tsx`, `components/ElectionPanel.tsx`                                      | Nominations open from the console at any time; nominees from the room or by name; floor ballots                                                                                                                                                                                                               |
| `views/ChairConsole.tsx`, `views/MeetingApp.tsx`                                                       | The console; the screen for the role                                                                                                                                                                                                                                                                          |
| `utils/phoneMoment.ts`, `components/phone/*`, `views/PhoneView.tsx`                                    | What the phone asks of its owner now; `PhoneHeader`, `ActionBlock`, `VoteBlock`, `DebateBlock`, `MotionPanel`; the phone view                                                                                                                                                                                 |
| `display.tsx`, `views/DisplayView.tsx`, `App.tsx` (app)                                                | The display route outside the app layout; the display                                                                                                                                                                                                                                                         |
| `components/scheduling/api.ts`, `MeetingScheduler.tsx`                                                 | The presiding officer when scheduling; the join card                                                                                                                                                                                                                                                          |
| `modules/documents/components/AttendanceSettingsCard.tsx`, `pages/SettingsPage.tsx`                    | "Voting members" and "Quorum" in Settings                                                                                                                                                                                                                                                                     |
| `index.html` (in `frontend-unified/`)                                                                  | `viewport-fit=cover`, so the phone view's safe-area padding works on iOS                                                                                                                                                                                                                                      |
| Deleted                                                                                                | `views/ChairView.tsx`, `views/AdminView.tsx`, `views/ParticipantView.tsx`, the chair panels the console replaces, the participant panels the phone view replaces, `components/admin/` but `RenameModal`, `components/QuorumWarning.tsx`, `components/MotionCard.tsx`, `components/chair/MotionStackPanel.tsx` |

**Repository root:** `e2e/helpers.ts` (`personPage`), `e2e/tests/meeting.spec.ts` (the scenario); `spec.md`, `CLAUDE.md`, `docs/mvp-roadmap.md` (Task 11).

---

### Task 1: The connection knows the room

**Files:**

- Replace: `frontend-unified/src/modules/meetings/types/socket.ts`, `context/SocketContext.tsx`, `hooks/useQuorumStatus.ts`, `index.tsx` (paths under `frontend-unified/src/modules/meetings/`)
- Modify: `hooks/useSocketConnection.ts`, `views/ChairView.tsx`, `views/ParticipantView.tsx`, `views/AdminView.tsx` (one line each in the views)
- Test: `hooks/__tests__/useSocketConnection.test.ts`, `context/__tests__/SocketContext.test.tsx` (replaced), `hooks/__tests__/useQuorumStatus.test.ts` (replaced), `__tests__/MeetingsModule.test.tsx` (replaced)

What the screens need from the connection: the signed-in user's role in the meeting as the server derived it (`myRole`, read from the state, never assumed), attendance counted the way the server counts it (`attendanceSummary`), a display join for the TV, and the reason a join was refused, with its code, so a link to a meeting that isn't scheduled shows the code box with "No meeting with that code" instead of a toast and a retry button. The user who isn't in the state yet (between connecting and the join's answer) is a guest, not a member: the screens must never offer more than the server will allow.

- [ ] **Step 1: Write the failing tests**

Append to `frontend-unified/src/modules/meetings/hooks/__tests__/useSocketConnection.test.ts`:

```ts
describe('useSocketConnection joins', () => {
  beforeEach(() => {
    io.mockClear();
  });

  // A socket that answers JOIN_MEETING with the given response
  function socketAnswering(response: Record<string, unknown>) {
    const handlers: Record<string, Handler> = {};
    const socket = {
      connected: true,
      on: vi.fn((event: string, handler: Handler) => {
        handlers[event] = handler;
      }),
      emit: vi.fn((event: string, _data: unknown, callback?: Handler) => {
        if (event === 'JOIN_MEETING') callback?.(response);
      }),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    io.mockReturnValueOnce(socket as never);
    return { handlers, socket };
  }

  const joined = { success: true, state: initialState, stateVersion: 1 };

  it('joins with the code alone, as the mobile app does', () => {
    const { handlers, socket } = socketAnswering(joined);
    renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    expect(socket.emit).toHaveBeenCalledWith(
      'JOIN_MEETING',
      { meetingCode: 'DEMO' },
      expect.any(Function),
    );
  });

  it('joins a display without making it a member', () => {
    const { handlers, socket } = socketAnswering(joined);
    renderHook(() => useSocketConnection('DEMO', () => {}, undefined, { display: true }));
    act(() => handlers.connect());
    expect(socket.emit).toHaveBeenCalledWith(
      'JOIN_MEETING',
      { meetingCode: 'DEMO', display: true },
      expect.any(Function),
    );
  });

  it('says why a join was refused, with the code the server sent', () => {
    const { handlers } = socketAnswering({
      success: false,
      error: 'No meeting with that code',
      errorCode: 'MEETING_NOT_FOUND',
    });
    const { result } = renderHook(() => useSocketConnection('NOPE01', () => {}));
    act(() => handlers.connect());
    expect(result.current.isConnected).toBe(false);
    expect(result.current.joinError).toEqual({
      message: 'No meeting with that code',
      code: 'MEETING_NOT_FOUND',
    });
  });

  it('forgets the refusal when trying again', () => {
    const { handlers, socket } = socketAnswering({
      success: false,
      error: 'Too many join attempts',
    });
    const { result } = renderHook(() => useSocketConnection('DEMO', () => {}));
    act(() => handlers.connect());
    expect(result.current.joinError).toEqual({ message: 'Too many join attempts', code: null });

    act(() => result.current.reconnect());
    expect(result.current.joinError).toBeNull();
    expect(socket.connect).toHaveBeenCalled();
  });
});
```

Replace `frontend-unified/src/modules/meetings/context/__tests__/SocketContext.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { SocketProvider, useSocket } from '../SocketContext';

vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({
    status: 'signedIn',
    user: { id: 1, email: 'chair@example.com', name: 'Test Chair' },
  }),
}));

type Handler = (...args: unknown[]) => void;

interface FakeSocket {
  connected: boolean;
  handlers: Record<string, Handler>;
  emitted: { event: string; data: unknown }[];
  on: (event: string, handler: Handler) => FakeSocket;
  emit: (event: string, ...args: unknown[]) => void;
  connect: () => void;
  disconnect: () => void;
}

const sockets: FakeSocket[] = [];
// The state the fake server answers a join with
let joinState: MeetingState = { ...initialState, meetingCode: 'DEMO' };

// Minimal stand-in for a socket.io client: connects on the next tick and answers
// JOIN_MEETING successfully, the way the server does for a signed-in user.
function createFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    connected: false,
    handlers: {},
    emitted: [],
    on(event, handler) {
      socket.handlers[event] = handler;
      return socket;
    },
    emit(event, ...args) {
      socket.emitted.push({ event, data: args[0] });
      if (event === 'JOIN_MEETING') {
        const callback = args[1] as Handler;
        setTimeout(() => callback({ success: true, state: joinState, members: [] }));
      }
    },
    connect() {},
    disconnect() {
      socket.connected = false;
    },
  };
  setTimeout(() => {
    socket.connected = true;
    socket.handlers.connect?.();
  });
  sockets.push(socket);
  return socket;
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => createFakeSocket()),
}));

function MeetingStatus() {
  const { isConnected, meetingCode, leaveMeeting, myRole, attendance, isDisplay, currentUser } =
    useSocket();
  return (
    <div>
      <p>{isConnected ? 'connected' : 'not connected'}</p>
      <p>Code: {meetingCode}</p>
      <p>Role: {myRole ?? 'none'}</p>
      <p>Present: {attendance.present}</p>
      <p>Display: {isDisplay ? 'yes' : 'no'}</p>
      <p>Member: {currentUser?.name ?? 'none'}</p>
      <button onClick={leaveMeeting}>Leave</button>
    </div>
  );
}

// The meetings module's route: the provider takes the code from the link
function MeetingRoute({ display = false }: { display?: boolean }) {
  const { code = '' } = useParams();
  return (
    <SocketProvider meetingCode={code} display={display}>
      <MeetingStatus />
    </SocketProvider>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meetings" element={<p>Live meetings page</p>} />
        <Route path="/meetings/:code" element={<MeetingRoute />} />
        <Route path="/meetings/:code/display" element={<MeetingRoute display />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SocketProvider', () => {
  beforeEach(() => {
    sockets.length = 0;
    joinState = { ...initialState, meetingCode: 'DEMO' };
  });

  it('joins the meeting in the link with only its code, and keeps one socket', async () => {
    renderAt('/meetings/DEMO');

    await screen.findByText('connected');
    // Give a reconnect loop time to show itself
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

    expect(screen.getByText('Code: DEMO')).toBeTruthy();
    expect(sockets).toHaveLength(1);
    expect(sockets[0].connected).toBe(true);
    const joins = sockets[0].emitted.filter((e) => e.event === 'JOIN_MEETING');
    expect(joins).toEqual([{ event: 'JOIN_MEETING', data: { meetingCode: 'DEMO' } }]);
  });

  it('keeps the same socket when the server sends a state update', async () => {
    renderAt('/meetings/DEMO');
    await screen.findByText('connected');

    act(() => {
      sockets[0].handlers.STATE_UPDATE?.({
        state: { ...initialState, meetingCode: 'DEMO', meetingActive: true },
        stateVersion: 1,
      });
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(sockets[0].connected).toBe(true);
  });

  it('leaving emits LEAVE_MEETING, disconnects and goes back to the Live Meetings page', async () => {
    renderAt('/meetings/DEMO');
    await screen.findByText('connected');

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(sockets[0].emitted.map((e) => e.event)).toContain('LEAVE_MEETING');
    expect(sockets[0].connected).toBe(false);
    expect(screen.getByText('Live meetings page')).toBeTruthy();
  });

  it('remembers no meeting in the browser: the link is the meeting', async () => {
    renderAt('/meetings/DEMO');
    await screen.findByText('connected');
    expect(localStorage.getItem('robbie_meeting_code')).toBeNull();
  });

  it("takes the user's role from the state the server sent, and counts attendance as it does", async () => {
    joinState = {
      ...initialState,
      meetingCode: 'DEMO',
      quorum: 3,
      headcount: 2,
      members: [
        { id: 1, name: 'Test Chair', role: 'chair', present: true, presentBy: 'device' },
        { id: 2, name: 'Guest', role: 'guest', present: true, presentBy: 'device' },
      ],
    };
    renderAt('/meetings/DEMO');
    await screen.findByText('connected');

    expect(screen.getByText('Role: chair')).toBeTruthy();
    // The chair on a device and two people counted in the room; never the guest
    expect(screen.getByText('Present: 3')).toBeTruthy();
    expect(screen.getByText('Display: no')).toBeTruthy();
  });

  it('has no role until the state the server sent has the user', async () => {
    renderAt('/meetings/DEMO');
    // Before the join answers, the user is not in the state
    expect(screen.getByText('Role: none')).toBeTruthy();
    await screen.findByText('connected');
    expect(screen.getByText('Role: none')).toBeTruthy();
  });

  it('joins a display without a role or a member', async () => {
    joinState = {
      ...initialState,
      meetingCode: 'DEMO',
      members: [{ id: 1, name: 'Test Chair', role: 'chair', present: true }],
    };
    renderAt('/meetings/DEMO/display');
    await screen.findByText('connected');

    const joins = sockets[0].emitted.filter((e) => e.event === 'JOIN_MEETING');
    expect(joins).toEqual([
      { event: 'JOIN_MEETING', data: { meetingCode: 'DEMO', display: true } },
    ]);
    expect(screen.getByText('Role: none')).toBeTruthy();
    expect(screen.getByText('Member: none')).toBeTruthy();
    expect(screen.getByText('Display: yes')).toBeTruthy();
  });
});
```

Replace `frontend-unified/src/modules/meetings/hooks/__tests__/useQuorumStatus.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { useQuorumStatus } from '../useQuorumStatus';

describe('useQuorumStatus', () => {
  it('counts what the server counts: devices, members marked present and the headcount', () => {
    const state: MeetingState = {
      ...initialState,
      quorum: 4,
      headcount: 2,
      members: [
        { id: 1, name: 'Ann', role: 'chair', present: true, presentBy: 'device' },
        { id: 2, name: 'Bo', role: 'member', present: true, presentBy: 'chair' },
        { id: 3, name: 'Cy', role: 'member', present: false },
        { id: 4, name: 'Guest', role: 'guest', present: true, presentBy: 'device' },
      ],
    };
    const { result } = renderHook(() => useQuorumStatus(state));
    expect(result.current).toEqual({
      presentCount: 4,
      effectiveCount: 4,
      totalMembers: 3,
      hasQuorum: true,
      proxyCount: 0,
    });
  });

  it('has no quorum below the count', () => {
    const state: MeetingState = {
      ...initialState,
      quorum: 3,
      members: [{ id: 1, name: 'Ann', role: 'member', present: true }],
    };
    const { result } = renderHook(() => useQuorumStatus(state));
    expect(result.current.hasQuorum).toBe(false);
    expect(result.current.presentCount).toBe(1);
  });
});
```

Replace `frontend-unified/src/modules/meetings/__tests__/MeetingsModule.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

const socket = vi.hoisted(() => ({
  meetingCode: 'DEMO',
  isConnected: false,
  error: null as string | null,
  joinError: null as { message: string; code: string | null } | null,
  reconnect: vi.fn(),
  leaveMeeting: vi.fn(),
}));
const provider = vi.hoisted(() => ({ codes: [] as string[] }));

vi.mock('../context/SocketContext', () => ({
  SocketProvider: ({ meetingCode, children }: { meetingCode: string; children: ReactNode }) => {
    provider.codes.push(meetingCode);
    return children;
  },
  useSocket: () => socket,
}));
vi.mock('../context/OrganizationBridge', () => ({
  MeetingOrganizationProvider: ({ children }: { children: ReactNode }) => children,
  useMeetingOrganization: () => ({
    currentOrganization: null,
    availableOrganizations: [],
    loading: false,
  }),
}));
vi.mock('../views/LiveMeetingsPage', () => ({ LiveMeetingsPage: () => <p>Live meetings page</p> }));
vi.mock('../views/MeetingApp', () => ({ MeetingApp: () => <p>The meeting</p> }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => toast }));

const { default: MeetingsModule } = await import('../index');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meetings/*" element={<MeetingsModule />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MeetingsModule routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provider.codes = [];
    socket.isConnected = true;
    socket.error = null;
    socket.joinError = null;
  });

  it('shows the Live Meetings page at /meetings', () => {
    renderAt('/meetings');
    expect(screen.getByText('Live meetings page')).toBeTruthy();
  });

  it('opens the meeting in the link, its code in upper case', () => {
    renderAt('/meetings/maple1');
    expect(screen.getByText('The meeting')).toBeTruthy();
    expect(provider.codes).toContain('MAPLE1');
  });

  it('sends a link that cannot be a meeting code to the Live Meetings page', () => {
    renderAt('/meetings/not-a-code!');
    expect(screen.getByText('Live meetings page')).toBeTruthy();
  });
});

describe('MeetingsModule while not connected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socket.isConnected = false;
    socket.error = null;
    socket.joinError = null;
  });

  it('offers a way to leave while connecting', () => {
    renderAt('/meetings/DEMO');
    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    expect(socket.leaveMeeting).toHaveBeenCalled();
  });

  it('shows why the connection failed and lets the user try again', () => {
    socket.error = 'Too many join attempts';
    socket.joinError = { message: 'Too many join attempts', code: null };
    renderAt('/meetings/DEMO');

    expect(screen.queryByText('Too many join attempts')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(socket.reconnect).toHaveBeenCalled();
  });

  it('shows the code box, with the reason, for a link to a meeting that is not scheduled', () => {
    socket.error = 'No meeting with that code';
    socket.joinError = { message: 'No meeting with that code', code: 'MEETING_NOT_FOUND' };
    renderAt('/meetings/DEMO');

    expect(screen.getByText('No meeting with that code')).toBeTruthy();
    expect((screen.getByLabelText('Meeting code') as HTMLInputElement).value).toBe('DEMO');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    // The code box says it; a toast would say it twice
    expect(toast.showToast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/hooks src/modules/meetings/context src/modules/meetings/__tests__/MeetingsModule.test.tsx`
Expected: FAIL. The join sends no `display` and there is no `joinError`; the provider has no `display`, `myRole` or `attendance` (the role and present lines render empty); `useQuorumStatus` takes the members, not the state (its results are wrong); the module shows "Try again" for a meeting that doesn't exist.

- [ ] **Step 3: Replace `frontend-unified/src/modules/meetings/types/socket.ts`**

```ts
import type { Socket } from 'socket.io-client';
import type {
  MeetingState,
  MeetingAction,
  MeetingRole,
  Member,
} from '@robbie-bylawyer/shared/types';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';

// Socket event types (matching server)
export interface StateUpdatePayload {
  state: MeetingState;
  stateVersion: number;
  triggeredBy?: {
    actionType: string;
    userId: number;
  };
}

export interface JoinMeetingResponse {
  success: boolean;
  state?: MeetingState;
  stateVersion?: number;
  members?: Member[];
  error?: string;
  /**
   * Why a join was refused: MEETING_NOT_FOUND (no scheduled meeting has the code), NAME_REQUIRED,
   * PERMISSION_DENIED (a display outside the organization)
   */
  errorCode?: string;
}

export interface ActionResponse {
  success: boolean;
  stateVersion?: number;
  error?: string;
}

export interface ClientToServerEvents {
  JOIN_MEETING: (
    // display: a TV or projector, which receives the meeting without becoming a member of it
    data: { meetingCode: string; display?: boolean },
    callback: (response: JoinMeetingResponse) => void,
  ) => void;
  LEAVE_MEETING: () => void;
  DISPATCH_ACTION: (
    data: { action: MeetingAction; clientSequence: number },
    callback: (response: ActionResponse) => void,
  ) => void;
  REQUEST_STATE: (
    callback: (response: {
      success: boolean;
      state?: MeetingState;
      stateVersion?: number;
      error?: string;
    }) => void,
  ) => void;
}

export interface ServerToClientEvents {
  STATE_UPDATE: (data: StateUpdatePayload) => void;
  ACTION_REJECTED: (data: { clientSequence: number; reason: string; errorCode: string }) => void;
  MEMBER_JOINED: (data: { member: Member; timestamp: string }) => void;
  MEMBER_LEFT: (data: { member: Member; timestamp: string }) => void;
  ERROR: (data: { message: string; code: string }) => void;
}

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A join the server refused: its message, and its error code when it sent one */
export interface JoinError {
  message: string;
  code: string | null;
}

export interface SocketContextValue {
  state: MeetingState;
  dispatch: (action: MeetingAction) => Promise<boolean>;
  isConnected: boolean;
  /** The signed-in user as a member of the meeting; null on a display */
  currentUser: Member | null;
  connectedMembers: Member[];
  error: string | null;
  /** Why the last join was refused, or null */
  joinError: JoinError | null;
  /** The meeting in the page's link (/meetings/:code) */
  meetingCode: string;
  /** A display follows the meeting without being a member of it */
  isDisplay: boolean;
  /**
   * The signed-in user's role in the meeting, as the server derived it and put in the state;
   * null on a display and before the join is answered
   */
  myRole: MeetingRole | null;
  /** Attendance as the server counts it (attendanceSummary in shared) */
  attendance: AttendanceSummary;
  /** Leave the meeting and go back to the Live Meetings page */
  leaveMeeting: () => void;
  reconnect: () => void;
}
```

- [ ] **Step 4: Display joins and `joinError` in `frontend-unified/src/modules/meetings/hooks/useSocketConnection.ts`**

Replace `import type { TypedSocket, StateUpdatePayload } from '../types/socket';` with:

```ts
import type { JoinError, TypedSocket, StateUpdatePayload } from '../types/socket';
```

Replace:

```ts
  connectedMembers: Member[];
  error: string | null;
  dispatch: (action: MeetingAction) => Promise<boolean>;
```

with:

```ts
  connectedMembers: Member[];
  error: string | null;
  /** Why the last join was refused, with the server's error code */
  joinError: JoinError | null;
  dispatch: (action: MeetingAction) => Promise<boolean>;
```

Replace:

```ts
  onTermsNotAccepted?: () => void,
): UseSocketConnectionReturn {
  const [state, setState] = useState<MeetingState>(initialState);
```

with:

```ts
  onTermsNotAccepted?: () => void,
  // display: a TV or projector, which follows the meeting without becoming a member of it
  options: { display?: boolean } = {},
): UseSocketConnectionReturn {
  const display = options.display === true;
  const [state, setState] = useState<MeetingState>(initialState);
  const [joinError, setJoinError] = useState<JoinError | null>(null);
```

Replace:

```ts
newSocket.on('connect', () => {
  newSocket.emit('JOIN_MEETING', { meetingCode }, (response) => {
    isConnectingRef.current = false;
    if (response.success) {
      stateVersionRef.current = response.stateVersion ?? 0;
      setState(response.state!);
      setConnectedMembers(response.members || []);
      setIsConnected(true);
      setError(null);
    } else {
      setError(response.error || 'Failed to join meeting');
    }
  });
});
```

with:

```ts
newSocket.on('connect', () => {
  // Members join with the code alone, as the mobile app does; a display says it is one
  const payload = display ? { meetingCode, display: true } : { meetingCode };
  newSocket.emit('JOIN_MEETING', payload, (response) => {
    isConnectingRef.current = false;
    if (response.success) {
      stateVersionRef.current = response.stateVersion ?? 0;
      setState(response.state!);
      setConnectedMembers(response.members || []);
      setIsConnected(true);
      setError(null);
      setJoinError(null);
    } else {
      const message = response.error || 'Failed to join meeting';
      setError(message);
      setJoinError({ message, code: response.errorCode ?? null });
    }
  });
});
```

Replace `  }, [meetingCode, setTemporaryError]);` with `  }, [meetingCode, display, setTemporaryError]);`.

In `reconnect`, replace:

```ts
if (socket.connected) socket.disconnect();
setError(null);
socket.connect();
```

with:

```ts
if (socket.connected) socket.disconnect();
setError(null);
setJoinError(null);
socket.connect();
```

In the returned object, replace:

```ts
    connectedMembers,
    error,
    dispatch,
```

with:

```ts
    connectedMembers,
    error,
    joinError,
    dispatch,
```

- [ ] **Step 5: Replace `frontend-unified/src/modules/meetings/context/SocketContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Member } from '@robbie-bylawyer/shared/types';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { SocketContextValue } from '../types/socket';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useSession } from '../../../context/SessionContext';

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
  /** The meeting in the page's link (/meetings/:code), in upper case */
  meetingCode: string;
  /** A display (/meetings/:code/display): follows the meeting without being a member of it */
  display?: boolean;
  children: ReactNode;
}

/**
 * The live meeting's connection. The link is the meeting: the provider connects to the code in
 * the route, so a shared link or a QR code joins after sign-in, and a reload rejoins.
 */
export function SocketProvider({ meetingCode, display = false, children }: SocketProviderProps) {
  const { user, markTermsNotAccepted } = useSession();
  const navigate = useNavigate();

  // The session ended (signed out elsewhere, or expired): sign in, then come back to this page
  const handleNotSignedIn = useCallback(() => {
    window.location.assign(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, []);

  // Refused for the terms: RequireSession shows the terms step in place of this module
  const connection = useSocketConnection(meetingCode, handleNotSignedIn, markTermsNotAccepted, {
    display,
  });

  // useSocketConnection returns a new object each render, so depend on its stable fields
  const { disconnect } = connection;

  // disconnect emits LEAVE_MEETING before closing the socket
  const leaveMeeting = useCallback(() => {
    disconnect();
    navigate('/meetings');
  }, [disconnect, navigate]);

  // The user as the state has them: the server derived their role at the join
  const me = useMemo<Member | null>(
    () => (user ? (connection.state.members.find((m) => m.id === user.id) ?? null) : null),
    [user, connection.state.members],
  );

  // A display is nobody in the meeting. Before the join is answered the user is not in the
  // state yet, and is shown as a guest: never offered more than the server allows.
  const currentUser = useMemo<Member | null>(() => {
    if (!user || display) return null;
    return me ?? { id: user.id, name: user.name ?? user.email, role: 'guest', present: true };
  }, [user, display, me]);

  const attendance = useMemo(() => attendanceSummary(connection.state), [connection.state]);

  const value = useMemo<SocketContextValue>(
    () => ({
      state: connection.state,
      dispatch: connection.dispatch,
      isConnected: connection.isConnected,
      currentUser,
      connectedMembers: connection.connectedMembers,
      error: connection.error,
      joinError: connection.joinError,
      meetingCode,
      isDisplay: display,
      myRole: display ? null : (me?.role ?? null),
      attendance,
      leaveMeeting,
      reconnect: connection.reconnect,
    }),
    [
      connection.state,
      connection.dispatch,
      connection.isConnected,
      connection.connectedMembers,
      connection.error,
      connection.joinError,
      connection.reconnect,
      currentUser,
      meetingCode,
      display,
      me,
      attendance,
      leaveMeeting,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
}
```

- [ ] **Step 6: Replace `frontend-unified/src/modules/meetings/hooks/useQuorumStatus.ts`**

```ts
import { useMemo } from 'react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';

/**
 * Quorum for the meeting, counted by attendanceSummary (shared), as the server counts it: members
 * present on a device, members the chair marked present, the headcount of people without an
 * account, and proxies when they count; never guests.
 *
 * @returns
 *   - `presentCount` and `effectiveCount`: everyone who counts toward quorum
 *   - `totalMembers`: the members in the meeting who can vote (not guests)
 *   - `hasQuorum`
 *   - `proxyCount`: absent members represented by a present proxy holder
 */
export function useQuorumStatus(state: MeetingState) {
  return useMemo(() => {
    const summary = attendanceSummary(state);
    return {
      presentCount: summary.present,
      effectiveCount: summary.present,
      totalMembers: state.members.filter((m) => m.role !== 'guest').length,
      hasQuorum: summary.hasQuorum,
      proxyCount: summary.proxies,
    };
  }, [state]);
}
```

Then the three views that call it pass the state. In `frontend-unified/src/modules/meetings/views/ChairView.tsx`, replace:

```ts
const { presentCount, effectiveCount, hasQuorum } = useQuorumStatus(state.members, state.quorum, {
  proxiesCountForQuorum: state.proxiesCountForQuorum,
  proxies: state.proxies,
});
```

with:

```ts
const { presentCount, effectiveCount, hasQuorum } = useQuorumStatus(state);
```

In `views/ParticipantView.tsx`, replace:

```ts
const { presentCount, hasQuorum } = useQuorumStatus(state.members, state.quorum, {
  proxiesCountForQuorum: state.proxiesCountForQuorum,
  proxies: state.proxies,
});
```

with:

```ts
const { presentCount, hasQuorum } = useQuorumStatus(state);
```

In `views/AdminView.tsx`, replace `useQuorumStatus(state.members, state.quorum)` with `useQuorumStatus(state)`. (All three views are replaced in Tasks 5 and 6; this keeps them compiling until then.)

- [ ] **Step 7: Replace `frontend-unified/src/modules/meetings/index.tsx`**

```tsx
/**
 * Meetings Module
 *
 * /meetings is the Live Meetings page: the organization's schedule and the code box.
 * /meetings/:code is the live meeting with that code. The link is the meeting, so it can be
 * shared or shown as a QR code, and a reload rejoins it; each meeting gets its own socket.
 * (/meetings/:code/display, the TV, is its own route in App.tsx, outside the app's layout.)
 */

import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { SocketProvider, useSocket } from './context/SocketContext';
import { MeetingOrganizationProvider } from './context/OrganizationBridge';
import { LiveMeetingsPage } from './views/LiveMeetingsPage';
import { MeetingApp } from './views/MeetingApp';
import { JoinMeetingScreen } from './views/JoinMeetingScreen';
import { MEETING_CODE, normalizeMeetingCode } from './utils/meetingLinks';
import { useToast } from '../../context/ToastContext';

function MeetingsContent() {
  const { isConnected, error, joinError, reconnect, leaveMeeting, meetingCode } = useSocket();
  const { showToast } = useToast();
  // A link to a meeting that isn't scheduled (or a code typed wrong): the code box says so
  const notFound = joinError?.code === 'MEETING_NOT_FOUND';

  // Forward socket errors to toast notifications
  useEffect(() => {
    if (error && !notFound) {
      showToast('error', error);
    }
  }, [error, notFound, showToast]);

  if (!isConnected && joinError?.code === 'MEETING_NOT_FOUND') {
    return (
      <div className="max-w-md mx-auto py-12">
        <JoinMeetingScreen message={joinError.message} initialCode={meetingCode} />
      </div>
    );
  }

  // Show loading while connecting to the meeting. The meeting view (with its Reconnect and Leave
  // buttons) isn't shown until connected, so this screen needs its own way out: the socket
  // stops retrying after a few attempts, and a failed join doesn't retry at all.
  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="card p-8 text-center max-w-md">
          {error ? (
            <p className="text-gavel mb-4" role="alert">
              {error}
            </p>
          ) : (
            <>
              <div className="animate-spin w-12 h-12 border-4 border-gavel border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-ink-muted mb-4">Connecting to meeting...</p>
            </>
          )}
          <div className="flex justify-center gap-3">
            {error && (
              <button onClick={reconnect} className="btn-primary btn-sm">
                Try again
              </button>
            )}
            <button onClick={leaveMeeting} className="btn-secondary btn-sm">
              Leave meeting
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show the meeting once connected
  return <MeetingApp />;
}

/** The meeting in the link; a link that can't be a meeting code goes to the Live Meetings page */
function LiveMeetingRoute() {
  const { code = '' } = useParams();
  const meetingCode = normalizeMeetingCode(code);
  if (!MEETING_CODE.test(meetingCode)) return <Navigate to="/meetings" replace />;
  // A new code is a new meeting: a fresh provider, so nothing of the last one shows
  return (
    <SocketProvider key={meetingCode} meetingCode={meetingCode}>
      <MeetingsContent />
    </SocketProvider>
  );
}

export default function MeetingsModule() {
  return (
    <MeetingOrganizationProvider>
      <Routes>
        <Route index element={<LiveMeetingsPage />} />
        <Route path=":code" element={<LiveMeetingRoute />} />
        <Route path="*" element={<Navigate to="/meetings" replace />} />
      </Routes>
    </MeetingOrganizationProvider>
  );
}

// Re-export for use in other parts of the app if needed
export { SocketProvider, useSocket } from './context/SocketContext';
export { MeetingOrganizationProvider, useMeetingOrganization } from './context/OrganizationBridge';
```

- [ ] **Step 8: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/hooks src/modules/meetings/context src/modules/meetings/__tests__/MeetingsModule.test.tsx`
Expected: all pass: the four new tests in `useSocketConnection.test.ts` beside the ones already there, `SocketContext` 7, `useQuorumStatus` 2, `MeetingsModule` 6.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass; lint ends with `Palette check passed (0 files on the allowlist).`

- [ ] **Step 9: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings
git add frontend-unified/src/modules/meetings
git commit -m "feat(web): the meeting connection knows the room

The socket context gives the user's meeting role from the state (a guest
until the server says otherwise), attendance as attendanceSummary counts it,
and display joins that follow a meeting without joining it. A link to a
meeting that isn't scheduled shows the code box with the server's reason.
useQuorumStatus wraps attendanceSummary."
```

---

### Task 2: Attendance: the roster, marking people present, the headcount

**Files:**

- Modify: `frontend-unified/src/api/client.ts`
- Create: `frontend-unified/src/modules/meetings/utils/attendance.ts`, `hooks/useRoster.ts`, `hooks/useEligibleVoters.ts`, `components/attendance/AttendanceBlock.tsx`, `components/attendance/HeadcountForm.tsx`, `components/attendance/AttendancePanel.tsx` (paths under `frontend-unified/src/modules/meetings/`)
- Test: `frontend-unified/src/api/__tests__/client.test.ts`, `frontend-unified/src/modules/meetings/utils/__tests__/attendance.test.ts` (new), `components/attendance/__tests__/AttendancePanel.test.tsx` (new)

The attendance panel is the chair's (and the secretary's) view of who is here. It merges the organization's roster (`GET /api/packets/:code/roster`) with `state.members`: every voting member (the member role and above; viewers join as guests and never count) is connected on a device, marked present by the chair, absent, or not joined, with "Mark present" or "Mark absent" beside them. A member whose device is connected can't be marked absent (the server answers `MEMBER_CONNECTED`), so that button is disabled rather than left to fail. Below the roster: the headcount of people without an account, with optional names for the minutes, and the guests in their own list. On top: the attendance block, the brief's three numbers (present, quorum, eligible) and the quorum line.

"Eligible" is the organization's `eligibleVoters`, or, when it isn't set, its voting members in the roster (what the server's quorum counts against). The organizations list carries the setting, so `useEligibleVoters` reads it from there; guests (outside the organization) aren't given the roster and don't need it.

- [ ] **Step 1: Write the failing tests**

In `frontend-unified/src/api/__tests__/client.test.ts`, add `meetingPackets,` after `bylawSync,` in the import list at the top (the UI foundation plan added `schedule,` after it too), and add inside `describe('organization calls', () => {`, after the last `it`:

```ts
it("reads a meeting's roster fresh each time, and reloads its agenda", async () => {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ members: [], invites: [] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await meetingPackets.roster('MAPLE1');
  await meetingPackets.roster('MAPLE1');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/packets/MAPLE1/roster');

  await meetingPackets.reloadAgenda('MAPLE1');
  const [url, init] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
  expect(url).toBe('/api/packets/MAPLE1/reload-agenda');
  expect(init.method).toBe('POST');
});
```

Create `frontend-unified/src/modules/meetings/utils/__tests__/attendance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../api/client';
import { attendanceChip, eligibleCount, quorumLine, rosterRows } from '../attendance';

const roster: MeetingRoster = {
  members: [
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', orgRole: 'admin' },
    { userId: 3, name: 'Alice Brennan', email: 'alice@maplegrove.example', orgRole: 'member' },
    { userId: 4, name: 'Ben Whitaker', email: 'ben@maplegrove.example', orgRole: 'member' },
    { userId: 5, name: null, email: 'carmen@maplegrove.example', orgRole: 'member' },
    { userId: 9, name: 'Morgan Lee', email: 'morgan@maplegrove.example', orgRole: 'viewer' },
  ],
  invites: [{ email: 'new@maplegrove.example', role: 'member' }],
};

const members: Member[] = [
  { id: 2, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
  { id: 3, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'chair' },
  { id: 4, name: 'Ben Whitaker', role: 'member', present: false },
];

const summary = (overrides: Partial<AttendanceSummary> = {}): AttendanceSummary => ({
  devicePresent: 1,
  markedPresent: 1,
  headcount: 3,
  proxies: 0,
  present: 5,
  quorum: 29,
  hasQuorum: false,
  guests: 0,
  ...overrides,
});

describe('rosterRows', () => {
  it("gives each voting member's standing, by name, and leaves viewers out", () => {
    expect(rosterRows(roster, members)).toEqual([
      { userId: 3, name: 'Alice Brennan', status: 'marked' },
      { userId: 4, name: 'Ben Whitaker', status: 'absent' },
      { userId: 5, name: 'carmen', status: 'not-joined' },
      { userId: 2, name: 'Dana Okafor', status: 'connected' },
    ]);
  });

  it('counts a present member saved without a reason as on a device', () => {
    const rows = rosterRows(roster, [{ id: 2, name: 'Dana Okafor', role: 'chair', present: true }]);
    expect(rows.find((r) => r.userId === 2)?.status).toBe('connected');
  });
});

describe('eligibleCount', () => {
  it("takes the organization's number of voting members", () => {
    expect(eligibleCount({ eligibleVoters: 142 }, roster)).toBe(142);
  });

  it("counts the roster's voting members when the organization has no number", () => {
    expect(eligibleCount({ eligibleVoters: null }, roster)).toBe(4);
    expect(eligibleCount(null, roster)).toBe(4);
  });

  it('is unknown without either', () => {
    expect(eligibleCount(null, null)).toBeNull();
  });
});

describe('the quorum in words', () => {
  it('says how many more are needed, or that quorum is met', () => {
    expect(quorumLine(summary())).toBe('Need 24 more');
    expect(quorumLine(summary({ present: 30, hasQuorum: true }))).toBe('Quorum met');
  });

  it('puts attendance in one chip for the console', () => {
    expect(attendanceChip(summary(), 142)).toBe('5 present of 142, quorum 29, not met');
    expect(attendanceChip(summary({ present: 38, hasQuorum: true }), null)).toBe(
      '38 present, quorum 29, met',
    );
  });
});
```

Create `frontend-unified/src/modules/meetings/components/attendance/__tests__/AttendancePanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../../api/client';
import { AttendancePanel } from '../AttendancePanel';

const roster: MeetingRoster = {
  members: [
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', orgRole: 'admin' },
    { userId: 3, name: 'Alice Brennan', email: 'alice@maplegrove.example', orgRole: 'member' },
    { userId: 4, name: 'Ben Whitaker', email: 'ben@maplegrove.example', orgRole: 'member' },
    { userId: 5, name: 'Carmen Diaz', email: 'carmen@maplegrove.example', orgRole: 'member' },
    { userId: 9, name: 'Morgan Lee', email: 'morgan@maplegrove.example', orgRole: 'viewer' },
  ],
  invites: [],
};

const state: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  quorum: 29,
  headcount: 0,
  headcountNames: [],
  members: [
    { id: 2, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
    { id: 3, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'chair' },
    { id: 4, name: 'Ben Whitaker', role: 'member', present: false },
    { id: 11, name: 'Sam Ortiz', role: 'guest', present: true, presentBy: 'device' },
  ],
};

const dispatch = vi.fn();

function renderPanel(overrides: Partial<MeetingState> = {}) {
  const current = { ...state, ...overrides };
  render(
    <AttendancePanel
      state={current}
      dispatch={dispatch}
      summary={attendanceSummary(current)}
      roster={roster}
      rosterError={null}
      eligible={142}
    />,
  );
}

describe('AttendancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the three numbers and the quorum line', () => {
    renderPanel();
    // Each number follows its label in the markup (the label is shown beneath it)
    const figure = (label: string) =>
      screen.getAllByRole('term').find((term) => term.textContent === label)?.nextElementSibling
        ?.textContent;
    // Dana on a device and Alice marked present; Ben is absent and Sam is a guest
    expect(figure('Present')).toBe('2');
    expect(figure('Quorum')).toBe('29');
    expect(figure('Eligible')).toBe('142');
    expect(screen.getByText('Need 27 more')).toBeTruthy();
  });

  it('lists each voting member with how they are here, and no viewers', () => {
    renderPanel();
    const roll = screen.getByRole('list', { name: 'Voting members' });
    const row = (name: string) => within(roll).getByText(name).closest('li')!;
    expect(within(row('Dana Okafor')).getByText('Present')).toBeTruthy();
    expect(within(row('Alice Brennan')).getByText('Marked present')).toBeTruthy();
    expect(within(row('Ben Whitaker')).getByText('Absent')).toBeTruthy();
    expect(within(row('Carmen Diaz')).getByText('Not joined')).toBeTruthy();
    expect(screen.queryByText('Morgan Lee')).toBeNull();
  });

  it('marks someone without a phone present from the roster', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Carmen Diaz present' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MARK_PRESENT', userId: 5 }),
    );
  });

  it('marks absent someone the chair marked, but not someone whose device is here', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Alice Brennan absent' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MARK_ABSENT', memberId: 3, excused: false }),
    );
    expect(
      (screen.getByRole('button', { name: 'Mark Dana Okafor absent' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('counts the people without an account, with the names given', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Headcount'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Names for the minutes/), {
      target: { value: 'Dee Park\n\nEli Ross' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the headcount' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_HEADCOUNT', count: 3, names: ['Dee Park', 'Eli Ross'] }),
    );
  });

  it('refuses more names than people counted', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Headcount'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Names for the minutes/), {
      target: { value: 'Dee Park\nEli Ross' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the headcount' }));
    expect(screen.getByText('Give at most one name for each person counted')).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('lists the guests apart', () => {
    renderPanel();
    const guests = screen.getByRole('list', { name: 'Guests' });
    expect(within(guests).getByText('Sam Ortiz')).toBeTruthy();
  });

  it('finds a member by name', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Find a member'), { target: { value: 'car' } });
    const roll = screen.getByRole('list', { name: 'Voting members' });
    expect(within(roll).getAllByRole('listitem')).toHaveLength(1);
    expect(within(roll).getByText('Carmen Diaz')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/api/__tests__/client.test.ts src/modules/meetings/utils/__tests__/attendance.test.ts src/modules/meetings/components/attendance`
Expected: FAIL. `meetingPackets` is not exported, and `../attendance` and `../AttendancePanel` don't exist.

- [ ] **Step 3: The roster and the attendance settings in `frontend-unified/src/api/client.ts`**

Replace:

```ts
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

with:

```ts
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** How many voting members it has (the quorum's base); null counts the roster's members */
  eligibleVoters?: number | null;
  /** The quorum: a percentage of the voting members, or a number of people; one is set */
  quorumPercent?: number | null;
  quorumCount?: number | null;
}
```

Replace:

```ts
export interface OrganizationUpdate {
  name?: string;
  description?: string;
  isActive?: boolean;
}
```

with:

```ts
export interface OrganizationUpdate {
  name?: string;
  description?: string;
  isActive?: boolean;
  /** null counts the roster's voting members */
  eligibleVoters?: number | null;
  /** Setting one of these clears the other */
  quorumPercent?: number;
  quorumCount?: number;
}
```

Add before the line `// Documents` (after the `schedule` object the UI foundation plan added):

```ts
// A live meeting's organization and its agenda on the schedule, by meeting code
export const meetingPackets = {
  /**
   * The meeting's organization's members and pending additions, for marking people present
   * (viewer and above). Not cached: people join the organization while a meeting runs.
   */
  roster: (code: string) => request<MeetingRoster>(`/packets/${code}/roster`, {}, false),
  /** Replace the live agenda with the schedule's, before the meeting is called to order */
  reloadAgenda: (code: string) =>
    request<{ live: boolean }>(`/packets/${code}/reload-agenda`, { method: 'POST' }),
};
```

Add after the `ScheduledMeeting` interface (which follows `MemberList`):

```ts
/** A member of a live meeting's organization, as the roster lists them */
export interface RosterMember {
  userId: number;
  name: string | null;
  email: string;
  orgRole: OrgRole;
}

/** A live meeting's organization: its members, and additions waiting for a first sign-in */
export interface MeetingRoster {
  members: RosterMember[];
  invites: Array<{ email: string; role: OrgRole }>;
}
```

- [ ] **Step 4: Create `frontend-unified/src/modules/meetings/utils/attendance.ts`**

```ts
import type { Member } from '@robbie-bylawyer/shared/types';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingRoster, Organization } from '../../../api/client';
import { atLeast } from '../../../utils/roles';

/** How a voting member of the organization stands in the meeting */
export type RosterStatus = 'connected' | 'marked' | 'absent' | 'not-joined';

export interface RosterRow {
  userId: number;
  name: string;
  status: RosterStatus;
}

const byName = new Intl.Collator(undefined, { sensitivity: 'base' });

/**
 * The organization's voting members (the member role and above) and how each stands in the
 * meeting: present on a connected device, marked present by the chair, absent, or not joined.
 * Viewers are left out: they join as guests and never count.
 */
export function rosterRows(roster: MeetingRoster, members: Member[]): RosterRow[] {
  const inMeeting = new Map(members.map((m) => [m.id, m]));
  return roster.members
    .filter((person) => atLeast(person.orgRole, 'member'))
    .map((person) => {
      const member = inMeeting.get(person.userId);
      const status: RosterStatus = !member
        ? 'not-joined'
        : !member.present
          ? 'absent'
          : member.presentBy === 'chair'
            ? 'marked'
            : 'connected';
      const name = member?.name ?? person.name ?? person.email.split('@')[0];
      return { userId: person.userId, name, status };
    })
    .sort((a, b) => byName.compare(a.name, b.name));
}

/**
 * The voting members quorum is counted against: the organization's number, or else its voting
 * members in the roster, as the server counts them. Null while neither is known.
 */
export function eligibleCount(
  organization: Pick<Organization, 'eligibleVoters'> | null,
  roster: MeetingRoster | null,
): number | null {
  if (organization?.eligibleVoters) return organization.eligibleVoters;
  if (!roster) return null;
  return roster.members.filter((m) => atLeast(m.orgRole, 'member')).length;
}

/** "Quorum met", or how many more people are needed */
export function quorumLine(summary: AttendanceSummary): string {
  return summary.hasQuorum ? 'Quorum met' : `Need ${summary.quorum - summary.present} more`;
}

/** Attendance in one line for the console's top bar: "38 present of 142, quorum 29, met" */
export function attendanceChip(summary: AttendanceSummary, eligible: number | null): string {
  const of = eligible ? ` of ${eligible}` : '';
  return `${summary.present} present${of}, quorum ${summary.quorum}, ${summary.hasQuorum ? 'met' : 'not met'}`;
}
```

- [ ] **Step 5: Create the two hooks**

`frontend-unified/src/modules/meetings/hooks/useRoster.ts`:

```ts
import { useEffect, useState } from 'react';
import { meetingPackets, type MeetingRoster } from '../../../api/client';

/**
 * The meeting's organization's roster, loaded once per meeting. People outside the organization
 * (guests) are refused it, and get the error.
 */
export function useRoster(meetingCode: string, enabled = true) {
  const [loaded, setLoaded] = useState<{
    code: string;
    roster: MeetingRoster | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let canceled = false;
    meetingPackets
      .roster(meetingCode)
      .then((roster) => {
        if (!canceled) setLoaded({ code: meetingCode, roster, error: null });
      })
      .catch((err: unknown) => {
        if (!canceled) {
          const error = err instanceof Error ? err.message : "Couldn't load the roster";
          setLoaded({ code: meetingCode, roster: null, error });
        }
      });
    return () => {
      canceled = true;
    };
  }, [meetingCode, enabled]);

  // A roster loaded for another meeting is not this one's
  const current = loaded?.code === meetingCode ? loaded : null;
  return { roster: current?.roster ?? null, error: current?.error ?? null };
}
```

`frontend-unified/src/modules/meetings/hooks/useEligibleVoters.ts`:

```ts
import type { MeetingRoster } from '../../../api/client';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { eligibleCount } from '../utils/attendance';

/**
 * The meeting organization's voting members: its setting from the user's organizations list,
 * or else its roster's voting members
 */
export function useEligibleVoters(
  organizationId: string | null,
  roster: MeetingRoster | null,
): number | null {
  const { availableOrganizations } = useMeetingOrganization();
  const organization = availableOrganizations.find((o) => o.id === organizationId) ?? null;
  return eligibleCount(organization, roster);
}
```

- [ ] **Step 6: Create `frontend-unified/src/modules/meetings/components/attendance/AttendanceBlock.tsx`**

```tsx
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import { quorumLine } from '../../utils/attendance';

interface AttendanceBlockProps {
  summary: AttendanceSummary;
  /** The voting members quorum is counted against; null while unknown */
  eligible: number | null;
  /** In a console panel, or on the display at 1080p */
  size?: 'panel' | 'display';
}

/**
 * Attendance you can read from the door (docs/design-brief.md): present, quorum and eligible in
 * Fraunces with labels beneath, and a line saying whether quorum is met
 */
export function AttendanceBlock({ summary, eligible, size = 'panel' }: AttendanceBlockProps) {
  const display = size === 'display';
  const figures = [
    { label: 'Present', value: String(summary.present) },
    { label: 'Quorum', value: String(summary.quorum) },
    { label: 'Eligible', value: eligible === null ? '-' : String(eligible) },
  ];
  return (
    <div>
      <dl className={`grid grid-cols-3 ${display ? 'gap-10' : 'gap-4'}`}>
        {figures.map((figure) => (
          <div key={figure.label} className="flex flex-col-reverse">
            <dt
              className={
                display
                  ? 'text-display-label font-semibold uppercase tracking-[0.08em] text-ink-muted'
                  : 'label-caps'
              }
            >
              {figure.label}
            </dt>
            <dd
              className={`font-serif-soft font-semibold tabular-nums text-ink ${display ? 'text-display-number' : 'text-page'}`}
            >
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
      <p
        className={`mt-2 font-semibold ${summary.hasQuorum ? 'text-carried' : 'text-caution-ink'} ${display ? 'text-display-line' : 'text-sm'}`}
      >
        {quorumLine(summary)}
      </p>
    </div>
  );
}
```

The `dt` comes first in the markup, as `<dl>` wants, and `flex-col-reverse` puts the number above its label.

- [ ] **Step 7: Create `frontend-unified/src/modules/meetings/components/attendance/HeadcountForm.tsx`**

```tsx
import { useId, useState, type FormEvent } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction } from '@robbie-bylawyer/shared/types';

interface HeadcountFormProps {
  /** The meeting's headcount and names now (the form is keyed on them, so a change resets it) */
  headcount: number;
  names: string[];
  dispatch: React.Dispatch<MeetingAction>;
}

/**
 * People in the room without an account: how many, and their names when they want them in the
 * minutes. Saving replaces both (SET_HEADCOUNT).
 */
export function HeadcountForm({ headcount, names, dispatch }: HeadcountFormProps) {
  const countId = useId();
  const namesId = useId();
  const [count, setCount] = useState(String(headcount));
  const [nameText, setNameText] = useState(names.join('\n'));
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(count.trim() || '0');
    if (!Number.isInteger(value) || value < 0) {
      setProblem('The headcount is a whole number, 0 or more');
      return;
    }
    const list = nameText
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (list.length > value) {
      setProblem('Give at most one name for each person counted');
      return;
    }
    setProblem(null);
    dispatch({ type: 'SET_HEADCOUNT', count: value, names: list, timestamp: generateTimestamp() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor={countId} className="label">
          Headcount
        </label>
        <p className="mb-1 text-xs text-ink-muted">People in the room without an account</p>
        <input
          id={countId}
          className="input tabular-nums"
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={namesId} className="label">
          Names for the minutes (optional, one per line)
        </label>
        <textarea
          id={namesId}
          className="textarea"
          rows={3}
          value={nameText}
          onChange={(e) => setNameText(e.target.value)}
        />
      </div>
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <button type="submit" className="btn-secondary btn-sm">
        Save the headcount
      </button>
    </form>
  );
}
```

- [ ] **Step 8: Create `frontend-unified/src/modules/meetings/components/attendance/AttendancePanel.tsx`**

```tsx
import { useId, useMemo, useState } from 'react';
import { generateTimestamp, type AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../api/client';
import { PresenceBadge } from '../../../../components/ui/Badge';
import { rosterRows, type RosterRow, type RosterStatus } from '../../utils/attendance';
import { AttendanceBlock } from './AttendanceBlock';
import { HeadcountForm } from './HeadcountForm';

interface AttendancePanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  summary: AttendanceSummary;
  roster: MeetingRoster | null;
  rosterError: string | null;
  eligible: number | null;
}

/**
 * The chair's attendance panel: the three numbers, the organization's voting members with how
 * each is here (and Mark present or Mark absent), the headcount of people without an account,
 * and the guests
 */
export function AttendancePanel({
  state,
  dispatch,
  summary,
  roster,
  rosterError,
  eligible,
}: AttendancePanelProps) {
  const findId = useId();
  const [find, setFind] = useState('');
  const rows = useMemo(
    () => (roster ? rosterRows(roster, state.members) : []),
    [roster, state.members],
  );
  const query = find.trim().toLowerCase();
  const shown = query ? rows.filter((row) => row.name.toLowerCase().includes(query)) : rows;
  const guests = state.members.filter((m) => m.role === 'guest' && m.present);

  const markPresent = (row: RosterRow) =>
    dispatch({ type: 'MARK_PRESENT', userId: row.userId, timestamp: generateTimestamp() });
  const markAbsent = (row: RosterRow) =>
    dispatch({
      type: 'MARK_ABSENT',
      memberId: row.userId,
      excused: false,
      timestamp: generateTimestamp(),
    });

  return (
    <section className="card space-y-5 p-5" aria-labelledby="attendance-heading">
      <h3 id="attendance-heading" className="label-caps">
        Attendance
      </h3>
      <AttendanceBlock summary={summary} eligible={eligible} />
      <p className="text-xs tabular-nums text-ink-muted">
        {summary.devicePresent} on a device, {summary.markedPresent} marked present,{' '}
        {summary.headcount} counted in the room
        {summary.proxies > 0 && `, ${summary.proxies} by proxy`}
      </p>

      {/* Keyed on what the meeting has, so a change from another console resets the form */}
      <HeadcountForm
        key={`${state.headcount}|${state.headcountNames.join('\n')}`}
        headcount={state.headcount}
        names={state.headcountNames}
        dispatch={dispatch}
      />

      <div className="space-y-2">
        <label htmlFor={findId} className="label">
          Find a member
        </label>
        <input
          id={findId}
          className="input"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
        {rosterError ? (
          <p role="alert" className="text-sm text-gavel">
            {rosterError}
          </p>
        ) : !roster ? (
          <p className="text-sm text-ink-muted">Loading the roster...</p>
        ) : (
          <ul
            aria-label="Voting members"
            className="max-h-96 divide-y divide-rule overflow-y-auto scrollbar-thin"
          >
            {shown.map((row) => (
              <li key={row.userId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                  <StatusBadge status={row.status} />
                </div>
                <RowAction row={row} onMarkPresent={markPresent} onMarkAbsent={markAbsent} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {guests.length > 0 && (
        <div className="space-y-2">
          <h4 className="label-caps">Guests ({guests.length})</h4>
          <ul aria-label="Guests" className="flex flex-wrap gap-2">
            {guests.map((guest) => (
              <li key={guest.id} className="badge-guest">
                {guest.name}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            Guests follow the meeting and may ask to speak. They don&apos;t vote or count toward
            quorum.
          </p>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: RosterStatus }) {
  if (status === 'connected') return <PresenceBadge presence="present" />;
  if (status === 'marked') return <PresenceBadge presence="marked" />;
  if (status === 'absent') return <PresenceBadge presence="absent" />;
  return <span className="block text-xs text-ink-muted">Not joined</span>;
}

function RowAction({
  row,
  onMarkPresent,
  onMarkAbsent,
}: {
  row: RosterRow;
  onMarkPresent: (row: RosterRow) => void;
  onMarkAbsent: (row: RosterRow) => void;
}) {
  if (row.status === 'connected') {
    // The server refuses it (MEMBER_CONNECTED): their phone says they are in the room
    return (
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled
        title="Their device is connected, so they are here"
        aria-label={`Mark ${row.name} absent`}
      >
        Mark absent
      </button>
    );
  }
  if (row.status === 'marked') {
    return (
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => onMarkAbsent(row)}
        aria-label={`Mark ${row.name} absent`}
      >
        Mark absent
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={() => onMarkPresent(row)}
      aria-label={`Mark ${row.name} present`}
    >
      Mark present
    </button>
  );
}
```

- [ ] **Step 9: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/api/__tests__/client.test.ts src/modules/meetings/utils/__tests__/attendance.test.ts src/modules/meetings/components/attendance`
Expected: all pass: the new client test, `attendance` 7, `AttendancePanel` 8.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
npx prettier --write frontend-unified/src/api frontend-unified/src/modules/meetings
git add frontend-unified/src/api frontend-unified/src/modules/meetings
git commit -m "feat(web): attendance from the roster, marked presence and the headcount

The attendance panel lists the organization's voting members with how each is
here (on a device, marked present, absent, not joined), marks people present
or absent, counts people without an account with names for the minutes, and
lists guests apart. The attendance block shows present, quorum and eligible."
```

---

### Task 3: The question card, the stamp, and the last result

**Files:**

- Create: `frontend-unified/src/modules/meetings/utils/question.ts`, `components/QuestionCard.tsx`, `components/Stamp.tsx`, `components/TimerLine.tsx` (paths under `frontend-unified/src/modules/meetings/`)
- Replace: `hooks/useVoteResults.ts`
- Test: `utils/__tests__/question.test.ts`, `components/__tests__/QuestionCard.test.tsx`, `components/__tests__/Stamp.test.tsx`, `components/__tests__/TimerLine.test.tsx` (new), `hooks/__tests__/useVoteResults.test.ts` (tests added)

The three things the brief asks people to remember, as components all three screens share:

- **The question card.** `describeQuestion(state)` turns whatever is before the assembly into one shape: a motion awaiting a second ("Moved by Alice Brennan, awaiting a second"), the motion being considered ("Moved by Alice Brennan, seconded by Ben Whitaker", the vote it needs, and the questions pending beneath it), nominations ("Election for Director", who has been nominated) or an election's ballot. `QuestionCard` draws it at three sizes: 2.5rem on a laptop, 1.5rem on a phone, 72px on the display, in Fraunces, with a 2px gavel rule on top, crossfading (200ms) when the question changes.
- **The stamp.** CARRIED, FAILED or ELECTED in Fraunces 700, a 3px border in `carried` (or `ink` for FAILED: a failed result is never red), tilted -4 degrees, landing with the brief's scale and fade, over the tally line.
- **The last result.** The server keeps the vote's log line as the web client parses it (`Vote: Yea 11, Nay 2. CARRIED.`) and appends the two parts when the chair entered a floor tally (` On devices 2 to 0, in the room 9 to 2.`). `parseVoteResult` reads both and builds the brief's tally line, `On devices 2 to 0, in the room 9 to 2: 11 to 2` (just `11 to 2` without a floor tally, and for a voice vote, which is all floor). A later decision of another kind (adopted by unanimous consent, an election closed or declared) makes the last vote old news. `currentResult` decides what the room sees: an election just decided, or the last vote, until the next question comes up.

`TimerLine` is the brief's timer: a 2px progress line in `caution` with the time left in tabular numerals.

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/modules/meetings/utils/__tests__/question.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { Election, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { parseVoteResult } from '../../hooks/useVoteResults';
import {
  adjournedAt,
  currentResult,
  describeQuestion,
  itemsDecided,
  stageLabel,
} from '../question';

const motion = (key: string, overrides: Partial<Motion> = {}): Motion => ({
  ...MOTIONS[key],
  id: 1,
  type: key,
  text: 'Resurface the pool this spring',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: null,
  status: 'active',
  ...overrides,
});

const active: MeetingState = { ...initialState, meetingActive: true, meetingStage: 'new-business' };

const election = (overrides: Partial<Election> = {}): Election => ({
  id: 7,
  position: 'Director',
  candidates: [
    { name: 'Carmen Diaz', id: 5 },
    { name: 'Ray Castillo', id: 6 },
  ],
  requiredVotes: 'majority',
  votingInProgress: true,
  ballotResults: { 'Carmen Diaz': 0, 'Ray Castillo': 0 },
  votersWhoVoted: [],
  elected: null,
  ...overrides,
});

describe('describeQuestion', () => {
  it('is null when nothing is before the assembly', () => {
    expect(describeQuestion(active)).toBeNull();
  });

  it('shows a motion awaiting a second', () => {
    const question = describeQuestion({ ...active, pendingSecond: motion('mainMotion') });
    expect(question).toMatchObject({
      kind: 'Main Motion',
      text: 'Resurface the pool this spring',
      byline: 'Moved by Alice Brennan, awaiting a second',
      requirement: 'Majority',
      awaitingSecond: true,
      beneath: [],
    });
  });

  it('shows the motion being considered, who moved and seconded it, and what is beneath it', () => {
    const main = motion('mainMotion', { secondedBy: 'Ben Whitaker' });
    const close = motion('previousQuestion', {
      id: 2,
      text: 'I move the previous question.',
      mover: 'Ben Whitaker',
      secondedBy: 'Alice Brennan',
    });
    const question = describeQuestion({
      ...active,
      currentMotion: close,
      motionStack: [main, close],
    });
    expect(question).toMatchObject({
      kind: 'Previous Question (Close Debate)',
      byline: 'Moved by Ben Whitaker, seconded by Alice Brennan',
      requirement: 'Two thirds',
      awaitingSecond: false,
      beneath: ['Main Motion: Resurface the pool this spring'],
      key: 'motion-2',
    });
  });

  it('shows open nominations, and then the ballot', () => {
    const nominating = describeQuestion({
      ...active,
      nominationsOpen: true,
      currentNominationPosition: 'Director',
      nominations: [
        {
          id: 1,
          position: 'Director',
          nomineeName: 'Carmen Diaz',
          nomineeId: 5,
          nominatedBy: 'Alice Brennan',
          nominatorId: 3,
          timestamp: '',
          declined: false,
        },
      ],
    });
    expect(nominating).toMatchObject({
      kind: 'Election for Director',
      text: 'Nominations are open',
      byline: 'Nominated: Carmen Diaz',
    });

    const balloting = describeQuestion({ ...active, currentElection: election() });
    expect(balloting).toMatchObject({
      kind: 'Election for Director',
      text: 'Carmen Diaz, Ray Castillo',
      requirement: 'Majority',
    });
  });
});

describe('currentResult', () => {
  const voted = (message: string) => ({
    ...active,
    meetingLog: [
      { time: '7:41:00 PM', message: 'Chair puts the question: "Resurface the pool this spring"' },
      { time: '7:45:00 PM', message },
    ],
  });

  it('stamps the last vote with both parts', () => {
    const state = voted('Vote: Yea 11, Nay 2. CARRIED. On devices 2 to 0, in the room 9 to 2.');
    expect(currentResult(state, parseVoteResult(state.meetingLog))).toMatchObject({
      outcome: 'carried',
      subject: 'Resurface the pool this spring',
      tally: 'On devices 2 to 0, in the room 9 to 2: 11 to 2',
    });
  });

  it('says failed, and keeps it until the next question comes up', () => {
    const state = voted('Vote: Yea 3, Nay 9. FAILED.');
    const vote = parseVoteResult(state.meetingLog);
    expect(currentResult(state, vote)).toMatchObject({ outcome: 'failed', tally: '3 to 9' });
    expect(currentResult({ ...state, pendingSecond: motion('mainMotion') }, vote)).toBeNull();
  });

  it('stamps an election when the ballot is closed with a winner', () => {
    const state = {
      ...active,
      currentElection: election({
        votingInProgress: false,
        ballotResults: { 'Carmen Diaz': 9, 'Ray Castillo': 5 },
        elected: 'Carmen Diaz',
      }),
    };
    expect(currentResult(state, null)).toEqual({
      outcome: 'elected',
      subject: 'Carmen Diaz, Director',
      tally: 'Carmen Diaz 9, Ray Castillo 5',
      key: 'election-7',
    });
  });
});

describe('the meeting in words', () => {
  it('names the stage', () => {
    expect(stageLabel(initialState)).toBe('Not yet called to order');
    expect(stageLabel(active)).toBe('New Business');
    expect(stageLabel({ ...initialState, meetingStage: 'adjourned' })).toBe('Adjourned');
  });

  it('says when the meeting adjourned and how many things it decided', () => {
    const state: MeetingState = {
      ...initialState,
      meetingStage: 'adjourned',
      meetingLog: [
        { time: '8:10:00 PM', message: 'Motion CARRIED by unanimous consent.' },
        { time: '8:42:15 PM', message: 'Meeting adjourned.' },
      ],
      completedMotions: [
        {
          id: 1,
          type: 'mainMotion',
          name: 'Main Motion',
          text: 'Resurface the pool',
          passed: true,
          voterChoices: {},
          timestamp: '7:45:00 PM',
          reconsidered: false,
        },
      ],
      electedOfficers: [
        { position: 'Director', name: 'Carmen Diaz', memberId: 5, electedAt: '8:30:00 PM' },
      ],
    };
    expect(adjournedAt(state)).toBe('8:42 PM');
    expect(itemsDecided(state)).toBe(3);
  });
});
```

Append to `frontend-unified/src/modules/meetings/hooks/__tests__/useVoteResults.test.ts`:

```ts
describe('parseVoteResult with a floor tally', () => {
  const log = (message: string): MeetingLogEntry[] => [
    { time: '19:41:00', message: 'Chair puts the question: "Approve the pool contract"' },
    { time: '19:45:00', message },
  ];

  it('reads both parts and writes the tally the room reads', () => {
    const result = parseVoteResult(
      log('Vote: Yea 21, Nay 5. CARRIED. On devices 12 to 3, in the room 9 to 2.'),
    );
    expect(result).toMatchObject({
      yea: 21,
      nay: 5,
      outcome: 'CARRIED',
      parts: { device: { yea: 12, nay: 3 }, floor: { yea: 9, nay: 2 } },
      tally: 'On devices 12 to 3, in the room 9 to 2: 21 to 5',
    });
  });

  it('gives the total alone without a floor tally', () => {
    const result = parseVoteResult(log('Vote: Yea 6, Nay 4. FAILED.'));
    expect(result).toMatchObject({ parts: null, tally: '6 to 4', passed: false });
  });

  it('treats the vote as old news once something else is decided', () => {
    const decided = (message: string) => [
      ...log('Vote: Yea 6, Nay 4. CARRIED.'),
      { time: '19:50:00', message },
    ];
    expect(parseVoteResult(decided('Motion CARRIED by unanimous consent.'))).toBeNull();
    expect(
      parseVoteResult(
        decided('Voting closed for Director. Results: Carmen Diaz: 9. Carmen Diaz elected.'),
      ),
    ).toBeNull();
    expect(parseVoteResult(decided('Chair declares Carmen Diaz elected as Director.'))).toBeNull();
  });
});
```

and change the file's `useVoteResults` import to `import { parseVoteResult, useVoteResults } from '../useVoteResults';`.

Create `frontend-unified/src/modules/meetings/components/__tests__/QuestionCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QuestionView } from '../../utils/question';
import { QuestionCard } from '../QuestionCard';

const question: QuestionView = {
  kind: 'Main Motion',
  text: 'Resurface the pool this spring',
  byline: 'Moved by Alice Brennan, seconded by Ben Whitaker',
  requirement: 'Majority',
  awaitingSecond: false,
  beneath: [],
  key: 'motion-1',
};

describe('QuestionCard', () => {
  it('shows the kind, the question, who moved and seconded it, and the vote it needs', () => {
    render(<QuestionCard question={question} />);
    const card = screen.getByRole('region', { name: 'The question' });
    expect(card.textContent).toContain('Main Motion');
    expect(screen.getByText('Resurface the pool this spring').className).toContain('text-question');
    expect(screen.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeTruthy();
    expect(screen.getByText('Majority')).toBeTruthy();
  });

  it('says a motion awaits a second, and what is pending beneath it', () => {
    render(
      <QuestionCard
        question={{ ...question, awaitingSecond: true, beneath: ['Main Motion: Buy a mower'] }}
      />,
    );
    expect(screen.getByText('Awaiting a second')).toBeTruthy();
    expect(screen.getByText('Main Motion: Buy a mower')).toBeTruthy();
  });

  it('is 72px on the display and 1.5rem on a phone', () => {
    const { unmount } = render(<QuestionCard question={question} size="display" />);
    expect(screen.getByText(question.text).className).toContain('text-display-question');
    unmount();
    render(<QuestionCard question={question} size="phone" />);
    expect(screen.getByText(question.text).className).toContain('text-question-phone');
  });

  it('says so when nothing is pending, and carries the chair toolbar', () => {
    render(
      <QuestionCard question={null} empty="The floor is open.">
        <button type="button">Adjourn</button>
      </QuestionCard>,
    );
    expect(screen.getByText('The floor is open.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adjourn' })).toBeTruthy();
  });
});
```

Create `frontend-unified/src/modules/meetings/components/__tests__/Stamp.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stamp } from '../Stamp';

describe('Stamp', () => {
  it('lands carried in the carried color, tilted, over the tally', () => {
    render(
      <Stamp
        outcome="carried"
        subject="Resurface the pool this spring"
        tally="On devices 2 to 0, in the room 9 to 2: 11 to 2"
      />,
    );
    const word = screen.getByText('Carried');
    expect(word.className).toContain('border-carried');
    expect(word.className).toContain('-rotate-4');
    expect(word.className).toContain('animate-stamp');
    expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
    expect(screen.getByRole('status', { name: /Carried/ })).toBeTruthy();
  });

  it('says failed in ink, never red', () => {
    render(<Stamp outcome="failed" tally="3 to 9" />);
    const word = screen.getByText('Failed');
    expect(word.className).toContain('border-ink');
    expect(word.className).not.toContain('gavel');
  });

  it('declares who was elected', () => {
    render(<Stamp outcome="elected" subject="Carmen Diaz, Director" size="display" />);
    expect(screen.getByText('Elected')).toBeTruthy();
    expect(screen.getByText('Carmen Diaz, Director')).toBeTruthy();
  });
});
```

Create `frontend-unified/src/modules/meetings/components/__tests__/TimerLine.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TimerLine } from '../TimerLine';

describe('TimerLine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down in tabular numerals over a caution line that shortens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T19:00:00'));
    render(<TimerLine endTime={Date.now() + 90_000} totalSeconds={180} label="Speaking time" />);
    expect(screen.getByRole('timer', { name: 'Speaking time: 1:30 left' })).toBeTruthy();
    expect(screen.getByTestId('timer-bar').style.width).toBe('50%');

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(screen.getByText('Time is up')).toBeTruthy();
  });

  it('shows nothing without a timer', () => {
    const { container } = render(<TimerLine endTime={null} totalSeconds={180} label="Voting" />);
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/utils/__tests__/question.test.ts src/modules/meetings/hooks/__tests__/useVoteResults.test.ts src/modules/meetings/components/__tests__/QuestionCard.test.tsx src/modules/meetings/components/__tests__/Stamp.test.tsx src/modules/meetings/components/__tests__/TimerLine.test.tsx`
Expected: FAIL. `../question`, `../QuestionCard`, `../Stamp` and `../TimerLine` don't exist, and `parseVoteResult` is not exported (so the whole `useVoteResults` file fails to load, its existing tests included).

- [ ] **Step 3: Replace `frontend-unified/src/modules/meetings/hooks/useVoteResults.ts`**

```ts
import { useMemo } from 'react';
import type { MeetingLogEntry } from '@robbie-bylawyer/shared/types';

/** The last vote, as its log line recorded it */
export interface VoteResult {
  /** Device and floor votes together */
  yea: number;
  nay: number;
  outcome: 'CARRIED' | 'FAILED';
  passed: boolean;
  /** The question put, from the chair's "puts the question" line before the vote */
  motionText: string;
  timestamp: string;
  /** The two parts, when the chair entered a floor tally */
  parts: { device: { yea: number; nay: number }; floor: { yea: number; nay: number } } | null;
  /** The tally as the room reads it: "On devices 12 to 3, in the room 9 to 2: 21 to 5" */
  tally: string;
}

// The reducer's line for a closed vote, "Vote: Yea 21, Nay 5. CARRIED.", with the parts after it
// when the chair entered a floor tally: " On devices 12 to 3, in the room 9 to 2."
const VOTE = /Vote: Yea (\d+), Nay (\d+)\. (CARRIED|FAILED)/;
const PARTS = /On devices (\d+) to (\d+), in the room (\d+) to (\d+)\./;
// Decisions of other kinds: once one comes after the last vote, that vote is old news
const OTHER_DECISION =
  /CARRIED by unanimous consent|^Voting closed for |^Chair declares .+ elected/;

/**
 * The most recent vote result in the meeting log, or null when there is none or something else
 * has been decided since
 */
export function parseVoteResult(meetingLog: MeetingLogEntry[]): VoteResult | null {
  const index = meetingLog.findLastIndex(
    (entry) => VOTE.test(entry.message) || OTHER_DECISION.test(entry.message),
  );
  if (index < 0) return null;
  const entry = meetingLog[index];
  const match = entry.message.match(VOTE);
  if (!match || OTHER_DECISION.test(entry.message)) return null;

  const yea = parseInt(match[1], 10);
  const nay = parseInt(match[2], 10);
  const outcome = match[3] as 'CARRIED' | 'FAILED';

  const partsMatch = entry.message.match(PARTS);
  const parts = partsMatch
    ? {
        device: { yea: parseInt(partsMatch[1], 10), nay: parseInt(partsMatch[2], 10) },
        floor: { yea: parseInt(partsMatch[3], 10), nay: parseInt(partsMatch[4], 10) },
      }
    : null;
  const total = `${yea} to ${nay}`;
  const tally = parts
    ? `On devices ${parts.device.yea} to ${parts.device.nay}, in the room ${parts.floor.yea} to ${parts.floor.nay}: ${total}`
    : total;

  // The question put before the vote (other entries, such as a quorum warning, may come between)
  const question = meetingLog
    .slice(0, index)
    .findLast((log) => log.message.startsWith('Chair puts the question: '));
  const motionText = question?.message.match(/Chair puts the question: "(.+)"/)?.[1] ?? '';

  return {
    yea,
    nay,
    outcome,
    passed: outcome === 'CARRIED',
    motionText,
    timestamp: entry.time,
    parts,
    tally,
  };
}

/** parseVoteResult, kept while the log is unchanged */
export function useVoteResults(meetingLog: MeetingLogEntry[]) {
  return useMemo(() => parseVoteResult(meetingLog), [meetingLog]);
}
```

- [ ] **Step 4: Create `frontend-unified/src/modules/meetings/utils/question.ts`**

```ts
import { DISPLAYABLE_STAGES, LOG_MEETING_ADJOURNED } from '@robbie-bylawyer/shared/constants';
import type { Election, MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import type { VoteResult } from '../hooks/useVoteResults';

/** Whatever is before the assembly, in the one shape the question card draws */
export interface QuestionView {
  /** What kind of question it is, shown as a label: "Main Motion", "Election for Director" */
  kind: string;
  /** The question itself */
  text: string;
  /** "Moved by Alice Brennan, seconded by Ben Whitaker" */
  byline: string | null;
  /** The vote it needs: "Majority", "Two thirds", "Plurality"; null when the chair rules */
  requirement: string | null;
  /** Moved and waiting for a second */
  awaitingSecond: boolean;
  /** Questions pending beneath it, the nearest first */
  beneath: string[];
  /** Changes when the question does, so the card crossfades */
  key: string;
}

const REQUIREMENTS = { majority: 'Majority', '2/3': 'Two thirds', plurality: 'Plurality' } as const;

function requirementOf(vote: Motion['vote'] | Election['requiredVotes']): string | null {
  return vote === 'none' ? null : REQUIREMENTS[vote];
}

function beneathLine(motion: Motion): string {
  return `${motion.name}: ${motion.text}`;
}

/** The question before the assembly, or null when nothing is pending */
export function describeQuestion(state: MeetingState): QuestionView | null {
  const election = state.currentElection;
  if (election?.votingInProgress) {
    return {
      kind: `Election for ${election.position}`,
      text: election.candidates.map((c) => c.name).join(', ') || 'No candidates',
      byline: 'Ballot in progress',
      requirement: requirementOf(election.requiredVotes),
      awaitingSecond: false,
      beneath: [],
      key: `election-${election.id}`,
    };
  }

  if (state.nominationsOpen && state.currentNominationPosition) {
    const position = state.currentNominationPosition;
    const nominees = state.nominations
      .filter((n) => n.position === position && !n.declined)
      .map((n) => n.nomineeName);
    return {
      kind: `Election for ${position}`,
      text: 'Nominations are open',
      byline: nominees.length > 0 ? `Nominated: ${nominees.join(', ')}` : 'No nominations yet',
      requirement: null,
      awaitingSecond: false,
      beneath: [],
      key: `nominations-${position}`,
    };
  }

  if (state.pendingSecond) {
    const motion = state.pendingSecond;
    return {
      kind: motion.name,
      text: motion.text,
      byline: `Moved by ${motion.mover}, awaiting a second`,
      requirement: requirementOf(motion.vote),
      awaitingSecond: true,
      beneath: [...state.motionStack].reverse().map(beneathLine),
      key: `second-${motion.id}`,
    };
  }

  if (state.currentMotion) {
    const motion = state.currentMotion;
    return {
      kind: motion.name,
      text: motion.text,
      byline: motion.secondedBy
        ? `Moved by ${motion.mover}, seconded by ${motion.secondedBy}`
        : `Moved by ${motion.mover}`,
      requirement: requirementOf(motion.vote),
      awaitingSecond: false,
      beneath: state.motionStack
        .filter((m) => m.id !== motion.id)
        .reverse()
        .map(beneathLine),
      key: `motion-${motion.id}`,
    };
  }

  return null;
}

/** The stage of the meeting as a label for the top bar */
export function stageLabel(state: MeetingState): string {
  if (state.meetingStage === 'adjourned') return 'Adjourned';
  if (!state.meetingActive) return 'Not yet called to order';
  return DISPLAYABLE_STAGES.find((s) => s.stage === state.meetingStage)?.label ?? 'In session';
}

export type StampOutcome = 'carried' | 'failed' | 'elected';

/** A decision for the stamp: what it was, about what, and the tally */
export interface ResultView {
  outcome: StampOutcome;
  subject: string | null;
  tally: string | null;
  /** Changes with each decision, so the stamp lands again */
  key: string;
}

export function voteResultView(vote: VoteResult): ResultView {
  return {
    outcome: vote.passed ? 'carried' : 'failed',
    subject: vote.motionText || null,
    tally: vote.tally,
    key: `vote-${vote.timestamp}-${vote.tally}`,
  };
}

/** An election's ballots by candidate, most first: "Carmen Diaz 9, Ray Castillo 5" */
export function electionTally(election: Election): string {
  return Object.entries(election.ballotResults)
    .sort(([, a], [, b]) => b - a)
    .map(([name, votes]) => `${name} ${votes}`)
    .join(', ');
}

/**
 * The result the room should see: an election just decided, or else the last vote, until the
 * next question comes up. Null while a question is pending or before anything is decided.
 */
export function currentResult(state: MeetingState, vote: VoteResult | null): ResultView | null {
  const election = state.currentElection;
  if (election && !election.votingInProgress && election.elected) {
    return {
      outcome: 'elected',
      subject: `${election.elected}, ${election.position}`,
      tally: electionTally(election),
      key: `election-${election.id}`,
    };
  }
  const questionPending =
    state.votingOpen ||
    !!state.pendingSecond ||
    !!state.currentMotion ||
    !!election?.votingInProgress ||
    state.nominationsOpen;
  if (questionPending || !vote) return null;
  return voteResultView(vote);
}

/** When the meeting adjourned, by the chair's clock, without the seconds: "8:42 PM" */
export function adjournedAt(state: MeetingState): string | null {
  const entry = state.meetingLog.findLast((e) => e.message === LOG_MEETING_ADJOURNED);
  return entry ? entry.time.replace(/^(\d{1,2}:\d{2}):\d{2}/, '$1') : null;
}

/** How many things the meeting decided: votes, unanimous consents and elections */
export function itemsDecided(state: MeetingState): number {
  const consents = state.meetingLog.filter((e) =>
    e.message.startsWith('Motion CARRIED by unanimous consent'),
  ).length;
  return state.completedMotions.length + consents + state.electedOfficers.length;
}
```

- [ ] **Step 5: Create `frontend-unified/src/modules/meetings/components/QuestionCard.tsx`**

```tsx
import type { ReactNode } from 'react';
import type { QuestionView } from '../utils/question';

interface QuestionCardProps {
  question: QuestionView | null;
  /** 2.5rem on a laptop, 1.5rem on a phone, 72px on the display */
  size?: 'laptop' | 'phone' | 'display';
  /** What to say when nothing is pending */
  empty?: string;
  /** The chair's toolbar and script line, under the question */
  children?: ReactNode;
}

const TEXT_SIZE = {
  laptop: 'text-question',
  phone: 'text-question-phone',
  display: 'text-display-question',
} as const;

/**
 * The question card (docs/design-brief.md): whatever is pending, always shown the same way, in
 * the serif, with who moved and seconded it and the vote it needs. It crossfades when the
 * question changes and never slides.
 */
export function QuestionCard({
  question,
  size = 'laptop',
  empty = 'No question is pending.',
  children,
}: QuestionCardProps) {
  const display = size === 'display';
  const label = display
    ? 'text-display-label font-semibold uppercase tracking-[0.08em] text-ink-muted'
    : 'label-caps';
  const secondary = display ? 'text-display-line text-ink-muted' : 'text-ink-muted';

  return (
    <section
      aria-label="The question"
      className={display ? '' : 'card border-t-2 border-t-gavel p-5 sm:p-6'}
    >
      {question ? (
        <div key={question.key} className="animate-crossfade space-y-3">
          <p className={label}>{question.kind}</p>
          <p className={`font-serif-soft font-semibold text-ink ${TEXT_SIZE[size]}`}>
            {question.text}
          </p>
          {question.byline && <p className={secondary}>{question.byline}</p>}
          {(question.requirement || question.awaitingSecond) && (
            <div className="flex flex-wrap items-center gap-2">
              {question.requirement &&
                (display ? (
                  <p className={label}>{question.requirement}</p>
                ) : (
                  <span className="badge">{question.requirement}</span>
                ))}
              {question.awaitingSecond && <span className="badge-proposed">Awaiting a second</span>}
            </div>
          )}
          {question.beneath.length > 0 && (
            <div>
              <p className={label}>Pending beneath it</p>
              <ul
                className={`mt-1 space-y-1 ${display ? 'text-display-label text-ink-muted' : 'text-sm text-ink-muted'}`}
              >
                {question.beneath.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className={secondary}>{empty}</p>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 6: Create `frontend-unified/src/modules/meetings/components/Stamp.tsx`**

```tsx
import type { StampOutcome } from '../utils/question';

interface StampProps {
  outcome: StampOutcome;
  /** What was decided: the motion, or who was elected to what */
  subject?: string | null;
  /** "On devices 12 to 3, in the room 9 to 2: 21 to 5" */
  tally?: string | null;
  /** In a console panel, on a phone, or filling a third of the display */
  size?: 'panel' | 'phone' | 'display';
}

const WORDS: Record<StampOutcome, string> = {
  carried: 'Carried',
  failed: 'Failed',
  elected: 'Elected',
};

const SIZES = {
  panel: { word: 'text-5xl px-6 py-2', subject: 'text-lg', tally: 'text-base' },
  phone: { word: 'text-4xl px-5 py-1.5', subject: 'text-base', tally: 'text-sm' },
  display: {
    word: 'text-[10rem] leading-none px-12 py-6',
    subject: 'text-display-line',
    tally: 'text-display-line',
  },
} as const;

/**
 * The stamp (docs/design-brief.md), the only theater in the app: the result in Fraunces 700,
 * uppercase, in a 3px border, tilted -4 degrees, landing with a short scale and fade. Carried and
 * elected are in the carried color; failed is ink, never red.
 */
export function Stamp({ outcome, subject, tally, size = 'panel' }: StampProps) {
  const sizes = SIZES[size];
  const color = outcome === 'failed' ? 'border-ink text-ink' : 'border-carried text-carried';
  return (
    <figure
      role="status"
      aria-label={tally ? `${WORDS[outcome]}, ${tally}` : WORDS[outcome]}
      className="flex flex-col items-center gap-4 text-center"
    >
      <span
        className={`animate-stamp -rotate-4 inline-block rounded-md border-[3px] font-serif-soft font-bold uppercase tracking-[0.06em] ${color} ${sizes.word}`}
      >
        {WORDS[outcome]}
      </span>
      {(subject || tally) && (
        <figcaption className="space-y-1">
          {subject && <p className={`font-serif-soft text-ink ${sizes.subject}`}>{subject}</p>}
          {tally && <p className={`tabular-nums text-ink-muted ${sizes.tally}`}>{tally}</p>}
        </figcaption>
      )}
    </figure>
  );
}
```

The tilt is the `-rotate-4` class (the CSS `rotate` property), apart from the animation's `transform`, so it stays when reduced motion turns the animation off.

- [ ] **Step 7: Create `frontend-unified/src/modules/meetings/components/TimerLine.tsx`**

```tsx
import { useEffect, useState } from 'react';

interface TimerLineProps {
  /** When the time runs out (ms since the epoch), or null for no timer */
  endTime: number | null;
  /** The whole allowance, for the length of the line */
  totalSeconds: number;
  label: string;
  size?: 'panel' | 'display';
}

/**
 * The brief's timer: a 2px line in caution that shortens as time runs out, with the time left in
 * tabular numerals beneath it
 */
export function TimerLine({ endTime, totalSeconds, label, size = 'panel' }: TimerLineProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endTime) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (!endTime) return null;
  const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
  const fraction = totalSeconds > 0 ? Math.min(1, remaining / totalSeconds) : 0;
  const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div role="timer" aria-label={`${label}: ${time} left`}>
      <div className="h-0.5 w-full bg-rule">
        <div
          data-testid="timer-bar"
          className="h-0.5 bg-caution"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p
        className={`mt-1 tabular-nums text-ink-muted ${size === 'display' ? 'text-display-label' : 'text-sm'}`}
      >
        {remaining === 0 ? 'Time is up' : `${time} left`}
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/utils/__tests__/question.test.ts src/modules/meetings/hooks/__tests__/useVoteResults.test.ts src/modules/meetings/components/__tests__/QuestionCard.test.tsx src/modules/meetings/components/__tests__/Stamp.test.tsx src/modules/meetings/components/__tests__/TimerLine.test.tsx`
Expected: all pass: `question` 9, `useVoteResults` its existing tests plus 3, `QuestionCard` 4, `Stamp` 3, `TimerLine` 2.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass. (`VoteResultsPanel` still reads `useVoteResults`' fields, which keep their names.)

- [ ] **Step 9: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings
git add frontend-unified/src/modules/meetings
git commit -m "feat(web): the question card, the stamp and the last result

describeQuestion puts whatever is pending into one shape that QuestionCard
draws on a laptop, a phone and the display. The stamp lands Carried, Failed
(in ink) or Elected over the tally, and the last vote is read with both parts:
On devices 2 to 0, in the room 9 to 2: 11 to 2. TimerLine is the brief's 2px
caution line."
```

---

### Task 4: The chair console's "Now" column

**Files:**

- Create: `frontend-unified/src/modules/meetings/utils/chairActions.ts`, `hooks/usePacket.ts`, `components/console/ConsoleTopBar.tsx`, `components/console/JoinInfoCard.tsx`, `components/console/ActionToolbar.tsx`, `components/console/ChairScriptLine.tsx`, `components/console/CurrentItemLine.tsx`, `components/console/VoteControl.tsx`, `components/console/ConsoleAgenda.tsx` (paths under `frontend-unified/src/modules/meetings/`)
- Modify: `components/scheduling/types.ts`
- Test: `utils/__tests__/chairActions.test.ts`, `components/console/__tests__/VoteControl.test.tsx`, `components/console/__tests__/ConsoleParts.test.tsx` (new)

The pieces of the console's "Now" column, each tested on its own; Task 5 lays them out and retires the old chair and admin views.

- **The toolbar shows only what is in order.** `chairActions(state, presidingId)` returns the chair's actions for this moment, the expected next step first (a primary button) and the alternatives after it (secondary): Call to order; Adopt the agenda or Objection to the agenda; No second; Open the vote or Ask for unanimous consent; No objection: adopted; the rulings on a point of order, a question of privilege, a request to withdraw, a call for the orders of the day or an inquiry; Complete the item or Put the item to a vote; Call the next item; Adjourn. Closing the vote is the vote panel's, and recognizing speakers the queue's. It replaces the chair panels that each carried some of these buttons (`MeetingControlPanel`, `PendingSecondPanel`, `PendingMotionPanel`, `UnanimousConsentPanel`, the buttons of `AgendaPanel`), which Task 5 deletes; their logic moves here unchanged, including "Proceed to the orders of the day", whose test moves here too.
- **The vote panel** (`VoteControl`): before the vote, how it is taken (on devices and in the room, a voice vote or show of hands, a secret ballot, a roll call); during it, the device counts with the brief's pulse (only the number of ballots for a secret ballot), the floor tally fields (Yea, Nay and Abstain in the room, "Enter the count", each entry replacing the last), the two parts added together, the chair's deciding vote judged on both parts (`canChairVoteDecide(addVotes(votes, floorVotes), ...)`, as the server judges it), an admin's own vote (admins vote like members, and the console is their screen), and "Close the vote".
- **The top bar**: the title in Fraunces, the stage, the time since the call to order (the packet's `startedAt`), the attendance chip ("7 present of 142, quorum 29, not met"), the Display button (it opens `/meetings/:code/display` in a new window, to move to the TV) and Join info.
- **The join card**: the code, the link and its QR code, to read out or put on a screen.
- **The current item** with its attachments from the schedule (the live item's `packetItemId` names the scheduled item), the **chair script** as one muted line that can be hidden, and the **agenda** with Call and Complete (and, before adoption, reordering and adding items).

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/modules/meetings/utils/__tests__/chairActions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { chairActions } from '../chairActions';

const motion = (key: string, overrides: Partial<Motion> = {}): Motion => ({
  ...MOTIONS[key],
  id: 1,
  type: key,
  text: 'Approve the pool contract',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
  ...overrides,
});

const active: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'call-to-order',
  agenda: [
    { id: 1, title: 'Call to order', status: 'pending' },
    { id: 2, title: "Treasurer's report", status: 'pending' },
  ],
};
const adopted: MeetingState = { ...active, agendaAdopted: true };
const ids = (state: MeetingState) => chairActions(state, 2).map((action) => action.id);

describe('chairActions', () => {
  it('calls the meeting to order first, and offers nothing once it is adjourned', () => {
    expect(chairActions(initialState, 2).map((a) => [a.label, a.tone])).toEqual([
      ['Call to order', 'primary'],
    ]);
    expect(chairActions(initialState, 2)[0].make()).toMatchObject({ type: 'START_MEETING' });
    expect(ids({ ...initialState, meetingStage: 'adjourned' })).toEqual([]);
  });

  it('adopts the agenda, then calls the next item', () => {
    expect(ids(active)).toEqual(['adopt-agenda', 'agenda-objection']);
    expect(ids({ ...active, agendaObjection: true })).toEqual(['adjourn']);
    const next = chairActions(adopted, 2);
    expect(next.map((a) => a.label)).toEqual(['Call the next item: Call to order', 'Adjourn']);
    expect(next[0].make()).toMatchObject({ type: 'CALL_AGENDA_ITEM', id: 1 });
  });

  it("completes the current item, or puts it to a vote in the presiding officer's name", () => {
    const state: MeetingState = {
      ...adopted,
      currentAgendaItem: { id: 2, title: "Treasurer's report", status: 'active' },
    };
    const actions = chairActions(state, 2);
    expect(actions.map((a) => a.id)).toEqual(['complete-item', 'put-item']);
    expect(actions[1].make()).toMatchObject({
      type: 'MAKE_MOTION',
      motionType: 'mainMotion',
      text: "Approve: Treasurer's report",
      moverId: 2,
    });
    expect(chairActions(state, null).map((a) => a.id)).toEqual(['complete-item']);
  });

  it('declares no second while a motion waits for one', () => {
    expect(ids({ ...adopted, pendingSecond: motion('mainMotion', { secondedBy: null }) })).toEqual([
      'no-second',
    ]);
  });

  it('opens the vote or asks for unanimous consent on a seconded motion', () => {
    const state = { ...adopted, currentMotion: motion('mainMotion') };
    const actions = chairActions(state, 2);
    expect(actions.map((a) => a.label)).toEqual(['Open the vote', 'Ask for unanimous consent']);
    expect(actions[0].make()).toMatchObject({ type: 'OPEN_VOTING' });
    expect(ids({ ...state, unanimousConsentPending: true })).toEqual(['adopted', 'open-vote']);
  });

  it('gives the chair a ruling on a call for the orders of the day', () => {
    const state = { ...adopted, currentMotion: motion('callOrderDay', { secondedBy: null }) };
    const actions = chairActions(state, 2);
    expect(actions.map((a) => a.label)).toEqual(['Proceed to the orders of the day']);
    expect(actions[0].make()).toMatchObject({ type: 'CHAIR_RULING', ruling: 'allow' });
  });

  it('rules on a point of order', () => {
    const state = { ...adopted, currentMotion: motion('pointOrder', { secondedBy: null }) };
    expect(chairActions(state, 2).map((a) => a.label)).toEqual([
      'Sustain the point',
      'Overrule the point',
    ]);
  });

  it('leaves closing a vote to the vote panel, and an election to the election panel', () => {
    expect(ids({ ...adopted, currentMotion: motion('mainMotion'), votingOpen: true })).toEqual([]);
  });
});
```

Create `frontend-unified/src/modules/meetings/components/console/__tests__/VoteControl.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';
import { VoteControl } from '../VoteControl';

const dana: Member = { id: 2, name: 'Dana Okafor', role: 'chair', present: true };
const pat: Member = { id: 1, name: 'Pat Lindqvist', role: 'admin', present: true };
const motion: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Approve the pool contract',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
};
const pending: MeetingState = {
  ...initialState,
  meetingActive: true,
  agendaAdopted: true,
  members: [pat, dana],
  currentMotion: motion,
  motionStack: [motion],
};
const voting: MeetingState = {
  ...pending,
  votingOpen: true,
  votes: { yea: 2, nay: 0, abstain: 0 },
  voters: [3, 4],
  voterChoices: { 3: 'yea', 4: 'yea' },
};

const dispatch = vi.fn();

describe('VoteControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks how the vote will be taken, a voice vote included', () => {
    render(<VoteControl state={pending} dispatch={dispatch} me={dana} />);
    const method = screen.getByLabelText('How the vote is taken');
    expect(screen.getByRole('option', { name: 'Voice vote or show of hands' })).toBeTruthy();
    fireEvent.change(method, { target: { value: 'voice' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_VOTING_METHOD', method: 'voice' });
  });

  it('shows the device votes and takes the count in the room', () => {
    render(<VoteControl state={voting} dispatch={dispatch} me={dana} />);
    expect(screen.getByText('2 voted on devices')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Yea in the room'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Nay in the room'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter the count' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_FLOOR_TALLY', yea: 9, nay: 2, abstain: 0 }),
    );
  });

  it('adds the count in the room to the device votes', () => {
    render(
      <VoteControl
        state={{ ...voting, floorVotes: { yea: 9, nay: 2, abstain: 0 } }}
        dispatch={dispatch}
        me={dana}
      />,
    );
    expect(screen.getByText('Together: 11 to 2')).toBeTruthy();
  });

  it('offers the chair a deciding vote, judged on both counts', () => {
    const tied = {
      ...voting,
      votes: { yea: 1, nay: 3, abstain: 0 },
      voters: [3, 4, 5, 6],
      floorVotes: { yea: 2, nay: 0, abstain: 0 },
    };
    const { unmount } = render(<VoteControl state={tied} dispatch={dispatch} me={dana} />);
    expect(screen.getByText('The chair may vote to break the tie')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CAST_VOTE',
        vote: 'yea',
        voterId: 2,
        isChairDecidingVote: true,
      }),
    );
    unmount();

    // On devices alone it would be a tie; with the room the chair's vote changes nothing
    const decided = {
      ...tied,
      votes: { yea: 2, nay: 2, abstain: 0 },
      floorVotes: { yea: 0, nay: 3, abstain: 0 },
    };
    render(<VoteControl state={decided} dispatch={dispatch} me={dana} />);
    expect(screen.queryByText(/The chair may vote/)).toBeNull();
  });

  it('lets an admin vote like a member', () => {
    render(<VoteControl state={voting} dispatch={dispatch} me={pat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vote nay' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAST_VOTE', vote: 'nay', voterId: 1 }),
    );
  });

  it("keeps a secret ballot's counts hidden until it closes", () => {
    render(
      <VoteControl
        state={{ ...voting, votingMethod: 'ballot', voterChoices: {} }}
        dispatch={dispatch}
        me={dana}
      />,
    );
    expect(screen.getByText(/ballots received on devices/)).toBeTruthy();
    expect(screen.queryByText('Yea on devices')).toBeNull();
  });

  it('closes the vote', () => {
    render(<VoteControl state={voting} dispatch={dispatch} me={dana} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close the vote' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLOSE_VOTING' }));
  });
});
```

Create `frontend-unified/src/modules/meetings/components/console/__tests__/ConsoleParts.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingPacket } from '../../scheduling/types';

vi.mock('../../../context/SocketContext', () => ({
  useSocket: () => ({
    isConnected: true,
    connectedMembers: [],
    currentUser: null,
    leaveMeeting: vi.fn(),
    reconnect: vi.fn(),
    error: null,
  }),
}));
vi.mock('../../QrCode', () => ({
  QrCode: ({ label }: { label: string }) => <img alt={label} />,
}));

const { ConsoleTopBar } = await import('../ConsoleTopBar');
const { JoinInfoCard } = await import('../JoinInfoCard');
const { CurrentItemLine } = await import('../CurrentItemLine');
const { ConsoleAgenda } = await import('../ConsoleAgenda');
const { ActionToolbar } = await import('../ActionToolbar');

const state: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  meetingActive: true,
  meetingStage: 'new-business',
  quorum: 29,
  headcount: 3,
  members: [{ id: 2, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' }],
};

const dispatch = vi.fn();

describe('the console top bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the meeting, its stage and attendance, and opens the display in its own window', () => {
    const onJoinInfo = vi.fn();
    render(
      <ConsoleTopBar
        state={state}
        attendance={attendanceSummary(state)}
        eligible={142}
        startedAt={null}
        meetingCode="MAPLE1"
        onJoinInfo={onJoinInfo}
      />,
    );
    expect(screen.getByRole('heading', { name: '2026 Annual Meeting' })).toBeTruthy();
    expect(screen.getByText('New Business')).toBeTruthy();
    expect(screen.getByText('4 present of 142, quorum 29, not met')).toBeTruthy();
    const display = screen.getByRole('link', { name: 'Display' });
    expect(display.getAttribute('href')).toBe('/meetings/MAPLE1/display');
    expect(display.getAttribute('target')).toBe('_blank');
    fireEvent.click(screen.getByRole('button', { name: 'Join info' }));
    expect(onJoinInfo).toHaveBeenCalled();
  });
});

describe('the join card', () => {
  it('gives the code, the link and its QR code', () => {
    render(<JoinInfoCard code="MAPLE1" />);
    const link = `${window.location.origin}/meetings/MAPLE1`;
    expect(screen.getByTestId('meeting-code').textContent).toBe('MAPLE1');
    expect(screen.getByText(link)).toBeTruthy();
    expect(screen.getByRole('img', { name: `QR code for ${link}` })).toBeTruthy();
  });
});

describe('the current item', () => {
  it("links the scheduled item's attachments", () => {
    const packet = {
      id: 'p1',
      organizationId: 'org-1',
      robbieCode: 'MAPLE1',
      createdAt: '',
      attachments: [],
      agendaItems: [
        {
          id: 'item-3',
          title: "Treasurer's report",
          position: 2,
          attachments: [
            {
              id: 'a1',
              type: 'uploaded_file',
              displayName: '2027 budget.pdf',
              position: 0,
              uploadedAt: '',
            },
          ],
        },
      ],
    } as MeetingPacket;
    render(
      <CurrentItemLine
        item={{ id: 3, title: "Treasurer's report", status: 'active', packetItemId: 'item-3' }}
        packet={packet}
      />,
    );
    expect(screen.getByText("Treasurer's report")).toBeTruthy();
    expect(screen.getByRole('link', { name: '2027 budget.pdf' }).getAttribute('href')).toBe(
      '/api/attachments/a1/download',
    );
  });
});

describe('the console agenda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls a pending item and completes the current one', () => {
    const agenda: MeetingState['agenda'] = [
      { id: 1, title: 'Call to order', status: 'completed' },
      { id: 2, title: "Treasurer's report", status: 'pending' },
    ];
    const { unmount } = render(
      <ConsoleAgenda state={{ ...state, agendaAdopted: true, agenda }} dispatch={dispatch} />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Call Treasurer's report" }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CALL_AGENDA_ITEM', id: 2 }),
    );
    unmount();

    const current = { id: 2, title: "Treasurer's report", status: 'active' as const };
    render(
      <ConsoleAgenda
        state={{
          ...state,
          agendaAdopted: true,
          agenda: [agenda[0], current],
          currentAgendaItem: current,
        }}
        dispatch={dispatch}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Complete Treasurer's report" }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COMPLETE_AGENDA_ITEM', id: 2 }),
    );
  });
});

describe('the action toolbar', () => {
  it('shows each action as a button, the first as the primary one', () => {
    render(
      <ActionToolbar
        dispatch={dispatch}
        actions={[
          {
            id: 'open-vote',
            label: 'Open the vote',
            tone: 'primary',
            make: () => ({ type: 'OPEN_VOTING', voteTimerEnd: null, timestamp: '' }),
          },
          {
            id: 'consent',
            label: 'Ask for unanimous consent',
            tone: 'secondary',
            make: () => ({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: '' }),
          },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open the vote' }).className).toContain(
      'btn-primary',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask for unanimous consent' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: '' });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/utils/__tests__/chairActions.test.ts src/modules/meetings/components/console`
Expected: FAIL: `../chairActions`, `../VoteControl` and the console components don't exist.

- [ ] **Step 3: The packet's presiding officer and meeting times in `frontend-unified/src/modules/meetings/components/scheduling/types.ts`**

Replace:

```ts
  scheduledFor?: string;
  createdAt: string;
  attachments: Attachment[];
```

with:

```ts
  scheduledFor?: string;
  /** The presiding officer, who chairs the live meeting; null when the admins run it */
  chairUserId?: number | null;
  /** When the meeting was called to order and adjourned */
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  attachments: Attachment[];
```

- [ ] **Step 4: Create `frontend-unified/src/modules/meetings/utils/chairActions.ts`**

```ts
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { calculateTimerEnd, generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';

/** One thing the chair can do now, as a button in the console's toolbar */
export interface ChairAction {
  id: string;
  label: string;
  /** The expected next step is primary; the alternatives are secondary */
  tone: 'primary' | 'secondary';
  /** The action, made when the button is pressed (so its timestamp is that moment's) */
  make: () => MeetingAction;
}

type Tone = ChairAction['tone'];
type Ruling = 'sustain' | 'overrule' | 'allow' | 'deny';

function ruling(id: string, label: string, kind: Ruling, tone: Tone): ChairAction {
  return {
    id,
    label,
    tone,
    make: () => ({ type: 'CHAIR_RULING', ruling: kind, timestamp: generateTimestamp() }),
  };
}

/** The chair's rulings on a motion that takes no vote */
function rulings(motionType: string): ChairAction[] {
  switch (motionType) {
    case 'pointOrder':
      return [
        ruling('sustain', 'Sustain the point', 'sustain', 'primary'),
        ruling('overrule', 'Overrule the point', 'overrule', 'secondary'),
      ];
    case 'questionPrivilege':
    case 'withdrawMotion':
      return [
        ruling('allow', 'Allow the request', 'allow', 'primary'),
        ruling('deny', 'Deny the request', 'deny', 'secondary'),
      ];
    case 'callOrderDay':
      return [ruling('orders-of-the-day', 'Proceed to the orders of the day', 'allow', 'primary')];
    default:
      // A point of information: the chair answers it or has it answered
      return [ruling('acknowledge', 'Acknowledge and respond', 'allow', 'primary')];
  }
}

function openVote(state: MeetingState, tone: Tone): ChairAction {
  return {
    id: 'open-vote',
    label: 'Open the vote',
    tone,
    make: () => ({
      type: 'OPEN_VOTING',
      voteTimerEnd: calculateTimerEnd(state.voteTimeLimit),
      timestamp: generateTimestamp(),
    }),
  };
}

function adjourn(tone: Tone): ChairAction {
  return {
    id: 'adjourn',
    label: 'Adjourn',
    tone,
    make: () => ({ type: 'END_MEETING', timestamp: generateTimestamp() }),
  };
}

/**
 * The chair's actions that are in order now, the expected next step first: never a wall of every
 * button (docs/design-brief.md). Closing a vote is the vote panel's, running an election the
 * election panel's, and recognizing speakers the queue's.
 *
 * @param presidingId - who puts an agenda item to a vote: the chair, or the admin presiding
 */
export function chairActions(state: MeetingState, presidingId: number | null): ChairAction[] {
  if (state.meetingStage === 'adjourned') return [];
  if (!state.meetingActive) {
    return [
      {
        id: 'call-to-order',
        label: 'Call to order',
        tone: 'primary',
        make: () => ({ type: 'START_MEETING', timestamp: generateTimestamp() }),
      },
    ];
  }
  if (state.votingOpen || state.currentElection?.votingInProgress) return [];

  if (state.pendingSecond) {
    return [
      {
        id: 'no-second',
        label: 'No second',
        tone: 'secondary',
        make: () => ({ type: 'DECLINE_SECOND', timestamp: generateTimestamp() }),
      },
    ];
  }

  const motion = state.currentMotion;
  if (motion && state.unanimousConsentPending) {
    const actions: ChairAction[] = [
      {
        id: 'adopted',
        label: 'No objection: adopted',
        tone: 'primary',
        make: () => ({ type: 'UNANIMOUS_CONSENT_PASSED', timestamp: generateTimestamp() }),
      },
    ];
    if (motion.vote !== 'none') actions.push(openVote(state, 'secondary'));
    return actions;
  }
  if (motion) {
    if (motion.vote === 'none') return rulings(motion.type);
    return [
      openVote(state, 'primary'),
      {
        id: 'consent',
        label: 'Ask for unanimous consent',
        tone: 'secondary',
        make: () => ({ type: 'REQUEST_UNANIMOUS_CONSENT', timestamp: generateTimestamp() }),
      },
    ];
  }

  if (!state.agendaAdopted) {
    // After an objection, a member moves to adopt or amend the agenda
    if (state.agendaObjection) return [adjourn('secondary')];
    return [
      {
        id: 'adopt-agenda',
        label: 'Adopt the agenda',
        tone: 'primary',
        make: () => ({ type: 'ADOPT_AGENDA', timestamp: generateTimestamp() }),
      },
      {
        id: 'agenda-objection',
        label: 'Objection to the agenda',
        tone: 'secondary',
        make: () => ({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() }),
      },
    ];
  }

  const item = state.currentAgendaItem;
  if (item) {
    const actions: ChairAction[] = [
      {
        id: 'complete-item',
        label: 'Complete the item',
        tone: 'primary',
        make: () => ({ type: 'COMPLETE_AGENDA_ITEM', id: item.id, timestamp: generateTimestamp() }),
      },
    ];
    if (presidingId !== null) {
      actions.push({
        id: 'put-item',
        label: 'Put the item to a vote',
        tone: 'secondary',
        make: () => ({
          type: 'MAKE_MOTION',
          motionType: 'mainMotion',
          text: `Approve: ${item.title}`,
          mover: 'Chair',
          moverId: presidingId,
          motionId: generateId(),
          timestamp: generateTimestamp(),
        }),
      });
    }
    return actions;
  }

  const next = state.agenda.find((i) => i.status === 'pending');
  if (next) {
    return [
      {
        id: 'call-next',
        label: `Call the next item: ${next.title}`,
        tone: 'primary',
        make: () => ({ type: 'CALL_AGENDA_ITEM', id: next.id, timestamp: generateTimestamp() }),
      },
      adjourn('secondary'),
    ];
  }
  return [adjourn('primary')];
}
```

- [ ] **Step 5: Create `frontend-unified/src/modules/meetings/hooks/usePacket.ts`**

```ts
import { useEffect, useState } from 'react';
import { getPacket } from '../components/scheduling/api';
import type { MeetingPacket } from '../components/scheduling/types';

/**
 * The meeting's packet: its agenda items with their attachments, and when it was called to
 * order. Loaded again when `refreshKey` changes (the console passes meetingActive, so the start
 * time arrives with the call to order).
 */
export function usePacket(meetingCode: string, refreshKey: unknown = null): MeetingPacket | null {
  const [loaded, setLoaded] = useState<{ code: string; packet: MeetingPacket | null } | null>(null);

  useEffect(() => {
    let canceled = false;
    getPacket(meetingCode)
      .then((packet) => {
        if (!canceled) setLoaded({ code: meetingCode, packet });
      })
      .catch(() => {
        // The packet only adds attachments and the start time; the meeting runs without them
        if (!canceled) setLoaded({ code: meetingCode, packet: null });
      });
    return () => {
      canceled = true;
    };
  }, [meetingCode, refreshKey]);

  return loaded?.code === meetingCode ? loaded.packet : null;
}
```

- [ ] **Step 6: Create the console's parts**

`frontend-unified/src/modules/meetings/components/console/ConsoleTopBar.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Monitor, QrCode as QrCodeIcon } from 'lucide-react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import { attendanceChip } from '../../utils/attendance';
import { stageLabel } from '../../utils/question';
import { ConnectionStatus } from '../ConnectionStatus';

interface ConsoleTopBarProps {
  state: MeetingState;
  attendance: AttendanceSummary;
  eligible: number | null;
  /** When the meeting was called to order (the packet's startedAt) */
  startedAt: string | null;
  meetingCode: string;
  onJoinInfo: () => void;
}

/** Hours and minutes since the call to order ("1:05"), checked every 30 seconds */
function useElapsed(startedAt: string | null, running: boolean): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || !running) return;
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [startedAt, running]);

  if (!startedAt || !running) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  const minutes = Math.max(0, Math.floor((now - started) / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The console's 56px top bar: the meeting's title, its stage, the time since the call to order,
 * attendance in one chip, and the Display and Join info buttons
 */
export function ConsoleTopBar({
  state,
  attendance,
  eligible,
  startedAt,
  meetingCode,
  onJoinInfo,
}: ConsoleTopBarProps) {
  const elapsed = useElapsed(startedAt, state.meetingActive);
  return (
    <header className="card flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
      <h2 className="min-w-0 truncate font-serif-soft text-title font-semibold text-ink">
        {state.title || 'Live meeting'}
      </h2>
      <span className="label-caps">{stageLabel(state)}</span>
      {elapsed && <span className="text-sm tabular-nums text-ink-muted">{elapsed} elapsed</span>}
      <span
        className={`rounded-full px-3 py-1 text-sm font-medium tabular-nums text-ink ${attendance.hasQuorum ? 'bg-carried-tint' : 'bg-caution-tint'}`}
      >
        {attendanceChip(attendance, eligible)}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* A window of its own, to drag to the TV or projector */}
        <a
          href={`/meetings/${meetingCode}/display`}
          target="_blank"
          rel="noopener"
          className="btn-secondary btn-sm"
        >
          <Monitor className="h-5 w-5" aria-hidden="true" />
          Display
        </a>
        <button type="button" className="btn-secondary btn-sm" onClick={onJoinInfo}>
          <QrCodeIcon className="h-5 w-5" aria-hidden="true" />
          Join info
        </button>
        <ConnectionStatus />
      </div>
    </header>
  );
}
```

`frontend-unified/src/modules/meetings/components/console/JoinInfoCard.tsx`:

```tsx
import { useId, useState } from 'react';
import { QrCode } from '../QrCode';
import { joinUrl } from '../../utils/meetingLinks';

interface JoinInfoCardProps {
  code: string;
  qrSize?: number;
}

/** How to join: the code, the link and its QR code, to read out or show on a screen */
export function JoinInfoCard({ code, qrSize = 200 }: JoinInfoCardProps) {
  const link = joinUrl(code);
  const headingId = useId();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => setCopied(true));
  };

  return (
    <section className="card p-5" aria-labelledby={headingId}>
      <h3 id={headingId} className="label-caps mb-4">
        Join
      </h3>
      <div className="flex flex-wrap items-center gap-6">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-sm text-ink-muted">Meeting code</p>
            <p data-testid="meeting-code" className="meeting-code text-page text-ink">
              {code}
            </p>
          </div>
          <div>
            <p className="text-sm text-ink-muted">Link</p>
            <p className="break-all text-ink">{link}</p>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={copy}>
            {copied ? 'Copied' : 'Copy the link'}
          </button>
        </div>
        <QrCode value={link} label={`QR code for ${link}`} size={qrSize} />
      </div>
    </section>
  );
}
```

`frontend-unified/src/modules/meetings/components/console/ActionToolbar.tsx`:

```tsx
import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import type { ChairAction } from '../../utils/chairActions';

interface ActionToolbarProps {
  actions: ChairAction[];
  dispatch: React.Dispatch<MeetingAction>;
}

/** The chair's actions that are in order now, under the question card */
export function ActionToolbar({ actions, dispatch }: ActionToolbarProps) {
  if (actions.length === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="The chair's actions"
      className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={action.tone === 'primary' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => dispatch(action.make())}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
```

`frontend-unified/src/modules/meetings/components/console/ChairScriptLine.tsx`:

```tsx
import { useState } from 'react';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { getChairScript } from '../../utils/chairScriptHelper';

/** What the chair says now, as one muted line under the question; it can be hidden */
export function ChairScriptLine({ state }: { state: MeetingState }) {
  const [hidden, setHidden] = useState(false);
  const script = getChairScript(state);
  if (!script) return null;

  if (hidden) {
    return (
      <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => setHidden(false)}>
        Show the script
      </button>
    );
  }
  return (
    <div role="note" className="mt-3 flex items-start gap-3 text-sm text-ink-muted">
      <p className="flex-1">
        <span className="font-semibold">Say: </span>
        {script.text}
      </p>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setHidden(true)}>
        Hide the script
      </button>
    </div>
  );
}
```

(The script's `note` named the old panels' buttons; the line keeps only what the chair says.)

`frontend-unified/src/modules/meetings/components/console/CurrentItemLine.tsx`:

```tsx
import { Paperclip } from 'lucide-react';
import type { AgendaItem } from '@robbie-bylawyer/shared/types';
import type { MeetingPacket } from '../scheduling/types';
import { getAttachmentDownloadUrl } from '../scheduling/api';

interface CurrentItemLineProps {
  item: AgendaItem | null;
  packet: MeetingPacket | null;
}

/** The agenda item before the meeting, on one line, with its attachments from the schedule */
export function CurrentItemLine({ item, packet }: CurrentItemLineProps) {
  if (!item) return null;
  const scheduled = packet?.agendaItems.find((i) => i.id === item.packetItemId);
  const attachments = scheduled?.attachments ?? [];
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="label-caps">Now</span>
      <span className="font-medium text-ink">{item.title}</span>
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={
            attachment.type === 'uploaded_file'
              ? getAttachmentDownloadUrl(attachment.id)
              : `/documents/${attachment.documentId}`
          }
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-sm text-gavel hover:underline"
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {attachment.displayName}
        </a>
      ))}
    </div>
  );
}
```

`frontend-unified/src/modules/meetings/components/console/VoteControl.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react';
import type {
  MeetingAction,
  MeetingState,
  Member,
  Votes,
  VotingMethod,
} from '@robbie-bylawyer/shared/types';
import {
  NO_VOTES,
  addVotes,
  canChairVoteDecide,
  generateTimestamp,
} from '@robbie-bylawyer/shared/utils';
import { TimerLine } from '../TimerLine';

interface VoteControlProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The signed-in user: the chair, or an admin, who votes like a member */
  me: Member | null;
}

const METHODS: Array<{ value: VotingMethod; label: string }> = [
  { value: 'standard', label: 'On devices and in the room' },
  { value: 'voice', label: 'Voice vote or show of hands' },
  { value: 'ballot', label: 'Secret ballot' },
  { value: 'rollcall', label: 'Roll call' },
];

const CHOICES = ['yea', 'nay', 'abstain'] as const;
const CHOICE_LABELS = { yea: 'Yea', nay: 'Nay', abstain: 'Abstain' } as const;

/**
 * The vote panel: how the vote is taken, then, while it is open, the device votes, the chair's
 * count of the room, the two together, the chair's deciding vote, an admin's own vote, and
 * Close the vote
 */
export function VoteControl({ state, dispatch, me }: VoteControlProps) {
  const methodId = useId();
  const motion = state.currentMotion;

  if (!state.votingOpen) {
    if (!motion || motion.vote === 'none' || state.pendingSecond) return null;
    return (
      <section className="card p-5">
        <label htmlFor={methodId} className="label-caps">
          How the vote is taken
        </label>
        <select
          id={methodId}
          className="select mt-2"
          value={state.votingMethod}
          onChange={(e) =>
            dispatch({ type: 'SET_VOTING_METHOD', method: e.target.value as VotingMethod })
          }
        >
          {METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.label}
            </option>
          ))}
        </select>
      </section>
    );
  }

  return <OpenVote state={state} dispatch={dispatch} me={me} />;
}

function OpenVote({ state, dispatch, me }: VoteControlProps) {
  const method = state.votingMethod;
  const floor = state.floorVotes ?? NO_VOTES;
  const combined = addVotes(state.votes, floor);
  const requirement = state.currentMotion?.vote ?? 'majority';
  const iVoted = me !== null && state.voters.includes(me.id);
  const myVote = me ? state.voterChoices[me.id] : undefined;
  const floorEntered = floor.yea + floor.nay + floor.abstain > 0;

  // The chair votes only when that would change the result, judged on the devices and the room
  // together, as the server judges it; on a secret ballot the chair votes like anyone
  const chairMayDecide =
    me?.role === 'chair' &&
    (method === 'standard' || method === 'rollcall') &&
    !iVoted &&
    canChairVoteDecide(combined, requirement);
  const ownVote =
    me !== null &&
    method !== 'voice' &&
    (me.role === 'admin' || (me.role === 'chair' && method === 'ballot'));

  return (
    <section className="card space-y-5 p-5" aria-labelledby="vote-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="vote-heading" className="label-caps">
          Vote in progress
        </h3>
        <span className="text-sm text-ink-muted">
          {METHODS.find((m) => m.value === method)?.label}
        </span>
      </div>

      {state.voteTimerEnd && (
        <TimerLine
          endTime={state.voteTimerEnd}
          totalSeconds={state.voteTimeLimit}
          label="Voting time"
        />
      )}

      {method === 'voice' ? (
        <p className="text-sm text-ink-muted">
          Counted in the room. Enter the count below, or just the clear result.
        </p>
      ) : method === 'ballot' ? (
        <p className="text-ink">
          <span className="animate-count-pulse font-serif-soft text-page font-semibold tabular-nums">
            {state.voters.length}
          </span>{' '}
          ballots received on devices. The counts stay hidden until the vote closes.
        </p>
      ) : (
        <div className="space-y-2">
          <dl className="grid grid-cols-3 gap-3">
            {CHOICES.map((choice) => (
              <div
                key={choice}
                className="flex flex-col-reverse rounded-lg bg-surface-2 p-3 text-center"
              >
                <dt className="label-caps">{CHOICE_LABELS[choice]} on devices</dt>
                <dd className="animate-count-pulse font-serif-soft text-page font-semibold tabular-nums text-ink">
                  {state.votes[choice]}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm tabular-nums text-ink-muted">
            {state.voters.length} voted on devices
          </p>
        </div>
      )}

      {/* Keyed on the tally the meeting has, so an entry from another console resets the form */}
      <FloorTallyForm
        key={`${floor.yea}|${floor.nay}|${floor.abstain}`}
        floor={floor}
        dispatch={dispatch}
      />

      {floorEntered && method !== 'ballot' && (
        <p className="text-sm font-medium tabular-nums text-ink">
          Together: {combined.yea} to {combined.nay}
          {combined.abstain > 0 && `, ${combined.abstain} abstaining`}
        </p>
      )}

      {chairMayDecide && me && (
        <div className="rounded-lg bg-gavel-tint p-3">
          <p className="mb-2 text-sm font-medium text-ink">
            {combined.yea === combined.nay
              ? 'The chair may vote to break the tie'
              : "The chair may vote: the chair's vote would change the result"}
          </p>
          <div className="flex gap-2">
            {(['yea', 'nay'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                className="btn-secondary btn-sm"
                onClick={() =>
                  dispatch({
                    type: 'CAST_VOTE',
                    vote: choice,
                    voterId: me.id,
                    isChairDecidingVote: true,
                  })
                }
              >
                {`Vote ${choice}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {ownVote && me && (
        <div>
          <p className="label-caps mb-2">Your vote</p>
          <div className="flex gap-2">
            {CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={myVote === choice}
                className={myVote === choice ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                onClick={() => dispatch({ type: 'CAST_VOTE', vote: choice, voterId: me.id })}
              >
                {`Vote ${choice}`}
              </button>
            ))}
          </div>
          {method === 'ballot' && iVoted && (
            <p role="status" className="mt-2 text-sm text-carried">
              Vote recorded
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn-primary w-full"
        onClick={() => dispatch({ type: 'CLOSE_VOTING', timestamp: generateTimestamp() })}
      >
        Close the vote
      </button>
    </section>
  );
}

/** The chair's count of the room: replaces the last entry */
function FloorTallyForm({
  floor,
  dispatch,
}: {
  floor: Votes;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  const id = useId();
  const [counts, setCounts] = useState({
    yea: String(floor.yea),
    nay: String(floor.nay),
    abstain: String(floor.abstain),
  });
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = {
      yea: Number(counts.yea.trim() || '0'),
      nay: Number(counts.nay.trim() || '0'),
      abstain: Number(counts.abstain.trim() || '0'),
    };
    if (Object.values(parsed).some((n) => !Number.isInteger(n) || n < 0)) {
      setProblem('Counts are whole numbers, 0 or more');
      return;
    }
    setProblem(null);
    dispatch({ type: 'SET_FLOOR_TALLY', ...parsed, timestamp: generateTimestamp() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <p className="label-caps">In the room</p>
      <p className="text-xs text-ink-muted">
        The show of hands of people not voting on a device. A new entry replaces the last.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {CHOICES.map((choice) => (
          <div key={choice}>
            <label htmlFor={`${id}-${choice}`} className="label">
              {`${CHOICE_LABELS[choice]} in the room`}
            </label>
            <input
              id={`${id}-${choice}`}
              className="input tabular-nums"
              inputMode="numeric"
              value={counts[choice]}
              onChange={(e) => setCounts({ ...counts, [choice]: e.target.value })}
            />
          </div>
        ))}
      </div>
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <button type="submit" className="btn-secondary btn-sm">
        Enter the count
      </button>
    </form>
  );
}
```

`frontend-unified/src/modules/meetings/components/console/ConsoleAgenda.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { DraggableAgendaList } from '../DraggableAgendaList';

interface ConsoleAgendaProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}

/**
 * The agenda in the console's side column: reordered and added to before it is adopted, then
 * each item called and completed in turn
 */
export function ConsoleAgenda({ state, dispatch }: ConsoleAgendaProps) {
  const newItemId = useId();
  const [newItem, setNewItem] = useState('');
  // Items are called and completed between questions, not during one
  const busy = !!state.currentMotion || !!state.pendingSecond || state.votingOpen;

  const addItem = (e: FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    dispatch({ type: 'ADD_AGENDA_ITEM', title: newItem.trim(), itemId: generateId() });
    setNewItem('');
  };

  return (
    <section className="card space-y-3 p-5" aria-labelledby="agenda-heading">
      <h3 id="agenda-heading" className="label-caps">
        Agenda
      </h3>
      {!state.agendaAdopted ? (
        <>
          <p className="text-sm text-ink-muted">Drag to reorder before the agenda is adopted.</p>
          <DraggableAgendaList agenda={state.agenda} dispatch={dispatch} disabled={false} />
          <form onSubmit={addItem} className="flex gap-2">
            <label htmlFor={newItemId} className="sr-only">
              New agenda item
            </label>
            <input
              id={newItemId}
              className="input"
              placeholder="Add an item"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
            />
            <button type="submit" className="btn-secondary btn-sm" disabled={!newItem.trim()}>
              Add
            </button>
          </form>
        </>
      ) : state.agenda.length === 0 ? (
        <p className="text-sm text-ink-muted">The agenda is empty.</p>
      ) : (
        <ol className="space-y-1">
          {state.agenda.map((item, index) => (
            <li
              key={item.id}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${item.status === 'active' ? 'border-l-2 border-gavel bg-gavel-tint' : ''}`}
            >
              <span
                className={`text-sm ${item.status === 'completed' ? 'text-ink-muted line-through' : 'text-ink'}`}
              >
                {item.status === 'active' && <span className="sr-only">Current item: </span>}
                {index + 1}. {item.title}
              </span>
              {item.status === 'pending' && !state.currentAgendaItem && !busy && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  aria-label={`Call ${item.title}`}
                  onClick={() =>
                    dispatch({
                      type: 'CALL_AGENDA_ITEM',
                      id: item.id,
                      timestamp: generateTimestamp(),
                    })
                  }
                >
                  Call
                </button>
              )}
              {item.status === 'active' && !busy && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  aria-label={`Complete ${item.title}`}
                  onClick={() =>
                    dispatch({
                      type: 'COMPLETE_AGENDA_ITEM',
                      id: item.id,
                      timestamp: generateTimestamp(),
                    })
                  }
                >
                  Complete
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/utils/__tests__/chairActions.test.ts src/modules/meetings/components/console`
Expected: all pass: `chairActions` 8, `VoteControl` 7, `ConsoleParts` 5.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings
git add frontend-unified/src/modules/meetings
git commit -m "feat(web): the chair console's parts

chairActions gives the chair only the actions in order now, next step first.
The vote panel takes the method (voice included), shows the device votes,
takes the count in the room, adds the two, offers the chair's deciding vote on
both and an admin's own vote. The top bar, the join card with its QR code, the
current item with its attachments, the script line and the agenda."
```

---

### Task 5: The chair console, with elections and the admin's view folded in

**Files:**

- Replace: `frontend-unified/src/modules/meetings/components/NominationsPanel.tsx`, `components/ElectionPanel.tsx`, `views/MeetingApp.tsx`, `components/chair/index.ts`, `components/admin/index.ts` (paths under `frontend-unified/src/modules/meetings/`)
- Create: `views/ChairConsole.tsx`, `components/console/MoreArea.tsx`
- Modify: `views/__tests__/ParticipantView.test.tsx` (one expectation)
- Delete: `views/ChairView.tsx`, `views/AdminView.tsx`, `views/__tests__/ChairView.test.tsx`, `views/__tests__/AdminView.test.tsx`, `components/chair/VotingPanel.tsx`, `components/chair/__tests__/VotingPanel.test.tsx`, `components/chair/PendingMotionPanel.tsx`, `components/chair/__tests__/PendingMotionPanel.test.tsx`, `components/chair/PendingSecondPanel.tsx`, `components/chair/UnanimousConsentPanel.tsx`, `components/chair/MeetingControlPanel.tsx`, `components/chair/ChairScriptPanel.tsx`, `components/chair/AgendaPanel.tsx`, `components/chair/MotionStackPanel.tsx`, `components/admin/MembersPanel.tsx`, `components/admin/RoleChangeModal.tsx`, `components/admin/TimeLimitsPanel.tsx`, `components/admin/MeetingSettingsPanel.tsx`
- Test: `views/__tests__/ChairConsole.test.tsx`, `components/__tests__/NominationsPanel.test.tsx`, `components/__tests__/ElectionPanel.test.tsx`, `components/console/__tests__/MoreArea.test.tsx` (new)

The console the brief draws, for the chair and for admins (who can do everything a chair can, and vote like members). Under the top bar, a 12-column grid at 1280px: columns 1 to 8 are "Now" (the join card before the meeting starts, the current item, the question card with its toolbar and the script line, the stamp when a result lands, the vote panel, the speaker queue); columns 9 to 12 are the attendance panel, the agenda, nominations and elections, inquiries, and "More". Below 1280px the columns stack.

- **Elections are always reachable.** `NominationsPanel` always shows the chair "Open nominations for" (any position, at any time no election is running), not only when nominations are already open; the nominee is chosen from everyone present who isn't a guest (members marked present included), or typed for someone not in the meeting (the server takes `nomineeId: 0` with a name). `ElectionPanel` opens the ballot with the vote required, takes the tellers' count of paper ballots by candidate (`SET_FLOOR_BALLOTS`), closes the ballot and declares the winner.
- **The admin view is folded in.** "More" (closed until opened) holds proxies; the order of business, the minutes from the last meeting and committee reports; meeting settings (this meeting's quorum, and for admins the speaking and voting time limits); the people in the meeting, each with Rename and Hand over the chair (meeting roles otherwise come from the organization, and the server only hands over the chair); reloading the agenda from the schedule before the call to order; the bylaws link (admins); the meeting's documents; tabled motions; and the log. `AdminView`, `ChairView` and the view switcher go, and so do the chair panels whose buttons are now the toolbar's, and the role and settings pieces the old admin view used.
- `MeetingApp` picks the screen by role: the console for the chair and admins, the participant view for everyone else (Task 6 replaces it with the phone view). The user's name comes from sign-in and a rejoin restores it (the server's known limit), so the one-time self-rename in the old meeting header goes with it; the console can still rename anyone for the meeting.

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/modules/meetings/components/__tests__/NominationsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { NominationsPanel } from '../NominationsPanel';

const dana: Member = {
  id: 2,
  name: 'Dana Okafor',
  role: 'chair',
  present: true,
  presentBy: 'device',
};
const alice: Member = {
  id: 3,
  name: 'Alice Brennan',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const carmen: Member = {
  id: 5,
  name: 'Carmen Diaz',
  role: 'member',
  present: true,
  presentBy: 'chair',
};
const sam: Member = {
  id: 11,
  name: 'Sam Ortiz',
  role: 'guest',
  present: true,
  presentBy: 'device',
};

const base: MeetingState = {
  ...initialState,
  meetingActive: true,
  agendaAdopted: true,
  members: [dana, alice, carmen, sam],
};
const open: MeetingState = {
  ...base,
  nominationsOpen: true,
  currentNominationPosition: 'Director',
};

const dispatch = vi.fn();

describe('NominationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets the chair open nominations for any position, at any time', () => {
    render(<NominationsPanel state={base} dispatch={dispatch} currentUser={dana} isChair />);
    fireEvent.change(screen.getByLabelText('Open nominations for'), {
      target: { value: 'Director' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open nominations' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_NOMINATIONS', position: 'Director' }),
    );
  });

  it('nominates someone present, members marked present included, and never a guest', () => {
    render(<NominationsPanel state={open} dispatch={dispatch} currentUser={alice} />);
    expect(screen.queryByRole('option', { name: 'Sam Ortiz' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Nominee'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nominate' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NOMINATE',
        position: 'Director',
        nomineeName: 'Carmen Diaz',
        nomineeId: 5,
        nominatorId: 3,
      }),
    );
  });

  it('nominates someone not in the meeting by name', () => {
    render(<NominationsPanel state={open} dispatch={dispatch} currentUser={alice} />);
    fireEvent.change(screen.getByLabelText('Nominee'), { target: { value: 'someone-else' } });
    fireEvent.change(screen.getByLabelText("Nominee's name"), {
      target: { value: 'Grace Kim' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nominate' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'NOMINATE', nomineeName: 'Grace Kim', nomineeId: 0 }),
    );
  });

  it('lets only the nominee decline, as the signed-in user', () => {
    const state: MeetingState = {
      ...open,
      nominations: [
        {
          id: 5,
          position: 'Director',
          nomineeName: 'Alice Brennan',
          nomineeId: 3,
          nominatedBy: 'Dana Okafor',
          nominatorId: 2,
          timestamp: '',
          declined: false,
        },
      ],
    };
    const { unmount } = render(
      <NominationsPanel state={state} dispatch={dispatch} currentUser={dana} isChair />,
    );
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
    unmount();

    render(<NominationsPanel state={state} dispatch={dispatch} currentUser={alice} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DECLINE_NOMINATION', nominationId: 5 }),
    );
  });

  it('gives a guest no nomination form', () => {
    render(<NominationsPanel state={open} dispatch={dispatch} currentUser={sam} />);
    expect(screen.queryByLabelText('Nominee')).toBeNull();
  });
});
```

Create `frontend-unified/src/modules/meetings/components/__tests__/ElectionPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { Election, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { ElectionPanel } from '../ElectionPanel';

const dana: Member = { id: 2, name: 'Dana Okafor', role: 'chair', present: true };
const alice: Member = { id: 3, name: 'Alice Brennan', role: 'member', present: true };
const sam: Member = { id: 11, name: 'Sam Ortiz', role: 'guest', present: true };

const election = (overrides: Partial<Election> = {}): Election => ({
  id: 7,
  position: 'Director',
  candidates: [
    { name: 'Carmen Diaz', id: 5 },
    { name: 'Ray Castillo', id: 6 },
  ],
  requiredVotes: 'majority',
  votingInProgress: true,
  ballotResults: { 'Carmen Diaz': 0, 'Ray Castillo': 0 },
  votersWhoVoted: [],
  floorBallots: {},
  elected: null,
  ...overrides,
});

const base: MeetingState = {
  ...initialState,
  meetingActive: true,
  members: [dana, alice, sam],
  currentNominationPosition: 'Director',
  nominations: [
    {
      id: 1,
      position: 'Director',
      nomineeName: 'Carmen Diaz',
      nomineeId: 5,
      nominatedBy: 'Alice Brennan',
      nominatorId: 3,
      timestamp: '',
      declined: false,
    },
  ],
};

const dispatch = vi.fn();

describe('ElectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the ballot once nominations close, with the vote required', () => {
    render(<ElectionPanel state={base} dispatch={dispatch} currentUser={dana} isChair />);
    expect(screen.getByText('Candidates: Carmen Diaz')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Vote required'), { target: { value: '2/3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open the ballot' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'START_ELECTION',
        position: 'Director',
        requiredVotes: '2/3',
      }),
    );
  });

  it('takes a ballot from a member, once', () => {
    const { unmount } = render(
      <ElectionPanel
        state={{ ...base, currentElection: election() }}
        dispatch={dispatch}
        currentUser={alice}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vote for Carmen Diaz' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CAST_BALLOT',
      candidateName: 'Carmen Diaz',
      voterId: 3,
    });
    unmount();

    render(
      <ElectionPanel
        state={{ ...base, currentElection: election({ votersWhoVoted: [3] }) }}
        dispatch={dispatch}
        currentUser={alice}
      />,
    );
    expect(screen.getByText('Ballot recorded')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vote for Carmen Diaz' })).toBeNull();
  });

  it('gives a guest no ballot', () => {
    render(
      <ElectionPanel
        state={{ ...base, currentElection: election() }}
        dispatch={dispatch}
        currentUser={sam}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Vote for Carmen Diaz' })).toBeNull();
  });

  it('takes the paper ballots by candidate, and closes the ballot', () => {
    render(
      <ElectionPanel
        state={{ ...base, currentElection: election() }}
        dispatch={dispatch}
        currentUser={dana}
        isChair
      />,
    );
    fireEvent.change(screen.getByLabelText('Carmen Diaz in the room'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Ray Castillo in the room'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter the paper ballots' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SET_FLOOR_BALLOTS',
        counts: { 'Carmen Diaz': 9, 'Ray Castillo': 5 },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close the ballot' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLOSE_ELECTION' }));
  });

  it('declares the winner', () => {
    const closed = election({
      votingInProgress: false,
      ballotResults: { 'Carmen Diaz': 12, 'Ray Castillo': 6 },
      elected: 'Carmen Diaz',
    });
    render(
      <ElectionPanel
        state={{ ...base, currentElection: closed }}
        dispatch={dispatch}
        currentUser={dana}
        isChair
      />,
    );
    expect(screen.getByText('Carmen Diaz 12, Ray Castillo 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Declare Carmen Diaz elected' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DECLARE_ELECTED', candidateName: 'Carmen Diaz' }),
    );
  });
});
```

Create `frontend-unified/src/modules/meetings/components/console/__tests__/MoreArea.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';

const api = vi.hoisted(() => ({ meetingPackets: { reloadAgenda: vi.fn() } }));
vi.mock('../../../../../api/client', () => api);
vi.mock('../../chair', () => ({
  ProxyManagementPanel: () => <p>Proxies</p>,
  OrderOfBusinessPanel: () => <p>Order of business</p>,
  MinutesApprovalPanel: () => null,
  CommitteeReportsPanel: () => null,
  MeetingDocumentsPanel: () => <p>Documents</p>,
}));
vi.mock('../../BylawyerLinkPanel', () => ({ BylawyerLinkPanel: () => <p>Bylaws link</p> }));

const { MoreArea } = await import('../MoreArea');

const dana: Member = { id: 2, name: 'Dana Okafor', role: 'chair', present: true };
const pat: Member = { id: 1, name: 'Pat Lindqvist', role: 'admin', present: true };
const alice: Member = { id: 3, name: 'Alice Brennan', role: 'member', present: true };
const sam: Member = { id: 11, name: 'Sam Ortiz', role: 'guest', present: true };
const state: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  quorum: 29,
  members: [pat, dana, alice, sam],
};

const dispatch = vi.fn();

function renderMore(me: Member, overrides: Partial<MeetingState> = {}) {
  render(
    <MoreArea
      state={{ ...state, ...overrides }}
      dispatch={dispatch}
      me={me}
      meetingCode="MAPLE1"
      organizationId="org-1"
    />,
  );
}

describe('MoreArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hands the chair to a member present, after a confirmation', () => {
    renderMore(dana);
    expect(screen.queryByRole('button', { name: 'Hand the chair to Sam Ortiz' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hand the chair to Alice Brennan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Alice Brennan takes the chair' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_MEMBER_ROLE', targetMemberId: 3, newRole: 'chair' }),
    );
  });

  it('sets the quorum for this meeting', () => {
    renderMore(dana);
    fireEvent.change(screen.getByLabelText('Quorum for this meeting'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the quorum' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_QUORUM', quorum: 25 }),
    );
  });

  it('shows the time limits and the bylaws link to admins only', () => {
    renderMore(pat);
    expect(screen.getByLabelText('Speaking time (seconds)')).toBeTruthy();
    expect(screen.getByText('Bylaws link')).toBeTruthy();
  });

  it('keeps the time limits from a chair who is not an admin', () => {
    renderMore(dana);
    expect(screen.queryByLabelText('Speaking time (seconds)')).toBeNull();
    expect(screen.queryByText('Bylaws link')).toBeNull();
  });

  it('reloads the agenda from the schedule before the call to order', async () => {
    api.meetingPackets.reloadAgenda.mockResolvedValueOnce({ live: true });
    renderMore(dana);
    fireEvent.click(screen.getByRole('button', { name: 'Reload the agenda' }));
    expect(await screen.findByText('The agenda now matches the schedule.')).toBeTruthy();
    expect(api.meetingPackets.reloadAgenda).toHaveBeenCalledWith('MAPLE1');
  });
});
```

Create `frontend-unified/src/modules/meetings/views/__tests__/ChairConsole.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  currentUser: null as unknown as Member,
}));
vi.mock('../../context/SocketContext', () => ({
  useSocket: () => ({
    state: socket.state,
    dispatch: vi.fn(),
    currentUser: socket.currentUser,
    myRole: socket.currentUser.role,
    attendance: attendanceSummary(socket.state),
    meetingCode: 'MAPLE1',
    isConnected: true,
    connectedMembers: [],
    leaveMeeting: vi.fn(),
    reconnect: vi.fn(),
    error: null,
  }),
}));
vi.mock('../../context/OrganizationBridge', () => ({
  useMeetingOrganization: () => ({ availableOrganizations: [] }),
}));
vi.mock('../../hooks/useRoster', () => ({ useRoster: () => ({ roster: null, error: null }) }));
vi.mock('../../hooks/usePacket', () => ({ usePacket: () => null }));
vi.mock('../../components/console/MoreArea', () => ({ MoreArea: () => <p>More</p> }));
vi.mock('../../components/QrCode', () => ({
  QrCode: ({ label }: { label: string }) => <img alt={label} />,
}));

const { ChairConsole } = await import('../ChairConsole');

const dana: Member = {
  id: 2,
  name: 'Dana Okafor',
  role: 'chair',
  present: true,
  presentBy: 'device',
};
const admin: Member = { id: 1, name: 'Admin', role: 'admin', present: true, presentBy: 'device' };
const motion: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Approve the pool contract',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
};
const active: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  meetingActive: true,
  meetingStage: 'new-business',
  agendaAdopted: true,
  members: [dana],
};

describe('ChairConsole', () => {
  beforeEach(() => {
    socket.currentUser = dana;
  });

  it('calls the meeting to order from the question card, with the join card beside it', () => {
    socket.state = {
      ...initialState,
      meetingCode: 'MAPLE1',
      title: '2026 Annual Meeting',
      members: [dana],
    };
    render(<ChairConsole />);
    expect(screen.getByRole('button', { name: 'Call to order' })).toBeTruthy();
    expect(screen.getByTestId('meeting-code').textContent).toBe('MAPLE1');
    expect(screen.getByText('The meeting has not been called to order.')).toBeTruthy();
  });

  it('shows the question with only the actions in order', () => {
    socket.state = { ...active, currentMotion: motion, motionStack: [motion] };
    render(<ChairConsole />);
    expect(screen.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open the vote' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call to order' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close the vote' })).toBeNull();
  });

  it('always offers to open nominations', () => {
    socket.state = active;
    render(<ChairConsole />);
    expect(screen.getByLabelText('Open nominations for')).toBeTruthy();
  });

  it('stamps the result when a vote closes', () => {
    socket.state = {
      ...active,
      meetingLog: [
        { time: '7:41:00 PM', message: 'Chair puts the question: "Approve the pool contract"' },
        {
          time: '7:45:00 PM',
          message: 'Vote: Yea 11, Nay 2. CARRIED. On devices 2 to 0, in the room 9 to 2.',
        },
      ],
    };
    render(<ChairConsole />);
    expect(screen.getByText('Carried')).toBeTruthy();
    expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
  });

  describe('presided over by an admin, with no member in the chair', () => {
    beforeEach(() => {
      socket.currentUser = admin;
      socket.state = {
        ...active,
        members: [admin, { id: 2, name: 'Member', role: 'member', present: true }],
        inquiries: [
          {
            id: 7,
            type: 'parliamentary',
            question: 'Is a motion to recess in order?',
            askedBy: 'Member',
            askerId: 2,
            timestamp: '10:00:00',
          },
        ],
        suspendedRules: [
          {
            id: 9,
            rule: 'debate-rules',
            purpose: 'Allow a longer report',
            specificAction: 'Treasurer speaks for 10 minutes',
            scope: 'meeting-remainder',
            suspendedAt: '10:00:00',
            motionId: 5,
          },
        ],
      };
    });

    it('lets the admin answer inquiries', () => {
      render(<ChairConsole />);
      expect(screen.queryByText(/Is a motion to recess in order\?/)).not.toBeNull();
      expect(screen.queryByPlaceholderText('Enter your answer...')).not.toBeNull();
    });

    it('lets the admin restore a suspended rule', () => {
      render(<ChairConsole />);
      expect(screen.queryByRole('button', { name: /restore/i })).not.toBeNull();
    });
  });
});
```

In `frontend-unified/src/modules/meetings/views/__tests__/ParticipantView.test.tsx`, the nomination form now chooses the nominee from the room. Replace:

```tsx
expect(screen.queryByPlaceholderText('Name of nominee')).not.toBeNull();
```

with:

```tsx
expect(screen.queryByLabelText('Nominee')).not.toBeNull();
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/components/__tests__/NominationsPanel.test.tsx src/modules/meetings/components/__tests__/ElectionPanel.test.tsx src/modules/meetings/components/console/__tests__/MoreArea.test.tsx src/modules/meetings/views/__tests__/ChairConsole.test.tsx src/modules/meetings/views/__tests__/ParticipantView.test.tsx`
Expected: FAIL. The nominations panel has no "Open nominations for" field or nominee list, the election panel has no "Vote required" label, paper ballots or "Declare ... elected" button, and `../MoreArea` and `../ChairConsole` don't exist.

- [ ] **Step 3: Replace `frontend-unified/src/modules/meetings/components/NominationsPanel.tsx`**

```tsx
import { useId, useMemo, useState, type FormEvent } from 'react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';

interface NominationsPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The signed-in user, who nominates and may decline their own nomination */
  currentUser: Member;
  /** The chair, or an admin presiding: opens and closes nominations */
  isChair?: boolean;
}

/** The nominee select's value for someone typed in by name */
const SOMEONE_ELSE = 'someone-else';

/**
 * Nominations (docs/superpowers/specs/2026-10-06-in-the-room-design.md, "Elections from the
 * chair's screen"): the chair opens them for any position at any time no election is running.
 * Nominees are anyone present who isn't a guest (members marked present included), or someone
 * not in the meeting, by name. Nominations need no second.
 */
export function NominationsPanel({
  state,
  dispatch,
  currentUser,
  isChair = false,
}: NominationsPanelProps) {
  const positionId = useId();
  const nomineeId = useId();
  const nameId = useId();
  const [position, setPosition] = useState('');
  const [nominee, setNominee] = useState('');
  const [name, setName] = useState('');

  const openPosition = state.nominationsOpen ? state.currentNominationPosition : null;
  const candidates = useMemo(
    () => state.members.filter((m) => m.present && m.role !== 'guest'),
    [state.members],
  );
  const nominations = state.nominations.filter((n) => n.position === openPosition);
  const canNominate = currentUser.role !== 'guest';

  const openNominations = (e: FormEvent) => {
    e.preventDefault();
    if (!position.trim()) return;
    dispatch({
      type: 'OPEN_NOMINATIONS',
      position: position.trim(),
      timestamp: generateTimestamp(),
    });
    setPosition('');
  };

  const nominate = (e: FormEvent) => {
    e.preventDefault();
    if (!openPosition) return;
    const member =
      nominee && nominee !== SOMEONE_ELSE
        ? candidates.find((m) => String(m.id) === nominee)
        : undefined;
    const nomineeName = member ? member.name : name.trim();
    if (!nomineeName) return;
    dispatch({
      type: 'NOMINATE',
      position: openPosition,
      nomineeName,
      // Someone not in the meeting has no member ID: the server tells them apart by name
      nomineeId: member?.id ?? 0,
      nominatedBy: currentUser.name,
      nominatorId: currentUser.id,
      nominationId: generateId(),
      timestamp: generateTimestamp(),
    });
    setNominee('');
    setName('');
  };

  const ready = nominee !== '' && (nominee !== SOMEONE_ELSE || name.trim() !== '');

  return (
    <section className="card space-y-4 p-5" aria-labelledby="nominations-heading">
      <h3 id="nominations-heading" className="label-caps">
        Nominations and elections
      </h3>

      {isChair && !state.nominationsOpen && !state.currentElection && (
        <form onSubmit={openNominations} className="space-y-2">
          <label htmlFor={positionId} className="label">
            Open nominations for
          </label>
          <div className="flex gap-2">
            <input
              id={positionId}
              className="input"
              placeholder="Director, Treasurer..."
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
            <button type="submit" className="btn-secondary btn-sm" disabled={!position.trim()}>
              Open nominations
            </button>
          </div>
        </form>
      )}

      {openPosition && (
        <div className="space-y-3">
          <p role="status" className="text-sm text-ink">
            Nominations are open for <span className="font-semibold">{openPosition}</span>. They
            need no second, and members may nominate themselves.
          </p>

          {canNominate && (
            <form onSubmit={nominate} className="space-y-2">
              <label htmlFor={nomineeId} className="label">
                Nominee
              </label>
              <select
                id={nomineeId}
                className="select"
                value={nominee}
                onChange={(e) => setNominee(e.target.value)}
              >
                <option value="">Choose someone present</option>
                {candidates.map((member) => (
                  <option key={member.id} value={String(member.id)}>
                    {member.name}
                  </option>
                ))}
                <option value={SOMEONE_ELSE}>Someone not in the meeting</option>
              </select>
              {nominee === SOMEONE_ELSE && (
                <div>
                  <label htmlFor={nameId} className="label">
                    Nominee&apos;s name
                  </label>
                  <input
                    id={nameId}
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              <button type="submit" className="btn-primary btn-sm" disabled={!ready}>
                Nominate
              </button>
            </form>
          )}

          {nominations.length > 0 && (
            <ul aria-label="Nominations" className="divide-y divide-rule">
              {nominations.map((nomination) => (
                <li key={nomination.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p
                      className={`text-sm font-medium ${nomination.declined ? 'text-ink-muted line-through' : 'text-ink'}`}
                    >
                      {nomination.nomineeName}
                      {nomination.declined && ' (declined)'}
                    </p>
                    <p className="text-xs text-ink-muted">Nominated by {nomination.nominatedBy}</p>
                  </div>
                  {!nomination.declined && nomination.nomineeId === currentUser.id && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        dispatch({
                          type: 'DECLINE_NOMINATION',
                          nominationId: nomination.id,
                          timestamp: generateTimestamp(),
                        })
                      }
                    >
                      Decline
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isChair && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                dispatch({ type: 'CLOSE_NOMINATIONS', timestamp: generateTimestamp() })
              }
            >
              Close nominations
            </button>
          )}
        </div>
      )}

      {state.electedOfficers.length > 0 && (
        <div>
          <p className="label-caps mb-2">Elected</p>
          <ul className="space-y-1">
            {state.electedOfficers.map((officer) => (
              <li
                key={`${officer.position}-${officer.memberId}-${officer.name}`}
                className="text-sm text-ink"
              >
                <span className="font-medium">{officer.position}:</span> {officer.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isChair && !openPosition && state.electedOfficers.length === 0 && (
        <p className="text-sm text-ink-muted">No nominations are open.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Replace `frontend-unified/src/modules/meetings/components/ElectionPanel.tsx`**

```tsx
import { useId, useMemo, useState, type FormEvent } from 'react';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { Election, MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { electionTally } from '../utils/question';

interface ElectionPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The signed-in user, who casts a ballot unless a guest */
  currentUser: Member;
  /** The chair, or an admin presiding: opens and closes the ballot and counts the room */
  isChair?: boolean;
}

type Required = Election['requiredVotes'];

/**
 * The election once nominations close: the chair opens the ballot with the vote required,
 * members cast ballots on their devices, the chair enters the tellers' count of paper ballots
 * by candidate, closes the ballot and declares the winner
 */
export function ElectionPanel({
  state,
  dispatch,
  currentUser,
  isChair = false,
}: ElectionPanelProps) {
  const requiredId = useId();
  const [required, setRequired] = useState<Required>('majority');
  const election = state.currentElection;
  const position = state.currentNominationPosition;
  const nominees = useMemo(
    () => [
      ...new Set(
        state.nominations
          .filter((n) => n.position === position && !n.declined)
          .map((n) => n.nomineeName),
      ),
    ],
    [state.nominations, position],
  );

  if (!election) {
    if (!isChair || state.nominationsOpen || !position) return null;
    return (
      <section className="card space-y-3 p-5" aria-labelledby="election-heading">
        <h3 id="election-heading" className="label-caps">
          Election for {position}
        </h3>
        <p className="text-sm text-ink">Candidates: {nominees.join(', ') || 'none'}</p>
        <div>
          <label htmlFor={requiredId} className="label">
            Vote required
          </label>
          <select
            id={requiredId}
            className="select"
            value={required}
            onChange={(e) => setRequired(e.target.value as Required)}
          >
            <option value="majority">A majority of the ballots</option>
            <option value="plurality">A plurality (the most ballots)</option>
            <option value="2/3">Two thirds of the ballots</option>
          </select>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            dispatch({
              type: 'START_ELECTION',
              electionId: generateId(),
              position,
              requiredVotes: required,
              timestamp: generateTimestamp(),
            })
          }
        >
          Open the ballot
        </button>
      </section>
    );
  }

  const voted = election.votersWhoVoted.includes(currentUser.id);
  const canVote = currentUser.role !== 'guest';

  if (election.votingInProgress) {
    return (
      <section className="card space-y-4 p-5" aria-labelledby="election-heading">
        <h3 id="election-heading" className="label-caps">
          Election for {election.position}
        </h3>
        <p className="text-sm tabular-nums text-ink-muted">
          <span className="animate-count-pulse">{election.votersWhoVoted.length}</span> ballots
          received on devices
        </p>
        {canVote &&
          (voted ? (
            <p role="status" className="text-sm font-medium text-carried">
              Ballot recorded
            </p>
          ) : (
            <div role="group" aria-label="Your ballot" className="space-y-2">
              {election.candidates.map((candidate) => (
                <button
                  key={candidate.name}
                  type="button"
                  className="btn-secondary btn-lg w-full"
                  aria-label={`Vote for ${candidate.name}`}
                  onClick={() =>
                    dispatch({
                      type: 'CAST_BALLOT',
                      candidateName: candidate.name,
                      voterId: currentUser.id,
                    })
                  }
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          ))}
        {isChair && (
          <>
            <FloorBallotsForm
              key={JSON.stringify(election.floorBallots ?? {})}
              election={election}
              dispatch={dispatch}
            />
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => dispatch({ type: 'CLOSE_ELECTION', timestamp: generateTimestamp() })}
            >
              Close the ballot
            </button>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="card space-y-3 p-5" aria-labelledby="election-heading">
      <h3 id="election-heading" className="label-caps">
        Election for {election.position}
      </h3>
      <p className="text-sm tabular-nums text-ink">{electionTally(election)}</p>
      {election.elected ? (
        <>
          <p className="text-sm font-medium text-carried">
            {election.elected} has the vote required.
          </p>
          {isChair && (
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                dispatch({
                  type: 'DECLARE_ELECTED',
                  candidateName: election.elected!,
                  timestamp: generateTimestamp(),
                })
              }
            >
              {`Declare ${election.elected} elected`}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-caution-ink">
          Nobody has the vote required.
          {isChair && ' Open nominations again or hold another ballot.'}
        </p>
      )}
    </section>
  );
}

/** The tellers' count of paper ballots by candidate: replaces the last entry */
function FloorBallotsForm({
  election,
  dispatch,
}: {
  election: Election;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  const id = useId();
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      election.candidates.map((c) => [c.name, String(election.floorBallots?.[c.name] ?? 0)]),
    ),
  );
  const [problem, setProblem] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = Object.fromEntries(
      Object.entries(counts).map(([name, value]) => [name, Number(value.trim() || '0')]),
    );
    if (Object.values(parsed).some((n) => !Number.isInteger(n) || n < 0)) {
      setProblem('Counts are whole numbers, 0 or more');
      return;
    }
    setProblem(null);
    dispatch({ type: 'SET_FLOOR_BALLOTS', counts: parsed, timestamp: generateTimestamp() });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <p className="label-caps">Paper ballots in the room</p>
      {election.candidates.map((candidate, index) => (
        <div key={candidate.name}>
          <label htmlFor={`${id}-${index}`} className="label">
            {`${candidate.name} in the room`}
          </label>
          <input
            id={`${id}-${index}`}
            className="input tabular-nums"
            inputMode="numeric"
            value={counts[candidate.name] ?? '0'}
            onChange={(e) => setCounts({ ...counts, [candidate.name]: e.target.value })}
          />
        </div>
      ))}
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <button type="submit" className="btn-secondary btn-sm">
        Enter the paper ballots
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Create `frontend-unified/src/modules/meetings/components/console/MoreArea.tsx`**

```tsx
import { useId, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type {
  MeetingAction,
  MeetingLogEntry,
  MeetingState,
  Member,
} from '@robbie-bylawyer/shared/types';
import { meetingPackets } from '../../../../api/client';
import { RoleBadge } from '../../../../components/ui/Badge';
import {
  CommitteeReportsPanel,
  MeetingDocumentsPanel,
  MinutesApprovalPanel,
  OrderOfBusinessPanel,
  ProxyManagementPanel,
} from '../chair';
import { RenameModal } from '../admin';
import { BylawyerLinkPanel } from '../BylawyerLinkPanel';

interface MoreAreaProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The signed-in user: the chair or an admin */
  me: Member | null;
  meetingCode: string;
  organizationId: string | null;
}

/**
 * The console's "More": everything the chair and admins need now and then, closed until opened
 */
export function MoreArea({ state, dispatch, me, meetingCode, organizationId }: MoreAreaProps) {
  const isAdmin = me?.role === 'admin';
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
        <span className="label-caps">More</span>
        <ChevronDown
          className="h-4 w-4 text-ink-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-8 border-t border-rule p-5">
        <ProxyManagementPanel state={state} dispatch={dispatch} />
        <div className="space-y-4">
          <OrderOfBusinessPanel state={state} dispatch={dispatch} />
          <MinutesApprovalPanel state={state} dispatch={dispatch} />
          <CommitteeReportsPanel state={state} dispatch={dispatch} />
        </div>
        <MeetingSettings state={state} dispatch={dispatch} isAdmin={isAdmin} />
        <PeopleInMeeting state={state} dispatch={dispatch} me={me} />
        {state.meetingStage === 'not-started' && <ReloadAgenda meetingCode={meetingCode} />}
        {isAdmin && (
          <BylawyerLinkPanel
            meetingCode={meetingCode}
            suggestedOrgId={organizationId ?? undefined}
          />
        )}
        <MeetingDocumentsPanel meetingCode={meetingCode} />
        <TabledMotions state={state} />
        <MeetingLog log={state.meetingLog} />
      </div>
    </details>
  );
}

/** This meeting's quorum, and for admins the time limits */
function MeetingSettings({
  state,
  dispatch,
  isAdmin,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  isAdmin: boolean;
}) {
  const quorumId = useId();
  const speakerId = useId();
  const voteId = useId();
  const [quorum, setQuorum] = useState(String(state.quorum));
  const [speaker, setSpeaker] = useState(String(state.speakerTimeLimit));
  const [vote, setVote] = useState(String(state.voteTimeLimit));

  const setTheQuorum = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(quorum);
    if (!Number.isInteger(value) || value < 1) return;
    dispatch({ type: 'SET_QUORUM', quorum: value, timestamp: generateTimestamp() });
  };

  const saveTimeLimits = (e: FormEvent) => {
    e.preventDefault();
    const speakerSeconds = Number(speaker);
    const voteSeconds = Number(vote);
    if (Number.isInteger(speakerSeconds) && speakerSeconds >= 0) {
      dispatch({ type: 'SET_SPEAKER_TIME_LIMIT', seconds: speakerSeconds });
    }
    if (Number.isInteger(voteSeconds) && voteSeconds >= 0) {
      dispatch({ type: 'SET_VOTE_TIME_LIMIT', seconds: voteSeconds });
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="meeting-settings-heading">
      <h4 id="meeting-settings-heading" className="label-caps">
        Meeting settings
      </h4>
      <form onSubmit={setTheQuorum} className="space-y-2">
        <label htmlFor={quorumId} className="label">
          Quorum for this meeting
        </label>
        <div className="flex gap-2">
          <input
            id={quorumId}
            className="input tabular-nums"
            inputMode="numeric"
            value={quorum}
            onChange={(e) => setQuorum(e.target.value)}
          />
          <button type="submit" className="btn-secondary btn-sm">
            Set the quorum
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          It starts from the organization&apos;s setting. Change it here when the bylaws set another
          for this meeting.
        </p>
      </form>
      {isAdmin && (
        <form onSubmit={saveTimeLimits} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={speakerId} className="label">
                Speaking time (seconds)
              </label>
              <input
                id={speakerId}
                className="input tabular-nums"
                inputMode="numeric"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={voteId} className="label">
                Voting time (seconds)
              </label>
              <input
                id={voteId}
                className="input tabular-nums"
                inputMode="numeric"
                value={vote}
                onChange={(e) => setVote(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-ink-muted">0 means no limit.</p>
          <button type="submit" className="btn-secondary btn-sm">
            Save the time limits
          </button>
        </form>
      )}
    </section>
  );
}

/**
 * The people in the meeting, with Rename and Hand over the chair. Roles otherwise come from the
 * organization; only the chair is handed over in a meeting.
 */
function PeopleInMeeting({
  state,
  dispatch,
  me,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member | null;
}) {
  const [renaming, setRenaming] = useState<Member | null>(null);
  const [newName, setNewName] = useState('');
  const [handingTo, setHandingTo] = useState<number | null>(null);
  const people = state.members.filter((m) => m.present);

  const rename = () => {
    if (!renaming || newName.trim().length < 2) return;
    dispatch({
      type: 'RENAME_MEMBER',
      memberId: renaming.id,
      newName: newName.trim(),
      renamedBy: me?.id ?? renaming.id,
      timestamp: generateTimestamp(),
    });
    setRenaming(null);
    setNewName('');
  };

  return (
    <section className="space-y-3" aria-labelledby="people-heading">
      <h4 id="people-heading" className="label-caps">
        People in the meeting
      </h4>
      <p className="text-xs text-ink-muted">
        Roles come from the organization. A new name lasts until the person joins again.
      </p>
      <ul className="divide-y divide-rule">
        {people.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2 text-sm text-ink">
              {person.name}
              <RoleBadge role={person.role} />
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                className="btn-ghost btn-sm"
                aria-label={`Rename ${person.name}`}
                onClick={() => {
                  setRenaming(person);
                  setNewName(person.name);
                }}
              >
                Rename
              </button>
              {person.role !== 'chair' &&
                person.role !== 'guest' &&
                (handingTo === person.id ? (
                  <>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      aria-label={`Confirm: ${person.name} takes the chair`}
                      onClick={() => {
                        dispatch({
                          type: 'SET_MEMBER_ROLE',
                          targetMemberId: person.id,
                          newRole: 'chair',
                          timestamp: generateTimestamp(),
                        });
                        setHandingTo(null);
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setHandingTo(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    aria-label={`Hand the chair to ${person.name}`}
                    onClick={() => setHandingTo(person.id)}
                  >
                    Hand over the chair
                  </button>
                ))}
            </span>
          </li>
        ))}
      </ul>
      {renaming && (
        <RenameModal
          member={renaming}
          newName={newName}
          setNewName={setNewName}
          onConfirm={rename}
          onCancel={() => {
            setRenaming(null);
            setNewName('');
          }}
        />
      )}
    </section>
  );
}

/** Before the call to order: replace the live agenda with the schedule's */
function ReloadAgenda({ meetingCode }: { meetingCode: string }) {
  const [status, setStatus] = useState<string | null>(null);

  const reload = async () => {
    try {
      await meetingPackets.reloadAgenda(meetingCode);
      setStatus('The agenda now matches the schedule.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't reload the agenda");
    }
  };

  return (
    <section className="space-y-2" aria-labelledby="reload-agenda-heading">
      <h4 id="reload-agenda-heading" className="label-caps">
        Agenda from the schedule
      </h4>
      <p className="text-sm text-ink-muted">
        Before the meeting is called to order, replace this agenda with the one on the schedule.
      </p>
      <button type="button" className="btn-secondary btn-sm" onClick={() => void reload()}>
        Reload the agenda
      </button>
      {status && (
        <p role="status" className="text-sm text-ink-muted">
          {status}
        </p>
      )}
    </section>
  );
}

function TabledMotions({ state }: { state: MeetingState }) {
  if (state.tabledMotions.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="tabled-heading">
      <h4 id="tabled-heading" className="label-caps">
        Tabled motions
      </h4>
      <ul className="space-y-2">
        {state.tabledMotions.map((motion) => (
          <li key={motion.id} className="text-sm text-ink">
            <span className="font-medium">{motion.name}:</span> {motion.text}
            <span className="block text-xs text-ink-muted">Moved by {motion.mover}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">A motion to take from the table brings one back.</p>
    </section>
  );
}

function MeetingLog({ log }: { log: MeetingLogEntry[] }) {
  return (
    <section className="space-y-2" aria-labelledby="log-heading">
      <h4 id="log-heading" className="label-caps">
        Log
      </h4>
      {log.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing yet.</p>
      ) : (
        <ol className="max-h-64 space-y-1 overflow-y-auto text-sm scrollbar-thin">
          {[...log].reverse().map((entry, index) => (
            <li key={log.length - index} className="text-ink">
              <span className="tabular-nums text-ink-muted">{entry.time}</span> {entry.message}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Create `frontend-unified/src/modules/meetings/views/ChairConsole.tsx`**

```tsx
import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRoster } from '../hooks/useRoster';
import { useEligibleVoters } from '../hooks/useEligibleVoters';
import { usePacket } from '../hooks/usePacket';
import { useVoteResults } from '../hooks/useVoteResults';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import { chairActions } from '../utils/chairActions';
import { currentResult, describeQuestion } from '../utils/question';
import { ActiveSuspensionsBanner } from '../components/ActiveSuspensionsBanner';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { NominationsPanel } from '../components/NominationsPanel';
import { ElectionPanel } from '../components/ElectionPanel';
import { InquiryPanel } from '../components/InquiryPanel';
import { AttendancePanel } from '../components/attendance/AttendancePanel';
import { SpeakerQueuePanel } from '../components/chair';
import { ActionToolbar } from '../components/console/ActionToolbar';
import { ChairScriptLine } from '../components/console/ChairScriptLine';
import { ConsoleAgenda } from '../components/console/ConsoleAgenda';
import { ConsoleTopBar } from '../components/console/ConsoleTopBar';
import { CurrentItemLine } from '../components/console/CurrentItemLine';
import { JoinInfoCard } from '../components/console/JoinInfoCard';
import { MoreArea } from '../components/console/MoreArea';
import { VoteControl } from '../components/console/VoteControl';
import Modal from '../../../components/ui/Modal';

/**
 * The chair console (docs/design-brief.md, "The three screens"), for the chair and admins: a top
 * bar, a "Now" column (columns 1 to 8 at 1280px) and a side column (9 to 12)
 */
export function ChairConsole() {
  const { state, dispatch, currentUser, attendance, meetingCode } = useSocket();
  const [joinInfoOpen, setJoinInfoOpen] = useState(false);
  const { roster, error: rosterError } = useRoster(meetingCode);
  const eligible = useEligibleVoters(state.organizationId, roster);
  // Loaded again at the call to order and the adjournment, for the start time
  const packet = usePacket(meetingCode, state.meetingActive);
  const voteResult = useVoteResults(state.meetingLog);
  const sortedQueue = useSortedSpeakerQueue(
    state.speakerQueue,
    state.currentMotion,
    state.lastSpeakerStance,
    state,
  );

  // The presiding officer: the member in the chair, or the signed-in admin when there is none
  // (the server lets admins do everything a chair does)
  const presiding = state.members.find((m) => m.role === 'chair') ?? currentUser;
  const question = describeQuestion(state);
  const result = currentResult(state, voteResult);
  const beforeMeeting = !state.meetingActive && state.meetingStage !== 'adjourned';
  const showElection =
    !!state.currentElection || (!state.nominationsOpen && !!state.currentNominationPosition);
  const empty = beforeMeeting
    ? 'The meeting has not been called to order.'
    : state.meetingStage === 'adjourned'
      ? 'The meeting is adjourned.'
      : 'No question is pending.';

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <ConsoleTopBar
        state={state}
        attendance={attendance}
        eligible={eligible}
        startedAt={packet?.startedAt ?? null}
        meetingCode={meetingCode}
        onJoinInfo={() => setJoinInfoOpen(true)}
      />
      <ActiveSuspensionsBanner
        state={state}
        currentUser={presiding ?? undefined}
        dispatch={dispatch}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          {beforeMeeting && <JoinInfoCard code={meetingCode} />}
          <CurrentItemLine item={state.currentAgendaItem} packet={packet} />
          <QuestionCard question={question} empty={empty}>
            <ActionToolbar
              actions={chairActions(state, presiding?.id ?? null)}
              dispatch={dispatch}
            />
            <ChairScriptLine state={state} />
          </QuestionCard>
          {result && (
            <section aria-label="The result" className="card p-6">
              <Stamp
                key={result.key}
                outcome={result.outcome}
                subject={result.subject}
                tally={result.tally}
              />
            </section>
          )}
          <VoteControl state={state} dispatch={dispatch} me={currentUser} />
          <SpeakerQueuePanel state={state} dispatch={dispatch} sortedQueue={sortedQueue} />
        </div>

        <div className="space-y-4 xl:col-span-4">
          <AttendancePanel
            state={state}
            dispatch={dispatch}
            summary={attendance}
            roster={roster}
            rosterError={rosterError}
            eligible={eligible}
          />
          <ConsoleAgenda state={state} dispatch={dispatch} />
          {currentUser && (
            <NominationsPanel state={state} dispatch={dispatch} currentUser={currentUser} isChair />
          )}
          {currentUser && showElection && (
            <ElectionPanel state={state} dispatch={dispatch} currentUser={currentUser} isChair />
          )}
          {presiding && (
            <InquiryPanel state={state} dispatch={dispatch} currentUser={presiding} isChair />
          )}
          <MoreArea
            state={state}
            dispatch={dispatch}
            me={currentUser}
            meetingCode={meetingCode}
            organizationId={state.organizationId}
          />
        </div>
      </div>

      <Modal
        isOpen={joinInfoOpen}
        onClose={() => setJoinInfoOpen(false)}
        title="Join this meeting"
        size="lg"
      >
        <JoinInfoCard code={meetingCode} qrSize={240} />
      </Modal>
    </div>
  );
}
```

- [ ] **Step 7: Replace `frontend-unified/src/modules/meetings/views/MeetingApp.tsx`**

```tsx
import { useSocket } from '../context/SocketContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChairConsole } from './ChairConsole';
import { ParticipantView } from './ParticipantView';

/**
 * The screen for the user's role in the meeting, as the server derived it: the console for the
 * chair and admins, the participant's screen for members and guests
 */
export function MeetingApp() {
  const { state, dispatch, currentUser, myRole } = useSocket();
  const presides = myRole === 'chair' || myRole === 'admin';
  return (
    <ErrorBoundary>
      {presides ? (
        <ChairConsole />
      ) : (
        currentUser && (
          <ParticipantView state={state} dispatch={dispatch} currentUser={currentUser} />
        )
      )}
    </ErrorBoundary>
  );
}
```

- [ ] **Step 8: Delete what the console replaces**

Run:

```bash
git rm frontend-unified/src/modules/meetings/views/ChairView.tsx frontend-unified/src/modules/meetings/views/AdminView.tsx frontend-unified/src/modules/meetings/views/__tests__/ChairView.test.tsx frontend-unified/src/modules/meetings/views/__tests__/AdminView.test.tsx frontend-unified/src/modules/meetings/components/chair/VotingPanel.tsx frontend-unified/src/modules/meetings/components/chair/__tests__/VotingPanel.test.tsx frontend-unified/src/modules/meetings/components/chair/PendingMotionPanel.tsx frontend-unified/src/modules/meetings/components/chair/__tests__/PendingMotionPanel.test.tsx frontend-unified/src/modules/meetings/components/chair/PendingSecondPanel.tsx frontend-unified/src/modules/meetings/components/chair/UnanimousConsentPanel.tsx frontend-unified/src/modules/meetings/components/chair/MeetingControlPanel.tsx frontend-unified/src/modules/meetings/components/chair/ChairScriptPanel.tsx frontend-unified/src/modules/meetings/components/chair/AgendaPanel.tsx frontend-unified/src/modules/meetings/components/chair/MotionStackPanel.tsx frontend-unified/src/modules/meetings/components/admin/MembersPanel.tsx frontend-unified/src/modules/meetings/components/admin/RoleChangeModal.tsx frontend-unified/src/modules/meetings/components/admin/TimeLimitsPanel.tsx frontend-unified/src/modules/meetings/components/admin/MeetingSettingsPanel.tsx
```

Expected: 18 `rm` lines.

Replace `frontend-unified/src/modules/meetings/components/chair/index.ts` with:

```ts
export { OrderOfBusinessPanel } from './OrderOfBusinessPanel';
export { SpeakerQueuePanel } from './SpeakerQueuePanel';
export { MinutesApprovalPanel } from './MinutesApprovalPanel';
export { CommitteeReportsPanel } from './CommitteeReportsPanel';
export { ProxyManagementPanel } from './ProxyManagementPanel';
export { MeetingDocumentsPanel } from './MeetingDocumentsPanel';
```

Replace `frontend-unified/src/modules/meetings/components/admin/index.ts` with:

```ts
export { RenameModal } from './RenameModal';
```

Then check nothing still imports what was deleted:

Run: `grep -rnE "ChairView|AdminView|chair/(VotingPanel|PendingMotionPanel|PendingSecondPanel|UnanimousConsentPanel|MeetingControlPanel|ChairScriptPanel|AgendaPanel|MotionStackPanel)|MembersPanel|RoleChangeModal|TimeLimitsPanel|MeetingSettingsPanel" frontend-unified/src`
Expected: no output.

- [ ] **Step 9: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/components/__tests__/NominationsPanel.test.tsx src/modules/meetings/components/__tests__/ElectionPanel.test.tsx src/modules/meetings/components/console/__tests__/MoreArea.test.tsx src/modules/meetings/views/__tests__/ChairConsole.test.tsx src/modules/meetings/views/__tests__/ParticipantView.test.tsx`
Expected: all pass: `NominationsPanel` 5, `ElectionPanel` 5, `MoreArea` 5, `ChairConsole` 6, `ParticipantView` 2.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings
git add frontend-unified/src/modules/meetings
git commit -m "feat(web): the chair console

The chair and admins run the meeting from one console: a top bar, the Now
column (the question card with only the actions in order, the stamp, the vote
panel, the speaker queue) and a side column (attendance, the agenda,
nominations and elections, inquiries, and More). Nominations open from the
console at any time, for nominees in the room or named, and elections take
paper ballots. The admin view and the old chair panels are gone."
```

(`git rm` in Step 8 already staged the deletions.)

---

### Task 6: The phone view

**Files:**

- Create: `frontend-unified/src/modules/meetings/utils/phoneMoment.ts`, `components/phone/PhoneHeader.tsx`, `components/phone/VoteBlock.tsx`, `components/phone/DebateBlock.tsx`, `components/phone/MotionPanel.tsx`, `components/phone/ActionBlock.tsx`, `components/phone/MeetingLists.tsx`, `views/PhoneView.tsx` (paths under `frontend-unified/src/modules/meetings/`)
- Replace: `views/MeetingApp.tsx`, `components/participant/index.ts`
- Modify: `frontend-unified/index.html`
- Delete: `views/ParticipantView.tsx`, `views/__tests__/ParticipantView.test.tsx`, `components/participant/VotingPanel.tsx`, `components/participant/CurrentBusinessPanel.tsx`, `components/participant/PendingSecondSection.tsx`, `components/participant/SpeakerRecognitionPanel.tsx`, `components/participant/VoteResultsPanel.tsx`, `components/QuorumWarning.tsx`, `components/MotionCard.tsx`
- Test: `utils/__tests__/phoneMoment.test.ts`, `views/__tests__/PhoneView.test.tsx` (new)

The brief's phone view, for members and guests from 360px up: one column, a sticky header (the meeting's title and the current item, and a Guest badge for guests), the question card at 1.5rem, then exactly one action block for the moment, then the speaker queue, the agenda and the last result. `phoneMoment(state)` decides the moment:

| Moment       | When                                  | The block                                                                           |
| ------------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `lobby`      | Not yet called to order               | A line saying so, and who chairs                                                    |
| `vote`       | A vote is open on devices             | Three 56px buttons (Yea, Nay, Abstain; Aye and No for a roll call), and proxy votes |
| `voice-vote` | A voice vote is open                  | "Answer aloud in the room"                                                          |
| `ballot`     | An election's ballot is open          | The ballot                                                                          |
| `nominate`   | Nominations are open                  | Nominate                                                                            |
| `second`     | A motion awaits a second              | Second (or, for the mover, a line saying someone else must)                         |
| `consent`    | The chair asked for unanimous consent | Object                                                                              |
| `agenda`     | The agenda's adoption is pending      | Object to the agenda                                                                |
| `debate`     | A debatable motion is pending         | Raise hand with For, Against or Neutral; other motions folded                       |
| `motion`     | Nothing debatable is pending          | Make a motion                                                                       |
| `adjourned`  | Adjourned                             | A line saying so                                                                    |

Guests see none of these: they get "Request the floor" (a raised hand, neutral) and "Ask the chair" (an inquiry), the only things the server lets them do besides following. A member who has the floor sees "You have the floor" with the timer line and "Yield the floor" above the question. A secret ballot's choices never reach the phone (the server strips them), so "Vote recorded" comes from `voters`. Buttons are 56px, and the page keeps clear of the iPhone home indicator: `env(safe-area-inset-bottom)` needs `viewport-fit=cover`, which `index.html` gains.

`MotionPanel` is the participant view's motion logic, moved: the motion selector, the special forms (amend the agenda, amend the bylaws, suspend the rules, take from the table, reconsider), and `MAKE_MOTION` in the member's name. One change: the reconsider form lists only the decided motions that can be reconsidered (`reconsiderable !== false`), now that every decided motion is recorded. The participant view and the panels only it used are deleted, with `QuorumWarning` (the console's chip and the attendance block replace it) and `MotionCard` (the question card replaces it).

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/modules/meetings/utils/__tests__/phoneMoment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { phoneMoment } from '../phoneMoment';

const motion = (key: string): Motion => ({
  ...MOTIONS[key],
  id: 1,
  type: key,
  text: 'Approve the pool contract',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
});

const active: MeetingState = { ...initialState, meetingActive: true, agendaAdopted: true };

describe('phoneMoment', () => {
  it.each<[string, MeetingState, string]>([
    ['before the call to order', initialState, 'lobby'],
    ['after the adjournment', { ...initialState, meetingStage: 'adjourned' }, 'adjourned'],
    ['while the agenda awaits adoption', { ...active, agendaAdopted: false }, 'agenda'],
    ['with nothing pending', active, 'motion'],
    [
      'while a motion awaits a second',
      { ...active, pendingSecond: motion('mainMotion') },
      'second',
    ],
    [
      'while a debatable motion is pending',
      { ...active, currentMotion: motion('mainMotion') },
      'debate',
    ],
    [
      'while an undebatable motion is pending',
      { ...active, currentMotion: motion('previousQuestion') },
      'motion',
    ],
    [
      'while the chair asks for unanimous consent',
      { ...active, currentMotion: motion('mainMotion'), unanimousConsentPending: true },
      'consent',
    ],
    [
      'while a vote is open',
      { ...active, currentMotion: motion('mainMotion'), votingOpen: true },
      'vote',
    ],
    [
      'while a voice vote is open',
      { ...active, currentMotion: motion('mainMotion'), votingOpen: true, votingMethod: 'voice' },
      'voice-vote',
    ],
    [
      'while nominations are open',
      { ...active, nominationsOpen: true, currentNominationPosition: 'Director' },
      'nominate',
    ],
  ])('asks for one thing %s', (_when, state, moment) => {
    expect(phoneMoment(state)).toBe(moment);
  });
});
```

Create `frontend-unified/src/modules/meetings/views/__tests__/PhoneView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Member, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  currentUser: null as unknown as Member,
  dispatch: vi.fn(),
}));
vi.mock('../../context/SocketContext', () => ({ useSocket: () => socket }));

const { PhoneView } = await import('../PhoneView');

const dana: Member = {
  id: 2,
  name: 'Dana Okafor',
  role: 'chair',
  present: true,
  presentBy: 'device',
};
const alice: Member = {
  id: 3,
  name: 'Alice Brennan',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const ben: Member = {
  id: 4,
  name: 'Ben Whitaker',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const sam: Member = {
  id: 11,
  name: 'Sam Ortiz',
  role: 'guest',
  present: true,
  presentBy: 'device',
};
const motion: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Resurface the pool this spring',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
};
const active: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  title: 'Special meeting',
  meetingActive: true,
  agendaAdopted: true,
  members: [dana, alice, ben, sam],
};
const voting: MeetingState = {
  ...active,
  currentMotion: motion,
  motionStack: [motion],
  votingOpen: true,
};

function renderAs(me: Member, state: MeetingState) {
  socket.currentUser = me;
  socket.state = state;
  return render(<PhoneView />);
}

describe('PhoneView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the question and three vote buttons while the vote is open, and nothing else to do', () => {
    renderAs(ben, voting);
    expect(screen.getByRole('heading', { name: 'Special meeting' })).toBeTruthy();
    expect(screen.getByText('Resurface the pool this spring')).toBeTruthy();
    for (const name of ['Vote yea', 'Vote nay', 'Vote abstain']) {
      expect(screen.getByRole('button', { name }).className).toContain('btn-lg');
    }
    expect(screen.queryByRole('button', { name: 'Raise hand' })).toBeNull();
    expect(screen.queryByLabelText('Motion text')).toBeNull();
  });

  it('votes, and says the vote was recorded', () => {
    renderAs(ben, voting);
    fireEvent.click(screen.getByRole('button', { name: 'Vote yea' }));
    expect(socket.dispatch).toHaveBeenCalledWith({ type: 'CAST_VOTE', vote: 'yea', voterId: 4 });
  });

  it('says a secret ballot was recorded without showing the choice', () => {
    renderAs(ben, { ...voting, votingMethod: 'ballot', voters: [4], voterChoices: {} });
    expect(screen.getByText('Vote recorded')).toBeTruthy();
  });

  it('seconds a motion someone else moved, and tells the mover to wait', () => {
    const awaiting = { ...active, pendingSecond: { ...motion, secondedBy: null } };
    const { unmount } = renderAs(ben, awaiting);
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SECOND_MOTION', seconder: 'Ben Whitaker' }),
    );
    unmount();

    renderAs(alice, awaiting);
    expect(screen.queryByRole('button', { name: 'Second' })).toBeNull();
    expect(screen.getByText('You moved this. Another member must second it.')).toBeTruthy();
  });

  it('raises a hand with a position during debate', () => {
    renderAs(ben, { ...active, currentMotion: motion, motionStack: [motion] });
    fireEvent.click(screen.getByRole('button', { name: 'Against' }));
    fireEvent.click(screen.getByRole('button', { name: 'Raise hand' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RAISE_HAND', stance: 'con' }),
    );
  });

  it('makes a motion when nothing is pending', () => {
    renderAs(alice, active);
    fireEvent.change(screen.getByLabelText('Motion text'), {
      target: { value: 'I move that we resurface the pool' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Motion' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MAKE_MOTION',
        motionType: 'mainMotion',
        text: 'I move that we resurface the pool',
        moverId: 3,
      }),
    );
  });

  it('lets a member nominate while nominations are open', () => {
    renderAs(alice, { ...active, nominationsOpen: true, currentNominationPosition: 'Treasurer' });
    expect(screen.getByLabelText('Nominee')).toBeTruthy();
  });

  it('lets a member cast a ballot in an election', () => {
    renderAs(alice, {
      ...active,
      currentElection: {
        id: 1,
        position: 'Treasurer',
        candidates: [{ name: 'Alice', id: 3 }],
        requiredVotes: 'majority',
        votingInProgress: true,
        ballotResults: { Alice: 0 },
        votersWhoVoted: [],
        elected: null,
      },
    });
    expect(screen.getByRole('button', { name: 'Vote for Alice' })).toBeTruthy();
  });

  it('gives a guest a Guest badge, Request the floor and Ask the chair, and no vote', () => {
    renderAs(sam, voting);
    expect(screen.getByText('Guest')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Vote / })).toHaveLength(0);
    expect(screen.getByText('Ask the chair')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Request the floor' }));
    expect(socket.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RAISE_HAND', stance: 'neutral' }),
    );
  });

  it('shows the last result with both parts', () => {
    renderAs(ben, {
      ...active,
      meetingLog: [
        {
          time: '7:41:00 PM',
          message: 'Chair puts the question: "Resurface the pool this spring"',
        },
        {
          time: '7:45:00 PM',
          message: 'Vote: Yea 11, Nay 2. CARRIED. On devices 2 to 0, in the room 9 to 2.',
        },
      ],
    });
    expect(screen.getByText('Carried')).toBeTruthy();
    expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
  });

  it('keeps clear of the home indicator on a phone', () => {
    const { container } = renderAs(ben, active);
    expect((container.firstChild as HTMLElement).className).toContain('safe-area-inset-bottom');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/utils/__tests__/phoneMoment.test.ts src/modules/meetings/views/__tests__/PhoneView.test.tsx`
Expected: FAIL: `../phoneMoment` and `../PhoneView` don't exist.

- [ ] **Step 3: Create `frontend-unified/src/modules/meetings/utils/phoneMoment.ts`**

```ts
import type { DebateStance, MeetingState } from '@robbie-bylawyer/shared/types';

/** What the phone asks of its owner now: one thing at a time (docs/design-brief.md) */
export type PhoneMoment =
  | 'lobby'
  | 'adjourned'
  | 'voice-vote'
  | 'vote'
  | 'ballot'
  | 'nominate'
  | 'second'
  | 'consent'
  | 'agenda'
  | 'debate'
  | 'motion';

/** The moment for the phone's one action block, the most pressing first */
export function phoneMoment(state: MeetingState): PhoneMoment {
  if (state.meetingStage === 'adjourned') return 'adjourned';
  if (!state.meetingActive) return 'lobby';
  if (state.votingOpen) return state.votingMethod === 'voice' ? 'voice-vote' : 'vote';
  if (state.currentElection?.votingInProgress) return 'ballot';
  if (state.nominationsOpen) return 'nominate';
  if (state.pendingSecond) return 'second';
  if (state.unanimousConsentPending) return 'consent';
  if (!state.agendaAdopted && !state.agendaObjection && !state.currentMotion) return 'agenda';
  if (state.currentMotion?.debatable) return 'debate';
  return 'motion';
}

/** A speaker's position on the question, in words */
export const STANCE_LABELS: Record<DebateStance, string> = {
  pro: 'For',
  con: 'Against',
  neutral: 'Neutral',
};
```

- [ ] **Step 4: Create the phone's parts**

`frontend-unified/src/modules/meetings/components/phone/PhoneHeader.tsx`:

```tsx
import { RoleBadge } from '../../../../components/ui/Badge';

interface PhoneHeaderProps {
  title: string;
  /** The agenda item before the meeting */
  item: string | null;
  guest: boolean;
}

/** The phone's sticky header: the meeting, the current item, and a Guest badge for guests */
export function PhoneHeader({ title, item, guest }: PhoneHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-paper/95 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate font-serif-soft text-lg font-semibold text-ink">{title}</h2>
        {guest && <RoleBadge role="guest" />}
      </div>
      <p className="truncate text-sm text-ink-muted">{item ?? 'No item is before the meeting'}</p>
    </header>
  );
}
```

`frontend-unified/src/modules/meetings/components/phone/VoteBlock.tsx`:

```tsx
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { TimerLine } from '../TimerLine';

interface VoteBlockProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

const CHOICES = ['yea', 'nay', 'abstain'] as const;

/**
 * The vote on a phone: three 56px buttons, and the votes of members whose proxy this member
 * holds. A secret ballot's choices never reach the phone, so "Vote recorded" comes from voters.
 */
export function VoteBlock({ state, dispatch, me }: VoteBlockProps) {
  const method = state.votingMethod;
  const labels =
    method === 'rollcall'
      ? { yea: 'Aye', nay: 'No', abstain: 'Abstain' }
      : { yea: 'Yea', nay: 'Nay', abstain: 'Abstain' };
  const myVote = state.voterChoices[me.id];
  const voted = state.voters.includes(me.id);
  const held = state.allowProxyVoting ? state.proxies.filter((p) => p.grantedTo === me.id) : [];
  const proxyVotes = new Map(
    state.proxyVotes.filter((v) => v.castBy === me.id).map((v) => [v.memberId, v.vote]),
  );

  return (
    <div className="space-y-4">
      <p className="label-caps">
        {method === 'ballot'
          ? 'Secret ballot'
          : method === 'rollcall'
            ? 'Roll call vote'
            : 'Your vote'}
      </p>
      {method === 'ballot' && <p className="text-sm text-ink-muted">Nobody sees how you voted.</p>}
      {state.voteTimerEnd && (
        <TimerLine
          endTime={state.voteTimerEnd}
          totalSeconds={state.voteTimeLimit}
          label="Voting time"
        />
      )}
      <div role="group" aria-label="Your vote" className="grid grid-cols-3 gap-2">
        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={myVote === choice}
            aria-label={`Vote ${labels[choice].toLowerCase()}`}
            className={`${myVote === choice ? 'btn-primary' : 'btn-secondary'} btn-lg`}
            onClick={() => dispatch({ type: 'CAST_VOTE', vote: choice, voterId: me.id })}
          >
            {labels[choice]}
          </button>
        ))}
      </div>
      {voted && (
        <p role="status" className="text-center text-sm font-medium text-carried">
          {method === 'ballot'
            ? 'Vote recorded'
            : 'Vote recorded. You may change it until the vote closes.'}
        </p>
      )}
      {held.map((proxy) => {
        const cast = proxyVotes.get(proxy.grantedBy);
        return (
          <div key={proxy.id} className="space-y-2 border-t border-rule pt-3">
            <p className="text-sm text-ink">
              By proxy for <span className="font-medium">{proxy.grantedByName}</span>
              {proxy.scope === 'single-vote' && ' (this vote only)'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={cast === choice}
                  aria-label={`Vote ${labels[choice].toLowerCase()} for ${proxy.grantedByName}`}
                  className={`${cast === choice ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() =>
                    dispatch({
                      type: 'CAST_PROXY_VOTE',
                      vote: choice,
                      forMemberId: proxy.grantedBy,
                      castById: me.id,
                      timestamp: generateTimestamp(),
                    })
                  }
                >
                  {labels[choice]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

`frontend-unified/src/modules/meetings/components/phone/MotionPanel.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { generateId, generateTimestamp, getValidMotions } from '@robbie-bylawyer/shared/utils';
import type {
  MeetingAction,
  MeetingState,
  Member,
  MotionDefinition,
} from '@robbie-bylawyer/shared/types';
import { AgendaAmendmentForm } from '../AgendaAmendmentForm';
import { BylawAmendmentForm } from '../BylawAmendmentForm';
import { SuspendRulesForm } from '../SuspendRulesForm';
import { TakeFromTableForm } from '../TakeFromTableForm';
import { ReconsiderForm } from '../ReconsiderForm';
import { MotionSelector } from '../participant';

interface MotionPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

/** The motions that open a form of their own before they are made */
type FormMotion =
  'amendAgenda' | 'bylawAmendment' | 'suspendRules' | 'takeFromTable' | 'reconsider';
const FORM_MOTIONS: readonly string[] = [
  'amendAgenda',
  'bylawAmendment',
  'suspendRules',
  'takeFromTable',
  'reconsider',
];

type MotionDetails = Pick<
  Extract<MeetingAction, { type: 'MAKE_MOTION' }>,
  | 'agendaAmendment'
  | 'ruleSuspension'
  | 'bylawAmendment'
  | 'tabledMotionId'
  | 'reconsideredMotionId'
>;

/** Make a motion: the motions in order now, in the member's name */
export function MotionPanel({ state, dispatch, me }: MotionPanelProps) {
  const [motionText, setMotionText] = useState('');
  const [chosen, setChosen] = useState('mainMotion');
  const [form, setForm] = useState<FormMotion | null>(null);

  const validMotions = useMemo(() => getValidMotions(state, me.id), [state, me.id]);
  // The chosen motion while it is in order, else the first one that is
  const selectedMotion = validMotions.some((m) => m.key === chosen)
    ? chosen
    : (validMotions[0]?.key ?? chosen);
  const selectedMotionDef = MOTIONS[selectedMotion];
  const groupedMotions = useMemo(
    () =>
      validMotions.reduce<Record<string, Array<MotionDefinition & { key: string }>>>(
        (groups, motion) => {
          (groups[motion.category] ??= []).push(motion);
          return groups;
        },
        {},
      ),
    [validMotions],
  );
  // Every decided motion is recorded now; only some can be reconsidered (records from before the
  // flag existed were all of motions that can)
  const reconsiderable = useMemo(
    () => state.completedMotions.filter((m) => m.reconsiderable !== false),
    [state.completedMotions],
  );

  const move = (motionType: string, text: string, details: MotionDetails = {}) => {
    dispatch({
      type: 'MAKE_MOTION',
      motionType,
      text,
      mover: me.name,
      moverId: me.id,
      motionId: generateId(),
      timestamp: generateTimestamp(),
      ...details,
    });
    setForm(null);
  };

  const submit = () => {
    if (FORM_MOTIONS.includes(selectedMotion)) {
      setForm(selectedMotion as FormMotion);
      return;
    }
    move(selectedMotion, motionText || selectedMotionDef?.phrase || '');
    setMotionText('');
  };

  const cancel = () => setForm(null);

  return (
    <section aria-labelledby="motion-heading" className="space-y-3">
      <h3 id="motion-heading" className="label-caps">
        Make a motion
      </h3>
      {form === 'amendAgenda' ? (
        <AgendaAmendmentForm
          agenda={state.agenda}
          onSubmit={(text, agendaAmendment) => move('amendAgenda', text, { agendaAmendment })}
          onCancel={cancel}
        />
      ) : form === 'bylawAmendment' ? (
        <BylawAmendmentForm
          meetingCode={state.meetingCode || ''}
          onSubmit={(text, bylawAmendment) => move('bylawAmendment', text, { bylawAmendment })}
          onCancel={cancel}
        />
      ) : form === 'suspendRules' ? (
        <SuspendRulesForm
          onSubmit={(purpose, specificAction, scope, rule) =>
            move(
              'suspendRules',
              `I move to suspend the rules (${rule}) for the following purpose: ${purpose}. Specific action: ${specificAction}`,
              { ruleSuspension: { rule, purpose, specificAction, scope } },
            )
          }
          onCancel={cancel}
        />
      ) : form === 'takeFromTable' ? (
        <TakeFromTableForm
          tabledMotions={state.tabledMotions}
          onSubmit={(text, tabledMotionId) => move('takeFromTable', text, { tabledMotionId })}
          onCancel={cancel}
        />
      ) : form === 'reconsider' ? (
        <ReconsiderForm
          completedMotions={reconsiderable}
          currentUserId={me.id}
          onSubmit={(text, reconsideredMotionId) =>
            move('reconsider', text, { reconsideredMotionId })
          }
          onCancel={cancel}
        />
      ) : (
        <MotionSelector
          selectedMotion={selectedMotion}
          setSelectedMotion={setChosen}
          selectedMotionDef={selectedMotionDef}
          motionText={motionText}
          setMotionText={setMotionText}
          groupedMotions={groupedMotions}
          onSubmit={submit}
        />
      )}
    </section>
  );
}
```

`frontend-unified/src/modules/meetings/components/phone/DebateBlock.tsx`:

```tsx
import { useState } from 'react';
import type {
  DebateStance,
  MeetingAction,
  MeetingState,
  Member,
} from '@robbie-bylawyer/shared/types';
import { STANCE_LABELS } from '../../utils/phoneMoment';
import { MotionPanel } from './MotionPanel';

interface DebateBlockProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

const STANCES: DebateStance[] = ['pro', 'con', 'neutral'];

/** Debate on a phone: raise a hand with a position, or lower it; other motions are folded away */
export function DebateBlock({ state, dispatch, me }: DebateBlockProps) {
  const [stance, setStance] = useState<DebateStance>('neutral');
  const queued = state.speakerQueue.find((entry) => entry.member.id === me.id);
  const place = queued ? state.speakerQueue.indexOf(queued) + 1 : 0;

  return (
    <div className="space-y-4">
      {queued ? (
        <>
          <p role="status" className="text-ink">
            Hand raised: {place} of {state.speakerQueue.length} waiting,{' '}
            {STANCE_LABELS[queued.stance].toLowerCase()}.
          </p>
          <button
            type="button"
            className="btn-secondary btn-lg w-full"
            onClick={() => dispatch({ type: 'LOWER_HAND', member: me })}
          >
            Lower your hand
          </button>
        </>
      ) : (
        <>
          <div>
            <p className="label-caps mb-2">Your position</p>
            <div role="group" aria-label="Your position" className="grid grid-cols-3 gap-2">
              {STANCES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={stance === option}
                  className={stance === option ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setStance(option)}
                >
                  {STANCE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn-primary btn-lg w-full"
            onClick={() => dispatch({ type: 'RAISE_HAND', member: me, stance })}
          >
            Raise hand
          </button>
        </>
      )}
      <details className="rounded-lg border border-rule">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
          Other motions
        </summary>
        <div className="border-t border-rule p-4">
          <MotionPanel state={state} dispatch={dispatch} me={me} />
        </div>
      </details>
    </div>
  );
}
```

`frontend-unified/src/modules/meetings/components/phone/ActionBlock.tsx`:

```tsx
import type { ReactNode } from 'react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { phoneMoment, type PhoneMoment } from '../../utils/phoneMoment';
import { NominationsPanel } from '../NominationsPanel';
import { ElectionPanel } from '../ElectionPanel';
import { InquiryPanel } from '../InquiryPanel';
import { UnanimousConsentSection } from '../participant';
import { VoteBlock } from './VoteBlock';
import { DebateBlock } from './DebateBlock';
import { MotionPanel } from './MotionPanel';

interface ActionBlockProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

function Note({ children }: { children: ReactNode }) {
  return <div className="space-y-1 text-ink-muted">{children}</div>;
}

/** The one thing the phone asks of its owner now */
export function ActionBlock({ state, dispatch, me }: ActionBlockProps) {
  const moment = phoneMoment(state);
  if (me.role === 'guest') {
    return <GuestBlock state={state} dispatch={dispatch} me={me} moment={moment} />;
  }

  switch (moment) {
    case 'lobby': {
      const chair = state.members.find((m) => m.role === 'chair');
      return (
        <Note>
          <p>The meeting has not been called to order yet.</p>
          {chair && <p>{chair.name} chairs it.</p>}
        </Note>
      );
    }
    case 'adjourned':
      return (
        <Note>
          <p>The meeting is adjourned.</p>
        </Note>
      );
    case 'voice-vote':
      return (
        <Note>
          <p>This is a voice vote: answer aloud in the room.</p>
        </Note>
      );
    case 'vote':
      return <VoteBlock state={state} dispatch={dispatch} me={me} />;
    case 'ballot':
      return <ElectionPanel state={state} dispatch={dispatch} currentUser={me} />;
    case 'nominate':
      return <NominationsPanel state={state} dispatch={dispatch} currentUser={me} />;
    case 'second':
      return state.pendingSecond?.moverId === me.id ? (
        <Note>
          <p>You moved this. Another member must second it.</p>
        </Note>
      ) : (
        <button
          type="button"
          className="btn-primary btn-lg w-full"
          onClick={() =>
            dispatch({ type: 'SECOND_MOTION', seconder: me.name, timestamp: generateTimestamp() })
          }
        >
          Second
        </button>
      );
    case 'consent':
      return <UnanimousConsentSection state={state} dispatch={dispatch} currentUser={me} />;
    case 'agenda':
      return (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            The chair asks whether anyone objects to adopting the agenda. Without an objection, it
            is adopted.
          </p>
          <button
            type="button"
            className="btn-secondary btn-lg w-full"
            onClick={() => dispatch({ type: 'AGENDA_OBJECTION', timestamp: generateTimestamp() })}
          >
            Object to the agenda
          </button>
        </div>
      );
    case 'debate':
      return <DebateBlock state={state} dispatch={dispatch} me={me} />;
    case 'motion':
      return <MotionPanel state={state} dispatch={dispatch} me={me} />;
  }
}

/**
 * A guest follows the meeting, asks for the floor and asks the chair a question: the only things
 * the server lets a guest do
 */
function GuestBlock({ state, dispatch, me, moment }: ActionBlockProps & { moment: PhoneMoment }) {
  if (moment === 'lobby' || moment === 'adjourned') {
    return (
      <Note>
        <p>
          {moment === 'lobby'
            ? 'The meeting has not been called to order yet.'
            : 'The meeting is adjourned.'}
        </p>
      </Note>
    );
  }
  const waiting = state.speakerQueue.some((entry) => entry.member.id === me.id);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        You are a guest: you can follow the meeting, ask to speak and ask the chair a question.
        Guests don&apos;t move, second or vote.
      </p>
      {waiting ? (
        <button
          type="button"
          className="btn-secondary btn-lg w-full"
          onClick={() => dispatch({ type: 'LOWER_HAND', member: me })}
        >
          Withdraw the request
        </button>
      ) : (
        <button
          type="button"
          className="btn-primary btn-lg w-full"
          onClick={() => dispatch({ type: 'RAISE_HAND', member: me, stance: 'neutral' })}
        >
          Request the floor
        </button>
      )}
      <details className="rounded-lg border border-rule">
        <summary className="cursor-pointer list-none px-4 py-3 text-center font-medium text-ink">
          Ask the chair
        </summary>
        <div className="border-t border-rule p-4">
          <InquiryPanel state={state} dispatch={dispatch} currentUser={me} isChair={false} />
        </div>
      </details>
    </div>
  );
}
```

`frontend-unified/src/modules/meetings/components/phone/MeetingLists.tsx`:

```tsx
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { STANCE_LABELS } from '../../utils/phoneMoment';
import { TimerLine } from '../TimerLine';

/** Who has the floor and who is waiting */
export function SpeakerList({ state }: { state: MeetingState }) {
  if (!state.recognizedSpeaker && state.speakerQueue.length === 0) return null;
  return (
    <section className="card space-y-3 p-4" aria-labelledby="speakers-heading">
      <h3 id="speakers-heading" className="label-caps">
        Speakers
      </h3>
      {state.recognizedSpeaker && (
        <div className="space-y-1">
          <p className="text-sm text-ink">
            <span className="font-medium">{state.recognizedSpeaker.name}</span> has the floor
          </p>
          <TimerLine
            endTime={state.speakerTimerEnd}
            totalSeconds={state.speakerTimeLimit}
            label="Speaking time"
          />
        </div>
      )}
      {state.speakerQueue.length > 0 && (
        <ol className="space-y-1 text-sm text-ink">
          {state.speakerQueue.map((entry, index) => (
            <li key={entry.member.id}>
              {index + 1}. {entry.member.name}{' '}
              <span className="text-ink-muted">({STANCE_LABELS[entry.stance]})</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The agenda, read only, with the current item marked */
export function PhoneAgenda({ state }: { state: MeetingState }) {
  if (state.agenda.length === 0) return null;
  return (
    <section className="card space-y-2 p-4" aria-labelledby="phone-agenda-heading">
      <h3 id="phone-agenda-heading" className="label-caps">
        Agenda
      </h3>
      <ol className="space-y-1">
        {state.agenda.map((item, index) => (
          <li
            key={item.id}
            className={`text-sm ${
              item.status === 'completed'
                ? 'text-ink-muted line-through'
                : item.status === 'active'
                  ? 'border-l-2 border-gavel pl-2 font-medium text-ink'
                  : 'text-ink'
            }`}
          >
            {item.status === 'active' && <span className="sr-only">Current item: </span>}
            {index + 1}. {item.title}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: Create `frontend-unified/src/modules/meetings/views/PhoneView.tsx`**

```tsx
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { useSocket } from '../context/SocketContext';
import { useVoteResults } from '../hooks/useVoteResults';
import { currentResult, describeQuestion, voteResultView } from '../utils/question';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { TimerLine } from '../components/TimerLine';
import { InquiryPanel } from '../components/InquiryPanel';
import { ProxyAcceptancePanel, ProxyRequestPanel } from '../components/participant';
import { PhoneHeader } from '../components/phone/PhoneHeader';
import { ActionBlock } from '../components/phone/ActionBlock';
import { PhoneAgenda, SpeakerList } from '../components/phone/MeetingLists';

/**
 * The phone view (docs/design-brief.md, "The three screens"), for members and guests: what is
 * happening now, the one thing to do about it, then the queue, the agenda and the last result
 */
export function PhoneView() {
  const { state, dispatch, currentUser } = useSocket();
  const voteResult = useVoteResults(state.meetingLog);
  if (!currentUser) return null;

  const me = currentUser;
  const guest = me.role === 'guest';
  const question = describeQuestion(state);
  // The latest decision stays below the action block until the next vote opens
  const result =
    currentResult(state, voteResult) ??
    (voteResult && !state.votingOpen ? voteResultView(voteResult) : null);
  const hasFloor = state.recognizedSpeaker?.id === me.id;
  const empty =
    state.meetingStage === 'adjourned'
      ? 'The meeting is adjourned.'
      : !state.meetingActive
        ? 'Nothing is before the meeting yet.'
        : 'No question is pending.';

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <PhoneHeader
        title={state.title || 'Live meeting'}
        item={state.currentAgendaItem?.title ?? null}
        guest={guest}
      />
      {!guest && <ProxyAcceptancePanel state={state} dispatch={dispatch} currentUser={me} />}
      {hasFloor && <FloorBanner state={state} dispatch={dispatch} />}
      <QuestionCard question={question} size="phone" empty={empty} />
      <section aria-label="Your part" className="card p-4">
        <ActionBlock state={state} dispatch={dispatch} me={me} />
      </section>
      <SpeakerList state={state} />
      <PhoneAgenda state={state} />
      {result && (
        <section aria-label="Last result" className="card p-4">
          <Stamp
            key={result.key}
            outcome={result.outcome}
            subject={result.subject}
            tally={result.tally}
            size="phone"
          />
        </section>
      )}
      {!guest && <ProxyRequestPanel state={state} dispatch={dispatch} currentUser={me} />}
      {!guest && (
        <InquiryPanel state={state} dispatch={dispatch} currentUser={me} isChair={false} />
      )}
    </div>
  );
}

/** For the member the chair recognized: their time, and Yield the floor */
function FloorBanner({
  state,
  dispatch,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  return (
    <section aria-label="You have the floor" className="card space-y-3 border-carried p-4">
      <p className="font-serif-soft text-lg font-semibold text-ink">You have the floor</p>
      <TimerLine
        endTime={state.speakerTimerEnd}
        totalSeconds={state.speakerTimeLimit}
        label="Your time"
      />
      <button
        type="button"
        className="btn-secondary w-full"
        onClick={() => dispatch({ type: 'YIELD_FLOOR', timestamp: generateTimestamp() })}
      >
        Yield the floor
      </button>
    </section>
  );
}
```

- [ ] **Step 6: The screen for the role, and the safe area**

Replace `frontend-unified/src/modules/meetings/views/MeetingApp.tsx` with:

```tsx
import { useSocket } from '../context/SocketContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChairConsole } from './ChairConsole';
import { PhoneView } from './PhoneView';

/**
 * The screen for the user's role in the meeting, as the server derived it: the console for the
 * chair and admins, the phone view for members and guests
 */
export function MeetingApp() {
  const { myRole } = useSocket();
  const presides = myRole === 'chair' || myRole === 'admin';
  return <ErrorBoundary>{presides ? <ChairConsole /> : <PhoneView />}</ErrorBoundary>;
}
```

In `frontend-unified/index.html`, replace:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

with:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 7: Delete what the phone view replaces**

Run:

```bash
git rm frontend-unified/src/modules/meetings/views/ParticipantView.tsx frontend-unified/src/modules/meetings/views/__tests__/ParticipantView.test.tsx frontend-unified/src/modules/meetings/components/participant/VotingPanel.tsx frontend-unified/src/modules/meetings/components/participant/CurrentBusinessPanel.tsx frontend-unified/src/modules/meetings/components/participant/PendingSecondSection.tsx frontend-unified/src/modules/meetings/components/participant/SpeakerRecognitionPanel.tsx frontend-unified/src/modules/meetings/components/participant/VoteResultsPanel.tsx frontend-unified/src/modules/meetings/components/QuorumWarning.tsx frontend-unified/src/modules/meetings/components/MotionCard.tsx
```

Expected: 9 `rm` lines. (The two `ParticipantView` tests live on in `PhoneView.test.tsx`: nominating and casting a ballot.)

Replace `frontend-unified/src/modules/meetings/components/participant/index.ts` with:

```ts
export { ProxyRequestPanel } from './ProxyRequestPanel';
export { ProxyAcceptancePanel } from './ProxyAcceptancePanel';
export { UnanimousConsentSection } from './UnanimousConsentSection';
export { MotionSelector } from './MotionSelector';
```

Run: `grep -rnE "ParticipantView|CurrentBusinessPanel|PendingSecondSection|SpeakerRecognitionPanel|VoteResultsPanel|participant/VotingPanel|QuorumWarning|MotionCard" frontend-unified/src`
Expected: no output.

- [ ] **Step 8: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/utils/__tests__/phoneMoment.test.ts src/modules/meetings/views/__tests__/PhoneView.test.tsx`
Expected: all pass: `phoneMoment` 11, `PhoneView` 11.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings frontend-unified/index.html
git add frontend-unified/src/modules/meetings frontend-unified/index.html
git commit -m "feat(web): the phone view

Members and guests get one column: a sticky header, the question card, one
action block for the moment (three 56px vote buttons, Second, Raise hand with
a position, Nominate, the ballot, Make a motion), then the queue, the agenda
and the last result. Guests can request the floor and ask the chair, and have
a Guest badge. Reconsider lists only what can be reconsidered. The
participant view and its panels are gone."
```

---

### Task 7: The display view

**Files:**

- Create: `frontend-unified/src/modules/meetings/display.tsx`, `frontend-unified/src/modules/meetings/views/DisplayView.tsx`
- Modify: `frontend-unified/src/App.tsx`
- Test: `frontend-unified/src/modules/meetings/views/__tests__/DisplayView.test.tsx` (new)

`/meetings/:code/display`, for the TV or projector: the chair opens it from the console's Display button (a new window, dragged to the external screen). It is its own route in `App.tsx`, next to the app's layout rather than inside it (no sidebar, no header), still behind `RequireSession` (the server allows a display to viewers and above in the meeting's organization) and inside `OrganizationProvider`, which gives it the organization's name and number of voting members. React Router ranks `/meetings/:code/display` above `meetings/*`, so the meetings module never sees it.

It joins as a display (`SocketProvider` with `display`), so it is nobody in the meeting and counts toward nothing. It is always the evening palette (its root carries `.dark`, which flips every token beneath it: the `@theme inline` mechanism from the UI foundation plan) over the brief's paper grain (an SVG noise at 4% opacity). Nothing on it is interactive; a hint about full screen shows for its first 10 seconds. Its three states:

- **Before the meeting:** the organization and the title, "Join at" with the link, the code, the QR code (360px, on its white tile), and the attendance block.
- **In session:** the current item in muted ink, the question card at 72px (or the stamp, which takes over the center when a result lands and stays until the next question), the chair's request for unanimous consent or latest ruling, a left rail with the speaker and the timer and who is waiting when there is debate, and a bottom band with attendance and the vote in progress (votes received, and the count in the room once entered; for a secret ballot only the number of ballots).
- **Adjourned:** "Adjourned at 8:42 PM", how many things were decided, and where the minutes will be.

- [ ] **Step 1: Write the failing test**

Create `frontend-unified/src/modules/meetings/views/__tests__/DisplayView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';

const socket = vi.hoisted(() => ({
  state: null as unknown as MeetingState,
  isConnected: true,
  joinError: null as { message: string; code: string | null } | null,
}));
vi.mock('../../context/SocketContext', () => ({
  useSocket: () => ({
    state: socket.state,
    isConnected: socket.isConnected,
    joinError: socket.joinError,
    meetingCode: 'MAPLE1',
    attendance: attendanceSummary(socket.state),
  }),
}));
vi.mock('../../context/OrganizationBridge', () => ({
  useMeetingOrganization: () => ({
    availableOrganizations: [{ id: 'org-1', name: 'Maple Grove HOA', eligibleVoters: 142 }],
  }),
}));
vi.mock('../../hooks/useRoster', () => ({ useRoster: () => ({ roster: null, error: null }) }));
vi.mock('../../components/QrCode', () => ({
  QrCode: ({ label, size }: { label: string; size: number }) => <img alt={label} width={size} />,
}));

const { DisplayView } = await import('../DisplayView');

const motion: Motion = {
  ...MOTIONS.mainMotion,
  id: 1,
  type: 'mainMotion',
  text: 'Resurface the pool this spring',
  mover: 'Alice Brennan',
  moverId: 3,
  secondedBy: 'Ben Whitaker',
  status: 'active',
};

const scheduled: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  organizationId: 'org-1',
  title: '2026 Annual Meeting',
  quorum: 29,
  headcount: 3,
  members: [
    { id: 2, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
    { id: 3, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'device' },
    { id: 4, name: 'Ben Whitaker', role: 'member', present: true, presentBy: 'device' },
  ],
};
const inSession: MeetingState = {
  ...scheduled,
  meetingActive: true,
  meetingStage: 'unfinished-business',
  agendaAdopted: true,
  currentAgendaItem: { id: 4, title: 'Old business: pool resurfacing contract', status: 'active' },
};

describe('DisplayView', () => {
  beforeEach(() => {
    socket.isConnected = true;
    socket.joinError = null;
  });

  it('shows where to join before the meeting: the link, the code, the QR code and attendance', () => {
    socket.state = scheduled;
    render(<DisplayView />);
    expect(screen.getByText('Maple Grove HOA')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2026 Annual Meeting' })).toBeTruthy();
    expect(screen.getByText('Join at')).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/meetings/MAPLE1`)).toBeTruthy();
    expect(screen.getByText('MAPLE1')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Scan to join' }).getAttribute('width')).toBe('360');
    // Three on devices and three counted in the room, of 142; 29 needed
    expect(screen.getByText('Need 23 more')).toBeTruthy();
  });

  it('is always in the evening palette', () => {
    socket.state = scheduled;
    const { container } = render(<DisplayView />);
    expect((container.firstChild as HTMLElement).className.split(' ')).toContain('dark');
  });

  it('shows the item, the question and the vote in progress, with the count in the room', () => {
    socket.state = {
      ...inSession,
      currentMotion: motion,
      motionStack: [motion],
      votingOpen: true,
      voters: [3, 4],
      votes: { yea: 2, nay: 0, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 0 },
    };
    render(<DisplayView />);
    expect(screen.getByText('Old business: pool resurfacing contract')).toBeTruthy();
    expect(screen.getByText('Resurface the pool this spring').className).toContain(
      'text-display-question',
    );
    expect(screen.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeTruthy();
    expect(screen.getByText(/votes received/).textContent).toBe('2 votes received');
    expect(screen.getByText('In the room: 9 to 2')).toBeTruthy();
  });

  it("keeps a secret ballot's counts off the screen", () => {
    socket.state = {
      ...inSession,
      currentMotion: motion,
      motionStack: [motion],
      votingOpen: true,
      votingMethod: 'ballot',
      voters: [3, 4],
      floorVotes: { yea: 9, nay: 2, abstain: 0 },
    };
    render(<DisplayView />);
    expect(screen.getByText(/votes received/).textContent).toBe('2 votes received');
    expect(screen.queryByText('In the room: 9 to 2')).toBeNull();
  });

  it('shows who has the floor, the time left and who is waiting', () => {
    socket.state = {
      ...inSession,
      currentMotion: motion,
      motionStack: [motion],
      recognizedSpeaker: { id: 3, name: 'Alice Brennan', role: 'member', present: true },
      speakerTimerEnd: Date.now() + 60_000,
      speakerQueue: [
        { member: { id: 4, name: 'Ben Whitaker', role: 'member', present: true }, stance: 'con' },
      ],
    };
    render(<DisplayView />);
    const rail = screen.getByRole('complementary', { name: 'Speakers' });
    expect(rail.textContent).toContain('Alice Brennan');
    expect(rail.textContent).toContain('Ben Whitaker');
    expect(rail.textContent).toContain('Against');
    expect(screen.getByRole('timer')).toBeTruthy();
  });

  it('stamps the result, in both parts, until the next question', () => {
    socket.state = {
      ...inSession,
      meetingLog: [
        {
          time: '7:41:00 PM',
          message: 'Chair puts the question: "Resurface the pool this spring"',
        },
        {
          time: '7:45:00 PM',
          message: 'Vote: Yea 11, Nay 2. CARRIED. On devices 2 to 0, in the room 9 to 2.',
        },
      ],
    };
    render(<DisplayView />);
    expect(screen.getByText('Carried')).toBeTruthy();
    expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
  });

  it('says when the meeting adjourned, how much it decided, and where the minutes will be', () => {
    socket.state = {
      ...scheduled,
      meetingStage: 'adjourned',
      meetingLog: [{ time: '8:42:15 PM', message: 'Meeting adjourned.' }],
      completedMotions: [
        {
          id: 1,
          type: 'mainMotion',
          name: 'Main Motion',
          text: 'Resurface the pool',
          passed: true,
          voterChoices: {},
          timestamp: '7:45:00 PM',
          reconsidered: false,
        },
      ],
    };
    render(<DisplayView />);
    expect(screen.getByText('Adjourned at 8:42 PM')).toBeTruthy();
    expect(screen.getByText('1 item decided')).toBeTruthy();
    expect(screen.getByText(/minutes/)).toBeTruthy();
  });

  it('says why it could not join', () => {
    socket.state = initialState;
    socket.isConnected = false;
    socket.joinError = {
      message: "Only the organization's members can open the display",
      code: 'PERMISSION_DENIED',
    };
    render(<DisplayView />);
    expect(screen.getByText("Only the organization's members can open the display")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/views/__tests__/DisplayView.test.tsx`
Expected: FAIL: `../DisplayView` doesn't exist.

- [ ] **Step 3: Create `frontend-unified/src/modules/meetings/views/DisplayView.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { MeetingState, SpeakerQueueEntry } from '@robbie-bylawyer/shared/types';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import { useSocket } from '../context/SocketContext';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { useRoster } from '../hooks/useRoster';
import { useVoteResults } from '../hooks/useVoteResults';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import { eligibleCount } from '../utils/attendance';
import { adjournedAt, currentResult, describeQuestion, itemsDecided } from '../utils/question';
import { STANCE_LABELS } from '../utils/phoneMoment';
import { joinUrl } from '../utils/meetingLinks';
import { AttendanceBlock } from '../components/attendance/AttendanceBlock';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { TimerLine } from '../components/TimerLine';
import { QrCode } from '../components/QrCode';

/** The display's labels: 28px at 1080p, the label style */
const LABEL = 'text-display-label font-semibold uppercase tracking-[0.08em] text-ink-muted';

/**
 * The display view (docs/design-brief.md, "The three screens"), for a TV or projector: always the
 * evening palette, large type, nothing to click. Before the meeting it shows how to join; in
 * session, the question (or the result) and the room's attendance and vote; adjourned, when.
 */
export function DisplayView() {
  const { state, isConnected, joinError, meetingCode, attendance } = useSocket();
  const { availableOrganizations } = useMeetingOrganization();
  const organization = availableOrganizations.find((o) => o.id === state.organizationId) ?? null;
  const { roster } = useRoster(meetingCode, isConnected);
  const eligible = eligibleCount(organization, roster);

  return (
    <div className="dark relative min-h-screen overflow-hidden bg-paper font-body text-ink">
      <Grain />
      <main className="relative flex min-h-screen flex-col gap-10 px-16 py-12">
        {!isConnected ? (
          <p className="m-auto text-display-line text-ink-muted">
            {joinError?.message ?? 'Connecting to the meeting...'}
          </p>
        ) : (
          <>
            <header className="space-y-1">
              {organization && <p className={LABEL}>{organization.name}</p>}
              <h1 className="font-serif-soft text-display-line font-semibold text-ink">
                {state.title || 'Meeting'}
              </h1>
            </header>
            {state.meetingStage === 'adjourned' ? (
              <Adjourned state={state} />
            ) : state.meetingActive ? (
              <InSession state={state} attendance={attendance} eligible={eligible} />
            ) : (
              <BeforeMeeting
                meetingCode={meetingCode}
                attendance={attendance}
                eligible={eligible}
              />
            )}
          </>
        )}
      </main>
      <FullscreenHint />
    </div>
  );
}

interface AttendanceProps {
  attendance: AttendanceSummary;
  eligible: number | null;
}

function BeforeMeeting({
  meetingCode,
  attendance,
  eligible,
}: AttendanceProps & { meetingCode: string }) {
  const link = joinUrl(meetingCode);
  return (
    <div className="flex flex-1 flex-col justify-center gap-16">
      <div className="grid grid-cols-[1fr_auto] items-center gap-16">
        <div className="space-y-10">
          <div className="space-y-2">
            <p className={LABEL}>Join at</p>
            <p className="break-all text-display-line text-ink">{link}</p>
          </div>
          <div className="space-y-2">
            <p className={LABEL}>Code</p>
            <p className="meeting-code text-display-number text-ink">{meetingCode}</p>
          </div>
        </div>
        <QrCode value={link} label="Scan to join" size={360} />
      </div>
      <AttendanceBlock summary={attendance} eligible={eligible} size="display" />
    </div>
  );
}

function InSession({ state, attendance, eligible }: AttendanceProps & { state: MeetingState }) {
  const voteResult = useVoteResults(state.meetingLog);
  const queue = useSortedSpeakerQueue(
    state.speakerQueue,
    state.currentMotion,
    state.lastSpeakerStance,
    state,
  );
  const question = describeQuestion(state);
  const result = currentResult(state, voteResult);
  const debate = !!state.recognizedSpeaker || queue.length > 0;
  // The chair's latest ruling, while nothing has happened since
  const ruling = state.meetingLog.at(-1)?.message.startsWith('Chair ruled:')
    ? state.lastChairRuling
    : null;

  return (
    <>
      <div className={`grid flex-1 gap-12 ${debate ? 'grid-cols-[24rem_1fr]' : 'grid-cols-1'}`}>
        {debate && <SpeakerRail state={state} queue={queue} />}
        <div className="flex flex-col justify-center gap-6">
          {state.currentAgendaItem && (
            <p className="text-display-line text-ink-muted">{state.currentAgendaItem.title}</p>
          )}
          {result ? (
            <Stamp
              key={result.key}
              outcome={result.outcome}
              subject={result.subject}
              tally={result.tally}
              size="display"
            />
          ) : (
            <QuestionCard question={question} size="display" empty="The floor is open." />
          )}
          {state.unanimousConsentPending && (
            <p className="text-display-line text-ink">The chair asks: is there any objection?</p>
          )}
          {ruling && !result && (
            <p className="text-display-line text-ink-muted">The chair rules: {ruling.ruling}</p>
          )}
        </div>
      </div>
      <footer className="grid grid-cols-[1fr_auto] items-end gap-12 border-t border-rule pt-8">
        <AttendanceBlock summary={attendance} eligible={eligible} size="display" />
        <VoteBand state={state} />
      </footer>
    </>
  );
}

function SpeakerRail({ state, queue }: { state: MeetingState; queue: SpeakerQueueEntry[] }) {
  return (
    <aside aria-label="Speakers" className="space-y-8 border-r border-rule pr-10">
      <div className="space-y-3">
        <p className={LABEL}>Speaking</p>
        {state.recognizedSpeaker ? (
          <>
            <p className="font-serif-soft text-display-line font-semibold text-ink">
              {state.recognizedSpeaker.name}
            </p>
            <TimerLine
              endTime={state.speakerTimerEnd}
              totalSeconds={state.speakerTimeLimit}
              label="Speaking time"
              size="display"
            />
          </>
        ) : (
          <p className="text-display-label text-ink-muted">Nobody has the floor</p>
        )}
      </div>
      {queue.length > 0 && (
        <div className="space-y-3">
          <p className={LABEL}>Waiting</p>
          <ol className="space-y-2">
            {queue.map((entry) => (
              <li key={entry.member.id} className="text-display-label text-ink">
                {entry.member.name}{' '}
                <span className="text-ink-muted">{STANCE_LABELS[entry.stance]}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}

/** The vote in progress: votes received, and the count in the room once the chair enters it */
function VoteBand({ state }: { state: MeetingState }) {
  const election = state.currentElection;
  if (state.votingOpen) {
    const floor = state.floorVotes;
    const floorEntered = floor.yea + floor.nay + floor.abstain > 0;
    const voice = state.votingMethod === 'voice';
    return (
      <div className="space-y-2 text-right">
        <p className={LABEL}>Voting now</p>
        {voice ? (
          <p className="text-display-line text-ink">Voice vote</p>
        ) : (
          <p className="text-display-line tabular-nums text-ink">
            <span className="animate-count-pulse">{state.voters.length}</span> votes received
          </p>
        )}
        {/* A secret ballot's counts stay hidden until it closes */}
        {floorEntered && state.votingMethod !== 'ballot' && (
          <p className="text-display-line tabular-nums text-ink">
            In the room: {floor.yea} to {floor.nay}
          </p>
        )}
      </div>
    );
  }
  if (election?.votingInProgress) {
    return (
      <div className="space-y-2 text-right">
        <p className={LABEL}>Ballot</p>
        <p className="text-display-line tabular-nums text-ink">
          <span className="animate-count-pulse">{election.votersWhoVoted.length}</span> ballots
          received
        </p>
      </div>
    );
  }
  return null;
}

function Adjourned({ state }: { state: MeetingState }) {
  const time = adjournedAt(state);
  const decided = itemsDecided(state);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <p className="font-serif-soft text-display-question font-semibold text-ink">
        {time ? `Adjourned at ${time}` : 'Adjourned'}
      </p>
      <p className="text-display-line text-ink-muted">
        {decided === 1 ? '1 item decided' : `${decided} items decided`}
      </p>
      <p className="text-display-label text-ink-muted">
        The secretary publishes the minutes in Robbie, where members can read them.
      </p>
    </div>
  );
}

/** The brief's paper grain: an SVG noise at 4% opacity over the paper */
function Grain() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
    >
      <filter id="display-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#display-grain)" />
    </svg>
  );
}

/** A reminder about full screen, for the first ten seconds */
function FullscreenHint() {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(false), 10_000);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <p className="absolute bottom-4 right-6 text-sm text-ink-muted">
      Press F11 (Control Command F on a Mac) for full screen
    </p>
  );
}
```

- [ ] **Step 4: Create `frontend-unified/src/modules/meetings/display.tsx`**

```tsx
import { Navigate, useParams } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { MeetingOrganizationProvider } from './context/OrganizationBridge';
import { DisplayView } from './views/DisplayView';
import { MEETING_CODE, normalizeMeetingCode } from './utils/meetingLinks';

/**
 * /meetings/:code/display: the meeting on a TV or projector, joined as a display (it follows
 * the meeting without being a member of it)
 */
export default function MeetingDisplay() {
  const { code = '' } = useParams();
  const meetingCode = normalizeMeetingCode(code);
  if (!MEETING_CODE.test(meetingCode)) return <Navigate to="/meetings" replace />;
  return (
    <MeetingOrganizationProvider>
      <SocketProvider key={meetingCode} meetingCode={meetingCode} display>
        <DisplayView />
      </SocketProvider>
    </MeetingOrganizationProvider>
  );
}
```

- [ ] **Step 5: The route in `frontend-unified/src/App.tsx`**

Replace:

```tsx
const MeetingsModule = lazy(() => import('./modules/meetings'));
```

with:

```tsx
const MeetingsModule = lazy(() => import('./modules/meetings'));
const MeetingDisplay = lazy(() => import('./modules/meetings/display'));
```

and replace:

```tsx
{
  /* Everything else needs a signed-in user */
}
```

with:

```tsx
{
  /*
                  The meeting on a TV or projector: signed in, but outside the app's layout.
                  It outranks meetings/* below, so the meetings module never sees it.
                */
}
<Route
  path="/meetings/:code/display"
  element={
    <RequireSession>
      <OrganizationProvider>
        <MeetingDisplay />
      </OrganizationProvider>
    </RequireSession>
  }
/>;

{
  /* Everything else needs a signed-in user */
}
```

- [ ] **Step 6: Run the test, the type-check, a build and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/views/__tests__/DisplayView.test.tsx`
Expected: 8 passed.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && npx vite build && cd .. && npm run lint`
Expected: all pass, and Vite builds the display as its own chunk (`display-*.js` in the output).

- [ ] **Step 7: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings frontend-unified/src/App.tsx
git add frontend-unified/src/modules/meetings frontend-unified/src/App.tsx
git commit -m "feat(web): the display view

/meetings/:code/display joins as a display and shows the room, in the
evening palette over a paper grain: before the meeting the link, the code, a
360px QR code and attendance; in session the question (or the stamp), the
speakers and the vote in progress with the count in the room; adjourned, when
and how much was decided. Nothing on it is interactive."
```

---

### Task 8: The presiding officer on the schedule, and the quorum in Settings

**Files:**

- Modify: `frontend-unified/src/modules/meetings/components/scheduling/api.ts`, `frontend-unified/src/modules/meetings/views/LiveMeetingsPage.tsx`, `frontend-unified/src/modules/meetings/views/__tests__/LiveMeetingsPage.test.tsx`, `frontend-unified/src/modules/documents/pages/SettingsPage.tsx`, `frontend-unified/src/modules/documents/pages/__tests__/SettingsPage.test.tsx`
- Replace: `frontend-unified/src/modules/meetings/components/scheduling/MeetingScheduler.tsx`, `components/scheduling/__tests__/MeetingScheduler.test.tsx`
- Create: `frontend-unified/src/modules/documents/components/AttendanceSettingsCard.tsx`
- Test: `frontend-unified/src/modules/documents/components/__tests__/AttendanceSettingsCard.test.tsx` (new)

- **The presiding officer.** Scheduling a meeting names who chairs it: the members of the organization with the member role or above (the server's rule; a viewer can't preside), starting with the person scheduling it when they can, or nobody (the admins run it). Once the meeting exists, the scheduler shows its join card (the code, the link, the QR code), and finishes with "Start meeting" for the presiding officer, who goes straight in, and "Done" for anyone else.
- **The organization's attendance settings.** Settings gets an "Attendance" card: "Voting members" (how many lots or units vote, or empty to count the members list) and "Quorum" (a percentage of the voting members, or a number of people). Every meeting starts from them; admins edit them (`PUT /api/organizations/:id`).
- **The schedule after scheduling.** The Live Meetings page (from the UI foundation plan) shows the scheduler in its place and loaded the schedule once per organization, so closing the scheduler showed the list from before. It loads the schedule again when the scheduler closes, so the meeting just scheduled is listed.
- **The demo seed** already has Dana presiding over its annual meeting, 142 voting members and a 20% quorum: the UI foundation plan's Task 9 added them, for its Playwright harness, before this plan. Nothing to do here; `grep -n "chairUserId\|eligibleVoters" backend-node/src/demo/demoSeed.ts` shows them.

- [ ] **Step 1: Write the failing tests**

Replace `frontend-unified/src/modules/meetings/components/scheduling/__tests__/MeetingScheduler.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpError } from '../../../../../api/client';

const api = vi.hoisted(() => ({ createPacket: vi.fn(), updatePacket: vi.fn() }));
vi.mock('../api', () => api);
vi.mock('../PacketBuilder', () => ({ PacketBuilder: () => <p>Agenda builder</p> }));
vi.mock('../../QrCode', () => ({ QrCode: ({ label }: { label: string }) => <img alt={label} /> }));
const membersApi = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../api/client')>()),
  members: membersApi,
}));
vi.mock('../../../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 7, name: 'Pat Lindqvist', email: 'pat@maplegrove.example' } }),
}));
const bridge = vi.hoisted(() => {
  const maple = {
    id: 'org-1',
    name: 'Maple Grove HOA',
    slug: 'maple-grove-hoa',
    role: 'secretary',
  };
  const chess = { id: 'org-2', name: 'Chess Club', slug: 'chess-club', role: 'admin' };
  return {
    maple,
    chess,
    currentOrganization: null as null | typeof maple,
    availableOrganizations: [maple, chess],
  };
});
vi.mock('../../../context/OrganizationBridge', () => ({ useMeetingOrganization: () => bridge }));

const { MeetingScheduler } = await import('../MeetingScheduler');

const packet = (robbieCode: string) => ({
  id: 'p1',
  organizationId: 'org-1',
  robbieCode,
  createdAt: '',
  attachments: [],
  agendaItems: [],
});

const people = {
  members: [
    { userId: 7, name: 'Pat Lindqvist', email: 'pat@maplegrove.example', role: 'owner' },
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', role: 'admin' },
    { userId: 9, name: 'Morgan Lee', email: 'morgan@maplegrove.example', role: 'viewer' },
  ],
};

/** Fill in the details once the presiding officers have loaded, and go on to the agenda */
async function schedule(
  props: { onBack?: () => void; onJoinMeeting?: (code: string) => void } = {},
) {
  const view = render(
    <MeetingScheduler
      onBack={props.onBack ?? vi.fn()}
      onJoinMeeting={props.onJoinMeeting ?? vi.fn()}
    />,
  );
  await screen.findByRole('option', { name: 'Dana Okafor' });
  fireEvent.change(screen.getByLabelText('Meeting title'), { target: { value: 'Annual Meeting' } });
  return view;
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next: build the agenda' }));

describe('MeetingScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.currentOrganization = bridge.maple;
    membersApi.list.mockResolvedValue(people);
    api.createPacket.mockImplementation(async (_org: string, data: { robbieCode: string }) =>
      packet(data.robbieCode),
    );
    api.updatePacket.mockResolvedValue(packet('ABC234'));
  });

  it('creates the meeting in the current organization, presided over by its scheduler', async () => {
    await schedule();
    next();
    expect(await screen.findByText('Agenda builder')).toBeTruthy();
    expect(api.createPacket).toHaveBeenCalledWith('org-1', {
      robbieCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
      title: 'Annual Meeting',
      description: undefined,
      scheduledFor: undefined,
      chairUserId: 7,
    });
  });

  it('offers members and above to preside, and names who does', async () => {
    await schedule();
    expect(screen.queryByRole('option', { name: 'Morgan Lee' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Presiding officer'), { target: { value: '2' } });
    next();
    await screen.findByText('Agenda builder');
    expect(api.createPacket).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ chairUserId: 2 }),
    );
  });

  it('shows the join card, and lets the presiding officer start the meeting', async () => {
    const onJoinMeeting = vi.fn();
    await schedule({ onJoinMeeting });
    next();
    const code = (await screen.findByTestId('meeting-code')).textContent;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Start meeting' }));
    await waitFor(() => expect(onJoinMeeting).toHaveBeenCalledWith(code));
  });

  it('finishes with Done for someone who does not preside', async () => {
    const onBack = vi.fn();
    await schedule({ onBack });
    fireEvent.change(screen.getByLabelText('Presiding officer'), { target: { value: '2' } });
    next();
    await screen.findByText('Agenda builder');
    expect(screen.queryByRole('button', { name: 'Start meeting' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it('tries a fresh code when the generated one is taken', async () => {
    api.createPacket.mockRejectedValueOnce(
      new HttpError('That meeting code is already in use', 409),
    );
    await schedule();
    next();
    expect(await screen.findByText('Agenda builder')).toBeTruthy();
    expect(api.createPacket).toHaveBeenCalledTimes(2);
    const [first, second] = api.createPacket.mock.calls.map(([, data]) => data.robbieCode);
    expect(second).not.toBe(first);
  });

  it("stays in the packet's organization after a switch in the header", async () => {
    const { rerender } = await schedule();
    next();
    expect(await screen.findByText('Maple Grove HOA: step 2 of 2, the agenda')).toBeTruthy();

    bridge.currentOrganization = bridge.chess;
    rerender(<MeetingScheduler onBack={vi.fn()} onJoinMeeting={vi.fn()} />);

    expect(screen.getByText('Maple Grove HOA: step 2 of 2, the agenda')).toBeTruthy();
    expect(screen.getByText('Agenda builder')).toBeTruthy();
  });

  it("shows the server's message when the packet can't be created", async () => {
    api.createPacket.mockReset();
    api.createPacket.mockRejectedValueOnce(
      new HttpError('You need the secretary role for this', 403),
    );
    await schedule();
    next();
    expect(await screen.findByText('You need the secretary role for this')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Agenda builder')).toBeNull());
  });

  it('explains who schedules meetings to a role below secretary', () => {
    bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'member' };
    render(<MeetingScheduler onBack={vi.fn()} onJoinMeeting={vi.fn()} />);
    expect(screen.getByText(/by its secretaries and admins/)).toBeTruthy();
    expect(screen.queryByLabelText('Meeting title')).toBeNull();
  });
});
```

Create `frontend-unified/src/modules/documents/components/__tests__/AttendanceSettingsCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const orgState = vi.hoisted(() => ({
  currentOrganization: {
    id: 'o1',
    name: 'Maple Grove HOA',
    slug: 'maple-grove-hoa',
    role: 'admin',
    eligibleVoters: 142 as number | null,
    quorumPercent: 20 as number | null,
    quorumCount: null as number | null,
  },
  isAdmin: true,
  refreshOrganizations: vi.fn(async () => {}),
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => orgState,
  useCan: () => orgState.isAdmin,
}));
const api = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('../../../../api/client', () => ({ organizations: { update: api.update } }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const { AttendanceSettingsCard } = await import('../AttendanceSettingsCard');

describe('AttendanceSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.isAdmin = true;
    api.update.mockResolvedValue({});
  });

  it('shows the voting members and the quorum every meeting starts from', () => {
    orgState.isAdmin = false;
    render(<AttendanceSettingsCard />);
    expect(screen.getByText('142')).toBeTruthy();
    expect(screen.getByText('20% of the voting members')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit attendance' })).toBeNull();
  });

  it('lets an admin set the quorum as a number of people', async () => {
    render(<AttendanceSettingsCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attendance' }));
    fireEvent.click(screen.getByLabelText('A number of people'));
    fireEvent.change(screen.getByLabelText('Quorum count'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('o1', { eligibleVoters: 142, quorumCount: 25 }),
    );
    expect(orgState.refreshOrganizations).toHaveBeenCalled();
  });

  it('counts the members list when no number of voting members is given', async () => {
    render(<AttendanceSettingsCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attendance' }));
    fireEvent.change(screen.getByLabelText('Voting members'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('o1', { eligibleVoters: null, quorumPercent: 20 }),
    );
  });

  it('refuses a percentage over 100', () => {
    render(<AttendanceSettingsCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit attendance' }));
    fireEvent.change(screen.getByLabelText('Quorum percentage'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('The quorum is a percentage from 1 to 100')).toBeTruthy();
    expect(api.update).not.toHaveBeenCalled();
  });
});
```

In `frontend-unified/src/modules/documents/pages/__tests__/SettingsPage.test.tsx`, add after the `vi.mock('../../components/MembersCard', ...)` block:

```tsx
vi.mock('../../components/AttendanceSettingsCard', () => ({
  AttendanceSettingsCard: () => <p>Attendance settings</p>,
}));
```

In `frontend-unified/src/modules/meetings/views/__tests__/LiveMeetingsPage.test.tsx`, the scheduler's stand-in gets a way back. Replace:

```tsx
vi.mock('../../components/scheduling', () => ({ MeetingScheduler: () => <p>Scheduler</p> }));
```

with:

```tsx
vi.mock('../../components/scheduling', () => ({
  MeetingScheduler: ({ onBack }: { onBack: () => void }) => (
    <div>
      <p>Scheduler</p>
      <button onClick={onBack}>Done scheduling</button>
    </div>
  ),
}));
```

and add inside `describe('LiveMeetingsPage', () => {`, after the last `it`:

```tsx
it('lists a meeting just scheduled when the scheduler closes', async () => {
  bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
  schedule.list.mockResolvedValueOnce([]).mockResolvedValueOnce([meeting()]);
  renderPage();
  expect(await screen.findByText('No meetings scheduled.')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Schedule a meeting' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done scheduling' }));
  expect(await screen.findByRole('link', { name: 'Start 2026 Annual Meeting' })).toBeTruthy();
  expect(schedule.list).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/components/scheduling src/modules/meetings/views/__tests__/LiveMeetingsPage.test.tsx src/modules/documents/components/__tests__/AttendanceSettingsCard.test.tsx`
Expected: FAIL. The scheduler has no "Presiding officer", its labels are the old ones, and `../AttendanceSettingsCard` doesn't exist (the scheduling `api.test.ts` passes); the Live Meetings page shows the old list after the scheduler closes, so its new test times out on the link.

- [ ] **Step 3: Load the schedule again when the scheduler closes, in `frontend-unified/src/modules/meetings/views/LiveMeetingsPage.tsx`**

Replace:

```tsx
const [scheduling, setScheduling] = useState(false);
```

with:

```tsx
const [scheduling, setScheduling] = useState(false);
// Bumped when the scheduler closes, so a meeting just scheduled is listed
const [refresh, setRefresh] = useState(0);
```

replace `  }, [organizationId]);` (the end of the effect that loads the schedule) with `  }, [organizationId, refresh]);`, and replace:

```tsx
        onBack={() => setScheduling(false)}
```

with:

```tsx
        onBack={() => {
          setScheduling(false);
          setRefresh((n) => n + 1);
        }}
```

- [ ] **Step 4: The presiding officer in `frontend-unified/src/modules/meetings/components/scheduling/api.ts`**

Replace:

```ts
  data: { robbieCode: string; title?: string; description?: string; scheduledFor?: string },
```

with:

```ts
  data: {
    robbieCode: string;
    title?: string;
    description?: string;
    scheduledFor?: string;
    /** The presiding officer; the server defaults it to the creator, and null is nobody */
    chairUserId?: number | null;
  },
```

and replace:

```ts
  data: { title?: string; description?: string; scheduledFor?: string },
```

with:

```ts
  data: {
    title?: string;
    description?: string;
    scheduledFor?: string;
    chairUserId?: number | null;
  },
```

- [ ] **Step 5: Replace `frontend-unified/src/modules/meetings/components/scheduling/MeetingScheduler.tsx`**

```tsx
/**
 * Meeting Scheduler Component
 *
 * Schedules a meeting in the current organization. Its details create the meeting's packet, which
 * claims the meeting code for the organization and names the presiding officer; the agenda and
 * attachments are then added to the packet, and the join card shows how people get in.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Calendar, Check, Clock, Loader2 } from 'lucide-react';
import type { MeetingPacket } from './types';
import { PacketBuilder } from './PacketBuilder';
import { createPacket, updatePacket } from './api';
import { HttpError, members as membersApi, type OrgMember } from '../../../../api/client';
import { useSession } from '../../../../context/SessionContext';
import { useMeetingOrganization } from '../../context/OrganizationBridge';
import { atLeast } from '../../../../utils/roles';
import { JoinInfoCard } from '../console/JoinInfoCard';

interface MeetingSchedulerProps {
  onBack: () => void;
  onJoinMeeting: (code: string) => void;
}

type Step = 'details' | 'agenda';

/** How many generated codes to try when one is already taken */
const CODE_ATTEMPTS = 3;

/** A random 6-character meeting code, without characters that look alike (0 and O, 1 and I) */
function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function MeetingScheduler({ onBack, onJoinMeeting }: MeetingSchedulerProps) {
  const { user } = useSession();
  const { currentOrganization, availableOrganizations } = useMeetingOrganization();
  const [step, setStep] = useState<Step>('details');
  const [meetingCode, setMeetingCode] = useState(generateMeetingCode);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  // The presiding officer: undefined until the members load, then the scheduler when they may
  // preside; null for nobody (the admins run the meeting)
  const [chairUserId, setChairUserId] = useState<number | null | undefined>(undefined);
  const [presiders, setPresiders] = useState<OrgMember[] | null>(null);
  const [packet, setPacket] = useState<MeetingPacket | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meetings are scheduled in the organization selected in the header, by its secretaries and
  // above. Once the packet exists it belongs to that organization, whatever the header shows.
  const headerOrganization =
    currentOrganization && atLeast(currentOrganization.role, 'secretary')
      ? currentOrganization
      : null;
  const organization = packet
    ? (availableOrganizations.find((org) => org.id === packet.organizationId) ?? null)
    : headerOrganization;
  const organizationId = organization?.id ?? null;

  // Who may preside: the organization's members with the member role or above (the server's rule)
  useEffect(() => {
    if (!organizationId) return;
    let canceled = false;
    membersApi
      .list(organizationId)
      .then(({ members }) => {
        if (canceled) return;
        const eligible = members.filter((m) => atLeast(m.role, 'member'));
        setPresiders(eligible);
        setChairUserId((current) => {
          if (current !== undefined) return current;
          return eligible.some((m) => m.userId === user?.id) ? (user?.id ?? null) : null;
        });
      })
      .catch(() => {
        // Without the list the server's default stands: the person scheduling presides
        if (!canceled) setPresiders([]);
      });
    return () => {
      canceled = true;
    };
  }, [organizationId, user?.id]);

  const details = () => ({
    title: title || undefined,
    description: description || undefined,
    scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
    ...(chairUserId === undefined ? {} : { chairUserId }),
  });

  /** Create the packet, with a fresh code if a generated one is already taken */
  const create = async (orgId: string): Promise<MeetingPacket> => {
    let code = meetingCode;
    for (let attempt = 1; ; attempt++) {
      try {
        return await createPacket(orgId, { robbieCode: code, ...details() });
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 409) || attempt >= CODE_ATTEMPTS) {
          throw err;
        }
        code = generateMeetingCode();
        setMeetingCode(code);
      }
    }
  };

  const handleProceedToAgenda = async () => {
    if (!organization) return;
    setIsSaving(true);
    setError(null);
    try {
      // The first time, creating the packet claims the code; after Edit the details, save them
      setPacket(packet ? await updatePacket(packet.id, details()) : await create(organization.id));
      setStep('agenda');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule the meeting');
    } finally {
      setIsSaving(false);
    }
  };

  // The presiding officer goes straight into the meeting; anyone else is done
  const presiding = chairUserId != null && chairUserId === user?.id;
  const presidingName =
    chairUserId == null ? null : (presiders?.find((m) => m.userId === chairUserId)?.name ?? null);

  const handleFinish = async () => {
    if (packet) {
      setIsSaving(true);
      try {
        await updatePacket(packet.id, details());
      } catch (err) {
        console.error('Failed to save details:', err);
      } finally {
        setIsSaving(false);
      }
    }
    if (presiding) onJoinMeeting(meetingCode);
    else onBack();
  };

  if (!organization) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="card p-6 text-center">
          <p className="text-ink-muted mb-4">
            Meetings are scheduled in an organization, by its secretaries and admins. Choose an
            organization where you have one of those roles.
          </p>
          <button onClick={onBack} className="btn-secondary">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-rule px-6 py-4">
          <button type="button" onClick={onBack} aria-label="Back" className="btn-ghost btn-sm">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="card-title">Schedule a meeting</h2>
            <p className="text-sm text-ink-muted">
              {organization.name}:{' '}
              {step === 'details' ? 'step 1 of 2, the details' : 'step 2 of 2, the agenda'}
            </p>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {error && (
            <div role="alert" className="rounded-lg bg-gavel-tint px-4 py-3 text-sm text-ink">
              {error}
            </div>
          )}

          {step === 'details' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleProceedToAgenda();
              }}
              className="space-y-4"
            >
              <p className="text-sm text-ink-muted">
                Meeting code <span className="meeting-code text-ink">{meetingCode}</span>
              </p>

              <div>
                <label htmlFor="meetingTitle" className="label">
                  Meeting title
                </label>
                <input
                  id="meetingTitle"
                  type="text"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="2026 Annual Meeting"
                />
              </div>

              <div>
                <label htmlFor="meetingDescription" className="label">
                  Description
                </label>
                <textarea
                  id="meetingDescription"
                  className="textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Where it is, and anything members should know"
                />
              </div>

              <div>
                <label htmlFor="meetingDate" className="label">
                  <Calendar className="mr-1 inline h-4 w-4" aria-hidden="true" />
                  Date and time
                </label>
                <input
                  id="meetingDate"
                  type="datetime-local"
                  className="input"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="presidingOfficer" className="label">
                  Presiding officer
                </label>
                <select
                  id="presidingOfficer"
                  className="select"
                  disabled={presiders === null}
                  value={chairUserId == null ? '' : String(chairUserId)}
                  onChange={(e) => setChairUserId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">
                    {presiders === null ? 'Loading the members...' : 'Nobody: the admins run it'}
                  </option>
                  {(presiders ?? []).map((member) => (
                    <option key={member.userId} value={String(member.userId)}>
                      {member.name ?? member.email}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-muted">
                  Chairs the live meeting. Members and above can preside.
                </p>
              </div>

              <button type="submit" disabled={isSaving} className="btn-primary w-full">
                {isSaving ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    Next: build the agenda
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          ) : (
            packet && (
              <>
                <JoinInfoCard code={meetingCode} />

                <div className="rounded-lg bg-surface-2 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-medium text-ink">{title || 'Untitled meeting'}</h3>
                    <button
                      type="button"
                      onClick={() => setStep('details')}
                      className="btn-ghost btn-sm"
                    >
                      Edit the details
                    </button>
                  </div>
                  {scheduledFor && (
                    <p className="flex items-center gap-1 text-sm text-ink-muted">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {new Date(scheduledFor).toLocaleString()}
                    </p>
                  )}
                  <p className="text-sm text-ink-muted">
                    {presidingName ? `${presidingName} presides` : 'No presiding officer'}
                  </p>
                </div>

                <PacketBuilder packet={packet} onPacketUpdate={setPacket} />

                <div className="flex gap-3 border-t border-rule pt-6">
                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className="btn-secondary flex-1"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFinish()}
                    disabled={isSaving}
                    className="btn-primary flex-1"
                  >
                    {isSaving ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : presiding ? (
                      <>
                        <Check className="h-5 w-5" aria-hidden="true" />
                        Start meeting
                      </>
                    ) : (
                      'Done'
                    )}
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
```

The scheduling header was a gradient in the meeting palette; it is a plain card header now (the brief has no gradients). "Start meeting" only opens the meeting: the presiding officer calls it to order from the console, which sees the attendance first.

- [ ] **Step 6: Create `frontend-unified/src/modules/documents/components/AttendanceSettingsCard.tsx`**

```tsx
import { useId, useState, type FormEvent } from 'react';
import { Users } from 'lucide-react';
import { organizations as organizationsApi, type OrganizationUpdate } from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';

type QuorumKind = 'percent' | 'count';

/**
 * The organization's voting members and quorum, which every meeting starts from (a meeting can
 * still change its own quorum). Admins edit them.
 */
export function AttendanceSettingsCard() {
  const { currentOrganization, refreshOrganizations } = useOrganization();
  const isAdmin = useCan('admin');
  const [editing, setEditing] = useState(false);
  if (!currentOrganization) return null;

  const org = currentOrganization;
  const quorumText = org.quorumPercent
    ? `${org.quorumPercent}% of the voting members`
    : `${org.quorumCount ?? 3} people`;

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-rule px-6 py-4">
        <h3 className="card-title flex items-center gap-2">
          <Users className="h-5 w-5" aria-hidden="true" />
          Attendance
        </h3>
        {isAdmin && !editing && (
          <button
            type="button"
            className="btn-secondary btn-sm"
            aria-label="Edit attendance"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>
      <div className="space-y-4 p-6">
        {editing ? (
          <AttendanceForm
            organizationId={org.id}
            eligibleVoters={org.eligibleVoters ?? null}
            quorumPercent={org.quorumPercent ?? null}
            quorumCount={org.quorumCount ?? null}
            onDone={async (saved) => {
              if (saved) await refreshOrganizations();
              setEditing(false);
            }}
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-muted">Voting members</dt>
              <dd className="font-medium text-ink">
                {org.eligibleVoters ?? 'Counted from the members list'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">Quorum</dt>
              <dd className="font-medium text-ink">{quorumText}</dd>
            </div>
          </dl>
        )}
        <p className="text-xs text-ink-muted">
          Every meeting starts with this quorum. Voting members are the lots or units that vote,
          whether or not their owners have an account.
        </p>
      </div>
    </div>
  );
}

function AttendanceForm({
  organizationId,
  eligibleVoters,
  quorumPercent,
  quorumCount,
  onDone,
}: {
  organizationId: string;
  eligibleVoters: number | null;
  quorumPercent: number | null;
  quorumCount: number | null;
  onDone: (saved: boolean) => Promise<void>;
}) {
  const votersId = useId();
  const quorumId = useId();
  const { showToast } = useToast();
  const [voters, setVoters] = useState(eligibleVoters ? String(eligibleVoters) : '');
  const [kind, setKind] = useState<QuorumKind>(quorumPercent ? 'percent' : 'count');
  const [quorum, setQuorum] = useState(String(quorumPercent ?? quorumCount ?? 3));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const eligible = voters.trim() === '' ? null : Number(voters);
    if (eligible !== null && (!Number.isInteger(eligible) || eligible < 1)) {
      setProblem('Voting members is a whole number, 1 or more, or empty to count the members list');
      return;
    }
    const value = Number(quorum);
    if (kind === 'percent' && (!Number.isInteger(value) || value < 1 || value > 100)) {
      setProblem('The quorum is a percentage from 1 to 100');
      return;
    }
    if (kind === 'count' && (!Number.isInteger(value) || value < 1)) {
      setProblem('The quorum is a whole number of people, 1 or more');
      return;
    }
    // Setting the quorum one way clears the other on the server
    const body: OrganizationUpdate = {
      eligibleVoters: eligible,
      ...(kind === 'percent' ? { quorumPercent: value } : { quorumCount: value }),
    };
    setProblem(null);
    setSaving(true);
    try {
      await organizationsApi.update(organizationId, body);
      showToast('success', 'Attendance settings saved');
      await onDone(true);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't save the settings");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-4">
      <div>
        <label htmlFor={votersId} className="label">
          Voting members
        </label>
        <input
          id={votersId}
          className="input tabular-nums"
          inputMode="numeric"
          value={voters}
          onChange={(e) => setVoters(e.target.value)}
        />
        <p className="mt-1 text-xs text-ink-muted">
          How many lots or units vote (142, say). Leave it empty to count the members list.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Quorum</legend>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name="quorum-kind"
            checked={kind === 'percent'}
            onChange={() => setKind('percent')}
          />
          A percentage of the voting members
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="radio"
            name="quorum-kind"
            checked={kind === 'count'}
            onChange={() => setKind('count')}
          />
          A number of people
        </label>
        <div className="flex items-center gap-2">
          <label htmlFor={quorumId} className="sr-only">
            {kind === 'percent' ? 'Quorum percentage' : 'Quorum count'}
          </label>
          <input
            id={quorumId}
            className="input w-32 tabular-nums"
            inputMode="numeric"
            value={quorum}
            onChange={(e) => setQuorum(e.target.value)}
          />
          <span className="text-sm text-ink-muted">{kind === 'percent' ? '%' : 'people'}</span>
        </div>
      </fieldset>
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={saving}>
          Save
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void onDone(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 7: The card in `frontend-unified/src/modules/documents/pages/SettingsPage.tsx`**

Add after `import { MembersCard } from '../components/MembersCard';`:

```tsx
import { AttendanceSettingsCard } from '../components/AttendanceSettingsCard';
```

and replace:

```tsx
{
  /* Keyed so a switch starts the card afresh, without the previous members */
}
<MembersCard key={currentOrganization.id} />;
```

with:

```tsx
{
  /* Voting members and the quorum every meeting starts from; keyed like MembersCard */
}
<AttendanceSettingsCard key={`attendance-${currentOrganization.id}`} />;

{
  /* Keyed so a switch starts the card afresh, without the previous members */
}
<MembersCard key={currentOrganization.id} />;
```

- [ ] **Step 8: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/components/scheduling src/modules/meetings/views/__tests__/LiveMeetingsPage.test.tsx src/modules/documents/components/__tests__/AttendanceSettingsCard.test.tsx src/modules/documents/pages/__tests__/SettingsPage.test.tsx`
Expected: all pass: `MeetingScheduler` 8, the scheduling `api` tests, `LiveMeetingsPage` 6, `AttendanceSettingsCard` 4, and `SettingsPage`'s tests as before.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings/components/scheduling frontend-unified/src/modules/meetings/views frontend-unified/src/modules/documents
git add frontend-unified/src/modules/meetings/components/scheduling frontend-unified/src/modules/meetings/views frontend-unified/src/modules/documents
git commit -m "feat(web): the presiding officer on the schedule, the quorum in Settings

Scheduling a meeting names its presiding officer from the members who may
preside, shows the join card with the code, the link and the QR code, and
lets the presiding officer start the meeting. Settings shows the voting
members and the quorum every meeting starts from, and admins change them."
```

---

### Task 9: The Playwright scenario: a vote from the phones to the display

**Files:**

- Modify: `e2e/helpers.ts`
- Create: `e2e/tests/meeting.spec.ts`

The design's scenario, on the harness from the UI foundation plan (its backend on port 3101 with test sign-in, the web build on 4173, the Maple Grove HOA demo reseeded before every run): five browser contexts, each signed in as one of the demo's people.

1. Pat, the secretary, schedules a meeting with Dana presiding, and opens the display (a 1920 by 1080 window).
2. Dana opens the console; Alice and Ben follow the meeting's link on phone-sized pages (390 by 844, touch).
3. Dana marks Carmen Diaz, who has no phone, present from the roster, and counts three people without an account: 7 present of 142, with a quorum of 29 (20% of 142, rounded up).
4. Dana calls the meeting to order and adopts the (empty) agenda; Alice moves from her phone and Ben seconds from his.
5. Dana opens the vote. Sam, a viewer in the organization, follows the link: he is a guest, with "Request the floor" and no vote.
6. Alice and Ben vote yea; Dana enters the show of hands (9 to 2) and closes the vote.
7. The display announces "Carried" with the tally in both parts, "On devices 2 to 0, in the room 9 to 2: 11 to 2", and the quorum line "Need 22 more".

The run saves screenshots of the console, a phone and the display at the end, beside the visual pass's.

- [ ] **Step 1: A signed-in page per person, in `e2e/helpers.ts`**

Replace:

```ts
import { expect, type Page } from '@playwright/test';
```

with:

```ts
import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { WEB_PORT } from './env';
```

and append:

```ts
/** A phone-sized, touch page: the phone view's narrowest common size */
export const PHONE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

/**
 * A page in a browser context of its own (its own cookies), signed in as one of the demo's
 * people: several people can be in one test, each in their own context
 */
export async function personPage(
  browser: Browser,
  email: string,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: `http://localhost:${WEB_PORT}`,
    ...options,
  });
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}
```

(`browser.newContext()` doesn't take the config's `use` options, so the base URL is passed here.)

- [ ] **Step 2: Create `e2e/tests/meeting.spec.ts`**

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { PEOPLE, PHONE, personPage } from '../helpers';

test('a scheduled meeting runs a vote from the phones to the display', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const pages: Page[] = [];
  const open = async (email: string, options = {}) => {
    const page = await personPage(browser, email, options);
    pages.push(page);
    return page;
  };

  // Pat, the secretary, schedules a meeting with Dana presiding
  const pat = await open(PEOPLE.pat, { viewport: { width: 1280, height: 900 } });
  await pat.goto('/meetings');
  await pat.getByRole('button', { name: 'Schedule a meeting' }).click();
  await pat.getByLabel('Meeting title').fill('Special meeting on the pool');
  await pat.getByLabel('Presiding officer').selectOption({ label: 'Dana Okafor' });
  await pat.getByRole('button', { name: 'Next: build the agenda' }).click();
  const code = (await pat.getByTestId('meeting-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await pat.getByRole('button', { name: 'Done' }).click();
  await expect(pat.getByRole('link', { name: 'Join Special meeting on the pool' })).toBeVisible();

  // Pat puts the display on the TV
  await pat.setViewportSize({ width: 1920, height: 1080 });
  await pat.goto(`/meetings/${code}/display`);
  await expect(pat.getByText('Join at')).toBeVisible();
  await expect(pat.getByText(code, { exact: true })).toBeVisible();
  await expect(pat.getByRole('img', { name: 'Scan to join' })).toBeVisible();

  // Dana opens the console; Alice and Ben follow the link on their phones
  const dana = await open(PEOPLE.dana, { viewport: { width: 1440, height: 1000 } });
  await dana.goto(`/meetings/${code}`);
  await expect(dana.getByRole('heading', { name: 'Special meeting on the pool' })).toBeVisible();
  const alice = await open(PEOPLE.alice, PHONE);
  const ben = await open(PEOPLE.ben, PHONE);
  for (const phone of [alice, ben]) {
    await phone.goto(`/meetings/${code}`);
    await expect(phone.getByText('The meeting has not been called to order yet.')).toBeVisible();
  }

  // Carmen has no phone: Dana marks her present, and counts three people without an account.
  // Dana, Alice and Ben on devices, Carmen marked, three counted: 7 of 142, quorum 29.
  await dana.getByRole('button', { name: 'Mark Carmen Diaz present' }).click();
  await expect(dana.getByRole('button', { name: 'Mark Carmen Diaz absent' })).toBeEnabled();
  await dana.getByLabel('Headcount').fill('3');
  await dana.getByRole('button', { name: 'Save the headcount' }).click();
  await expect(dana.getByText('7 present of 142, quorum 29, not met')).toBeVisible();
  await expect(pat.getByText('Need 22 more')).toBeVisible();

  // The meeting is called to order and the agenda adopted
  await dana.getByRole('button', { name: 'Call to order' }).click();
  await dana.getByRole('button', { name: 'Adopt the agenda' }).click();

  // Alice moves from her phone, and Ben seconds
  await alice.getByLabel('Motion text').fill('I move that we resurface the pool this spring');
  await alice.getByRole('button', { name: 'Submit Motion' }).click();
  await ben.getByRole('button', { name: 'Second', exact: true }).click();
  await expect(dana.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeVisible();
  await expect(pat.getByText('I move that we resurface the pool this spring')).toBeVisible();

  // The vote opens. Sam, a viewer in the organization, follows as a guest and has no vote.
  await dana.getByRole('button', { name: 'Open the vote' }).click();
  const sam = await open(PEOPLE.sam, PHONE);
  await sam.goto(`/meetings/${code}`);
  await expect(sam.getByText('Guest', { exact: true })).toBeVisible();
  await expect(sam.getByRole('button', { name: 'Request the floor' })).toBeVisible();
  await expect(sam.getByRole('button', { name: /^Vote / })).toHaveCount(0);

  // The phones vote; Dana enters the show of hands and closes the vote
  await alice.getByRole('button', { name: 'Vote yea' }).click();
  await ben.getByRole('button', { name: 'Vote yea' }).click();
  await expect(dana.getByText('2 voted on devices')).toBeVisible();
  await expect(pat.getByText('2 votes received')).toBeVisible();
  await dana.getByLabel('Yea in the room').fill('9');
  await dana.getByLabel('Nay in the room').fill('2');
  await dana.getByLabel('Abstain in the room').fill('0');
  await dana.getByRole('button', { name: 'Enter the count' }).click();
  await expect(dana.getByText('Together: 11 to 2')).toBeVisible();
  await expect(pat.getByText('In the room: 9 to 2')).toBeVisible();
  await dana.getByRole('button', { name: 'Close the vote' }).click();

  // The display announces the result in both parts, with the quorum
  await expect(pat.getByText('Carried', { exact: true })).toBeVisible();
  await expect(pat.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeVisible();
  await expect(pat.getByText('Need 22 more')).toBeVisible();
  await expect(alice.getByText('Carried', { exact: true })).toBeVisible();

  await capture(dana, testInfo, 'console');
  await capture(alice, testInfo, 'phone');
  await capture(pat, testInfo, 'display');
  await Promise.all(pages.map((page) => page.context().close()));
});

/** A screenshot attached to the report (CI uploads it); never compared */
async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}
```

The console's chip counts 7 because the roster panel marks Carmen and the headcount adds 3 to the three devices: Dana (the chair), Alice and Ben. Pat's display and Sam's guest phone count for nothing.

- [ ] **Step 3: Run it**

Check that nothing listens on 3101 or 4173: `ss -ltn | grep -E ':(3101|4173) '` prints nothing. Start the throwaway Postgres if `docker ps --filter name=robbie-ci-pg` doesn't list it.

Run: `npx tsc --noEmit -p e2e/tsconfig.json && npm run e2e`
Expected: a clean type-check, then `7 passed`: the smoke test's 2, the visual pass's 4, and this scenario. Its screenshots (`console.png`, `phone.png`, `display.png`) are in its folder under `e2e/test-results/`. Open the three and check by eye: the console's top bar and its two columns; the phone's one action block and the Carried stamp; the display dark, with the stamp a third of the screen and the attendance band beneath it.

If a step times out, the trace (`npx playwright show-trace e2e/test-results/*meeting*/trace.zip`) shows which page and what it showed.

- [ ] **Step 4: Commit**

```bash
npx prettier --write e2e
npm run lint
git add e2e
git commit -m "test(e2e): a meeting from the schedule to the display

Pat schedules a meeting with Dana presiding and opens the display; Alice and
Ben join from phones by the link; Dana marks Carmen present, counts three
people without an account, calls the meeting to order and adopts the agenda;
Alice moves, Ben seconds, both vote, Dana enters the show of hands and closes
the vote, and the display announces it in both parts with the quorum. Sam
follows as a guest with no vote."
```

---

### Task 10: A live check in the browser

**Files:** none (a check, with notes for the report)

The Playwright scenario proves the flow; this step looks at the screens as people will see them, in both palettes, at the sizes the brief names (1280px for the console, 390px for a phone, 1920 by 1080 for the display), with the demo's own meeting: its seven agenda items, Dana presiding, 142 voting members.

- [ ] **Step 1: Start the app on the seeded database**

- Check that nothing listens on 3001 or 5173: `ss -ltn | grep -E ':(3001|5173) '` prints nothing.
- Reseed: `cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx tsx src/scripts/seedDemo.ts --reset`, and clear the live meetings first if a run left any: `psql postgresql://postgres:postgres@localhost:55432/robbie -c 'DELETE FROM meetings'` (or run `npm run e2e` again, which does both).
- Backend: from `backend-node`, run `npx tsx src/index.ts` in the background with `PORT=3001`, `DATABASE_URL` and `DIRECT_URL` set to `postgresql://postgres:postgres@localhost:55432/robbie`, `ENABLE_TEST_AUTH=true`, `NODE_ENV=test` and `RESEND_API_KEY=` (empty); record its PID.
- Web: from `frontend-unified`, run `npx vite --port 5173` in the background; record its PID.

- [ ] **Step 2: Walk through it with the Playwright MCP browser**

1. At 1280 by 800, sign in at `http://localhost:5173/sign-in` as `dana@maplegrove.example` with `000000`. Live Meetings lists "2026 Annual Meeting" with "Start"; click it. The console: the top bar ("2026 Annual Meeting", "Not yet called to order", "1 present of 142, quorum 29, not met", Display, Join info), the join card with its QR code, "Call to order" on the question card, the attendance panel with the 15 voting members (Dana present, the others not joined) and the seeded agenda's seven items, ready to reorder.
2. Click Display: a new tab at `/meetings/MAPLE1/display`. Resize it to 1920 by 1080: dark, with the grain, "Maple Grove HOA" and the title, "Join at http://localhost:5173/meetings/MAPLE1", the code and the QR code, and 1, 29, 142 with "Need 28 more". The full-screen hint goes after ten seconds.
3. Back on the console: mark Carmen Diaz and Grace Kim present, save a headcount of 25 with two names. The chip says "28 present of 142, quorum 29, not met"; the display says "Need 1 more". Save 26: "Quorum met" on both.
4. Call to order and adopt the agenda. "Call the next item: Call to order" is the primary action; call it, then "Complete the item". Call "Treasurer's report and the 2027 budget": the current item line shows above the question card.
5. In the side column, open nominations for Director; nominate Carmen Diaz from the list and "Ray Castillo" as someone not in the meeting; close nominations; open the ballot (a majority); enter paper ballots 18 and 9; close the ballot. The console and the display stamp ELECTED, "Carmen Diaz, Director", with "Carmen Diaz 18, Ray Castillo 9". Declare her elected.
6. Open "More": the people in the meeting with Rename and Hand over the chair, the quorum for this meeting, the log.
7. Settings, Appearance, Dark: the console in the evening palette; the stamp, the chip and the tints still readable. Back to Light.
8. Sign out, resize to 390 by 844, sign in as `alice@maplegrove.example`, and open `http://localhost:5173/meetings/MAPLE1`: the sticky header with the meeting and the current item, the question card, one action block (Make a motion), the agenda with the current item marked, and the last result stamped. Scroll: the header stays.
9. Sign out, sign in as `sam@maplegrove.example`, open the same link: the Guest badge, "Request the floor" and "Ask the chair", nothing else to do.

Note anything that differs from the above or from the brief in the report, with a screenshot. Stop both servers by PID, and remove any `.playwright-mcp/` folder the browser tool created.

---

### Task 11: Docs and the final check

**Files:** `spec.md`, `CLAUDE.md`, `docs/mvp-roadmap.md`

- [ ] **Step 1: `spec.md`**

Under `### M3. Organization authorization (REST and socket)`, after the bullet that starts `- **Done 2026-10-06 (server, in the room):**`, add:

```markdown
- **Done 2026-10-06 (clients, in the room):** the web app takes each person's meeting role from the state the server sent (`myRole`), never assumes one, and shows the chair and admins the chair console and everyone else the phone view; guests see a Guest badge and can only request the floor and ask the chair; a display (`/meetings/:code/display`) joins without becoming a member; the chair marks people present from the organization's roster (`GET /api/packets/:code/roster`) and hands over the chair from the console; the presiding officer is chosen when a meeting is scheduled. A link to a meeting that isn't scheduled shows the code box with "No meeting with that code".
```

Under `### M7. Parliamentary correctness`, after the bullet that starts `- **Done 2026-10-06 (server):** quorum comes from the organization`, add:

```markdown
- **Done 2026-10-06 (web):** the chair console shows attendance as present, quorum and eligible (devices, members marked present and the headcount, never guests), takes the floor tally for every voting method (and a voice vote), offers the chair's deciding vote on both parts together, lets admins vote, takes paper ballots in elections, and announces every result in both parts ("On devices 12 to 3, in the room 9 to 2: 21 to 5") on the console, the phones and the display. Settings sets the organization's voting members and quorum. Reconsider lists only motions that can be reconsidered.
```

Under `### M9. Web client completion`, after the paragraph that starts `**Done 2026-10-06 (design system, the first half of MVP phase B):**`, add:

```markdown
**Done 2026-10-06 (the meeting screens, MVP phase B):** the chair console (a top bar with attendance and the Display and Join info buttons; the question card with only the chair's actions that are in order, the script line, the stamp, the vote panel with the floor tally, the speaker queue; attendance, the agenda, nominations and elections always reachable, inquiries, and a "More" area that replaced the admin view), the phone view (one action block for the moment, 56px buttons, a guest mode, safe-area padding) and the display view (`/meetings/:code/display`, dark, before the meeting, in session and adjourned, with the QR code) are built on `docs/design-brief.md`. The scheduler names the presiding officer and shows the join card. The old chair view, admin view, participant view and their panels are gone. A Playwright scenario (`e2e/tests/meeting.spec.ts`) runs a vote from two phones to the display with a guest watching.
```

In the same section, replace:

```markdown
- Refactor the 6 "reset state when a prop changes" effects (Sidebar, SpeakerQueuePanel, VotingPanel, AgendaItemEditor, MeetingApp, ParticipantView) to derived state or `key` resets,
```

with:

```markdown
- Refactor the 3 remaining "reset state when a prop changes" effects (Sidebar, SpeakerQueuePanel, AgendaItemEditor; the ones in the chair's VotingPanel, MeetingApp and ParticipantView went with the meeting screens, whose forms reset with a `key`) to derived state or `key` resets,
```

(the rest of that bullet stays).

- [ ] **Step 2: `CLAUDE.md`**

In the monorepo structure block, replace:

```
│               ├── views/      # AuthScreen, MeetingApp, ChairView, ParticipantView
│               ├── components/ # chair/, participant/, mobile/, scheduling/
│               ├── hooks/      # useQuorumStatus, useSortedSpeakerQueue, useVoteResults
```

with:

```
│               ├── views/      # LiveMeetingsPage, MeetingApp, ChairConsole, PhoneView, DisplayView
│               ├── components/ # console/, phone/, attendance/, chair/, participant/, scheduling/
│               ├── hooks/      # useQuorumStatus, useRoster, usePacket, useSortedSpeakerQueue, useVoteResults
```

Under "**Routing Structure:**", add after the line that starts ``- `/meetings/:code` -``:

```markdown
- `/meetings/:code/display` - The meeting on a TV or projector: always dark, nothing to click, outside the app's layout; joins as a display, not a member (Robbie)
```

Under "### Robbie Meetings Module (modules/meetings)", add before "**Shared Package Exports:**":

```markdown
**Screens** (`docs/design-brief.md`): `MeetingApp` shows the chair console (`views/ChairConsole.tsx`) to the chair and admins and the phone view (`views/PhoneView.tsx`) to members and guests, by `myRole` from `SocketContext` (the role the server derived and put in the state; never assume one). `/meetings/:code/display` (`display.tsx`, `views/DisplayView.tsx`) joins with `display: true`. The question card, the stamp and the attendance block are shared by all three, fed by `describeQuestion`, `currentResult` and `parseVoteResult` (`utils/question.ts`, `hooks/useVoteResults.ts`) and `attendanceSummary` (shared); the console's toolbar shows only `chairActions(state)`, and the phone's one action block follows `phoneMoment(state)`. Counts the chair enters (`SET_HEADCOUNT`, `SET_FLOOR_TALLY`, `SET_FLOOR_BALLOTS`) replace the last entry, so their forms reset with a `key` on the meeting's value.
```

- [ ] **Step 3: `docs/mvp-roadmap.md`**

In the phases table, set the State cell of row B (In the room) to `done` followed by the output of `date +%F`, formatted as row A's cell is (`done 2026-10-06`), and the State cell of row C to `next`. Prettier re-pads the table in the next step.

- [ ] **Step 4: Format, then the full check**

Run: `npx prettier --write spec.md CLAUDE.md docs/mvp-roadmap.md`

Run (from the repository root):

```bash
npm run build:shared && npm run format:check && npm run lint && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npx tsc --noEmit -p e2e/tsconfig.json && npm run test:run -w shared && npm run test:run -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -w backend-node && npm run e2e
```

Expected: all pass. Lint warnings no more than before this plan; lint ends with `Palette check passed (0 files on the allowlist).`; `npm run e2e` reports `7 passed`. No commit of this plan touches `mobile/` or `backend-node/`: `git log --name-only --format= $(git log --format=%H --grep='the meeting connection knows the room' -1)^..HEAD | grep -E '^(mobile|backend-node)/'` prints nothing (the search names this plan's first commit).

- [ ] **Step 5: Commit**

```bash
git add spec.md CLAUDE.md docs/mvp-roadmap.md
git commit -m "docs: record the meeting screens and finish phase B"
```

---

## Self-review notes

- **Coverage (the request, the design's client sections, and the brief):**
  1. The connection (Task 1): `attendance` from `attendanceSummary`, `myRole` (chair, admin, member, guest; null on a display and before the join), display joins (`SocketProvider` with `display`, `JOIN_MEETING { meetingCode, display: true }`), the deep link from the UI foundation plan, and "No meeting with that code" on the code box (`joinError.code === 'MEETING_NOT_FOUND'`); `useQuorumStatus` as a thin wrapper.
  2. Attendance (Task 2): the roster merged with `state.members`, the four statuses, Mark present and Mark absent (disabled while the device is connected), the headcount with names, the attendance block's three numbers and the quorum line, the guests apart.
  3. The question card and the stamp (Task 3), shared by all three screens, with their tests; the last result with both parts (`parseVoteResult`, `currentResult`), and the timer line.
  4. The chair console (Tasks 4 and 5): the top bar (title, stage, elapsed time, the attendance chip, Display, Join info), the Now column and the side column at 1280px, the toolbar with only the actions in order, the vote panel with device counts, the floor tally and the voting method including voice, the chair's deciding vote on both parts, elections always reachable (open nominations at any time, nominees present or named, paper ballots), the script line, the join card with the QR code, and "More" holding the admin view's panels; the tab switcher, `ChairView` and `AdminView` deleted.
  5. The phone view (Task 6): one column, one action block per moment, guest mode, the sticky header, safe-area padding (with `viewport-fit=cover`), 56px buttons.
  6. The display (Task 7): `/meetings/:code/display`, dark only, the three states, the QR code, the stamp, the speaker rail, the bottom band, nothing interactive, a full-screen hint.
  7. Scheduling and Settings (Task 8): the presiding officer picker (member role and above), the join card on the schedule, Start meeting for the presiding officer; "Voting members" and "Quorum" for admins.
  8. Minutes-safe details: `useVoteResults` reads the new log line with its parts (Task 3); the last result is shown in both parts on the console, the phones and the display (Tasks 5 to 7); reconsider lists only what can be reconsidered (Task 6); a secret ballot's "Vote recorded" comes from `voters` (Tasks 4 and 6).
  9. The Playwright scenario (Task 9): five contexts (Dana chairing, Alice and Ben on phones, Pat's display, Sam as a guest), every step the request lists, and the display's result and quorum lines.
  10. The live check (Task 10) and the docs and final check (Task 11).
  - The brief's motion (one reveal per screen, the stamp, the vote count pulse, the question card's crossfade, reduced motion keeping only the crossfade) comes from the UI foundation's utilities, used here as `animate-stamp`, `animate-count-pulse` and `animate-crossfade`. The per-panel reveal on mount (`animate-reveal` with a 40ms stagger) is not applied; it is cosmetic, and the brief allows it on mount only, so it can be added to the console's columns without touching behavior.
- **Where the code, the server plan, the design, the brief or the request didn't agree, and what this plan does:**
  - **The demo seed.** The request puts the seed's `chairUserId`, `eligibleVoters` and `quorumPercent` in this plan's scheduling or docs task; the UI foundation plan's Task 9 already sets them (its Playwright harness runs on that seed, and the step is guarded by a `grep`). Task 8 says so and changes nothing.
  - **The roadmap's phases.** The roadmap was rewritten while these plans were written: phase B is now "in the room" with the move to the tokens and the Playwright harness inside it. The UI foundation plan no longer touches the roadmap; Task 11 marks B done and C next.
  - **Admins on the console.** The design says admins "vote like members", and the old chair voting panel only offered the chair a deciding vote; the vote panel gives an admin "Your vote".
  - **The organization's name and voting members** are not in the meeting state (only `organizationId`, `title`, `scheduledFor`). The console and the display read them from the user's organizations list (the display route is wrapped in `OrganizationProvider` for that), and count the roster's voting members when `eligibleVoters` is null, as the server does.
  - **Elapsed time** needs the call to order's time, which the state doesn't carry; the console reads the packet's `startedAt` (loaded again when the meeting starts).
  - **Mark absent.** The design's known limits say the chair may mark a member absent whose phone is still connected; the server plan refuses it (`MEMBER_CONNECTED`). The console follows the server and disables the button, with a reason.
  - **The required vote in elections.** The design puts it on the "Open nominations for" form; the shared action takes it at `START_ELECTION`, so it is on the ballot form, after nominations close.
  - **Make a motion on the phone.** The brief's list of action blocks has no "make a motion", but the scenario's motion is moved from a phone; when nothing is pending the phone's one block is "Make a motion", and during debate it is folded under "Other motions".
  - **Self-rename.** The old meeting header let a member rename themselves once; names now come from sign-in and a rejoin restores them (the server plan's known limit), so it goes. The console can rename anyone for the meeting.
  - **The stamp's tilt.** The UI foundation's stamp keyframes rotated in `transform`, which reduced motion turns off with the animation; they now only scale, and the tilt is the `-rotate-4` class, so it stays (the UI foundation plan is updated to match).
  - **Caution as text.** The brief's day `caution` is too faint for text (3.2:1); caution-colored text uses the UI foundation's `caution-ink`.
  - **The phone's last result** stays below the action block until the next vote opens, while the console and the display drop the stamp as soon as the next question comes up (the brief: "stays until the next question").
  - **The Live Meetings page after scheduling.** The UI foundation plan's page loaded the schedule once per organization and showed the scheduler in its place, so a meeting just scheduled wasn't listed until a reload; Task 8 loads it again when the scheduler closes (the Playwright scenario checks the new meeting's Join link there).
  - **The scheduler's copy** moves to sentence case with the brief's voice ("Meeting title", "Next: build the agenda", "Start meeting"); its test changes with it.
  - **The display's last ruling** is shown only while it is the latest thing in the log, since `lastChairRuling` is never cleared.
- **Placeholder scan:** no "TBD", no "similar to"; every new file is given whole; files whose markup changes are replaced whole (the UI foundation's codemod rewrote their classes); the only snippets are imports, logic lines and comments the codemod didn't touch, and lines of files the UI foundation plan wrote after its codemod ran (`LiveMeetingsPage` and its test); the UI foundation plan's other tests that change here are replaced whole. Task 11's roadmap date is `date +%F` on the day the task runs, in row A's format.
- **Names this plan uses from the server plan and the UI foundation plan, spelled as they define them:** `MeetingRole`, `presentBy`, `attendanceSummary`, `AttendanceSummary`, `addVotes`, `NO_VOTES`, `canChairVoteDecide`, `MARK_PRESENT`, `MARK_ABSENT`, `SET_HEADCOUNT`, `SET_FLOOR_TALLY`, `SET_FLOOR_BALLOTS`, `floorVotes`, `floorBallots`, `headcount`, `headcountNames`, `organizationId`, `title`, `scheduledFor`, `packetItemId`, `reconsiderable`, `'voice'`, `MEETING_NOT_FOUND`, `MEMBER_CONNECTED`, `chairUserId`, `startedAt`, `endedAt`, `eligibleVoters`, `quorumPercent`, `quorumCount`, `GET /api/packets/:code/roster`, `POST /api/packets/:code/reload-agenda`, `GET /api/organizations/:orgId/packets`; `SocketProvider({ meetingCode })`, `SocketContextValue.meetingCode`, `leaveMeeting`, `JoinMeetingScreen({ message, initialCode })`, `QrCode`, `joinUrl`, `meetingPath`, `MEETING_CODE`, `normalizeMeetingCode`, `RoleBadge`, `PresenceBadge`, `schedule.list`, `ScheduledMeeting`, the brief's tokens and the utilities `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-lg`, `btn-sm`, `card`, `label-caps`, `card-title`, `meeting-code`, `font-serif-soft`, `badge`, `badge-proposed`, `badge-guest`, `badge-marked`, `text-question`, `text-question-phone`, `text-display-question`, `text-display-line`, `text-display-number`, `text-display-label`, `text-page`, `text-title`, `animate-stamp`, `animate-count-pulse`, `animate-crossfade`; e2e `PEOPLE`, `signIn`, `WEB_PORT`.
- **Names this plan adds:** `JoinError`, `SocketContextValue.joinError`, `isDisplay`, `myRole`, `attendance`; `meetingPackets.roster`, `meetingPackets.reloadAgenda`, `RosterMember`, `MeetingRoster`; `rosterRows`, `RosterRow`, `RosterStatus`, `eligibleCount`, `quorumLine`, `attendanceChip`, `useRoster`, `useEligibleVoters`, `AttendanceBlock`, `HeadcountForm`, `AttendancePanel`; `QuestionView`, `describeQuestion`, `stageLabel`, `StampOutcome`, `ResultView`, `voteResultView`, `electionTally`, `currentResult`, `adjournedAt`, `itemsDecided`, `VoteResult`, `parseVoteResult`, `QuestionCard`, `Stamp`, `TimerLine`; `ChairAction`, `chairActions`, `usePacket`, `ConsoleTopBar`, `JoinInfoCard`, `ActionToolbar`, `ChairScriptLine`, `CurrentItemLine`, `VoteControl`, `ConsoleAgenda`, `MoreArea`, `ChairConsole`; `PhoneMoment`, `phoneMoment`, `STANCE_LABELS`, `PhoneHeader`, `VoteBlock`, `DebateBlock`, `MotionPanel`, `ActionBlock`, `SpeakerList`, `PhoneAgenda`, `PhoneView`; `MeetingDisplay` (`display.tsx`), `DisplayView`; `AttendanceSettingsCard`; e2e `PHONE`, `personPage`.
