# Robbie Improvement Plan

## Executive Summary

This document outlines code improvements and essential features for the Robbie parliamentary procedure application based on comprehensive codebase analysis.

---

## Phase 1: Critical Security & Stability (Priority: HIGH)

### 1.1 Authentication Security
- [x] **Replace localStorage with HttpOnly cookies for JWT** ✅
  - Current: Token stored in localStorage, vulnerable to XSS
  - Fix: Use HttpOnly cookies, add CSRF protection
  - Files: `frontend/src/context/SocketContext.tsx`, `backend/src/auth/authController.ts`

- [x] **Add Socket.io rate limiting** ✅
  - Current: No rate limiting on socket events
  - Fix: Implement per-user rate limiting for DISPATCH_ACTION
  - Files: `backend/src/socket/socketHandler.ts`, `backend/src/socket/rateLimiter.ts`

### 1.2 Quorum Enforcement
- [x] **Warn when voting without quorum** ✅
  - Current: Votes accepted regardless of quorum
  - Fix: Show warning banner + log entry when voting without quorum (allow but warn)
  - Files: `backend/src/socket/socketHandler.ts`, `shared/reducer/meetingReducer.ts`, `frontend/src/views/ChairView.tsx`, `frontend/src/views/ParticipantView.tsx`

- [x] **Track member presence explicitly** ✅
  - Current: Members appear when connected
  - Fix: Add explicit check-in/attendance tracking via ADD_MEMBER and SET_MEMBER_PRESENCE actions
  - Files: `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`, `backend/src/socket/socketHandler.ts`

### 1.3 Server-Side Authority
- [x] **Generate all timestamps server-side** ✅
  - Current: Inconsistent timestamp generation (client vs server)
  - Fix: Server generates all timestamps in ISO 8601 format
  - Files: `backend/src/socket/socketHandler.ts`

- [x] **Validate voter membership on server** ✅
  - Current: Client-side validation only
  - Fix: Re-verify member exists and is present before accepting vote
  - Files: `backend/src/socket/socketHandler.ts`

---

## Phase 2: Code Quality Improvements (Priority: MEDIUM)

### 2.1 Type Safety
- [x] **Make critical properties required** ✅
  - `Motion.moverId` is now required
  - `Nomination.nomineeId` is now required
  - `Officer.memberId` is now required
  - `Election.candidates[].id` is now required
  - Files: `shared/types/index.ts`

- [x] **Add socket callback timeouts** ✅
  - Current: Socket callbacks can hang indefinitely
  - Fix: Add Promise.race with 10 second timeout, fallback to error
  - Files: `frontend/src/context/SocketContext.tsx`

### 2.2 Code Duplication
- [x] **Extract motion outcome processing** ✅
  - Current: Duplicated in CLOSE_VOTING and UNANIMOUS_CONSENT_PASSED
  - Fix: Created `processOutcomeResult()` helper in `shared/utils/motionOutcomeHelper.ts`
  - Files: `shared/reducer/meetingReducer.ts`, `shared/utils/motionOutcomeHelper.ts`

- [x] **Centralize log message generation** ✅
  - Current: Hardcoded strings throughout reducer
  - Fix: Created log message factory functions in `shared/constants/logMessages.ts`
  - Files: `shared/reducer/meetingReducer.ts`, `shared/constants/logMessages.ts`

### 2.3 Error Handling
- [x] **Add reducer validation error feedback** ✅
  - Current: Silent failures (returns unchanged state)
  - Fix: Added server-side pre-validation via `actionValidator.ts`, returns meaningful error codes
  - Files: `backend/src/socket/actionValidator.ts`, `backend/src/socket/socketHandler.ts`, `shared/types/socket.ts`

- [x] **Add audit logging for role changes** ✅
  - Current: Role changes not logged separately
  - Fix: SET_MEMBER_ROLE now includes changedBy/changedById audit fields
  - Files: `shared/reducer/meetingReducer.ts`, `backend/src/socket/socketHandler.ts`

### 2.4 Cleanup in-memory storage
- [x] **Add verification code expiration cleanup** ✅
  - Current: Old verification records accumulate
  - Fix: Periodic cleanup of expired records every 15 minutes
  - Files: `backend/src/auth/authController.ts`

---

## Phase 3: Robert's Rules Compliance (Priority: MEDIUM)

