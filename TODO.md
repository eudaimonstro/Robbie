# TODO

This file tracks all pending tasks and improvements for the Robbie project.

---

## Backend

### Production Deployment
- [ ] **Configure email provider environment variables**
  - Set one of: `SENDGRID_API_KEY`, `RESEND_API_KEY`, or `SMTP_*` variables
  - Set `EMAIL_FROM` for sender address
  - See [backend/src/auth/emailService.ts](backend/src/auth/emailService.ts) for configuration options

- [ ] **Enable PostgreSQL persistence (ready to use)**
  - Set `DATABASE_URL` environment variable to enable
  - SSL support auto-detected for cloud databases
  - Graceful shutdown with connection cleanup
  - Action logging for audit trail included

### Testing
- **Test authentication bypass** (for testing without email)
  - Set `ENABLE_TEST_AUTH=true` to enable
  - Default meeting code: `DEMO` (or customize with `TEST_MEETING_CODE`)
  - Default verification code: `000000` (or customize with `TEST_VERIFICATION_CODE`)
  - Use any email address with the test meeting code
  - Optionally pass `name` in verify request body

---

## Frontend

*No pending TODOs*

---

## Mobile

### Testing Workflow

#### Running Tests
```bash
# From root directory
npm run test:mobile           # Run all mobile tests
npm run test:mobile:coverage  # Run with coverage report

# From mobile directory
cd mobile
npm test                      # Run all tests
npm run test:watch            # Watch mode for development
npm run test:coverage         # Generate coverage report
```

#### Test Structure
```
mobile/
├── __tests__/
│   └── components/
│       ├── ui/
│       │   └── Button.test.tsx
│       ├── VotingButtons.test.tsx
│       ├── QuorumBanner.test.tsx
│       └── MotionCard.test.tsx
├── jest.config.js            # Jest configuration
└── jest.setup.js             # Test setup and mocks
```

#### Writing New Tests
1. Create test file in `mobile/__tests__/` mirroring the source structure
2. Use `@testing-library/react-native` for component testing
3. Mock external dependencies in `jest.setup.js` or inline
4. Follow existing test patterns (describe/it blocks, accessibility testing)

#### Mocked Dependencies
- `@react-native-async-storage/async-storage`
- `expo-router` (navigation)
- `socket.io-client`
- `expo-constants`
- `@react-native-picker/picker`

---

## Shared

*No pending TODOs*

---

## Future Enhancements

- [ ] Add integration tests for mobile socket connections
- [ ] Add E2E tests with Detox for mobile
- [ ] Add visual regression tests for components

---

## Completed

- [x] Remove placeholder data from initialState
  - Members: Added dynamically when users join (first user becomes chair)
  - Agenda: Chair adds items before/during meeting
  - Committee Reports: Chair adds as needed
  - Previous Minutes: Can be set via admin interface
- [x] Test role switcher for DEMO meetings
  - Purple flask button in bottom-right corner
  - Allows quick switching between member/chair/admin views
  - Only visible in DEMO meetings with ENABLE_TEST_AUTH=true
- [x] Auth persistence across page reloads
  - Auth state saved to localStorage after verification
  - Restored on page load for seamless experience
- [x] Member-controlled proxy authorization system
- [x] Mobile app resend verification code fix
- [x] Environment-based API URL configuration for mobile
- [x] Component memoization for performance
- [x] Accessibility improvements for color-blind users
- [x] Mobile testing infrastructure (Jest + React Native Testing Library)
  - 53 tests across 4 test files
  - VotingButtons, QuorumBanner, MotionCard, Button components
- [x] Responsive design improvements
  - HelpTooltip: Dynamic width for small screens
  - VotingPanel: Buttons stack on mobile, side-by-side on larger screens
  - Mobile verify screen: Dynamic code input sizing based on screen width
  - Mobile: Fixed touchTargets.button reference
  - Mobile: Changed orientation to "default" for tablet landscape support
- [x] Production-ready email service
  - Supports SMTP, SendGrid, and Resend providers
  - Beautiful HTML email templates for verification codes
  - Auto-detects provider from environment variables
  - Falls back to console logging in development
- [x] JWT security hardening
  - Fail-fast in production if JWT_SECRET missing
  - Require minimum 32-character secret in production
- [x] Backend action validator tests
  - 38 comprehensive tests for action validation
  - Covers motions, voting, proxy, roll call, agenda actions
- [x] PostgreSQL persistence improvements
  - SSL support for cloud databases (auto-detected)
  - Graceful shutdown with connection cleanup
  - Action logging for audit trail
  - Optimistic locking for concurrent updates
