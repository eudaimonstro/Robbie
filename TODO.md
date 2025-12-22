# TODO

This file tracks all pending tasks and improvements for the Robbie project.

---

## Backend

### Email Service
- [ ] **Replace placeholder email service with actual provider** ([backend/src/auth/emailService.ts:27](backend/src/auth/emailService.ts#L27))
  - Current: Console logging verification codes (dev mode)
  - Options: SendGrid, Mailgun, AWS SES, Postmark
  - Requires: `EMAIL_API_KEY` environment variable

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