### 3.1 Debate Management
- [x] **Enforce motion maker speaks first** ✅
  - Current: Tracked but not enforced
  - Fix: Validates in RECOGNIZE_SPEAKER that mover speaks first when motion-maker-priority rule is active
  - Files: `shared/reducer/meetingReducer.ts`, `backend/src/socket/actionValidator.ts`

- [x] **Track debate positions per member** ✅
  - Current: No prevention of side-switching
  - Fix: Added `debatePositions` to state; locks member's stance when speaking; prevents side-switching in RAISE_HAND
  - Files: `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`, `shared/reducer/initialState.ts`, `backend/src/socket/actionValidator.ts`

- [x] **Implement motion renewal prevention by subject** ✅
  - Current: Only blocks exact motion type match
  - Fix: Added `wasMotionDefeated()` with subject-matter matching using 50% word overlap algorithm
  - Files: `shared/utils/motionHelpers.ts`, `backend/src/socket/actionValidator.ts`

### 3.2 Missing Motions
- [x] **Implement Withdraw Motion** ✅
  - Current: Listed in constants but no handler
  - Fix: Added WITHDRAW_MOTION action - mover can withdraw pending or current motion
  - Files: `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`, `backend/src/socket/actionValidator.ts`

- [x] **Implement Modify Motion** ✅
  - Current: Not supported
  - Fix: Added MODIFY_MOTION action - mover can modify motion before debate begins
  - Files: `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`, `backend/src/socket/actionValidator.ts`

- [x] **Implement Divide the Question** ✅
  - Current: Not supported
  - Fix: Added divideQuestion motion with dividedParts; when passed, splits main motion into sequential parts
  - Files: `shared/constants/motions.ts`, `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`, `shared/utils/motionOutcomeHelper.ts`

### 3.3 Voting Improvements
- [x] **Implement Roll Call Voting** ✅
  - Current: Listed in VotingMethod but not implemented
  - Fix: Logs individual votes with member names when votingMethod is 'rollcall'
  - Files: `shared/reducer/meetingReducer.ts`, `shared/constants/logMessages.ts`, `shared/types/index.ts`

- [x] **Add write-in candidate support** ✅
  - Current: Only nominated candidates allowed
  - Fix: CAST_BALLOT already accepts any name; updated CLOSE_ELECTION to mark write-ins; updated DECLARE_ELECTED to accept write-in winners
  - Files: `shared/reducer/meetingReducer.ts`

- [x] **Implement election tie-breaking** ✅
  - Current: Tie just says "no candidate elected"
  - Fix: Detects ties at top; triggers automatic runoff with only tied candidates; tracks runoff round
  - Files: `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`

---

## Phase 4: Essential Features (Priority: MEDIUM-LOW)

### 4.1 Meeting Minutes
- [x] **Implement structured minutes recording** ✅
  - Current: Just a text field for previous minutes
  - Fix: Created MeetingMinutes, AttendanceRecord, MinutesMotionRecord, MinutesElectionRecord types
  - Added generateMeetingMinutes() to build structured minutes from state
  - Files: `shared/types/index.ts`, `shared/utils/minutesGenerator.ts`

- [x] **Add minutes export functionality** ✅
  - Formats: Markdown, JSON (PDF would require external library)
  - Added formatMinutesAsMarkdown() and formatMinutesAsJSON() functions
  - Files: `shared/utils/minutesGenerator.ts`

### 4.2 Attendance System
- [x] **Implement formal roll call** ✅
  - Added RollCallState, RollCallRecord, AttendanceStatus types
  - Added START_ROLL_CALL, RESPOND_ROLL_CALL, COMPLETE_ROLL_CALL actions
  - Tracks each member's response with timestamps
  - Files: `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`, `shared/constants/logMessages.ts`

- [x] **Add absence tracking** ✅
  - Added MARK_ABSENT action with excused/unexcused status
  - Integrated with roll call responses
  - Files: `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`

### 4.3 Motion History
- [x] **Add searchable motion history panel** ✅
  - Created HistoricalMotion type combining completedMotions, tabledMotions, and pending motions
  - Added getMotionHistory(), filterMotionHistory(), getMotionTypes(), getMotionHistoryStats() functions
  - Supports filtering by outcome, type, and search text
  - Files: `shared/utils/motionHistoryHelper.ts`

