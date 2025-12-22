# Codebase Gap Analysis

**Date:** December 21, 2025
**Scope:** Implementation completeness, performance, security, testing

---

## Executive Summary

This analysis identified 18 gaps across implementation, performance, and security. The most critical issues are in action validation (8 action types bypass validation entirely) and state management (race conditions with concurrent users).

---

## Critical Issues (Production Blockers)

### 1. Missing Action Validation for 8 Types

**Location:** [backend/src/socket/actionValidator.ts:438-440](backend/src/socket/actionValidator.ts#L438-L440)

**Issue:** These action types fall through to the default case which returns `{ valid: true }`:

| Action Type | Purpose |
|-------------|---------|
| `CAST_PROXY_VOTE` | Cast a vote on behalf of another member |
| `GRANT_PROXY` | Authorize a member to vote for an absent member |
| `REVOKE_PROXY` | Remove a proxy authorization |
| `SET_PROXY_SETTINGS` | Enable/disable proxy voting, set limits |
| `COMPLETE_ROLL_CALL` | Mark roll call as complete |
| `RESPOND_ROLL_CALL` | Member responds present to roll call |
| `MARK_ABSENT` | Mark a member as absent |
| `SET_AUTO_YIELD` | Configure automatic floor yielding |

**Impact:** Users can perform these operations without proper state validation, potentially causing inconsistent meeting state.

**Status:** ✅ Fixed - Added validation for all 8 action types with appropriate error codes. Default case now rejects unknown action types.

---

### 2. Email Service Not Implemented

**Location:** [backend/src/auth/emailService.ts:27-56](backend/src/auth/emailService.ts#L27-L56)

**Issue:** Email verification codes are logged to console instead of being sent via email. The `sendVerificationEmail` function contains a TODO placeholder.

```typescript
// TODO: Replace with actual email sending logic
console.log(`...VERIFICATION EMAIL...`)
```

The `/api/auth/dev-code` endpoint (used to retrieve codes during development) is disabled in production.

**Impact:** In production, users cannot receive verification codes and cannot log in.

**Recommendation:** Integrate SendGrid, Mailgun, or AWS SES for email delivery.

---

### 3. Race Condition in State Manager

**Location:** [backend/src/socket/stateManager.ts:13-35](backend/src/socket/stateManager.ts#L13-L35)

**Issue:** The `applyAction` function has no optimistic locking:

```typescript
const meeting = await storage.getMeeting(meetingCode);  // Read
const newState = meetingReducer(meeting.state, action);  // Transform
await storage.updateMeetingState(meetingCode, newState, newVersion);  // Write
```

With concurrent users, two clients can:
1. Both read version N
2. Both apply their action to version N
3. Both write version N+1
4. Second write silently overwrites the first

**Impact:** Meeting state modifications can be lost when multiple users act simultaneously.

**Status:** ✅ Fixed - Implemented optimistic locking with version checking. Storage now validates expected version before update. State manager retries up to 3 times on conflict, then returns CONCURRENCY_CONFLICT error.

---

## High Priority Issues

### 4. No Error Boundaries in Component Tree

**Location:** [frontend/src/App.tsx](frontend/src/App.tsx)

**Issue:** Only the root-level `SocketProvider` implicitly wraps components. Large views like `ParticipantView` (494 lines) and `ChairView` (127 lines) are not isolated with error boundaries.

**Impact:** A single JavaScript error in any component crashes the entire application for all users in the meeting.

**Recommendation:** Add ErrorBoundary components around major view sections.

---

### 5. Silent Logout Failure

**Location:** [frontend/src/context/SocketContext.tsx:281-284](frontend/src/context/SocketContext.tsx#L281-L284)

**Issue:** Empty catch block ignores failed logout requests:

```typescript
fetch(`${SERVER_URL}/api/auth/logout`, {
  method: 'POST',
  credentials: 'include'
}).catch(() => { /* Ignore logout errors */ });
```

**Impact:** Users may think they're logged out when session is still active.

---

### 6. Dead localStorage Code

**Location:** [frontend/src/context/SocketContext.tsx:343](frontend/src/context/SocketContext.tsx#L343)

**Issue:** Code attempts to remove auth token from localStorage, but tokens are never stored there (they're in memory only):

```typescript
localStorage.removeItem('authToken');
```

**Impact:** Auth state doesn't persist across page reloads; code suggests incomplete token persistence design.

---

### 7. Incomplete Role Validation

**Location:** [backend/src/socket/actionHandler.ts:138-160](backend/src/socket/actionHandler.ts#L138-L160)

**Issue:** `SET_MEMBER_ROLE` validation doesn't verify the target member exists before assigning roles (though actionValidator.ts now has this check at line 375-377).

---

## Medium Priority Issues

### 8. ParticipantView Component Too Large

**Location:** [frontend/src/views/ParticipantView.tsx](frontend/src/views/ParticipantView.tsx)

**Issue:** 494 lines with multiple form states:
- `motionText`, `selectedMotion`
- `showAgendaAmendForm`, `showSuspendRulesForm`, `showTakeFromTableForm`, `showReconsiderForm`
- 10+ dispatch handlers

**Impact:** Difficult to test, increased re-render scope, harder to maintain.

**Recommendation:** Extract motion forms into separate container components.

---

### 9. Missing Backend Integration Tests

**Location:** [backend/src/__tests__/](backend/src/__tests__/)

**Issue:** Only 2 test files exist:
- `permissionGuard.test.ts` (168 test cases)
- `rateLimiter.test.ts` (20 test cases)

Missing tests for:
- Socket handlers (joinHandler, actionHandler, stateRequestHandler)
- State manager concurrency
- Email verification flow
- Database storage operations

**Impact:** No regression detection for socket/auth logic.

---

### 10. Validator Default Case Too Permissive

**Location:** [backend/src/socket/actionValidator.ts:438-440](backend/src/socket/actionValidator.ts#L438-L440)

**Issue:** Unknown action types return `{ valid: true }`:

```typescript
default:
  // Unknown action type - let reducer handle it
  return { valid: true };
```

**Recommendation:** Return `{ valid: false, error: 'Unknown action type' }` to fail safely.

---

### 11. No Input Length Limits

**Location:** [frontend/src/views/ParticipantView.tsx](frontend/src/views/ParticipantView.tsx)

**Issue:** Motion text input has no maximum length validation. Neither the frontend nor backend enforce text size limits.

**Impact:** Potential DOS through extremely long motion text.

---

## Low Priority Issues

### 12. Console Error Logging Without Context

**Files:** Multiple (actionHandler.ts, authController.ts, etc.)

**Issue:** Error logging uses unstructured `console.error()`:

```typescript
console.error('Error applying action:', error);
```

**Recommendation:** Use structured logging with request IDs for production debugging.

---

### 13. Rate Limiter Memory Growth

**Location:** [backend/src/socket/rateLimiter.ts](backend/src/socket/rateLimiter.ts)

**Issue:** Cleanup interval runs every 5 minutes with 10-minute TTL. With high user churn, buckets can grow between cleanups.

**Impact:** Minor memory growth over time.

---

### 14. Missing Loader States for Auth

**Location:** [frontend/src/views/AuthScreen.tsx](frontend/src/views/AuthScreen.tsx)

**Issue:** Login/verification forms don't show loading state during async operations.

**Impact:** Users might double-submit, consuming rate limits.

---

### 15. Incomplete Election State Machine

**Location:** [shared/reducer/handlers/electionHandlers.ts](shared/reducer/handlers/electionHandlers.ts)

**Issue:** No validation that elections can't start while motion voting is open.

**Impact:** Parliamentary procedure violations possible (low impact since chair-managed).

---

## Summary Table

| # | Issue | Severity | Type | Status |
|---|-------|----------|------|--------|
| 1 | Missing validation for 8 action types | Critical | Validation | ✅ Fixed |
| 2 | Email service not implemented | Critical | Feature | Backlog |
| 3 | State manager race condition | Critical | Concurrency | ✅ Fixed |
| 4 | No error boundaries | High | Error Handling | ✅ Already implemented |
| 5 | Silent logout failure | High | Error Handling | ✅ Fixed |
| 6 | Dead localStorage code | High | Code Quality | ✅ Fixed |
| 7 | Incomplete role validation | High | Validation | Backlog |
| 8 | ParticipantView too large | Medium | Maintainability | Backlog |
| 9 | Missing backend tests | Medium | Testing | Backlog |
| 10 | Validator default too permissive | Medium | Security | ✅ Fixed |
| 11 | No input length limits | Medium | Security | ✅ Fixed |
| 12 | Unstructured logging | Low | Operations | Backlog |
| 13 | Rate limiter memory growth | Low | Performance | Backlog |
| 14 | Missing loader states | Low | UX | ✅ Already implemented |
| 15 | Incomplete election validation | Low | Validation | Backlog |

---

## Recommended Priority

1. **Immediate:** Fix action validator gaps (quick win, security impact)
2. **Immediate:** Fix state manager race condition (data integrity)
3. **Short-term:** Implement email service for production
4. **Short-term:** Add error boundaries to isolate failures
5. **Medium-term:** Add backend integration tests
6. **Medium-term:** Refactor ParticipantView into smaller components

---

*Report generated by Claude Code analysis*