### 4.4 Speaker Queue UX
- [x] **Add speaker queue position display** ✅
  - Created `speakerQueueHelper.ts` utility module with:
    - `getMemberQueueInfo()` - returns position, estimated wait time, willSpeakNext flag
    - `calculateStanceBalance()` - counts pro/con/neutral and determines if balanced
    - `getQueueStats()` - returns total queue size, estimated total time, current speaker time remaining
    - `canRemoveSelfFromQueue()` - checks if member can remove self (not current speaker)
    - `formatWaitTime()` - formats seconds as "Now", "30s", "2min", "1min 30s"
    - `getNextSpeakerInfo()` - respects pro-con alternation rule
  - Files: `shared/utils/speakerQueueHelper.ts`

---

## Phase 5: UX Improvements (Priority: LOW) ✅

### 5.1 Accessibility ✅
- [x] **Add keyboard-accessible agenda reordering** ✅
  - Added Up/Down arrow buttons for reordering
  - Added keyboard shortcuts: Alt+↑/↓ to move items
  - Added focus management and keyboard navigation
  - Files: `frontend/src/components/DraggableAgendaList.tsx`

- [x] **Improve screen reader support** ✅
  - Added ARIA labels to interactive elements
  - Added role="alert", role="status", role="list" where appropriate
  - Hidden decorative emojis from screen readers
  - Files: Multiple components updated

### 5.2 Timer Enforcement ✅
- [x] **Add auto-yield option for speaker time** ✅
  - Added `autoYieldOnTimeExpired` setting to MeetingState
  - Added `SET_AUTO_YIELD` action to toggle the setting
  - When enabled, automatically yields floor when speaker timer expires
  - Toggle available in Speaker Queue panel
  - Files: `shared/types/index.ts`, `shared/reducer/meetingReducer.ts`, `frontend/src/views/ChairView.tsx`

### 5.3 Real-time Updates
- [ ] **Show typing/action indicators** (Deferred)
  - Requires socket event infrastructure changes
  - Future work: Add typing indicators for motion creation, voting activity

---

## Testing Additions

### Backend Tests Needed
- [ ] Permission matrix enforcement tests
- [ ] Action enrichment correctness tests
- [ ] State consistency after concurrent actions
- [ ] Socket event rate limiting tests
- [ ] JWT expiration handling tests

### Integration Tests
- [ ] Full meeting flow (start to adjourn)
- [ ] Multi-user voting scenarios
- [ ] Quorum loss during meeting
- [ ] Role transfer scenarios

---

## Code Refactoring ✅

### Reducer Handler Modules
Created modular handler structure in `shared/reducer/handlers/`:
- `types.ts` - Common types for action handlers
- `meetingLifecycleHandlers.ts` - START_MEETING, END_MEETING, ADVANCE_STAGE
- `speakerHandlers.ts` - RAISE_HAND, LOWER_HAND, RECOGNIZE_SPEAKER, YIELD_FLOOR
- `agendaHandlers.ts` - Agenda item management
- `memberHandlers.ts` - Member management and role changes
- `rollCallHandlers.ts` - Roll call attendance
- `settingsHandlers.ts` - Settings and configuration
- `index.ts` - Exports all handlers

### Chair View Components
Created reusable components in `frontend/src/components/chair/`:
- `MeetingControlPanel.tsx` - Meeting start/end and chair transfer
- `OrderOfBusinessPanel.tsx` - Meeting stage progression
- `SpeakerQueuePanel.tsx` - Speaker queue with auto-yield support

---

## Documentation Needs

- [ ] Robert's Rules interpretation guide (which rules are implemented, which are simplified)
- [ ] Production deployment guide (PostgreSQL setup, environment variables)
- [ ] API documentation for socket events
- [ ] Meeting administrator guide

---

## Implementation Order

1. **Week 1-2**: Phase 1 (Security & Stability)
2. **Week 3-4**: Phase 2 (Code Quality)
3. **Week 5-6**: Phase 3.1-3.2 (Debate & Motions)
4. **Week 7-8**: Phase 3.3 (Voting) + Phase 4.1-4.2 (Minutes & Attendance)
5. **Week 9+**: Phase 4.3-4.4 + Phase 5 (UX)

---

## Quick Wins (Can be done immediately)

1. ~~Add verification code cleanup job (cron every 15 min)~~ ✅
2. ~~Make moverId/nomineeId required in types~~ ✅
3. ~~Extract processMotionOutcome helper function~~ ✅ (processOutcomeResult)
4. ~~Add socket callback timeout (5 second default)~~ ✅ (10 second timeout)
5. ~~Use ISO 8601 timestamps consistently~~ ✅
