# In the Room (UI Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the whole web app on the design brief's visual language (`docs/design-brief.md`): the paper, ink and gavel tokens in a day and an evening palette, Fraunces and Public Sans, the brief's buttons, cards and badges, a shell and a documents side on the tokens, a meetings module with no raw palette classes left and a check that keeps it that way, deep links to live meetings with QR codes, a Live Meetings page built from the organization's schedule, and a Playwright harness that signs in as the demo's people and captures the main pages in both palettes.

**Architecture:**

- **Tokens.** `frontend-unified/src/styles/index.css` sets each brief token as a CSS variable on `:root` (day) and `.dark` (evening), and exposes it to Tailwind 4 with `@theme inline` (`--color-paper: var(--paper)`), so `bg-paper`, `text-ink` and `bg-gavel` flip with the theme in any subtree marked `.dark`. Fixed scales (`gavel-*`, `ink-*`, `carried-*`, `caution-*`) back the old palette names (`primary-*` to gavel, `secondary-*` to ink, `accent-*` to caution, `success-*` to carried, `danger-*` to gavel), which keep working as a compatibility layer. The `@utility` classes (`btn-*`, `card`, `badge-*`, `input`) are rewritten to the brief, and new ones carry the type scale (`page-title`, `card-title`, `label-caps`, `meeting-code`) and the motion (`animate-reveal`, `animate-stamp`, `animate-count-pulse`, `animate-crossfade`).
- **Fonts.** `@fontsource-variable/fraunces` (its `full.css`, which carries the optical size and `SOFT` axes) and `@fontsource/public-sans` (400, 500, 600) are imported in `main.tsx`: no third-party font requests.
- **The palette check.** `scripts/check-palette.sh` fails `npm run lint` when a web source file uses a raw Tailwind palette class (`gray-`, `blue-`, `indigo-`...), `white` or `black`, the retired `meeting-` palette, or an emoji icon, outside `scripts/palette-allowlist.txt`. The allowlist starts with the 94 files that do today and only shrinks; a listed file that no longer needs it fails the check too. A one-off codemod (`scripts/palette-codemod.mjs`) moves files onto the tokens with a fixed mapping; Tasks 3 to 6 run it over the shell, the documents side and the meetings module, and Task 6 deletes it and closes the palette (`--color-*: initial`).
- **Live meetings by link.** The URL is the meeting: `/meetings/:code` mounts the socket for that code, so a link or a QR code joins after sign-in (the sign-in page's `next` already carries the path). `/meetings` is the Live Meetings page: the organization's schedule from `GET /api/organizations/:orgId/packets` (Join, and Start for the presiding officer) and the code box. `QrCode` renders a join link as an SVG; the chair console, the display and the schedule page use it in the screens plan.
- **Playwright.** `e2e/` at the repository root: a config that migrates the throwaway database and starts the backend (port 3101, test sign-in) and `vite preview` (port 4173, proxying to it), a global setup that clears live meetings and reseeds the Maple Grove HOA demo, a smoke test, and a visual pass that saves screenshots of the main pages in both palettes. CI runs it in its own job.

**Tech Stack:** React 19, React Router 7, Vite 8, Tailwind CSS 4.3, Vitest 5 with Testing Library, `@fontsource-variable/fraunces` 5.3.0, `@fontsource/public-sans` 5.3.0, `qrcode` 1.5.4 (`@types/qrcode` 1.5.6), `@playwright/test` 1.63.0; Node 24, Prisma 7 (the seed).

**Design:** `docs/superpowers/specs/2026-10-06-in-the-room-design.md` (Phase B of `docs/mvp-roadmap.md`), sections "Screens" (the rest of the meetings module moves onto the tokens), "Deep link and QR", "The schedule is the meeting" (the Live Meetings page and the home page) and "Testing" (the Playwright harness); the visual language is `docs/design-brief.md`, which is authoritative for look and feel. The server and shared half, `docs/superpowers/plans/2026-10-06-in-the-room-server.md`, is done before this plan starts. The chair console, phone view, display view and the Playwright meeting scenario are the next plan, `docs/superpowers/plans/2026-10-06-in-the-room-screens.md`, which builds on this one.

**Server API this plan uses** (all from the server plan; nothing here changes the server except the demo seed in Task 9):

| Call                                    | Answer                                                                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/organizations/:orgId/packets` | The schedule (viewer and above): meetings not yet adjourned first, soonest first, undated after them, then adjourned ones, most recent first. Each `{ id, robbieCode, title, description, scheduledFor, chairUserId, startedAt, endedAt, chair: { name } \| null }` |
| `JOIN_MEETING { meetingCode }`          | Unchanged on the wire. A code without a packet answers `{ success: false, error: 'No meeting with that code', errorCode: 'MEETING_NOT_FOUND' }` (the screens plan shows it on the join box)                                                                         |
| `POST /api/auth/verify`                 | `{ email, code }`; with `ENABLE_TEST_AUTH=true` outside production the code `000000` signs in any email and sets the `session` cookie (the Playwright helper uses it)                                                                                               |
| `GET /api/health`                       | `{ status: 'healthy', mode }` (the Playwright web server waits for it)                                                                                                                                                                                              |

**Conventions:**

- Paths are from the repository root. Run commands from the repository root unless a step says `cd frontend-unified &&` or `cd backend-node &&`. Use `&&` between commands, never `;`.
- Use Node 24. The system `node` is 22; put Node 24 first on the PATH in each shell, and check that `node --version` prints `v24.21.0`:

  ```bash
  export PATH=/tmp/claude-1000/-home-steve-workspace-robbie/943dc342-9d15-4cdf-b298-60456f7372f0/scratchpad/node24/node-v24.21.0-linux-x64/bin:$PATH
  ```

- Web tests: `cd frontend-unified && TZ=America/Chicago npx vitest run <path>`; the whole suite is `npm run test:run -w frontend-unified`. The web Vitest config has no `clearMocks`, so each test file clears its own mocks (`vi.clearAllMocks()` in `beforeEach`). Type-check: `cd frontend-unified && npx tsc --noEmit -p .` (it includes the tests).
- The server and shared half is done: `shared/` has `MeetingRole` with `'guest'`, `presentBy`, `attendanceSummary`, and the packet routes exist. If `shared/dist` is older than `shared/types/index.ts`, run `npm run build:shared` before type-checking the web app.
- Never point anything at port 5432 (another project's database; `backend-node/.env` points there). The seed and the Playwright harness use the throwaway Postgres on port 55432, passed explicitly as `DATABASE_URL` and `DIRECT_URL` (dotenv never overrides a variable that is set). Start it once if `docker ps --filter name=robbie-ci-pg` doesn't list it:

  ```bash
  docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine
  ```

  CI's own Postgres service is on port 5432 inside the runner; that is the only place 5432 appears.

- Before/after snippets show the code as it is when the task starts. Prettier formats this plan's code blocks, so a fragment may show less indentation than the file has: match a snippet by its text and keep the file's indentation.
- Before each commit, run `npx prettier --write` on the files you changed (Prettier has no parser for `.sh` files); CI checks formatting.
- Another agent may be committing on this branch. `git add` only the paths each commit step lists, and never run `git checkout`, `git stash` or `git reset`.
- Commit messages carry no `Co-Authored-By` or other attribution lines.
- No emdashes and American spelling in code, comments and copy. Use the brief's token names exactly (`paper`, `surface`, `surface-2`, `ink`, `ink-muted`, `rule`, `gavel`, `gavel-tint`, `carried`, `carried-tint`, `caution`, `caution-tint`) and its voice: labels are nouns, buttons are verbs.
- The mobile app is not touched by this plan.

---

## File structure

**Web** (`frontend-unified/`):

| File                                                                              | Responsibility                                                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                    | `@fontsource-variable/fraunces`, `@fontsource/public-sans`, `qrcode`, `@types/qrcode`                     |
| `src/main.tsx`                                                                    | The font imports                                                                                          |
| `src/styles/index.css`                                                            | Tokens (`:root`, `.dark`, `@theme inline`), scales, compatibility palettes, type scale, utilities, motion |
| `src/styles/__tests__/tokens.test.ts`                                             | The brief's token values in both palettes                                                                 |
| `vite.config.ts`                                                                  | The API proxy target from `API_PROXY_TARGET` (Playwright runs the backend on 3101)                        |
| `src/components/layout/Sidebar.tsx`, `Header.tsx`                                 | `surface-2` sidebar with ink text and a gavel bar on the current page; the brand in Fraunces              |
| `src/components/ui/Badge.tsx`                                                     | Role and presence badges (`RoleBadge`, `PresenceBadge`) on the brief's badge styles                       |
| `src/context/ToastContext.tsx`                                                    | Toasts on the tints                                                                                       |
| `src/components/**`, `src/context/**`, `src/pages/**`, `src/modules/documents/**` | Moved onto the tokens by the codemod (Tasks 3, 4)                                                         |
| `src/modules/meetings/**`                                                         | Moved onto the tokens by the codemod (Tasks 5, 6); `components/mobile/*` deleted                          |
| `src/api/client.ts`                                                               | `schedule.list`, `ScheduledMeeting`                                                                       |
| `src/utils/dates.ts`                                                              | `formatMeetingTime`                                                                                       |
| `src/modules/meetings/index.tsx`                                                  | Routes: `/meetings` (Live Meetings page) and `/meetings/:code` (the meeting)                              |
| `src/modules/meetings/context/SocketContext.tsx`                                  | `SocketProvider` takes the meeting code from the route; join and leave navigate                           |
| `src/modules/meetings/views/LiveMeetingsPage.tsx`                                 | The organization's schedule (Join, Start), the code box, Schedule a meeting                               |
| `src/modules/meetings/views/JoinMeetingScreen.tsx`                                | The code box: navigates to `/meetings/:code`; takes a message and a starting code                         |
| `src/modules/meetings/components/QrCode.tsx`, `utils/joinUrl.ts`                  | A QR code of a link, as an SVG image; `joinUrl(code)`                                                     |
| `src/modules/documents/pages/HomePage.tsx`                                        | Upcoming meetings from the schedule                                                                       |

**Repository root:**

| File                                                                                                   | Responsibility                                                                                      |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `scripts/check-palette.sh`, `scripts/palette-allowlist.txt`                                            | The palette and emoji check, and the files still waiting for it                                     |
| `scripts/palette-codemod.mjs`                                                                          | One-off: raw and compatibility classes to tokens (created in Task 3, deleted in Task 6)             |
| `package.json`                                                                                         | `lint` runs the check; `e2e`; `@playwright/test`                                                    |
| `eslint.config.mjs`                                                                                    | Node globals for `scripts/` and `e2e/`                                                              |
| `e2e/playwright.config.ts`, `e2e/env.ts`, `e2e/global-setup.ts`, `e2e/helpers.ts`, `e2e/tsconfig.json` | The harness                                                                                         |
| `e2e/tests/smoke.spec.ts`, `e2e/tests/visual.spec.ts`                                                  | Sign in as Pat and find the bylaws and the schedule; screenshots of the main pages in both palettes |
| `.github/workflows/ci.yml`                                                                             | The `e2e` job                                                                                       |
| `.gitignore`                                                                                           | Playwright output                                                                                   |
| `backend-node/src/demo/demoSeed.ts`, `backend-node/src/__integration__/demoSeed.test.ts`               | Dana presides over the demo meeting; 142 voting members, quorum 20%                                 |
| `spec.md`, `CLAUDE.md`                                                                                 | Task 10 (the roadmap's phase B row is the screens plan's, which finishes the phase)                 |

The screens plan names three things this plan prepares for and does not build: `SocketContextValue.attendance` (from `attendanceSummary`), `SocketContextValue.myRole` (`'chair' | 'admin' | 'member' | 'guest'`, or null for a display), and display joins (`SocketProvider` with `display`, sending `JOIN_MEETING { meetingCode, display: true }`), plus the display route `/meetings/:code/display`, which sits next to the app layout in `App.tsx`, not inside it.

---

### Task 1: Tokens, typefaces and utilities

**Files:**

- Modify: `frontend-unified/package.json`, `package-lock.json`, `frontend-unified/src/main.tsx`, `frontend-unified/src/styles/index.css`
- Test: `frontend-unified/src/styles/__tests__/tokens.test.ts` (new)

The brief's twelve tokens become CSS variables on `:root` and `.dark`, and Tailwind colors through `@theme inline`. Plain `@theme { --color-paper: var(--paper) }` would not do: Tailwind would emit `var(--color-paper)`, a custom property resolved once on `:root`, so a `.dark` element inside a light page (the display view) would keep the day colors. With `inline`, each utility carries `var(--paper)` itself and resolves it where it is used.

One token is added to the brief's twelve: `caution-ink`. The brief's day `caution` (`#B7791F`) is 3.2:1 on `caution-tint` and 3.6:1 on `surface`, below the 4.5:1 the brief asks for text, so caution-colored text uses `caution-ink` (`#7F5410`, 5.9:1 on the tint; the evening value is `caution` itself, 6.1:1). The `caution` color stays for lines, borders, fills and the timer bar. Badges on `gavel-tint` use `ink` text for the same reason (the evening `gavel` on `gavel-tint` is 4.3:1).

The old palettes are not deleted: `primary-*` points at the new `gavel-*` scale, `secondary-*` at `ink-*`, `accent-*` at `caution-*`, `success-*` at `carried-*`, and `danger-*` and `meeting-*` at `gavel-*` (red is the gavel's). Every screen keeps working, in the new colors, while Tasks 3 to 6 move it onto the tokens. Their day shades sit at 600 and their evening shades at 400, so the existing `text-primary-600 dark:text-primary-400` pairs land on the two gavel values.

- [ ] **Step 1: Add the typefaces**

Run:

```bash
npm install @fontsource-variable/fraunces@5.3.0 @fontsource/public-sans@5.3.0 -w frontend-unified
```

Expected: `added 2 packages` (or close to it), and `frontend-unified/package.json` lists `"@fontsource-variable/fraunces": "^5.3.0"` and `"@fontsource/public-sans": "^5.3.0"` under `dependencies`. `@fontsource-variable/fraunces/full.css` is the build with every axis (weight, optical size, `SOFT`, `WONK`), family `'Fraunces Variable'`; the package's default `index.css` has the weight axis only. Public Sans is family `'Public Sans'`, one file per weight.

- [ ] **Step 2: Write the failing test**

Create `frontend-unified/src/styles/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

/** The declarations of the rule with this selector, at the start of a line */
function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('\n}', start));
}

// docs/design-brief.md, "Color": the day session and the evening session
const BRIEF: Record<string, [string, string]> = {
  paper: ['#f7f3ec', '#15130f'],
  surface: ['#fffdf9', '#1f1c17'],
  'surface-2': ['#f1ebe1', '#282420'],
  ink: ['#1c1a17', '#f3eee6'],
  'ink-muted': ['#5b564e', '#a8a094'],
  rule: ['#e4ddd1', '#332e27'],
  gavel: ['#8b2e25', '#e0604a'],
  'gavel-tint': ['#f6e6e2', '#3a1f1b'],
  carried: ['#2f6b45', '#5dbb7a'],
  'carried-tint': ['#e3efe5', '#1e3326'],
  caution: ['#b7791f', '#e0a530'],
  'caution-tint': ['#fbf0dc', '#3a2e14'],
};

describe('design tokens', () => {
  it.each(Object.entries(BRIEF))('sets %s in both palettes', (name, [day, evening]) => {
    expect(block(':root')).toContain(`--${name}: ${day};`);
    expect(block('.dark')).toContain(`--${name}: ${evening};`);
  });

  it.each(Object.keys(BRIEF))('makes %s a Tailwind color that follows the palette', (name) => {
    expect(block('@theme inline')).toContain(`--color-${name}: var(--${name});`);
  });

  it('keeps the old palette names working, on the new scales', () => {
    expect(css).toContain('--color-primary-600: var(--color-gavel-600);');
    expect(css).toContain('--color-secondary-900: var(--color-ink-900);');
  });

  it('sets the two typefaces', () => {
    expect(css).toContain("--font-heading: 'Fraunces Variable', Georgia, serif;");
    expect(css).toContain("--font-body: 'Public Sans', system-ui, sans-serif;");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/styles/__tests__/tokens.test.ts`
Expected: FAIL, 26 tests, all failing: the stylesheet has no `:root` block, so `block(':root')` fails its own check, and none of the `@theme` lines exist.

- [ ] **Step 4: Replace `frontend-unified/src/styles/index.css`**

Replace the whole file with:

```css
@import 'tailwindcss';

@custom-variant dark (&:is(.dark *));

/*
  Robbie's design tokens (docs/design-brief.md): the clerk's ledger. Each token is a CSS variable
  set on :root for the day session and on .dark for the evening session. ThemeContext puts .dark on
  <html>; the display view puts it on its own root, since it is always dark. The @theme inline
  block below makes Tailwind write var(--paper) into each utility (bg-paper, text-ink...) instead
  of resolving it once at :root, so a .dark subtree flips them too.
*/
:root {
  --paper: #f7f3ec;
  --surface: #fffdf9;
  --surface-2: #f1ebe1;
  --ink: #1c1a17;
  --ink-muted: #5b564e;
  --rule: #e4ddd1;
  --gavel: #8b2e25;
  --gavel-tint: #f6e6e2;
  --carried: #2f6b45;
  --carried-tint: #e3efe5;
  --caution: #b7791f;
  --caution-tint: #fbf0dc;
  /* Caution as text: the caution color is 3.2:1 on its tint in the day palette, too faint for text */
  --caution-ink: #7f5410;
  color-scheme: light;
}

.dark {
  --paper: #15130f;
  --surface: #1f1c17;
  --surface-2: #282420;
  --ink: #f3eee6;
  --ink-muted: #a8a094;
  --rule: #332e27;
  --gavel: #e0604a;
  --gavel-tint: #3a1f1b;
  --carried: #5dbb7a;
  --carried-tint: #1e3326;
  --caution: #e0a530;
  --caution-tint: #3a2e14;
  --caution-ink: #e0a530;
  color-scheme: dark;
}

@theme inline {
  --color-paper: var(--paper);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-rule: var(--rule);
  --color-gavel: var(--gavel);
  --color-gavel-tint: var(--gavel-tint);
  --color-carried: var(--carried);
  --color-carried-tint: var(--carried-tint);
  --color-caution: var(--caution);
  --color-caution-tint: var(--caution-tint);
  --color-caution-ink: var(--caution-ink);
}

@theme {
  /*
    Fixed scales around the tokens, the same in both palettes, for the places that need a shade
    rather than a token (an overlay, a hover). 600 is the day token and 400 the evening one.
  */
  --color-gavel-50: #f6e6e2;
  --color-gavel-100: #efd3cc;
  --color-gavel-200: #e2ada2;
  --color-gavel-300: #e8826f;
  --color-gavel-400: #e0604a;
  --color-gavel-500: #b8432f;
  --color-gavel-600: #8b2e25;
  --color-gavel-700: #74261f;
  --color-gavel-800: #5a1e18;
  --color-gavel-900: #3a1f1b;

  --color-ink-50: #f7f3ec;
  --color-ink-100: #f1ebe1;
  --color-ink-200: #e4ddd1;
  --color-ink-300: #cfc6b8;
  --color-ink-400: #a8a094;
  --color-ink-500: #6e675d;
  --color-ink-600: #5b564e;
  --color-ink-700: #332e27;
  --color-ink-800: #1f1c17;
  --color-ink-900: #15130f;

  --color-carried-50: #e3efe5;
  --color-carried-100: #cfe5d4;
  --color-carried-200: #a9d3b4;
  --color-carried-300: #7fc596;
  --color-carried-400: #5dbb7a;
  --color-carried-500: #3f8a5a;
  --color-carried-600: #2f6b45;
  --color-carried-700: #275a3a;
  --color-carried-800: #1f472e;
  --color-carried-900: #1e3326;

  --color-caution-50: #fbf0dc;
  --color-caution-100: #f7e3bd;
  --color-caution-200: #f0cd85;
  --color-caution-300: #e8b955;
  --color-caution-400: #e0a530;
  --color-caution-500: #c98a22;
  --color-caution-600: #b7791f;
  --color-caution-700: #7f5410;
  --color-caution-800: #5e3e0c;
  --color-caution-900: #3a2e14;

  /*
    Compatibility: the old palettes now point at the scales above, so screens not yet moved onto
    the tokens keep working. New code uses the tokens (bg-paper, text-ink, bg-gavel...), never these.
  */
  --color-primary-50: var(--color-gavel-50);
  --color-primary-100: var(--color-gavel-100);
  --color-primary-200: var(--color-gavel-200);
  --color-primary-300: var(--color-gavel-300);
  --color-primary-400: var(--color-gavel-400);
  --color-primary-500: var(--color-gavel-500);
  --color-primary-600: var(--color-gavel-600);
  --color-primary-700: var(--color-gavel-700);
  --color-primary-800: var(--color-gavel-800);
  --color-primary-900: var(--color-gavel-900);

  --color-secondary-50: var(--color-ink-50);
  --color-secondary-100: var(--color-ink-100);
  --color-secondary-200: var(--color-ink-200);
  --color-secondary-300: var(--color-ink-300);
  --color-secondary-400: var(--color-ink-400);
  --color-secondary-500: var(--color-ink-500);
  --color-secondary-600: var(--color-ink-600);
  --color-secondary-700: var(--color-ink-700);
  --color-secondary-800: var(--color-ink-800);
  --color-secondary-900: var(--color-ink-900);

  --color-accent-50: var(--color-caution-50);
  --color-accent-100: var(--color-caution-100);
  --color-accent-200: var(--color-caution-200);
  --color-accent-300: var(--color-caution-300);
  --color-accent-400: var(--color-caution-400);
  --color-accent-500: var(--color-caution-500);
  --color-accent-600: var(--color-caution-600);
  --color-accent-700: var(--color-caution-700);
  --color-accent-800: var(--color-caution-800);
  --color-accent-900: var(--color-caution-900);

  --color-success-50: var(--color-carried-50);
  --color-success-100: var(--color-carried-100);
  --color-success-200: var(--color-carried-200);
  --color-success-300: var(--color-carried-300);
  --color-success-400: var(--color-carried-400);
  --color-success-500: var(--color-carried-500);
  --color-success-600: var(--color-carried-600);
  --color-success-700: var(--color-carried-700);
  --color-success-800: var(--color-carried-800);
  --color-success-900: var(--color-carried-900);

  /* Red is the gavel's: destructive confirmations use it too */
  --color-danger-50: var(--color-gavel-50);
  --color-danger-100: var(--color-gavel-100);
  --color-danger-200: var(--color-gavel-200);
  --color-danger-300: var(--color-gavel-300);
  --color-danger-400: var(--color-gavel-400);
  --color-danger-500: var(--color-gavel-500);
  --color-danger-600: var(--color-gavel-600);
  --color-danger-700: var(--color-gavel-700);
  --color-danger-800: var(--color-gavel-800);
  --color-danger-900: var(--color-gavel-900);

  /* Until the meetings module moves onto the tokens (see scripts/check-palette.sh) */
  --color-meeting-50: var(--color-gavel-50);
  --color-meeting-100: var(--color-gavel-100);
  --color-meeting-200: var(--color-gavel-200);
  --color-meeting-300: var(--color-gavel-300);
  --color-meeting-400: var(--color-gavel-400);
  --color-meeting-500: var(--color-gavel-500);
  --color-meeting-600: var(--color-gavel-600);
  --color-meeting-700: var(--color-gavel-700);
  --color-meeting-800: var(--color-gavel-800);
  --color-meeting-900: var(--color-gavel-900);

  /* Fraunces for headings, questions, results and the display; Public Sans for everything else */
  --font-heading: 'Fraunces Variable', Georgia, serif;
  --font-body: 'Public Sans', system-ui, sans-serif;
  --font-document: 'Fraunces Variable', Georgia, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  /* The brief's scale beyond Tailwind's xs (0.75), sm (0.875), base (1) and lg (1.125) */
  --text-title: 1.375rem;
  --text-title--line-height: 1.3;
  --text-page: 1.75rem;
  --text-page--line-height: 1.2;
  --text-question: 2.5rem;
  --text-question--line-height: 1.2;
  --text-question-phone: 1.5rem;
  --text-question-phone--line-height: 1.25;
  /* The display view at 1080p: 72px, 40px, 96px and 28px */
  --text-display-question: 4.5rem;
  --text-display-question--line-height: 1.15;
  --text-display-line: 2.5rem;
  --text-display-line--line-height: 1.25;
  --text-display-number: 6rem;
  --text-display-number--line-height: 1;
  --text-display-label: 1.75rem;
  --text-display-label--line-height: 1.2;

  --ease-out-quiet: cubic-bezier(0.2, 0.7, 0.3, 1);
}

@layer base {
  /* Borders default to the rule, not currentcolor (Tailwind 4) */
  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: var(--rule);
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--ink-muted);
  }

  body {
    @apply font-body text-ink bg-paper leading-normal;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    @apply font-heading font-semibold leading-tight;
    font-optical-sizing: auto;
    font-variation-settings: 'SOFT' 50;
  }

  :focus-visible {
    outline: 2px solid var(--gavel);
    outline-offset: 2px;
  }
}

/* The serif with the brief's warmth, for anything that isn't a heading element */
@utility font-serif-soft {
  font-family: var(--font-heading);
  font-optical-sizing: auto;
  font-variation-settings: 'SOFT' 50;
}

/* Page titles (1.75rem) and card titles (1.375rem), in Fraunces */
@utility page-title {
  @apply font-serif-soft text-page font-semibold text-ink;
}

@utility card-title {
  @apply font-serif-soft text-title font-semibold text-ink;
}

/* Labels and section headers ("Attendance"): Public Sans 600, 0.75rem, uppercase, tracked, muted */
@utility label-caps {
  @apply font-body text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted;
}

/* The meeting code: Public Sans 600 with 0.12em tracking, tabular, not a monospace */
@utility meeting-code {
  @apply font-body font-semibold tracking-[0.12em] tabular-nums;
}

@utility btn {
  /* 40px on laptops; btn-lg is the 56px phone size. The focus ring is 2px gavel, offset on paper. */
  @apply inline-flex items-center justify-center gap-2 px-4 py-2 min-h-10 rounded-lg font-body font-medium transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gavel focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 disabled:cursor-not-allowed;
}

@utility btn-primary {
  @apply btn bg-gavel text-paper hover:bg-gavel/90 active:bg-gavel/80;
}

@utility btn-secondary {
  @apply btn border border-ink text-ink bg-transparent hover:bg-surface-2;
}

@utility btn-ghost {
  @apply btn bg-transparent text-gavel hover:bg-gavel-tint;
}

/* Destructive confirmations: the gavel's red is the only red */
@utility btn-danger {
  @apply btn bg-gavel text-paper hover:bg-gavel/90 active:bg-gavel/80;
}

@utility btn-success {
  @apply btn bg-carried text-paper hover:bg-carried/90;
}

@utility btn-sm {
  @apply px-3 py-1.5 min-h-8 text-sm;
}

@utility btn-lg {
  @apply px-6 py-3 min-h-14 text-lg;
}

@utility card {
  /* Surface on paper, a 1px rule, 12px radius, no shadow */
  @apply bg-surface rounded-xl border border-rule;
}

@utility card-hover {
  @apply card hover:border-ink-muted transition-colors duration-150;
}

@utility section-card {
  /* Section cards for document view */
  @apply p-4 border-l-4 border-rule hover:border-gavel transition-colors duration-150 bg-surface;
}

@utility badge {
  /* The label style in a tint */
  @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-body text-xs font-semibold uppercase tracking-[0.08em] bg-surface-2 text-ink-muted;
}

@utility badge-draft {
  @apply badge bg-surface-2 text-ink-muted;
}

@utility badge-proposed {
  @apply badge bg-caution-tint text-caution-ink;
}

@utility badge-passed {
  @apply badge bg-carried-tint text-carried;
}

/* Failed is ink on paper: the word carries the meaning, not red */
@utility badge-failed {
  @apply badge bg-surface-2 text-ink;
}

@utility badge-tabled {
  @apply badge bg-gavel-tint text-ink;
}

@utility badge-withdrawn {
  @apply badge bg-surface-2 text-ink-muted;
}

/* Meeting roles */
@utility badge-chair {
  @apply badge bg-gavel-tint text-ink;
}

@utility badge-admin {
  @apply badge bg-surface-2 text-ink;
}

@utility badge-member {
  @apply badge bg-surface-2 text-ink-muted;
}

@utility badge-guest {
  @apply badge bg-caution-tint text-caution-ink;
}

/* Presence */
@utility badge-present {
  @apply badge bg-carried-tint text-carried;
}

@utility badge-marked {
  @apply badge bg-carried-tint text-ink;
}

@utility badge-absent {
  @apply badge bg-surface-2 text-ink-muted;
}

@utility input {
  /* Form inputs */
  @apply w-full px-3 py-2 rounded-lg border border-rule bg-surface text-ink font-body placeholder:text-ink-muted focus:outline-hidden focus:border-gavel focus:ring-2 focus:ring-gavel/30;
}

@utility input-error {
  @apply input border-gavel focus:ring-gavel/30;
}

@utility label {
  @apply block text-sm font-medium text-ink mb-1;
}

@utility select {
  @apply input appearance-none bg-no-repeat bg-right pr-10;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23857c70' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 0.5rem center;
  background-size: 1.5em 1.5em;
}

@utility textarea {
  @apply input resize-none;
}

@utility diff-add {
  /* Diff highlighting - includes visual indicators beyond color for accessibility */
  @apply bg-carried-tint text-ink border-l-4 border-carried pl-2;
}

@utility diff-delete {
  @apply bg-gavel-tint text-ink line-through;
}

@utility diff-modify {
  @apply bg-caution-tint text-ink underline decoration-caution decoration-2;
}

@utility modal-backdrop {
  /* Modal backdrop: the darkest ink at half strength, in both palettes */
  @apply fixed inset-0 bg-ink-900/50 flex items-center justify-center z-50 animate-fade-in;
}

@utility modal-content {
  @apply bg-surface border border-rule rounded-xl max-w-lg w-full mx-4 animate-slide-up;
}

@utility spinner {
  /* Loading spinner */
  @apply animate-spin rounded-full border-2 border-current border-t-transparent;
}

@utility skeleton {
  /* Skeleton loader */
  @apply animate-pulse bg-surface-2 rounded-sm;
}

@utility tree-node {
  /* Tree node */
  @apply relative pl-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-px before:bg-rule;
}

@utility tree-node-last {
  @apply before:bottom-1/2;
}

@utility tab {
  /* Tabs */
  @apply px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink border-b-2 border-transparent hover:border-rule transition-colors;
}

@utility tab-active {
  @apply tab text-ink border-gavel;
}

@utility tooltip {
  /* Tooltip */
  @apply absolute z-50 px-2 py-1 text-xs font-medium text-paper bg-ink rounded-sm;
}

@utility document-content {
  /* Document content styling */
  @apply font-document leading-relaxed text-ink;

  & h1 {
    @apply text-2xl font-bold mb-4 text-ink;
  }

  & h2 {
    @apply text-xl font-bold mb-3 text-ink;
  }

  & h3 {
    @apply text-lg font-semibold mb-2 text-ink;
  }

  & p {
    @apply mb-4;
  }

  & ul {
    @apply mb-4 pl-6;
  }

  & ol {
    @apply mb-4 pl-6;
  }

  & li {
    @apply mb-1;
  }

  & ul {
    @apply list-disc;
  }

  & ol {
    @apply list-decimal;
  }

  & blockquote {
    @apply border-l-4 border-rule pl-4 py-2 my-4 italic text-ink-muted bg-surface-2;
  }

  & code {
    @apply font-mono text-sm bg-surface-2 px-1.5 py-0.5 rounded-sm;
  }

  & pre {
    @apply font-mono text-sm bg-surface-2 p-4 rounded-lg overflow-x-auto my-4;
  }

  & pre code {
    @apply bg-transparent p-0;
  }
}

@utility animate-fade-in {
  animation: fade-in 0.15s ease-out;
}

@utility animate-slide-up {
  animation: slide-up 0.2s ease-out;
}

@utility animate-slide-in-right {
  animation: slide-in-right 0.2s ease-out;
}

/*
  Motion (docs/design-brief.md): one reveal when a screen mounts, the stamp, the pulse on counts
  while a vote is open, and the crossfade of the question card. Reduced motion keeps only the
  crossfade.
*/
@utility animate-reveal {
  /* Panels fade and rise 8px; stagger them with style={{ animationDelay }} in 40ms steps */
  animation: reveal 240ms var(--ease-out-quiet) both;
}

@utility animate-stamp {
  /* Scale and fade only: the stamp element carries its own tilt (-rotate-4) */
  animation:
    stamp-scale 180ms ease-out both,
    stamp-fade 60ms linear both;
}

@utility animate-count-pulse {
  animation: count-pulse 1.6s ease-in-out infinite;
}

@utility animate-crossfade {
  animation: crossfade 200ms ease-out both;
}

@utility scrollbar-thin {
  /* Scrollbar styling */
  scrollbar-width: thin;
  scrollbar-color: var(--rule) transparent;

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--rule);
    border-radius: 3px;
  }
}

@utility table-striped {
  /* Table striped rows */
  & tr:nth-child(even) {
    @apply bg-surface-2;
  }

  & tr:hover {
    @apply bg-gavel-tint;
  }
}

@utility label-required {
  /* Required field indicator */
  &::after {
    content: '*';
    @apply text-gavel ml-0.5;
  }
}

@utility error-message {
  /* Error message */
  @apply text-sm text-gavel mt-1;
}

@utility content-readable {
  /* Content max-width for readability */
  @apply max-w-4xl;
}

@layer utilities {
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slide-in-right {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes reveal {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* The stamp's -4 degree tilt is its own (the -rotate-4 class), so it stays with reduced motion */
  @keyframes stamp-scale {
    from {
      transform: scale(1.2);
    }
    to {
      transform: scale(1);
    }
  }

  @keyframes stamp-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes count-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }

  @keyframes crossfade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}

/* Reduced motion: everything stops except the question card's crossfade */
@media (prefers-reduced-motion: reduce) {
  *:not(.animate-crossfade),
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  .animate-fade-in,
  .animate-slide-up,
  .animate-slide-in-right,
  .animate-reveal,
  .animate-stamp,
  .animate-count-pulse,
  .animate-spin,
  .animate-pulse {
    animation: none !important;
  }
}

/* Print styles */
@media print {
  /* Hide non-essential elements */
  aside,
  nav,
  header,
  .sidebar,
  .no-print,
  button:not(.print-only),
  .btn,
  .modal-backdrop {
    display: none !important;
  }

  /* Reset body styles for print */
  body {
    background: white !important;
    color: black !important;
    font-size: 12pt;
    line-height: 1.5;
  }

  /* Full width content */
  main {
    margin: 0 !important;
    padding: 1cm !important;
    width: 100% !important;
    max-width: none !important;
  }

  /* Cards for print */
  .card {
    border: 1px solid #ccc !important;
    box-shadow: none !important;
    break-inside: avoid;
  }

  /* Section content */
  .section-card {
    border-left: 2px solid #8b2e25 !important;
    page-break-inside: avoid;
  }

  /* Document content */
  .document-content {
    font-size: 11pt;
    color: black !important;
  }

  /* Links */
  a {
    color: black !important;
    text-decoration: underline;
  }

  /* Page breaks */
  h1,
  h2,
  h3 {
    page-break-after: avoid;
  }

  /* Show print-only elements */
  .print-only {
    display: block !important;
  }
}
```

What changed besides the tokens: the `@layer base` border and placeholder colors no longer reach for `--color-gray-*` (a Tailwind palette this app no longer uses); headings are Fraunces with optical sizing and `SOFT` 50; the focus outline is 2px `gavel`; `btn` is 40px tall with an 8px radius and `btn-lg` 56px; `card` is `surface` on a 1px `rule` with a 12px radius and no shadow; badges are the label style in a tint, with role (`badge-chair`, `badge-admin`, `badge-member`, `badge-guest`) and presence (`badge-present`, `badge-marked`, `badge-absent`) variants; the failed badge is ink, not red; the motion utilities are new; the reduced-motion rule spares `animate-crossfade`, which the brief keeps; and the stray `@utility dark` block, which defined a `dark` class utility by mistake, is gone.

- [ ] **Step 5: Load the typefaces in `frontend-unified/src/main.tsx`**

Replace:

```tsx
import { BrowserRouter } from 'react-router-dom';
import App from './App';
```

with:

```tsx
import { BrowserRouter } from 'react-router-dom';
// Fraunces (every axis: weight, optical size, SOFT) and Public Sans, served by the app itself
import '@fontsource-variable/fraunces/full.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import App from './App';
```

- [ ] **Step 6: Run the test, the type-check, the web suite and a build**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/styles/__tests__/tokens.test.ts`
Expected: 26 passed.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && npx vite build && grep -c "Fraunces Variable" dist/assets/*.css`
Expected: a clean type-check; every web test passes (no test reads class names); `✓ built in` from Vite; and a count of at least 1 (the font faces are in the CSS bundle, with `.woff2` files beside it in `dist/assets`).

- [ ] **Step 7: Commit**

```bash
npx prettier --write frontend-unified/package.json frontend-unified/src/main.tsx frontend-unified/src/styles/index.css frontend-unified/src/styles/__tests__/tokens.test.ts
git add frontend-unified/package.json package-lock.json frontend-unified/src/main.tsx frontend-unified/src/styles/index.css frontend-unified/src/styles/__tests__/tokens.test.ts
git commit -m "feat(web): the design brief's tokens, typefaces and utilities

Paper, ink and gavel in a day and an evening palette, as CSS variables that
Tailwind reads through @theme inline, so a .dark subtree flips them. The old
palettes point at the new scales until each screen moves onto the tokens.
Fraunces and Public Sans are self-hosted. Buttons, cards, badges and inputs
follow the brief, and new utilities carry the type scale and the motion."
```

---

### Task 2: The palette check and the codemod

**Files:**

- Create: `scripts/check-palette.sh`, `scripts/palette-allowlist.txt`, `scripts/palette-codemod.mjs`
- Modify: `package.json`, `eslint.config.mjs`

The brief's rule is "no raw Tailwind palette classes; use the tokens", checked in CI by `scripts/check-palette.sh`. The check covers the Tailwind palettes (`gray-`, `slate-`, `red-`, `amber-`, `green-`, `blue-`, `indigo-`, `purple-` and the rest, with a shade), `white` and `black` (white text is `paper` on the brief's buttons, a white card is `surface`, an overlay is `ink-900`), the retired `meeting-` palette, and emoji used as icons (the brief: lucide only). It reads every `.ts`, `.tsx` and `.css` file under `frontend-unified/src` except tests. The compatibility palettes (`primary-`, `secondary-` and the rest) are not checked: they point at the new scales and read correctly.

At the start, 94 files fail it: the meetings module (about 730 raw classes in 60 files, none with a `dark:` variant, so they have no evening palette at all), and a `bg-white` or `dark:text-white` in most of the shell and the documents side. They go on the allowlist, which only shrinks: a listed file that passes fails the check until its line is removed. Tasks 3 to 6 empty it.

The codemod does the moving. It is a fixed mapping, so its result is predictable and reviewable: light and dark pairs of the compatibility palettes become one token (`text-secondary-900 dark:text-white` to `text-ink`), compatibility colors that read wrong in the evening (`text-primary-600` on its own, a `success-` fill under white text) become tokens, every raw class becomes a token with its variant prefix kept (`hover:bg-indigo-700` to `hover:bg-gavel/90`), a `dark:` variant of the meeting palette is dropped (the token flips by itself), and emoji icons are removed (the words beside them carry the meaning). Raw reds become the gavel: in this module they are actions and destructive buttons, which the brief colors gavel; a failed result is never red (the screens plan's stamp says FAILED in ink). It leaves anything it has no mapping for and exits with 1, naming it.

- [ ] **Step 1: Create `scripts/check-palette.sh`**

```bash
#!/usr/bin/env bash
# Fails when a web source file uses a raw Tailwind palette class (gray-, blue-, indigo-, ...),
# white or black, the retired meeting- palette, or an emoji as an icon, outside the allowlist.
# The design tokens in frontend-unified/src/styles/index.css replace them (docs/design-brief.md).
#
# The allowlist (scripts/palette-allowlist.txt) names files still waiting to move onto the
# tokens. It only shrinks: a listed file that no longer needs it fails the check too.
#
# Usage: bash scripts/check-palette.sh (npm run lint runs it)
set -euo pipefail
cd "$(dirname "$0")/.."

export LC_ALL=C.UTF-8
SRC=frontend-unified/src
ALLOWLIST=scripts/palette-allowlist.txt

PALETTE='(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|decoration|placeholder|shadow)(?:-[trblxy])?-(?:(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|meeting)-\d{2,3}|white|black)(?:/\d+)?(?![\w-])'
EMOJI='[\x{1F300}-\x{1FAFF}\x{2600}-\x{26FF}\x{2705}\x{270B}\x{23F0}-\x{23FA}]'

offending=$(grep -rlP "$PALETTE|$EMOJI" "$SRC" --include='*.ts' --include='*.tsx' --include='*.css' \
  --exclude-dir=__tests__ | sort || true)
allowed=$(grep -v '^\s*\(#.*\)\?$' "$ALLOWLIST" | sort || true)

status=0
new=$(comm -23 <(printf '%s\n' "$offending" | sed '/^$/d') <(printf '%s\n' "$allowed" | sed '/^$/d'))
if [ -n "$new" ]; then
  echo "Raw palette classes or emoji icons (use the tokens in $SRC/styles/index.css):"
  for file in $new; do
    grep -noP "$PALETTE|$EMOJI" "$file" | sed "s|^|  $file:|"
  done
  status=1
fi
clean=$(comm -13 <(printf '%s\n' "$offending" | sed '/^$/d') <(printf '%s\n' "$allowed" | sed '/^$/d'))
if [ -n "$clean" ]; then
  echo "These files no longer need the allowlist; remove them from $ALLOWLIST:"
  printf '  %s\n' $clean
  status=1
fi
count=$(printf '%s\n' "$allowed" | sed '/^$/d' | wc -l)
if [ "$status" -eq 0 ]; then
  echo "Palette check passed ($count files on the allowlist)."
fi
exit $status
```

Then make it executable: `chmod +x scripts/check-palette.sh`. It needs GNU grep with `-P` (Ubuntu and CI have it).

- [ ] **Step 2: Create `scripts/palette-allowlist.txt`**

```text
# Web source files that still use raw Tailwind palette classes, white or black, the old
# meeting- palette, or emoji icons (see scripts/check-palette.sh). Remove a file once it is on
# the design tokens; never add one.
frontend-unified/src/components/auth/RequireSession.tsx
frontend-unified/src/components/auth/TermsStep.tsx
frontend-unified/src/components/layout/AppLayout.tsx
frontend-unified/src/components/layout/Header.tsx
frontend-unified/src/components/layout/OrganizationSwitcher.tsx
frontend-unified/src/components/layout/Sidebar.tsx
frontend-unified/src/components/layout/UserMenu.tsx
frontend-unified/src/components/shared/ErrorBoundary.tsx
frontend-unified/src/components/ui/EmptyState.tsx
frontend-unified/src/components/ui/LoadingSpinner.tsx
frontend-unified/src/components/ui/Modal.tsx
frontend-unified/src/modules/documents/components/MembersCard.tsx
frontend-unified/src/modules/documents/components/SectionTree.tsx
frontend-unified/src/modules/documents/components/ShareModal.tsx
frontend-unified/src/modules/documents/pages/amendmentDetailPage/AmendmentChangesList.tsx
frontend-unified/src/modules/documents/pages/amendmentDetailPage/AmendmentHeader.tsx
frontend-unified/src/modules/documents/pages/AmendmentDetailPage.tsx
frontend-unified/src/modules/documents/pages/AmendmentsPage.tsx
frontend-unified/src/modules/documents/pages/DocumentDiffPage.tsx
frontend-unified/src/modules/documents/pages/documentPage/DocumentContentCard.tsx
frontend-unified/src/modules/documents/pages/documentPage/DocumentHeader.tsx
frontend-unified/src/modules/documents/pages/documentPage/ExportDropdown.tsx
frontend-unified/src/modules/documents/pages/documentPage/PendingAmendmentsPanel.tsx
frontend-unified/src/modules/documents/pages/DocumentPage.tsx
frontend-unified/src/modules/documents/pages/HomePage.tsx
frontend-unified/src/modules/documents/pages/meetingDetailPage/MeetingDetailsCard.tsx
frontend-unified/src/modules/documents/pages/meetingDetailPage/MeetingHeader.tsx
frontend-unified/src/modules/documents/pages/MeetingDetailPage.tsx
frontend-unified/src/modules/documents/pages/meetingDetailPage/VotesPanels.tsx
frontend-unified/src/modules/documents/pages/MeetingsPage.tsx
frontend-unified/src/modules/documents/pages/PublicDocumentPage.tsx
frontend-unified/src/modules/documents/pages/SettingsPage.tsx
frontend-unified/src/modules/meetings/components/ActiveSuspensionsBanner.tsx
frontend-unified/src/modules/meetings/components/admin/MeetingSettingsPanel.tsx
frontend-unified/src/modules/meetings/components/admin/MembersPanel.tsx
frontend-unified/src/modules/meetings/components/admin/RenameModal.tsx
frontend-unified/src/modules/meetings/components/admin/RoleChangeModal.tsx
frontend-unified/src/modules/meetings/components/admin/TimeLimitsPanel.tsx
frontend-unified/src/modules/meetings/components/AgendaAmendmentForm.tsx
frontend-unified/src/modules/meetings/components/bylawAmendment/ChangeTypeSelector.tsx
frontend-unified/src/modules/meetings/components/bylawAmendment/ContentFields.tsx
frontend-unified/src/modules/meetings/components/bylawAmendment/FormStatusDisplays.tsx
frontend-unified/src/modules/meetings/components/BylawAmendmentForm.tsx
frontend-unified/src/modules/meetings/components/bylawAmendment/SectionSelector.tsx
frontend-unified/src/modules/meetings/components/BylawyerLinkPanel.tsx
frontend-unified/src/modules/meetings/components/chair/AgendaPanel.tsx
frontend-unified/src/modules/meetings/components/chair/ChairScriptPanel.tsx
frontend-unified/src/modules/meetings/components/chair/CommitteeReportsPanel.tsx
frontend-unified/src/modules/meetings/components/chair/MeetingControlPanel.tsx
frontend-unified/src/modules/meetings/components/chair/MeetingDocumentsPanel.tsx
frontend-unified/src/modules/meetings/components/chair/MinutesApprovalPanel.tsx
frontend-unified/src/modules/meetings/components/chair/MotionStackPanel.tsx
frontend-unified/src/modules/meetings/components/chair/OrderOfBusinessPanel.tsx
frontend-unified/src/modules/meetings/components/chair/PendingMotionPanel.tsx
frontend-unified/src/modules/meetings/components/chair/PendingSecondPanel.tsx
frontend-unified/src/modules/meetings/components/chair/ProxyManagementPanel.tsx
frontend-unified/src/modules/meetings/components/chair/SpeakerQueuePanel.tsx
frontend-unified/src/modules/meetings/components/chair/UnanimousConsentPanel.tsx
frontend-unified/src/modules/meetings/components/chair/VotingPanel.tsx
frontend-unified/src/modules/meetings/components/CountdownTimer.tsx
frontend-unified/src/modules/meetings/components/DraggableAgendaList.tsx
frontend-unified/src/modules/meetings/components/ElectionPanel.tsx
frontend-unified/src/modules/meetings/components/ErrorBoundary.tsx
frontend-unified/src/modules/meetings/components/HelpTooltip.tsx
frontend-unified/src/modules/meetings/components/InquiryPanel.tsx
frontend-unified/src/modules/meetings/components/mobile/BottomSheet.tsx
frontend-unified/src/modules/meetings/components/mobile/ResponsiveGrid.tsx
frontend-unified/src/modules/meetings/components/mobile/TouchButton.tsx
frontend-unified/src/modules/meetings/components/mobile/TouchRadioGroup.tsx
frontend-unified/src/modules/meetings/components/MotionCard.tsx
frontend-unified/src/modules/meetings/components/NominationsPanel.tsx
frontend-unified/src/modules/meetings/components/participant/CurrentBusinessPanel.tsx
frontend-unified/src/modules/meetings/components/participant/MotionSelector.tsx
frontend-unified/src/modules/meetings/components/participant/PendingSecondSection.tsx
frontend-unified/src/modules/meetings/components/participant/ProxyAcceptancePanel.tsx
frontend-unified/src/modules/meetings/components/participant/ProxyRequestPanel.tsx
frontend-unified/src/modules/meetings/components/participant/SpeakerRecognitionPanel.tsx
frontend-unified/src/modules/meetings/components/participant/UnanimousConsentSection.tsx
frontend-unified/src/modules/meetings/components/participant/VoteResultsPanel.tsx
frontend-unified/src/modules/meetings/components/participant/VotingPanel.tsx
frontend-unified/src/modules/meetings/components/ReconsiderForm.tsx
frontend-unified/src/modules/meetings/components/scheduling/AgendaItemEditor.tsx
frontend-unified/src/modules/meetings/components/scheduling/AttachmentUploader.tsx
frontend-unified/src/modules/meetings/components/scheduling/MeetingScheduler.tsx
frontend-unified/src/modules/meetings/components/scheduling/PacketBuilder.tsx
frontend-unified/src/modules/meetings/components/SuspendRulesForm.tsx
frontend-unified/src/modules/meetings/components/TakeFromTableForm.tsx
frontend-unified/src/modules/meetings/index.tsx
frontend-unified/src/modules/meetings/views/AdminView.tsx
frontend-unified/src/modules/meetings/views/JoinMeetingScreen.tsx
frontend-unified/src/modules/meetings/views/MeetingApp.tsx
frontend-unified/src/modules/meetings/views/ParticipantView.tsx
frontend-unified/src/pages/legal/LegalPage.tsx
frontend-unified/src/pages/SignInPage.tsx
```

- [ ] **Step 3: Run the check**

Run: `bash scripts/check-palette.sh`
Expected: `Palette check passed (94 files on the allowlist).`

If it lists a file under "Raw palette classes or emoji icons", that file was added on this branch after this plan was written: don't add it to the allowlist; move it onto the tokens with the codemod from Step 5 (`node scripts/palette-codemod.mjs <file>`) and run the check again.

Then check that it catches a new raw class:

```bash
printf "export const probe = 'bg-gray-100 text-white';\n" > frontend-unified/src/paletteProbe.ts && bash scripts/check-palette.sh ; rm frontend-unified/src/paletteProbe.ts
```

(The `;` is deliberate here: the check fails, and the probe must be removed anyway.) Expected:

```
Raw palette classes or emoji icons (use the tokens in frontend-unified/src/styles/index.css):
  frontend-unified/src/paletteProbe.ts:1:bg-gray-100
  frontend-unified/src/paletteProbe.ts:1:text-white
```

- [ ] **Step 4: Run it with the linter**

In `package.json`, replace:

```json
    "lint": "eslint .",
```

with:

```json
    "lint": "eslint . && npm run lint:palette",
    "lint:palette": "bash scripts/check-palette.sh",
```

CI's "Lint" step runs `npm run lint`, so it now runs the check.

In `eslint.config.mjs`, add after the `frontend-unified/**/*.{ts,tsx}` block (before the closing `);`):

```js
  {
    // Node scripts and the Playwright harness
    files: ['scripts/**/*.mjs', 'e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
```

- [ ] **Step 5: Create `scripts/palette-codemod.mjs`**

```js
#!/usr/bin/env node
/**
 * Moves web files off raw Tailwind palette classes onto the design tokens
 * (docs/design-brief.md). A one-off for MVP Phase B; deleted once no file needs it.
 *
 * Usage: node scripts/palette-codemod.mjs <file>...
 *
 * 1. Light and dark pairs of the compatibility palettes become one token that flips with the
 *    theme ("text-secondary-900 dark:text-white" -> "text-ink").
 * 2. Every raw palette class (gray, indigo, green, amber, red, blue, purple, orange), the old
 *    meeting palette, and white and black become a token, keeping their variant prefixes
 *    (hover:, focus:, disabled:...). A dark: variant of the meeting palette is dropped: the
 *    token already flips.
 * 3. Emoji used as icons are removed; the words next to them carry the meaning.
 *
 * A class with no mapping is left alone and reported; the command then exits with 1.
 */
import fs from 'node:fs';

const PAIRS = [
  // No gradients (docs/design-brief.md)
  ['bg-linear-to-r from-meeting-700 to-meeting-800', 'bg-gavel'],
  ['text-secondary-900 dark:text-white', 'text-ink'],
  ['hover:text-secondary-900 dark:hover:text-white', 'hover:text-ink'],
  ['text-secondary-800 dark:text-secondary-200', 'text-ink'],
  ['text-secondary-700 dark:text-secondary-200', 'text-ink'],
  ['text-secondary-700 dark:text-secondary-300', 'text-ink'],
  ['text-secondary-600 dark:text-secondary-400', 'text-ink-muted'],
  ['text-secondary-500 dark:text-secondary-400', 'text-ink-muted'],
  ['border-secondary-200 dark:border-secondary-700', 'border-rule'],
  ['border-secondary-300 dark:border-secondary-600', 'border-rule'],
  ['divide-secondary-100 dark:divide-secondary-700', 'divide-rule'],
  ['hover:bg-secondary-50 dark:hover:bg-secondary-800/50', 'hover:bg-surface-2'],
  ['hover:bg-secondary-50 dark:hover:bg-secondary-700', 'hover:bg-surface-2'],
  ['hover:bg-secondary-50 dark:hover:bg-secondary-600', 'hover:bg-surface-2'],
  ['hover:bg-secondary-100 dark:hover:bg-secondary-700', 'hover:bg-surface-2'],
  ['hover:bg-secondary-200 dark:hover:bg-secondary-700', 'hover:bg-rule'],
  ['bg-white dark:bg-secondary-800', 'bg-surface'],
  ['bg-white dark:bg-secondary-700', 'bg-surface'],
  ['bg-white dark:bg-secondary-900', 'bg-surface'],
  ['bg-white/80 dark:bg-secondary-900/80', 'bg-paper/80'],
  ['bg-secondary-50 dark:bg-secondary-900', 'bg-paper'],
  ['bg-secondary-50 dark:bg-secondary-800/50', 'bg-surface-2'],
  ['bg-secondary-50 dark:bg-secondary-800', 'bg-surface-2'],
  ['bg-secondary-100 dark:bg-secondary-800', 'bg-surface-2'],
  ['bg-secondary-100 dark:bg-secondary-700', 'bg-surface-2'],
  ['text-primary-600 dark:text-primary-400', 'text-gavel'],
  ['text-danger-600 dark:text-danger-400', 'text-gavel'],
  ['bg-primary-50 dark:bg-primary-900/20', 'bg-gavel-tint'],
  ['bg-primary-50 dark:bg-primary-900/30', 'bg-gavel-tint'],
  ['bg-primary-100 dark:bg-primary-900/30', 'bg-gavel-tint'],
  ['bg-success-100 dark:bg-success-900/30', 'bg-carried-tint'],
  ['bg-accent-100 dark:bg-accent-900/30', 'bg-caution-tint'],
  ['bg-danger-100 dark:bg-danger-900/30', 'bg-gavel-tint'],
  ['bg-danger-50 dark:bg-danger-900/20', 'bg-gavel-tint'],
  // Page titles (after the pair that makes their color text-ink)
  ['text-2xl font-heading font-bold text-ink', 'page-title'],
];

// Compatibility classes, as whole class tokens with their variant prefix, that would read wrong
// in the evening palette: light-only text colors, and fills under white text (white text becomes
// paper, which flips, so the fill must flip too). Applied after PAIRS. An empty replacement
// drops the class.
const TOKENS = {
  'text-primary-600': 'text-gavel',
  'text-primary-700': 'text-gavel',
  'hover:text-primary-600': 'hover:text-gavel',
  'hover:text-primary-700': 'hover:text-gavel',
  'group-hover:text-primary-600': 'group-hover:text-gavel',
  'text-danger-500': 'text-gavel',
  'text-danger-600': 'text-gavel',
  'text-danger-700': 'text-gavel',
  'text-success-600': 'text-carried',
  'text-success-700': 'text-carried',
  'text-accent-600': 'text-caution-ink',
  'text-accent-700': 'text-caution-ink',
  'text-secondary-400': 'text-ink-muted',
  'text-secondary-500': 'text-ink-muted',
  'hover:text-secondary-600': 'hover:text-ink',
  'hover:text-secondary-700': 'hover:text-ink',
  'bg-primary-600': 'bg-gavel',
  'bg-primary-700': 'bg-gavel/90',
  'hover:bg-primary-700': 'hover:bg-gavel/90',
  'focus:bg-primary-600': 'focus:bg-gavel',
  'bg-success-500': 'bg-carried',
  'bg-success-600': 'bg-carried',
  'hover:bg-success-600': 'hover:bg-carried/90',
  'hover:bg-success-700': 'hover:bg-carried/90',
  'bg-accent-500': 'bg-gavel',
  'bg-accent-600': 'bg-gavel',
  'hover:bg-accent-600': 'hover:bg-gavel/90',
  'hover:bg-accent-700': 'hover:bg-gavel/90',
  'bg-danger-500': 'bg-gavel',
  'hover:bg-danger-600': 'hover:bg-gavel/90',
  'bg-secondary-600': 'bg-ink',
  'hover:bg-secondary-700': 'hover:bg-ink/90',
  'disabled:bg-secondary-300': 'disabled:bg-rule',
  'dark:disabled:bg-secondary-600': '',
  'dark:disabled:bg-secondary-700': '',
};

// Raw palette class (without variant prefix) -> token class
const SINGLES = {
  // Neutrals
  'text-gray-900': 'text-ink',
  'text-gray-800': 'text-ink',
  'text-gray-700': 'text-ink',
  'text-gray-600': 'text-ink-muted',
  'text-gray-500': 'text-ink-muted',
  'text-gray-400': 'text-ink-muted',
  'bg-gray-50': 'bg-surface-2',
  'bg-gray-100': 'bg-surface-2',
  'bg-gray-200': 'bg-rule',
  'bg-gray-300': 'bg-rule',
  'bg-gray-400': 'bg-ink-muted',
  'bg-gray-500': 'bg-ink-muted',
  'bg-gray-600': 'bg-ink',
  'bg-gray-700': 'bg-ink/90',
  'border-gray-200': 'border-rule',
  'border-gray-300': 'border-rule',
  'border-gray-400': 'border-ink-muted',
  'ring-gray-400': 'ring-ink-muted',
  'ring-gray-500': 'ring-gavel',
  // Actions and the current item: the gavel
  'bg-indigo-500': 'bg-gavel',
  'bg-indigo-600': 'bg-gavel',
  'bg-indigo-700': 'bg-gavel/90',
  'bg-indigo-800': 'bg-gavel/80',
  'bg-blue-500': 'bg-gavel',
  'bg-blue-600': 'bg-gavel',
  'bg-blue-700': 'bg-gavel/90',
  'bg-red-500': 'bg-gavel',
  'bg-red-600': 'bg-gavel',
  'bg-red-700': 'bg-gavel/90',
  'bg-red-800': 'bg-gavel/80',
  'bg-amber-500': 'bg-gavel',
  'bg-amber-600': 'bg-gavel',
  'bg-amber-700': 'bg-gavel/90',
  'bg-indigo-50': 'bg-gavel-tint',
  'bg-indigo-100': 'bg-gavel-tint',
  'bg-blue-50': 'bg-gavel-tint',
  'bg-blue-100': 'bg-gavel-tint',
  'bg-purple-50': 'bg-gavel-tint',
  'bg-red-50': 'bg-gavel-tint',
  'bg-red-100': 'bg-gavel-tint',
  'bg-red-200': 'bg-gavel-tint',
  'text-indigo-400': 'text-gavel',
  'text-indigo-500': 'text-gavel',
  'text-indigo-600': 'text-gavel',
  'text-indigo-700': 'text-gavel',
  'text-indigo-800': 'text-ink',
  'text-indigo-900': 'text-ink',
  'text-blue-500': 'text-gavel',
  'text-blue-600': 'text-gavel',
  'text-blue-700': 'text-ink',
  'text-blue-800': 'text-ink',
  'text-blue-900': 'text-ink',
  'text-purple-600': 'text-gavel',
  'text-purple-700': 'text-ink',
  'text-purple-800': 'text-ink',
  'text-red-400': 'text-gavel',
  'text-red-600': 'text-gavel',
  'text-red-700': 'text-gavel',
  'text-red-800': 'text-ink',
  'border-indigo-200': 'border-rule',
  'border-indigo-300': 'border-rule',
  'border-indigo-400': 'border-gavel',
  'border-indigo-500': 'border-gavel',
  'border-indigo-600': 'border-gavel',
  'border-blue-200': 'border-rule',
  'border-blue-300': 'border-rule',
  'border-purple-300': 'border-rule',
  'border-red-200': 'border-gavel/30',
  'border-red-300': 'border-gavel/30',
  'border-red-400': 'border-gavel',
  'border-red-600': 'border-gavel',
  'ring-indigo-500': 'ring-gavel',
  'ring-blue-400': 'ring-gavel',
  'ring-red-300': 'ring-gavel/30',
  'ring-red-500': 'ring-gavel',
  'ring-amber-500': 'ring-gavel',
  'ring-green-500': 'ring-gavel',
  // Carried, elected, present
  'bg-green-50': 'bg-carried-tint',
  'bg-green-100': 'bg-carried-tint',
  'bg-green-500': 'bg-carried',
  'bg-green-600': 'bg-carried',
  'bg-green-700': 'bg-carried/90',
  'bg-green-800': 'bg-carried/80',
  'text-green-600': 'text-carried',
  'text-green-700': 'text-carried',
  'text-green-800': 'text-ink',
  'text-green-900': 'text-ink',
  'border-green-200': 'border-carried/40',
  'border-green-300': 'border-carried/40',
  'border-green-400': 'border-carried',
  'border-green-600': 'border-carried',
  'ring-green-300': 'ring-carried/40',
  // Caution: no quorum, time running out, a pending second
  'bg-amber-50': 'bg-caution-tint',
  'bg-amber-100': 'bg-caution-tint',
  'bg-orange-100': 'bg-caution-tint',
  'text-amber-600': 'text-caution-ink',
  'text-amber-700': 'text-caution-ink',
  'text-amber-800': 'text-ink',
  'text-amber-900': 'text-ink',
  'text-orange-800': 'text-ink',
  'border-amber-200': 'border-caution/40',
  'border-amber-300': 'border-caution/40',
  'border-amber-400': 'border-caution',
  'border-amber-500': 'border-caution',
  // The old meeting palette
  'bg-meeting-50': 'bg-gavel-tint',
  'bg-meeting-100': 'bg-gavel-tint',
  'bg-meeting-600': 'bg-gavel',
  'bg-meeting-600/80': 'bg-gavel/80',
  'bg-meeting-700': 'bg-gavel/90',
  'text-meeting-200': 'text-paper/80',
  'text-meeting-500': 'text-gavel',
  'text-meeting-600': 'text-gavel',
  'text-meeting-700': 'text-gavel',
  'text-meeting-800': 'text-ink',
  'text-meeting-900': 'text-ink',
  'border-meeting-200': 'border-gavel/30',
  'border-meeting-300': 'border-gavel/30',
  'border-meeting-500': 'border-gavel',
  'border-meeting-600': 'border-gavel',
  'ring-meeting-400': 'ring-gavel',
  'ring-meeting-500': 'ring-gavel',
  'from-meeting-700': 'from-gavel',
  'to-meeting-800': 'to-gavel',
  // White and black
  'bg-white': 'bg-surface',
  'bg-white/20': 'bg-paper/20',
  'bg-white/30': 'bg-paper/30',
  'bg-white/80': 'bg-paper/80',
  'text-white': 'text-paper',
  'text-white/80': 'text-paper/80',
  'bg-black/50': 'bg-ink-900/50',
  'bg-black/70': 'bg-ink-900/70',
};

// Under dark:, a token already flips, so white text is ink and a white background is surface
const DARK_SINGLES = { 'text-white': 'text-ink', 'bg-white': 'bg-surface' };

const CLASS =
  /(?<![\w-])((?:[a-z-]+:)*)((?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|decoration|placeholder|shadow)(?:-[trblxy])?-(?:(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|meeting)-\d{2,3}|white|black)(?:\/\d+)?)(?![\w-])/g;

// Emoji used as icons (the ranges scripts/check-palette.sh rejects): one in a span of its own
// goes with the span, and one before a word goes with the space after it
const PICTOGRAPH =
  '[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{26FF}\\u{2705}\\u{270B}\\u{23F0}-\\u{23FA}]\\u{FE0F}?';
const EMOJI = new RegExp(`<span[^>]*>\\s*${PICTOGRAPH}\\s*</span>\\s*|${PICTOGRAPH} ?`, 'gu');

// Stands in for a dropped class until its space is taken out (a private-use character)
const DROP = '\uE000';

let unmapped = 0;
for (const file of process.argv.slice(2)) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [from, to] of PAIRS) text = text.split(from).join(to);
  for (const [from, to] of Object.entries(TOKENS)) {
    const token = new RegExp(`(?<![^\\s"'\`])${from.replace(/[/]/g, '\\/')}(?![^\\s"'\`])`, 'g');
    text = text.replace(token, to || DROP);
  }
  text = text.replace(CLASS, (match, prefix, base) => {
    if (prefix.includes('dark:')) {
      if (base.includes('-meeting-')) return DROP;
      if (DARK_SINGLES[base]) return prefix + DARK_SINGLES[base];
    }
    if (SINGLES[base]) return prefix + SINGLES[base];
    console.error(`${file}: no mapping for ${match}`);
    unmapped++;
    return match;
  });
  // A dropped class takes one space with it
  text = text.replace(new RegExp(` ?${DROP} ?`, 'g'), (m) =>
    m.startsWith(' ') && m.endsWith(' ') ? ' ' : '',
  );
  text = text.replace(EMOJI, '');
  fs.writeFileSync(file, text);
}
process.exitCode = unmapped > 0 ? 1 : 0;
```

The tokens it maps onto are all defined in Task 1: `ink-900` (the darkest ink, for overlays, the same in both palettes), `caution-ink` for caution-colored text, and the `/90` and `/80` opacity steps of the fills for hover and active states.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: ESLint reports warnings only (no more than before this task; the codemod and the check add none), then `Palette check passed (94 files on the allowlist).`

- [ ] **Step 7: Commit**

```bash
npx prettier --write scripts/palette-codemod.mjs package.json eslint.config.mjs
git add scripts/check-palette.sh scripts/palette-allowlist.txt scripts/palette-codemod.mjs package.json eslint.config.mjs
git commit -m "chore: check the web app for raw palette classes and emoji icons

scripts/check-palette.sh, run by npm run lint, fails on a raw Tailwind
palette class, white or black, the old meeting palette, or an emoji icon
outside scripts/palette-allowlist.txt, which lists the 94 files still
waiting for the design tokens and only shrinks. scripts/palette-codemod.mjs
moves a file onto the tokens with a fixed mapping."
```

---

### Task 3: The shell and the ui kit

**Files:**

- Modify: everything under `frontend-unified/src/components`, `frontend-unified/src/context` and `frontend-unified/src/pages` that the codemod changes (the auth screens, the layout, the ui kit, the legal pages, the sign-in page)
- Modify (by hand): `frontend-unified/src/components/layout/Sidebar.tsx` (replaced), `Header.tsx`, `frontend-unified/src/components/ui/Badge.tsx` (replaced), `frontend-unified/src/components/ui/index.ts`, `frontend-unified/src/context/ToastContext.tsx`, `scripts/palette-allowlist.txt`
- Test: `frontend-unified/src/components/layout/__tests__/Sidebar.test.tsx`, `frontend-unified/src/components/ui/__tests__/Badge.test.tsx` (new)

The sidebar becomes `surface-2` with ink text and a gavel bar on the current page (the brief: "not a blue block"); the header is `surface` with the name in Fraunces; the ui kit (`Modal`, `ConfirmDialog`, `EmptyState`, `LoadingSpinner`, `Badge`) and the sign-in, terms and legal pages are on the tokens, so the evening palette works everywhere. The badge component gains the role and presence badges the screens plan uses.

- [ ] **Step 1: Write the failing tests**

In `frontend-unified/src/components/layout/__tests__/Sidebar.test.tsx`, add inside `describe('Sidebar', () => {`, after the last `it`:

```tsx
it('marks the current page for the eye and for screen readers', async () => {
  list.mockResolvedValueOnce([]);
  render(
    <MemoryRouter initialEntries={['/amendments']}>
      <Sidebar onNewDocument={() => {}} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Amendments' }).getAttribute('aria-current')).toBe(
    'page',
  );
  expect(
    screen.getByRole('link', { name: 'Live Meetings' }).getAttribute('aria-current'),
  ).toBeNull();
  await waitFor(() => expect(list).toHaveBeenCalled());
});
```

Create `frontend-unified/src/components/ui/__tests__/Badge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceBadge, RoleBadge, StatusBadge } from '../Badge';

describe('badges', () => {
  it('name a meeting role, each in its own tint', () => {
    render(
      <>
        <RoleBadge role="chair" />
        <RoleBadge role="guest" />
      </>,
    );
    expect(screen.getByText('Chair').className).toContain('badge-chair');
    expect(screen.getByText('Guest').className).toContain('badge-guest');
  });

  it('say how someone is present', () => {
    render(
      <>
        <PresenceBadge presence="present" />
        <PresenceBadge presence="marked" />
        <PresenceBadge presence="absent" />
      </>,
    );
    expect(screen.getByText('Present').className).toContain('badge-present');
    expect(screen.getByText('Marked present').className).toContain('badge-marked');
    expect(screen.getByText('Absent').className).toContain('badge-absent');
  });

  it('show a failed amendment in ink, not red', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed').className).toContain('badge-failed');
  });
});
```

(The badge's class is its whole design here: the utilities in `index.css` carry the colors, so these tests check the class and not a computed color, which jsdom doesn't compute from Tailwind.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/components/layout/__tests__/Sidebar.test.tsx src/components/ui/__tests__/Badge.test.tsx`
Expected: FAIL. The sidebar's links have no `aria-current`; `RoleBadge` and `PresenceBadge` are not exported (the Badge file fails to import them, so its three tests fail).

- [ ] **Step 3: Run the codemod over the shell**

Run:

```bash
node scripts/palette-codemod.mjs $(find frontend-unified/src/components frontend-unified/src/context frontend-unified/src/pages -name '*.tsx' -not -path '*/__tests__/*')
```

Expected: no output (every class has a mapping). Read the diff (`git diff --stat` lists 18 files): the pairs became tokens (`bg-white dark:bg-secondary-800` is `bg-surface`, `text-secondary-900 dark:text-white` is `text-ink`, `bg-secondary-50 dark:bg-secondary-900` is `bg-paper`), the legal page's title is `page-title`, the skip link is `focus:bg-gavel focus:text-paper`, and the mobile overlay is `bg-ink-900/50`.

- [ ] **Step 4: Replace `frontend-unified/src/components/layout/Sidebar.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FileText,
  GitBranch,
  Calendar,
  Settings,
  Plus,
  ChevronRight,
  ChevronDown,
  X,
  Users,
} from 'lucide-react';
import { useOrganization, useCan } from '../../context/OrganizationContext';
import { documents as documentsApi, Document } from '../../api/client';

const navItems = [
  { icon: FileText, label: 'Documents', path: '/' },
  { icon: GitBranch, label: 'Amendments', path: '/amendments' },
  { icon: Calendar, label: 'Meeting Records', path: '/bylawyer-meetings' },
  { icon: Users, label: 'Live Meetings', path: '/meetings' },
];

/**
 * A navigation entry: ink on surface-2, and the current page on surface with a gavel bar at its
 * left edge (docs/design-brief.md: the sidebar is "not a blue block")
 */
function entryClass(current: boolean, nested = false): string {
  const size = nested ? 'gap-2 px-3 py-1.5 mb-0.5 text-sm' : 'gap-3 px-3 py-2 mb-1';
  const state = current
    ? 'bg-surface text-ink font-medium before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-gavel'
    : 'text-ink-muted hover:bg-surface hover:text-ink';
  return `relative flex items-center rounded-md transition-colors ${size} ${state}`;
}

interface SidebarProps {
  onNewDocument: () => void;
  onClose?: () => void;
}

export default function Sidebar({ onNewDocument, onClose }: SidebarProps) {
  const location = useLocation();
  const { currentOrganization } = useOrganization();
  // Documents are created by secretaries and above
  const canCreate = useCan('secretary');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [expandedDocs, setExpandedDocs] = useState(true);

  // Reload on navigation too: creating a document navigates to it, and deleting one navigates
  // away. The client caches the list and clears the cache on any write, so this is cheap.
  useEffect(() => {
    if (currentOrganization) {
      documentsApi.list(currentOrganization.id).then(setDocuments).catch(console.error);
    } else {
      setDocuments([]);
    }
  }, [currentOrganization, location.pathname]);

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/documents');
    }
    return location.pathname.startsWith(path);
  };
  const onSettings = location.pathname === '/settings';

  return (
    <aside className="w-64 bg-surface-2 text-ink border-r border-rule flex flex-col h-full">
      {/* Mobile close button */}
      {onClose && (
        <div className="flex justify-end p-2 md:hidden">
          <button
            onClick={onClose}
            className="p-2 rounded-md text-ink-muted hover:text-ink hover:bg-surface"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* New Document Button (a role implies a current organization) */}
      {canCreate && (
        <div className="p-4 pt-2 md:pt-4">
          <button onClick={onNewDocument} className="btn-primary w-full">
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Document
          </button>
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 px-2 overflow-y-auto scrollbar-thin" aria-label="Main">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          if (item.path === '/') {
            // Documents with expandable list
            return (
              <div key={item.path}>
                <button
                  onClick={() => setExpandedDocs(!expandedDocs)}
                  aria-expanded={expandedDocs}
                  className={`w-full ${entryClass(active)}`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {expandedDocs ? (
                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>

                {expandedDocs && documents.length > 0 && (
                  <div className="ml-4 mb-2">
                    {documents.map((doc) => {
                      const current = location.pathname === `/documents/${doc.id}`;
                      return (
                        <Link
                          key={doc.id}
                          to={`/documents/${doc.id}`}
                          aria-current={current ? 'page' : undefined}
                          className={entryClass(current, true)}
                        >
                          <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{doc.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? 'page' : undefined}
              className={entryClass(active)}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <div className="p-4 border-t border-rule">
        <Link
          to="/settings"
          aria-current={onSettings ? 'page' : undefined}
          className={entryClass(onSettings)}
        >
          <Settings className="w-5 h-5" aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
```

The Live Meetings entry no longer has its own color: it is a page like the others.

- [ ] **Step 5: The name in the header**

In `frontend-unified/src/components/layout/Header.tsx`, replace (as the codemod left it):

```tsx
        <Scale className="w-6 h-6 text-gavel" aria-hidden="true" />
        <h1 className="text-xl font-heading font-bold text-gavel">Robbie</h1>
```

with:

```tsx
        <Scale className="w-6 h-6 text-gavel" aria-hidden="true" />
        <h1 className="font-serif-soft text-title font-semibold text-ink">Robbie</h1>
```

- [ ] **Step 6: Replace `frontend-unified/src/components/ui/Badge.tsx`**

```tsx
import { ReactNode } from 'react';
import type { MeetingRole } from '@robbie-bylawyer/shared/types';

type BadgeVariant =
  | 'draft'
  | 'proposed'
  | 'passed'
  | 'failed'
  | 'tabled'
  | 'withdrawn'
  | MeetingRole
  | Presence
  | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

// The badge utilities in styles/index.css: the label style in a tint
const variantClasses: Record<BadgeVariant, string> = {
  draft: 'badge-draft',
  proposed: 'badge-proposed',
  passed: 'badge-passed',
  failed: 'badge-failed',
  tabled: 'badge-tabled',
  withdrawn: 'badge-withdrawn',
  chair: 'badge-chair',
  admin: 'badge-admin',
  member: 'badge-member',
  guest: 'badge-guest',
  present: 'badge-present',
  marked: 'badge-marked',
  absent: 'badge-absent',
  default: 'badge',
};

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return <span className={`${variantClasses[variant]} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant = ['draft', 'proposed', 'passed', 'failed', 'tabled', 'withdrawn'].includes(status)
    ? (status as BadgeVariant)
    : 'default';

  return <Badge variant={variant}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

export function DocumentTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    bylaws: 'Bylaws',
    standing_rules: 'Standing Rules',
    policy: 'Policy',
  };

  return <Badge variant="default">{labels[type] || type}</Badge>;
}

export function MeetingTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    regular: 'Regular',
    special: 'Special',
    annual: 'Annual',
    emergency: 'Emergency',
  };
  const variants: Record<string, BadgeVariant> = {
    regular: 'default',
    special: 'proposed',
    annual: 'tabled',
    emergency: 'chair',
  };

  return <Badge variant={variants[type] ?? 'default'}>{labels[type] || type}</Badge>;
}

const ROLE_LABELS: Record<MeetingRole, string> = {
  chair: 'Chair',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
};

/** A person's role in a live meeting */
export function RoleBadge({ role }: { role: MeetingRole }) {
  return <Badge variant={role}>{ROLE_LABELS[role]}</Badge>;
}

/** How someone is in the room: on a device, marked present by the chair, or absent */
export type Presence = 'present' | 'marked' | 'absent';

const PRESENCE_LABELS: Record<Presence, string> = {
  present: 'Present',
  marked: 'Marked present',
  absent: 'Absent',
};

export function PresenceBadge({ presence }: { presence: Presence }) {
  return <Badge variant={presence}>{PRESENCE_LABELS[presence]}</Badge>;
}
```

In `frontend-unified/src/components/ui/index.ts`, replace:

```ts
export { default as Badge, StatusBadge, DocumentTypeBadge, MeetingTypeBadge } from './Badge';
```

with:

```ts
export {
  default as Badge,
  StatusBadge,
  DocumentTypeBadge,
  MeetingTypeBadge,
  RoleBadge,
  PresenceBadge,
  type Presence,
} from './Badge';
```

- [ ] **Step 7: Toasts on the tints**

In `frontend-unified/src/context/ToastContext.tsx`, replace (as the codemod left it):

```tsx
const colors = {
  success:
    'bg-success-50 border-success-500 text-success-800 dark:bg-success-900/20 dark:text-success-200',
  error:
    'bg-danger-50 border-danger-500 text-danger-800 dark:bg-danger-900/20 dark:text-danger-200',
  warning:
    'bg-accent-50 border-accent-500 text-accent-800 dark:bg-accent-900/20 dark:text-accent-200',
  info: 'bg-primary-50 border-primary-500 text-primary-800 dark:bg-primary-900/20 dark:text-primary-200',
};

const iconColors = {
  success: 'text-success-500',
  error: 'text-gavel',
  warning: 'text-accent-500',
  info: 'text-primary-500',
};
```

with:

```tsx
const colors = {
  success: 'bg-carried-tint border-carried text-ink',
  error: 'bg-gavel-tint border-gavel text-ink',
  warning: 'bg-caution-tint border-caution text-ink',
  info: 'bg-surface border-rule text-ink',
};

const iconColors = {
  success: 'text-carried',
  error: 'text-gavel',
  warning: 'text-caution-ink',
  info: 'text-ink-muted',
};
```

- [ ] **Step 8: Take the shell off the allowlist**

Run: `sed -i '\#^frontend-unified/src/components/#d; \#^frontend-unified/src/pages/#d' scripts/palette-allowlist.txt && bash scripts/check-palette.sh`
Expected: `Palette check passed (81 files on the allowlist).` (13 lines removed: the two auth screens, five layout files, the error boundary, three ui files, the legal page and the sign-in page.)

- [ ] **Step 9: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/components/layout/__tests__/Sidebar.test.tsx src/components/ui/__tests__/Badge.test.tsx`
Expected: 6 passed (3 in each file).

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass; lint ends with the palette check passing.

- [ ] **Step 10: Commit**

```bash
npx prettier --write frontend-unified/src/components frontend-unified/src/context frontend-unified/src/pages
git add frontend-unified/src/components frontend-unified/src/context frontend-unified/src/pages scripts/palette-allowlist.txt
git commit -m "feat(web): the shell and the ui kit on the design tokens

The sidebar is surface-2 with ink text and a gavel bar on the current page,
marked aria-current. The header, menus, dialogs, empty states, toasts, the
sign-in and terms screens and the legal pages use the tokens, so the evening
palette works throughout. Badges gain the meeting roles and presence."
```

---

### Task 4: The documents side

**Files:**

- Modify: the files under `frontend-unified/src/modules/documents` that the codemod changes (26 of its 28 `.tsx` files outside tests), `scripts/palette-allowlist.txt`

The documents side already uses the compatibility palettes, so it looks right in the new colors after Task 1; what it lacks is the evening palette in a few places (`bg-white` cards, `dark:text-white` headings, `text-primary-600` links that were dark-on-dark) and the brief's page titles. The codemod's pairs fix the first and make every page title `page-title` (Fraunces, 1.75rem). Nothing here changes behavior.

- [ ] **Step 1: Run the codemod over the documents side**

Run:

```bash
node scripts/palette-codemod.mjs $(find frontend-unified/src/modules/documents -name '*.tsx' -not -path '*/__tests__/*')
```

Expected: no output. `git diff --stat frontend-unified/src/modules/documents` lists 26 files. Check a sample of the diff: in `pages/HomePage.tsx` the dashboard title is `<h2 className="page-title">`, the cards' header rules are `border-rule`, the list dividers are `divide-rule`, and the links are `text-gavel`; in `pages/documentPage/DocumentHeader.tsx` the document title is `page-title`; in `pages/SettingsPage.tsx` the danger zone keeps its compatibility classes (`border-danger-200 dark:border-danger-900`), which point at the gavel scale.

- [ ] **Step 2: Take the documents side off the allowlist**

Run: `sed -i '\#^frontend-unified/src/modules/documents/#d' scripts/palette-allowlist.txt && bash scripts/check-palette.sh`
Expected: `Palette check passed (60 files on the allowlist).` (21 lines removed.) The 60 left are all in the meetings module.

- [ ] **Step 3: Run the tests, the type-check and lint**

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass. (The documents tests find elements by role and text, never by class.)

- [ ] **Step 4: Commit**

```bash
npx prettier --write frontend-unified/src/modules/documents
git add frontend-unified/src/modules/documents scripts/palette-allowlist.txt
git commit -m "feat(web): the documents side on the design tokens

Cards, headings, dividers and links use the tokens, so the evening palette
works on every documents page, and page titles are set in Fraunces."
```

---

### Task 5: The meetings module, part 1: the views, the chair's and admin's panels, scheduling

**Files:**

- Modify: `frontend-unified/src/modules/meetings/index.tsx`, `views/*.tsx`, `components/chair/*.tsx`, `components/admin/*.tsx`, `components/scheduling/*.tsx`, `components/BylawyerLinkPanel.tsx` (paths under `frontend-unified/src/modules/meetings/`), `scripts/palette-allowlist.txt`

These are the 29 allowlisted files the chair and the admin see, with the views and the scheduler. They move onto the tokens as they are; the screens plan redesigns the chair console, the phone view and the display, and it rewrites several of these panels then. Nothing here changes what a button does or what it is called.

What the codemod changes here, beyond colors:

- The emoji icons go: `📊` before "Committee Reports", `📝` before "Minutes from Previous Meeting", `⚠️` before "Objection Raised" and "Voting Without Quorum", `⚖️` before "Appeal of Chair's Ruling" and "Chair Ruling Required", `⏰` before "Speaking time has expired" and "Voting time has expired", `🔒` before the two secret-ballot lines, `📋` before "Tabled Motions". The words stay. The `✓` and `✗` marks in the meeting settings panel are typographic, not emoji, and stay.
- The scheduler's header gradient (`from-meeting-700 to-meeting-800`) becomes a flat `bg-gavel`: the brief has no gradients.
- Filled buttons: the old indigo, blue, amber and red fills and the `meeting-` fill become `bg-gavel` with `text-paper` (actions are the gavel's); green fills (Vote Yea, Call Meeting to Order, Save & Join) become `bg-carried`. The chair panel's "Close & Announce" keeps its name (a test clicks it; the screens plan renames it with its test).

- [ ] **Step 1: Run the codemod over these files**

Run:

```bash
node scripts/palette-codemod.mjs frontend-unified/src/modules/meetings/index.tsx frontend-unified/src/modules/meetings/components/BylawyerLinkPanel.tsx $(find frontend-unified/src/modules/meetings/views frontend-unified/src/modules/meetings/components/chair frontend-unified/src/modules/meetings/components/admin frontend-unified/src/modules/meetings/components/scheduling -name '*.tsx' -not -path '*/__tests__/*')
```

Expected: no output. `git diff --stat frontend-unified/src/modules/meetings` lists the 29 allowlisted files (`views/ChairView.tsx` has no classes the codemod maps, so it is unchanged).

Check the evening palette on two of them by reading the diff: `components/chair/VotingPanel.tsx` has no `bg-white`, its deciding-vote buttons are `bg-carried text-paper` and `bg-gavel text-paper`, and its secret ballot line reads "Secret Ballot in Progress"; in `views/AdminView.tsx` the Appoint Chair and Add buttons are `bg-gavel text-paper ... hover:bg-gavel/90 disabled:bg-rule`, and the no-chair warning keeps its compatibility classes (`bg-accent-50 dark:bg-accent-900/20`), which point at the caution scale.

- [ ] **Step 2: Take them off the allowlist**

Run:

```bash
sed -i -E '\#^frontend-unified/src/modules/meetings/(views|components/(chair|admin|scheduling))/#d; \#^frontend-unified/src/modules/meetings/(index|components/BylawyerLinkPanel)\.tsx$#d' scripts/palette-allowlist.txt && bash scripts/check-palette.sh
```

Expected: `Palette check passed (31 files on the allowlist).`

- [ ] **Step 3: Run the tests, the type-check and lint**

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass. The meetings tests that touch these files (`ChairView`, `AdminView`, `ParticipantView`, `JoinMeetingScreen`, `MeetingsModule`, the chair `VotingPanel` and `PendingMotionPanel`, `MeetingScheduler`, `BylawyerLinkPanel`) find their elements by role, label and text; none names an emoji.

- [ ] **Step 4: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings
git add frontend-unified/src/modules/meetings scripts/palette-allowlist.txt
git commit -m "feat(web): the meeting views and the chair's panels on the design tokens

The views, the chair's and admin's panels, scheduling and the link panel lose
their raw palette classes and emoji icons, so they follow the evening palette
too. Actions are gavel fills; votes for and green states use carried."
```

---

### Task 6: The meetings module, part 2, and the palette closed

**Files:**

- Modify: `frontend-unified/src/modules/meetings/components/participant/*.tsx`, `components/bylawAmendment/*.tsx`, the top-level `components/*.tsx` (paths under `frontend-unified/src/modules/meetings/`), `frontend-unified/src/styles/index.css`, `scripts/palette-allowlist.txt`
- Delete: `frontend-unified/src/modules/meetings/components/mobile/` (`BottomSheet.tsx`, `ResponsiveGrid.tsx`, `TouchButton.tsx`, `TouchRadioGroup.tsx`, `index.ts`), `scripts/palette-codemod.mjs`
- Test: `frontend-unified/src/styles/__tests__/tokens.test.ts`

The last 31 files: the participant panels, the bylaw amendment form, and the shared panels (elections, nominations, inquiries, the motion card, the forms for suspending rules, reconsidering and taking from the table). `components/mobile/*` is dead code (nothing imports it; `grep -rn "components/mobile" frontend-unified/src` finds only the directory itself), and the design deletes it. Then no file needs the raw palette, so the palette is closed: `--color-*: initial` switches Tailwind's own colors off (a `bg-gray-100` written later compiles to nothing, besides failing the check), and the `meeting-` compatibility palette goes.

The codemod removes these emoji here: `⚠️` (the error boundary's icon, "Active Rule Suspensions" and its "Effect:", "Requires 2/3 vote", "Voting Without Quorum", "No candidate elected"), `🔓`, `⚖️` ("Appealing Chair's Ruling"), `🔒` ("Secret Ballot - your vote is anonymous"), `✋` (the raised hand, and before "Raise Hand to Speak"), `🗳️` (before "Election" and "Nominations and Elections"), `✅` ("Nominations are open for:"), `🎉` ("has been elected!"), `🔄` ("Reconsider Motion"), `📋` ("Tabled Motions"). The words stay; `✓`, `✗`, `○` and `✎` stay.

- [ ] **Step 1: Write the failing test**

In `frontend-unified/src/styles/__tests__/tokens.test.ts`, add inside `describe('design tokens', () => {`, after the last `it`:

```ts
it("switches Tailwind's own palette off, and the old meeting palette is gone", () => {
  expect(css).toContain('--color-*: initial;');
  expect(css).not.toContain('--color-meeting-');
});
```

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/styles/__tests__/tokens.test.ts`
Expected: FAIL, 1 failed and 26 passed.

- [ ] **Step 2: Run the codemod over the rest of the module**

Run:

```bash
node scripts/palette-codemod.mjs $(find frontend-unified/src/modules/meetings/components -maxdepth 1 -name '*.tsx') $(find frontend-unified/src/modules/meetings/components/participant frontend-unified/src/modules/meetings/components/bylawAmendment -name '*.tsx' -not -path '*/__tests__/*')
```

Expected: no output. The top-level `BylawyerLinkPanel.tsx` is in the list again; the codemod changes nothing in a file already moved.

- [ ] **Step 3: Delete the dead mobile components**

Run: `git rm -r frontend-unified/src/modules/meetings/components/mobile`
Expected: `rm` lines for the five files.

- [ ] **Step 4: Empty the allowlist**

Run: `sed -i '\#^frontend-unified/src/modules/meetings/#d' scripts/palette-allowlist.txt && bash scripts/check-palette.sh`
Expected: `Palette check passed (0 files on the allowlist).` The file keeps its three comment lines, so the mechanism is there if a large import ever needs it again.

- [ ] **Step 5: Close the palette in `frontend-unified/src/styles/index.css`**

Replace:

```css
@theme inline {
  --color-paper: var(--paper);
```

with:

```css
/*
  Only the colors defined here exist: Tailwind's own palette (gray, blue, white...) is off. This
  block comes first: a reset after the @theme inline block would clear the tokens too.
*/
@theme {
  --color-*: initial;
}

@theme inline {
  --color-paper: var(--paper);
```

and delete these lines (the comment and the ten `meeting-` shades):

```css
/* Until the meetings module moves onto the tokens (see scripts/check-palette.sh) */
--color-meeting-50: var(--color-gavel-50);
--color-meeting-100: var(--color-gavel-100);
--color-meeting-200: var(--color-gavel-200);
--color-meeting-300: var(--color-gavel-300);
--color-meeting-400: var(--color-gavel-400);
--color-meeting-500: var(--color-gavel-500);
--color-meeting-600: var(--color-gavel-600);
--color-meeting-700: var(--color-gavel-700);
--color-meeting-800: var(--color-gavel-800);
--color-meeting-900: var(--color-gavel-900);
```

- [ ] **Step 6: Delete the codemod**

Run: `git rm scripts/palette-codemod.mjs`
Its work is done; the check stays.

- [ ] **Step 7: Run the tests, a build, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/styles/__tests__/tokens.test.ts`
Expected: 27 passed.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && npx vite build && grep -c "color-gray\|color-blue\|color-meeting" dist/assets/*.css ; cd .. && npm run lint`
Expected: a clean type-check, all tests passing, `✓ built in`, a count of `0` (no Tailwind palette variable reaches the bundle), and lint passing with `Palette check passed (0 files on the allowlist).` (The `;` before `cd ..` is deliberate: `grep -c` exits with 1 when it counts nothing, which is the result wanted here.)

- [ ] **Step 8: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings frontend-unified/src/styles
git add frontend-unified/src/modules/meetings frontend-unified/src/styles scripts/palette-allowlist.txt
git commit -m "feat(web): the whole meetings module on the design tokens

The participant panels, elections, nominations, inquiries and the motion
forms lose their raw palette classes and emoji icons. The dead mobile
components are deleted. With no file left on the allowlist, Tailwind's own
palette is switched off and the old meeting palette is removed."
```

(`git rm` already staged the deletions of `components/mobile` and the codemod.)

---

### Task 7: Meeting links, QR codes, and the Live Meetings page

**Files:**

- Modify: `frontend-unified/package.json`, `package-lock.json`, `frontend-unified/src/api/client.ts`, `frontend-unified/src/utils/dates.ts`, `frontend-unified/src/modules/meetings/types/socket.ts`, `frontend-unified/src/modules/documents/pages/HomePage.tsx`
- Replace: `frontend-unified/src/modules/meetings/index.tsx`, `context/SocketContext.tsx`, `views/JoinMeetingScreen.tsx` (paths under `frontend-unified/src/modules/meetings/`)
- Create: `frontend-unified/src/modules/meetings/utils/meetingLinks.ts`, `components/QrCode.tsx`, `views/LiveMeetingsPage.tsx`
- Test: `frontend-unified/src/api/__tests__/client.test.ts`, `frontend-unified/src/utils/__tests__/dates.test.ts`, `frontend-unified/src/modules/meetings/utils/__tests__/meetingLinks.test.ts` (new), `components/__tests__/QrCode.test.tsx` (new), `context/__tests__/SocketContext.test.tsx` (replaced), `__tests__/MeetingsModule.test.tsx` (replaced), `views/__tests__/JoinMeetingScreen.test.tsx` (replaced), `views/__tests__/LiveMeetingsPage.test.tsx` (new), `frontend-unified/src/modules/documents/pages/__tests__/HomePage.test.tsx`

**Behavior:**

- **The link is the meeting.** `/meetings/:code` connects to that meeting; `SocketProvider` takes the code from the route, so a link or a QR code joins after sign-in (`RequireSession` sends a signed-out visitor to `/sign-in?next=/meetings/CODE` and back), and a reload rejoins. The meeting code no longer lives in `localStorage`. Leaving goes back to `/meetings`. A link that can't be a code (not 4 to 8 letters or digits) goes to `/meetings`. A lost session signs in and returns to the same page (it went to `/meetings` before).
- **The Live Meetings page** (`/meetings`) lists the current organization's schedule (`GET /api/organizations/:orgId/packets`): the meetings not yet adjourned, each with its date, its presiding officer and its code, "In session" when it is, and a link in: "Start" for the presiding officer before the meeting is called to order, "Join" for everyone else. "Start" only opens the meeting: the chair sees the attendance and calls the meeting to order from the console. Adjourned meetings are listed apart, under "Held", with "Open". Beside the schedule is the code box, for guests and anyone with a code; without an organization it is all the page shows. Secretaries and above get "Schedule a meeting".
- **The home page's upcoming meetings** are the same schedule's first three meetings not yet adjourned, linked to their live meeting, instead of the manual meeting records.
- **QR codes**: `QrCode` draws a link as an SVG image (sharp from a phone to a 4K display), ink modules on a white tile with the standard 4-module quiet zone. `joinUrl(code)` is `${window.location.origin}/meetings/CODE`. The screens plan puts them on the chair console's join card, the display and the schedule page.

- [ ] **Step 1: Add the QR library**

Run:

```bash
npm install qrcode@1.5.4 -w frontend-unified && npm install -D @types/qrcode@1.5.6 -w frontend-unified
```

Expected: `frontend-unified/package.json` lists `"qrcode": "^1.5.4"` under `dependencies` and `"@types/qrcode": "^1.5.6"` under `devDependencies`. In the browser `qrcode` resolves to its browser build, whose `toString` with `type: 'svg'` needs no canvas.

- [ ] **Step 2: Write the failing tests**

In `frontend-unified/src/api/__tests__/client.test.ts`, add `schedule,` after `bylawSync,` in the import list at the top, and add inside `describe('organization calls', () => {`, after the last `it`:

```ts
it('reads the schedule fresh each time, since meetings start and end', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await schedule.list('o1');
  await schedule.list('o1');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/organizations/o1/packets');
});
```

In `frontend-unified/src/utils/__tests__/dates.test.ts`, replace the import of `../dates` with:

```ts
import {
  formatCalendarDate,
  formatMeetingTime,
  fromLocalDateTimeInput,
  toLocalDateTimeInput,
} from '../dates';
```

and append:

```ts
describe('formatMeetingTime', () => {
  it("shows a meeting's day and time in the viewer's time zone", () => {
    // 7 PM in Chicago, where the tests run, on Tuesday, October 20, 2026
    expect(formatMeetingTime('2026-10-21T00:00:00.000Z')).toMatch(/^Tue, Oct 20, 7:00\sPM$/);
  });

  it('shows nothing for a missing or unreadable date', () => {
    expect(formatMeetingTime('')).toBe('');
    expect(formatMeetingTime('not a date')).toBe('');
  });
});
```

Create `frontend-unified/src/modules/meetings/utils/__tests__/meetingLinks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MEETING_CODE, joinUrl, meetingPath, normalizeMeetingCode } from '../meetingLinks';

describe('meeting links', () => {
  it('know a meeting code as the server does', () => {
    expect(MEETING_CODE.test('MAPLE1')).toBe(true);
    expect(MEETING_CODE.test('AB1')).toBe(false);
    expect(MEETING_CODE.test('NOT-A-CODE')).toBe(false);
  });

  it('take a code as typed or linked', () => {
    expect(normalizeMeetingCode(' maple1 ')).toBe('MAPLE1');
    expect(meetingPath(' maple1 ')).toBe('/meetings/MAPLE1');
  });

  it("join from the app's own address", () => {
    expect(joinUrl('maple1')).toBe(`${window.location.origin}/meetings/MAPLE1`);
  });
});
```

Create `frontend-unified/src/modules/meetings/components/__tests__/QrCode.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// jsdom has no canvas; the SVG renderer needs none, and the test only checks what is drawn
const qr = vi.hoisted(() => ({ toString: vi.fn() }));
vi.mock('qrcode', () => qr);

const { QrCode } = await import('../QrCode');

describe('QrCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('draws the link as an SVG image, ink on a white tile', async () => {
    qr.toString.mockResolvedValueOnce('<svg>code</svg>');
    render(<QrCode value="http://localhost/meetings/MAPLE1" label="Scan to join" size={240} />);

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Scan to join' }).getAttribute('src')).toBe(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg>code</svg>')}`,
      ),
    );
    expect(screen.getByRole('img', { name: 'Scan to join' }).getAttribute('width')).toBe('240');
    expect(qr.toString).toHaveBeenCalledWith(
      'http://localhost/meetings/MAPLE1',
      expect.objectContaining({ type: 'svg', color: { dark: '#15130f', light: '#ffffff' } }),
    );
  });

  it('keeps its place, with its name, while the code is drawn', () => {
    qr.toString.mockReturnValueOnce(new Promise(() => {}));
    render(<QrCode value="http://localhost/meetings/MAPLE1" label="Scan to join" />);
    const placeholder = screen.getByRole('img', { name: 'Scan to join' });
    expect(placeholder.tagName).toBe('DIV');
    expect(placeholder.style.width).toBe('200px');
  });
});
```

Replace `frontend-unified/src/modules/meetings/context/__tests__/SocketContext.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { initialState } from '@robbie-bylawyer/shared/reducer';
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
        setTimeout(() =>
          callback({
            success: true,
            state: { ...initialState, meetingCode: 'DEMO' },
            members: [],
          }),
        );
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
  const { isConnected, meetingCode, leaveMeeting } = useSocket();
  return (
    <div>
      <p>{isConnected ? 'connected' : 'not connected'}</p>
      <p>Code: {meetingCode}</p>
      <button onClick={leaveMeeting}>Leave</button>
    </div>
  );
}

// The meetings module's route: the provider takes the code from the link
function MeetingRoute() {
  const { code = '' } = useParams();
  return (
    <SocketProvider meetingCode={code}>
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
      </Routes>
    </MemoryRouter>,
  );
}

describe('SocketProvider', () => {
  beforeEach(() => {
    sockets.length = 0;
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
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: () => {} }) }));

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
  });

  it('offers a way to leave while connecting', () => {
    renderAt('/meetings/DEMO');
    fireEvent.click(screen.getByRole('button', { name: 'Leave meeting' }));
    expect(socket.leaveMeeting).toHaveBeenCalled();
  });

  it('shows why the connection failed and lets the user try again', () => {
    socket.error = 'Too many join attempts';
    renderAt('/meetings/DEMO');

    expect(screen.queryByText('Too many join attempts')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(socket.reconnect).toHaveBeenCalled();
  });
});
```

Replace `frontend-unified/src/modules/meetings/views/__tests__/JoinMeetingScreen.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const { JoinMeetingScreen } = await import('../JoinMeetingScreen');

function renderBox(props: { message?: string; initialCode?: string } = {}) {
  render(
    <MemoryRouter>
      <JoinMeetingScreen {...props} />
    </MemoryRouter>,
  );
}

describe('JoinMeetingScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("goes to the meeting's link", () => {
    renderBox();
    fireEvent.change(screen.getByLabelText('Meeting code'), { target: { value: ' sync02 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join meeting' }));
    expect(navigate).toHaveBeenCalledWith('/meetings/SYNC02');
  });

  it('rejects a code that is not 4 to 8 letters or digits', () => {
    renderBox();
    fireEvent.change(screen.getByLabelText('Meeting code'), { target: { value: 'ab!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join meeting' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('Meeting codes are 4 to 8 letters or digits')).toBeTruthy();
  });

  it('says why the visitor is here, with the code ready to correct', () => {
    renderBox({ message: 'No meeting with that code', initialCode: 'NOPE01' });
    expect(screen.getByText('No meeting with that code')).toBeTruthy();
    expect((screen.getByLabelText('Meeting code') as HTMLInputElement).value).toBe('NOPE01');
  });
});
```

Create `frontend-unified/src/modules/meetings/views/__tests__/LiveMeetingsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ScheduledMeeting } from '../../../../api/client';

const schedule = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../api/client', () => ({ schedule }));
vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example' } }),
}));
const bridge = vi.hoisted(() => ({
  currentOrganization: null as null | { id: string; name: string; slug: string; role: string },
}));
vi.mock('../../context/OrganizationBridge', () => ({ useMeetingOrganization: () => bridge }));
vi.mock('../../components/scheduling', () => ({ MeetingScheduler: () => <p>Scheduler</p> }));

const { LiveMeetingsPage } = await import('../LiveMeetingsPage');

const meeting = (overrides: Partial<ScheduledMeeting> = {}): ScheduledMeeting => ({
  id: 'p1',
  robbieCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  description: null,
  scheduledFor: '2026-10-21T00:00:00.000Z',
  chairUserId: 2,
  startedAt: null,
  endedAt: null,
  chair: { name: 'Dana Okafor' },
  ...overrides,
});

function renderPage() {
  render(
    <MemoryRouter>
      <LiveMeetingsPage />
    </MemoryRouter>,
  );
}

describe('LiveMeetingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.currentOrganization = {
      id: 'org-1',
      name: 'Maple Grove HOA',
      slug: 'maple-grove-hoa',
      role: 'member',
    };
  });

  it("lists the organization's schedule: Start for the presiding officer, Join for others", async () => {
    schedule.list.mockResolvedValueOnce([
      meeting(),
      meeting({
        id: 'p2',
        robbieCode: 'BOARD1',
        title: 'Board meeting',
        scheduledFor: null,
        chairUserId: 9,
        chair: { name: 'Pat Lindqvist' },
      }),
    ]);
    renderPage();

    const start = await screen.findByRole('link', { name: 'Start 2026 Annual Meeting' });
    expect(start.getAttribute('href')).toBe('/meetings/MAPLE1');
    expect(screen.getByRole('link', { name: 'Join Board meeting' }).getAttribute('href')).toBe(
      '/meetings/BOARD1',
    );
    expect(screen.getByText(/^Tue, Oct 20, 7:00\sPM$/)).toBeTruthy();
    expect(screen.getByText('No date set')).toBeTruthy();
    expect(screen.getByText(', Pat Lindqvist presiding')).toBeTruthy();
    expect(schedule.list).toHaveBeenCalledWith('org-1');
  });

  it('lets the presiding officer join a meeting in session, and lists held meetings apart', async () => {
    schedule.list.mockResolvedValueOnce([
      meeting({ startedAt: '2026-10-21T00:05:00.000Z' }),
      meeting({
        id: 'p0',
        robbieCode: 'MAPLE0',
        title: '2025 Annual Meeting',
        startedAt: '2025-03-21T00:05:00.000Z',
        endedAt: '2025-03-21T01:30:00.000Z',
      }),
    ]);
    renderPage();

    expect(await screen.findByRole('link', { name: 'Join 2026 Annual Meeting' })).toBeTruthy();
    expect(screen.getByText('In session')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Held' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open 2025 Annual Meeting' })).toBeTruthy();
  });

  it('offers scheduling to a secretary, and not to a member', async () => {
    schedule.list.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No meetings scheduled.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Schedule a meeting' })).toBeNull();

    bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule a meeting' }));
    expect(screen.getByText('Scheduler')).toBeTruthy();
  });

  it('shows only the code box without an organization', () => {
    bridge.currentOrganization = null;
    renderPage();
    expect(screen.getByLabelText('Meeting code')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Schedule' })).toBeNull();
    expect(schedule.list).not.toHaveBeenCalled();
  });

  it("says so when the schedule can't be loaded", async () => {
    schedule.list.mockRejectedValueOnce(new Error('Failed to list meeting packets'));
    renderPage();
    expect(await screen.findByText('Failed to list meeting packets')).toBeTruthy();
  });
});
```

In `frontend-unified/src/modules/documents/pages/__tests__/HomePage.test.tsx` (it has two tests of the empty states), the page now reads the schedule instead of the meeting records. Replace:

```tsx
const api = vi.hoisted(() => ({
  listDocuments: vi.fn(async () => []),
  listMeetings: vi.fn(async () => []),
  listAmendments: vi.fn(async () => []),
}));
vi.mock('../../../../api/client', () => ({
  documents: { list: api.listDocuments },
  meetings: { list: api.listMeetings },
  amendments: { list: api.listAmendments },
}));
```

with:

```tsx
const api = vi.hoisted(() => ({
  listDocuments: vi.fn(async () => []),
  listSchedule: vi.fn(async (): Promise<unknown[]> => []),
  listAmendments: vi.fn(async () => []),
}));
vi.mock('../../../../api/client', () => ({
  documents: { list: api.listDocuments },
  schedule: { list: api.listSchedule },
  amendments: { list: api.listAmendments },
}));
```

and add inside `describe('HomePage', () => {`, after the last `it`:

```tsx
it('lists the upcoming meetings from the schedule, linked to their live meeting', async () => {
  api.listSchedule.mockResolvedValueOnce([
    {
      id: 'p1',
      robbieCode: 'MAPLE1',
      title: '2026 Annual Meeting',
      description: null,
      scheduledFor: '2026-10-21T00:00:00.000Z',
      chairUserId: 2,
      startedAt: null,
      endedAt: null,
      chair: { name: 'Dana Okafor' },
    },
    {
      id: 'p0',
      robbieCode: 'MAPLE0',
      title: '2025 Annual Meeting',
      description: null,
      scheduledFor: '2025-03-21T00:00:00.000Z',
      chairUserId: 2,
      startedAt: '2025-03-21T00:05:00.000Z',
      endedAt: '2025-03-21T01:30:00.000Z',
      chair: { name: 'Dana Okafor' },
    },
  ]);
  renderHome();

  const link = await screen.findByRole('link', { name: /2026 Annual Meeting/ });
  expect(link.getAttribute('href')).toBe('/meetings/MAPLE1');
  expect(screen.queryByText('2025 Annual Meeting')).toBeNull();
  expect(api.listSchedule).toHaveBeenCalledWith('o1');
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/api/__tests__/client.test.ts src/utils/__tests__/dates.test.ts src/modules/meetings src/modules/documents/pages/__tests__/HomePage.test.tsx`
Expected: FAIL. `schedule` and `formatMeetingTime` are not exported; `../meetingLinks`, `../QrCode` and `../LiveMeetingsPage` don't exist; `SocketProvider` ignores the code in the link (it reads `localStorage`), so the provider tests time out on `connected`; the module has no routes; `JoinMeetingScreen` calls `useSocket`; `HomePage` reads `meetings.list`, which the test no longer provides, so its two existing tests fail too.

- [ ] **Step 4: The schedule in the API client**

In `frontend-unified/src/api/client.ts`, add after the `members` object (before `// Documents`):

```ts
// The organization's schedule: its meetings (packets), not yet adjourned first. Not cached: a
// meeting starts and ends while the page is open.
export const schedule = {
  list: (orgId: string) =>
    request<ScheduledMeeting[]>(`/organizations/${orgId}/packets`, {}, false),
};
```

and add after the `MemberList` interface:

```ts
/** A scheduled meeting, as the organization's schedule lists it (its packet) */
export interface ScheduledMeeting {
  id: string;
  /** The meeting code: the live meeting is /meetings/<robbieCode> */
  robbieCode: string;
  title: string | null;
  description: string | null;
  scheduledFor: string | null;
  /** The presiding officer, who chairs the live meeting; null when the admins run it */
  chairUserId: number | null;
  /** When the meeting was called to order and adjourned */
  startedAt: string | null;
  endedAt: string | null;
  chair: { name: string | null } | null;
}
```

- [ ] **Step 5: `formatMeetingTime` in `frontend-unified/src/utils/dates.ts`**

Append:

```ts
/**
 * A meeting's day and time for display, in the viewer's time zone ("Tue, Oct 20, 7:00 PM"):
 * unlike a calendar date, a meeting is an instant
 */
export function formatMeetingTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
```

- [ ] **Step 6: Create `frontend-unified/src/modules/meetings/utils/meetingLinks.ts`**

```ts
/** Meeting codes are 4 to 8 letters or digits, stored in upper case (the server's rule) */
export const MEETING_CODE = /^[A-Z0-9]{4,8}$/;

/** A code as typed or linked, in the form the server stores */
export function normalizeMeetingCode(code: string): string {
  return code.trim().toUpperCase();
}

/** A live meeting's page: going there joins it */
export function meetingPath(code: string): string {
  return `/meetings/${normalizeMeetingCode(code)}`;
}

/**
 * The link people join by, for QR codes and to read out: this app's own address, so it is right
 * in development, behind a proxy and in production alike
 */
export function joinUrl(code: string): string {
  return `${window.location.origin}${meetingPath(code)}`;
}
```

- [ ] **Step 7: Create `frontend-unified/src/modules/meetings/components/QrCode.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { toString as renderQrCode } from 'qrcode';

interface QrCodeProps {
  /** What the code holds: a meeting's join link (see joinUrl) */
  value: string;
  /** What a screen reader says for it */
  label: string;
  /** Its size on screen, in CSS pixels */
  size?: number;
  className?: string;
}

/**
 * A QR code drawn in the browser as an SVG image, sharp at any size from a phone to a 4K display:
 * ink modules on a white tile with the standard 4-module quiet zone, which phones read best
 * (docs/design-brief.md: "QR on a white tile")
 */
export function QrCode({ value, label, size = 200, className = '' }: QrCodeProps) {
  const [drawn, setDrawn] = useState<{ value: string; src: string } | null>(null);

  useEffect(() => {
    let canceled = false;
    renderQrCode(value, {
      type: 'svg',
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#15130f', light: '#ffffff' },
    })
      .then((svg) => {
        if (!canceled) {
          setDrawn({ value, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
        }
      })
      .catch(() => {
        // A link too long for a QR code: the link itself is shown beside it
      });
    return () => {
      canceled = true;
    };
  }, [value]);

  if (drawn?.value !== value) {
    return (
      <div
        role="img"
        aria-label={label}
        className={`rounded-lg bg-surface-2 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={drawn.src}
      alt={label}
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
    />
  );
}
```

- [ ] **Step 8: The socket from the link**

In `frontend-unified/src/modules/meetings/types/socket.ts`, in `SocketContextValue`, replace:

```ts
  meetingCode: string | null;
  joinMeeting: (code: string) => void;
  leaveMeeting: () => void;
```

with:

```ts
  /** The meeting in the page's link (/meetings/:code) */
  meetingCode: string;
  /** Leave the meeting and go back to the Live Meetings page */
  leaveMeeting: () => void;
```

Replace `frontend-unified/src/modules/meetings/context/SocketContext.tsx` with:

```tsx
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Member } from '@robbie-bylawyer/shared/types';
import type { SocketContextValue } from '../types/socket';
import { useSocketConnection } from '../hooks/useSocketConnection';
import { useSession } from '../../../context/SessionContext';

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
  /** The meeting in the page's link (/meetings/:code), in upper case */
  meetingCode: string;
  children: ReactNode;
}

/**
 * The live meeting's connection. The link is the meeting: the provider connects to the code in
 * the route, so a shared link or a QR code joins after sign-in, and a reload rejoins.
 */
export function SocketProvider({ meetingCode, children }: SocketProviderProps) {
  const { user, markTermsNotAccepted } = useSession();
  const navigate = useNavigate();

  // The session ended (signed out elsewhere, or expired): sign in, then come back to this page
  const handleNotSignedIn = useCallback(() => {
    window.location.assign(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, []);

  // Refused for the terms: RequireSession shows the terms step in place of this module
  const connection = useSocketConnection(meetingCode, handleNotSignedIn, markTermsNotAccepted);

  // useSocketConnection returns a new object each render, so depend on its stable fields
  const { disconnect } = connection;

  // disconnect emits LEAVE_MEETING before closing the socket
  const leaveMeeting = useCallback(() => {
    disconnect();
    navigate('/meetings');
  }, [disconnect, navigate]);

  const currentUser = useMemo<Member | null>(() => {
    if (!user) return null;
    return (
      connection.state.members.find((m) => m.id === user.id) ?? {
        id: user.id,
        name: user.name ?? user.email,
        role: 'member',
        present: true,
      }
    );
  }, [user, connection.state.members]);

  const value = useMemo<SocketContextValue>(
    () => ({
      state: connection.state,
      dispatch: connection.dispatch,
      isConnected: connection.isConnected,
      currentUser,
      connectedMembers: connection.connectedMembers,
      error: connection.error,
      meetingCode,
      leaveMeeting,
      reconnect: connection.reconnect,
    }),
    [
      connection.state,
      connection.dispatch,
      connection.isConnected,
      connection.connectedMembers,
      connection.error,
      connection.reconnect,
      currentUser,
      meetingCode,
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

- [ ] **Step 9: The code box**

Replace `frontend-unified/src/modules/meetings/views/JoinMeetingScreen.tsx` with:

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { MEETING_CODE, meetingPath, normalizeMeetingCode } from '../utils/meetingLinks';

interface JoinMeetingScreenProps {
  /** Why the visitor is here, such as a link to a meeting that doesn't exist */
  message?: string | null;
  /** The code to start with, such as the one that couldn't be joined */
  initialCode?: string;
}

/** The code box: join a live meeting by its code, as a guest or anyone without the schedule */
export function JoinMeetingScreen({ message = null, initialCode = '' }: JoinMeetingScreenProps) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [invalid, setInvalid] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeMeetingCode(code);
    if (!MEETING_CODE.test(normalized)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    navigate(meetingPath(normalized));
  };

  return (
    <section className="card p-6 self-start" aria-labelledby="join-heading">
      <h3 id="join-heading" className="card-title mb-1">
        Join with a code
      </h3>
      <p className="text-sm text-ink-muted mb-4">
        The code is on the screen in the room and in the meeting&apos;s link.
      </p>
      {message && (
        <p role="alert" className="mb-4 rounded-lg bg-caution-tint px-3 py-2 text-sm text-ink">
          {message}
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="meetingCode" className="label">
            Meeting code
          </label>
          <div className="relative">
            <Hash className="w-4 h-4 absolute left-3 top-3 text-ink-muted" aria-hidden="true" />
            <input
              id="meetingCode"
              className="input pl-9 uppercase meeting-code"
              autoComplete="off"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {invalid && (
            <p role="alert" className="mt-1 text-sm text-gavel">
              Meeting codes are 4 to 8 letters or digits
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary w-full">
          Join meeting
        </button>
      </form>
    </section>
  );
}
```

Scheduling moves from this box to the Live Meetings page.

- [ ] **Step 10: Create `frontend-unified/src/modules/meetings/views/LiveMeetingsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { schedule, type ScheduledMeeting } from '../../../api/client';
import { useSession } from '../../../context/SessionContext';
import { atLeast } from '../../../utils/roles';
import { formatMeetingTime } from '../../../utils/dates';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { MeetingScheduler } from '../components/scheduling';
import { meetingPath } from '../utils/meetingLinks';
import { JoinMeetingScreen } from './JoinMeetingScreen';

/** The schedule as loaded, for the organization it belongs to */
type Loaded =
  | { organizationId: string; meetings: ScheduledMeeting[] }
  | { organizationId: string; error: string };

/**
 * The Live Meetings page: the current organization's schedule, each meeting with a way in (Start
 * for its presiding officer, Join for everyone else), the meetings already held, the code box
 * for anyone with a code, and Schedule a meeting for secretaries and above
 */
export function LiveMeetingsPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { currentOrganization } = useMeetingOrganization();
  const organizationId = currentOrganization?.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [scheduling, setScheduling] = useState(false);
  // Meetings are scheduled in the current organization, by its secretaries and above
  const canSchedule =
    currentOrganization !== null && atLeast(currentOrganization.role, 'secretary');

  useEffect(() => {
    if (!organizationId) return;
    let canceled = false;
    schedule
      .list(organizationId)
      .then((meetings) => {
        if (!canceled) setLoaded({ organizationId, meetings });
      })
      .catch((err: unknown) => {
        if (!canceled) {
          const error = err instanceof Error ? err.message : "Couldn't load the schedule";
          setLoaded({ organizationId, error });
        }
      });
    return () => {
      canceled = true;
    };
  }, [organizationId]);

  if (scheduling) {
    return (
      <MeetingScheduler
        onBack={() => setScheduling(false)}
        onJoinMeeting={(code) => navigate(meetingPath(code))}
      />
    );
  }

  // A schedule loaded for another organization (the header switched) is not shown
  const current = loaded?.organizationId === organizationId ? loaded : null;
  const meetings = current && 'meetings' in current ? current.meetings : null;
  const upcoming = meetings?.filter((m) => !m.endedAt) ?? [];
  const held = meetings?.filter((m) => m.endedAt) ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="page-title">Live meetings</h2>
          <p className="text-ink-muted mt-1">
            {currentOrganization
              ? `Meetings of ${currentOrganization.name}`
              : 'Join a meeting with its code'}
          </p>
        </div>
        {canSchedule && (
          <button type="button" className="btn-primary" onClick={() => setScheduling(true)}>
            <CalendarPlus className="w-5 h-5" aria-hidden="true" />
            Schedule a meeting
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {currentOrganization && (
            <section className="card" aria-labelledby="schedule-heading">
              <h3 id="schedule-heading" className="label-caps px-6 pt-5 pb-3">
                Schedule
              </h3>
              {current && 'error' in current ? (
                <p role="alert" className="px-6 pb-5 text-sm text-gavel">
                  {current.error}
                </p>
              ) : meetings === null ? (
                <p className="px-6 pb-5 text-sm text-ink-muted">Loading the schedule...</p>
              ) : upcoming.length === 0 ? (
                <p className="px-6 pb-5 text-sm text-ink-muted">No meetings scheduled.</p>
              ) : (
                <ul className="border-t border-rule divide-y divide-rule">
                  {upcoming.map((meeting) => (
                    <ScheduleRow
                      key={meeting.id}
                      meeting={meeting}
                      presiding={meeting.chairUserId !== null && meeting.chairUserId === user?.id}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {held.length > 0 && (
            <section className="card" aria-labelledby="held-heading">
              <h3 id="held-heading" className="label-caps px-6 pt-5 pb-3">
                Held
              </h3>
              <ul className="border-t border-rule divide-y divide-rule">
                {held.map((meeting) => (
                  <ScheduleRow key={meeting.id} meeting={meeting} presiding={false} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <JoinMeetingScreen />
      </div>
    </div>
  );
}

/** One scheduled meeting: its title, date, presiding officer and code, and the way in */
function ScheduleRow({ meeting, presiding }: { meeting: ScheduledMeeting; presiding: boolean }) {
  const title = meeting.title || 'Untitled meeting';
  const inSession = meeting.startedAt !== null && meeting.endedAt === null;
  // The presiding officer starts a meeting not yet called to order; everyone else joins it.
  // Starting only opens it: the chair calls the meeting to order from the console.
  const action = meeting.endedAt ? 'Open' : presiding && !meeting.startedAt ? 'Start' : 'Join';

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">
          <span>
            {meeting.scheduledFor ? formatMeetingTime(meeting.scheduledFor) : 'No date set'}
          </span>
          {meeting.chair?.name && <span>{`, ${meeting.chair.name} presiding`}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {inSession && <span className="badge-present">In session</span>}
        <span className="meeting-code text-sm text-ink-muted">{meeting.robbieCode}</span>
        <Link
          to={meetingPath(meeting.robbieCode)}
          aria-label={`${action} ${title}`}
          className={action === 'Start' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
        >
          {action}
        </Link>
      </div>
    </li>
  );
}
```

- [ ] **Step 11: The module's routes**

Replace `frontend-unified/src/modules/meetings/index.tsx` with:

```tsx
/**
 * Meetings Module
 *
 * /meetings is the Live Meetings page: the organization's schedule and the code box.
 * /meetings/:code is the live meeting with that code. The link is the meeting, so it can be
 * shared or shown as a QR code, and a reload rejoins it; each meeting gets its own socket.
 */

import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { SocketProvider, useSocket } from './context/SocketContext';
import { MeetingOrganizationProvider } from './context/OrganizationBridge';
import { LiveMeetingsPage } from './views/LiveMeetingsPage';
import { MeetingApp } from './views/MeetingApp';
import { MEETING_CODE, normalizeMeetingCode } from './utils/meetingLinks';
import { useToast } from '../../context/ToastContext';

function MeetingsContent() {
  const { isConnected, error, reconnect, leaveMeeting } = useSocket();
  const { showToast } = useToast();

  // Forward socket errors to toast notifications
  useEffect(() => {
    if (error) {
      showToast('error', error);
    }
  }, [error, showToast]);

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

`App.tsx` needs no change: its `meetings/*` route hands everything under `/meetings` to the module, and `RequireSession` already sends a signed-out visitor to `/sign-in?next=<the path>`, which `SignInPage`'s `safeNext` follows back.

- [ ] **Step 12: The home page's upcoming meetings**

In `frontend-unified/src/modules/documents/pages/HomePage.tsx` (as Task 4 left it):

Replace the lucide import's last two names:

```tsx
  Users,
  ExternalLink,
} from 'lucide-react';
```

with:

```tsx
  Users,
} from 'lucide-react';
```

Replace:

```tsx
  meetings as meetingsApi,
  Document,
  Amendment,
  Meeting,
} from '../../../api/client';
```

with:

```tsx
  schedule as scheduleApi,
  Document,
  Amendment,
  ScheduledMeeting,
} from '../../../api/client';
import { formatMeetingTime } from '../../../utils/dates';
```

Replace `import { StatusBadge, DocumentTypeBadge, MeetingTypeBadge } from '../../../components/ui/Badge';` with `import { StatusBadge, DocumentTypeBadge } from '../../../components/ui/Badge';`, and `useState<Meeting[]>([])` with `useState<ScheduledMeeting[]>([])`.

Replace:

```tsx
const [docs, mtgs] = await Promise.all([
  documentsApi.list(currentOrganization.id),
  meetingsApi.list(currentOrganization.id),
]);
setDocuments(docs);
setUpcomingMeetings(mtgs.filter((m) => m.status === 'scheduled').slice(0, 3));
```

with:

```tsx
const [docs, scheduled] = await Promise.all([
  documentsApi.list(currentOrganization.id),
  scheduleApi.list(currentOrganization.id),
]);
setDocuments(docs);
// The schedule lists the meetings not yet adjourned first, soonest first
setUpcomingMeetings(scheduled.filter((m) => !m.endedAt).slice(0, 3));
```

Replace:

```tsx
{
  upcomingMeetings.map((meeting) => (
    <Link
      key={meeting.id}
      to={`/bylawyer-meetings/${meeting.id}`}
      className="block px-4 py-3 hover:bg-surface-2 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm text-ink">{meeting.title}</span>
        <MeetingTypeBadge type={meeting.meetingType} />
      </div>
      <p className="text-xs text-ink-muted flex items-center gap-1">
        <Calendar className="w-3 h-3" />
        {new Date(meeting.scheduledDate).toLocaleDateString()}
        {meeting.location && ` - ${meeting.location}`}
      </p>
    </Link>
  ));
}
```

with:

```tsx
{
  upcomingMeetings.map((meeting) => (
    <Link
      key={meeting.id}
      to={`/meetings/${meeting.robbieCode}`}
      className="block px-4 py-3 hover:bg-surface-2 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-medium text-sm text-ink truncate">
          {meeting.title || 'Untitled meeting'}
        </span>
        <span className="meeting-code text-xs text-ink-muted">{meeting.robbieCode}</span>
      </div>
      <p className="text-xs text-ink-muted flex items-center gap-1">
        <Calendar className="w-3 h-3" aria-hidden="true" />
        {meeting.scheduledFor ? formatMeetingTime(meeting.scheduledFor) : 'No date set'}
      </p>
    </Link>
  ));
}
```

and replace:

```tsx
              <Link to="/bylawyer-meetings" className="text-sm text-gavel hover:text-gavel">
                View all meetings
              </Link>
              <Link
                to="/meetings"
                className="text-sm text-gavel hover:text-gavel flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Live
              </Link>
```

with:

```tsx
              <Link to="/meetings" className="text-sm text-gavel hover:underline">
                All scheduled meetings
              </Link>
              <Link to="/bylawyer-meetings" className="text-sm text-gavel hover:underline">
                Meeting records
              </Link>
```

- [ ] **Step 13: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/api/__tests__/client.test.ts src/utils/__tests__/dates.test.ts src/modules/meetings src/modules/documents/pages/__tests__/HomePage.test.tsx`
Expected: all pass. The new and replaced files: `meetingLinks` 3, `QrCode` 2, `SocketContext` 4, `MeetingsModule` 5, `JoinMeetingScreen` 3, `LiveMeetingsPage` 5, `HomePage` 3 (2 were there), plus one new test each in `client.test.ts` and two in `dates.test.ts`.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass (`ConnectionStatus` reads `leaveMeeting`, which keeps its name; nothing else read `joinMeeting`).

- [ ] **Step 14: Commit**

```bash
npx prettier --write frontend-unified/package.json frontend-unified/src/api frontend-unified/src/utils frontend-unified/src/modules/meetings frontend-unified/src/modules/documents/pages
git add frontend-unified/package.json package-lock.json frontend-unified/src/api frontend-unified/src/utils frontend-unified/src/modules/meetings frontend-unified/src/modules/documents/pages
git commit -m "feat(web): meeting links, QR codes and the Live Meetings page

/meetings/:code is the meeting: the socket connects to the code in the link,
so a shared link or a QR code joins after sign-in and a reload rejoins.
/meetings lists the organization's schedule, with Start for the presiding
officer and Join for everyone else, beside the code box. The home page's
upcoming meetings come from the schedule. QrCode draws a join link as an SVG."
```

---

### Task 8: The style guide page

**Files:**

- Create: `frontend-unified/src/pages/StyleGuidePage.tsx`
- Modify: `frontend-unified/src/App.tsx`
- Test: `frontend-unified/src/pages/__tests__/StyleGuidePage.test.tsx` (new)

The roadmap's design-system phase asks for a style guide page. `/style-guide` (signed in, inside the app's layout) shows the tokens, the type, the buttons, the badges and a form field twice: in the palette the app is in, and in the evening palette inside a `.dark` panel, which is how the display view will look and shows the `@theme inline` mechanism at work (the panel flips while the page around it doesn't). It is the reference for reviewing screens, and the visual pass in Task 9 captures it in both palettes.

- [ ] **Step 1: Write the failing test**

Create `frontend-unified/src/pages/__tests__/StyleGuidePage.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StyleGuidePage from '../StyleGuidePage';

const TOKENS = [
  'paper',
  'surface',
  'surface-2',
  'ink',
  'ink-muted',
  'rule',
  'gavel',
  'gavel-tint',
  'carried',
  'carried-tint',
  'caution',
  'caution-tint',
  'caution-ink',
];

describe('StyleGuidePage', () => {
  it('shows every token in the current palette and in the evening palette', () => {
    render(<StyleGuidePage />);
    expect(screen.getByRole('heading', { name: 'Style guide' })).toBeTruthy();
    for (const token of TOKENS) {
      expect(screen.getAllByText(token, { exact: true }), token).toHaveLength(2);
    }
  });

  it('sets the evening sample in a .dark panel, as the display is', () => {
    render(<StyleGuidePage />);
    const evening = screen.getByRole('region', { name: 'Evening session' });
    expect(evening.className.split(' ')).toContain('dark');
    expect(screen.getByRole('region', { name: 'This palette' }).className).not.toContain('dark');
  });

  it('shows the components in the brief voice', () => {
    render(<StyleGuidePage />);
    expect(screen.getAllByRole('button', { name: 'Call to order' })).toHaveLength(2);
    expect(screen.getAllByText('Marked present')).toHaveLength(2);
    expect(screen.getAllByLabelText('Headcount')).toHaveLength(2);
  });
});
```

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/pages/__tests__/StyleGuidePage.test.tsx`
Expected: FAIL: `../StyleGuidePage` doesn't exist.

- [ ] **Step 2: Create `frontend-unified/src/pages/StyleGuidePage.tsx`**

```tsx
import { useId } from 'react';
import { Gavel } from 'lucide-react';
import { PresenceBadge, RoleBadge, StatusBadge } from '../components/ui/Badge';

/** The design tokens (docs/design-brief.md), each as its background utility */
const TOKENS = [
  { name: 'paper', swatch: 'bg-paper', use: 'Page background' },
  { name: 'surface', swatch: 'bg-surface', use: 'Cards, panels' },
  { name: 'surface-2', swatch: 'bg-surface-2', use: 'Sidebar, inset areas' },
  { name: 'ink', swatch: 'bg-ink', use: 'Text' },
  { name: 'ink-muted', swatch: 'bg-ink-muted', use: 'Secondary text, labels' },
  { name: 'rule', swatch: 'bg-rule', use: 'Borders, dividers' },
  { name: 'gavel', swatch: 'bg-gavel', use: 'Actions, the current item, focus rings' },
  { name: 'gavel-tint', swatch: 'bg-gavel-tint', use: 'Selected and hover backgrounds' },
  { name: 'carried', swatch: 'bg-carried', use: 'Carried, elected, present, connected' },
  { name: 'carried-tint', swatch: 'bg-carried-tint', use: 'Behind carried' },
  { name: 'caution', swatch: 'bg-caution', use: 'No quorum, time running out' },
  { name: 'caution-tint', swatch: 'bg-caution-tint', use: 'Behind caution' },
  { name: 'caution-ink', swatch: 'bg-caution-ink', use: 'Caution as text' },
];

/** One full sample of the language: type, colors, buttons, badges, a form field */
function Specimen() {
  const headcountId = useId();
  return (
    <>
      <div className="space-y-2">
        <p className="label-caps">Type</p>
        <p className="font-serif-soft text-question font-semibold text-ink">Resurface the pool</p>
        <p className="card-title">Treasurer&apos;s report</p>
        <p className="text-ink">Public Sans for forms, tables, labels and everything else.</p>
        <p className="text-sm text-ink-muted">Moved by Alice Brennan, seconded by Ben Whitaker</p>
        <p className="meeting-code text-2xl text-ink">MAPLE1</p>
      </div>

      <div className="space-y-2">
        <p className="label-caps">Colors</p>
        <ul className="grid grid-cols-2 gap-3">
          {TOKENS.map((token) => (
            <li key={token.name} className="flex items-center gap-3">
              <span
                className={`h-10 w-10 shrink-0 rounded-lg border border-rule ${token.swatch}`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{token.name}</span>
                <span className="block text-xs text-ink-muted">{token.use}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="label-caps">Buttons</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary">
            Call to order
          </button>
          <button type="button" className="btn-secondary">
            Open the vote
          </button>
          <button type="button" className="btn-ghost">
            Mark present
          </button>
          <button type="button" className="btn-primary" disabled>
            Second
          </button>
        </div>
        <button type="button" className="btn-primary btn-lg w-full">
          <Gavel className="w-5 h-5" aria-hidden="true" />
          Yea
        </button>
      </div>

      <div className="space-y-2">
        <p className="label-caps">Badges</p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="draft" />
          <StatusBadge status="proposed" />
          <StatusBadge status="passed" />
          <StatusBadge status="failed" />
          <RoleBadge role="chair" />
          <RoleBadge role="admin" />
          <RoleBadge role="member" />
          <RoleBadge role="guest" />
          <PresenceBadge presence="present" />
          <PresenceBadge presence="marked" />
          <PresenceBadge presence="absent" />
        </div>
      </div>

      <div>
        <label htmlFor={headcountId} className="label">
          Headcount
        </label>
        <input id={headcountId} className="input" inputMode="numeric" defaultValue="3" />
      </div>
    </>
  );
}

/**
 * The style guide: the tokens and components every screen is built from, in the palette the app
 * is in and in the evening palette (a .dark panel, as the display view is)
 */
export default function StyleGuidePage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="page-title">Style guide</h2>
        <p className="text-ink-muted mt-1">
          The clerk&apos;s ledger: paper, ink and the gavel (docs/design-brief.md).
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="this-palette" className="card p-6 space-y-6">
          <h3 id="this-palette" className="card-title">
            This palette
          </h3>
          <Specimen />
        </section>
        <section
          aria-labelledby="evening-session"
          className="dark card p-6 space-y-6 bg-surface text-ink"
        >
          <h3 id="evening-session" className="card-title">
            Evening session
          </h3>
          <Specimen />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: The route**

In `frontend-unified/src/App.tsx`, add after `const NotFoundPage = lazy(() => import('./modules/documents/pages/NotFoundPage'));`:

```tsx
const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage'));
```

and replace:

```tsx
{
  /* Settings */
}
<Route path="settings" element={<SettingsPage />} />;
```

with:

```tsx
{
  /* Settings */
}
<Route path="settings" element={<SettingsPage />} />;

{
  /* The design language (docs/design-brief.md) */
}
<Route path="style-guide" element={<StyleGuidePage />} />;
```

- [ ] **Step 4: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/pages/__tests__/StyleGuidePage.test.tsx`
Expected: 3 passed.

Run: `cd frontend-unified && npx tsc --noEmit -p . && npm run test:run && cd .. && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
npx prettier --write frontend-unified/src/pages/StyleGuidePage.tsx frontend-unified/src/pages/__tests__/StyleGuidePage.test.tsx frontend-unified/src/App.tsx
git add frontend-unified/src/pages/StyleGuidePage.tsx frontend-unified/src/pages/__tests__/StyleGuidePage.test.tsx frontend-unified/src/App.tsx
git commit -m "feat(web): a style guide page

/style-guide shows the tokens, the type, the buttons, the badges and a form
field in the app's palette and, in a .dark panel, in the evening palette the
display view uses."
```

---

### Task 9: The demo presides and counts, and the Playwright harness

**Files:**

- Modify: `backend-node/src/demo/demoSeed.ts`, `backend-node/src/__integration__/demoSeed.test.ts`
- Modify: `package.json`, `package-lock.json`, `frontend-unified/vite.config.ts`, `eslint.config.mjs`, `.gitignore`, `.github/workflows/ci.yml`
- Create: `e2e/env.ts`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/helpers.ts`, `e2e/tsconfig.json`, `e2e/tests/smoke.spec.ts`, `e2e/tests/visual.spec.ts`

**The seed.** The server plan lists it as a follow-up and does not change it: the demo's packet has no presiding officer and the organization no attendance settings, so the 2026 Annual Meeting would have no chair and a quorum of 3. Dana Okafor (the president, an admin) presides, and the HOA has 142 voting members with a quorum of 20% (29), as its bylaws say. The screens plan's scenario and live check depend on both.

**The harness.**

- Playwright starts its web servers before it runs the global setup, so the backend's command applies the migrations before starting (`prisma migrate deploy && tsx src/index.ts`), and the global setup then clears the live meetings and reseeds the demo with `--reset`. The live meetings table is outside Prisma (`backend-node/src/db/meetingStorage.ts`), so resetting the organization alone would leave last run's live state under the demo's codes.
- The backend runs on port 3101 with `NODE_ENV=test` (no per-address sign-in limit, which several runs from one machine would reach), test sign-in (`000000`), no email provider, and uploads in a temp folder. The web app runs as `vite preview` of the production build on port 4173; `vite preview` uses the same proxy as the dev server (Vite falls back to `server.proxy` when `preview.proxy` is unset), and `vite.config.ts` now takes the proxy's target from `API_PROXY_TARGET`. Both ports are apart from the development servers (3001, 5173), so a developer's running servers are left alone.
- The database: `E2E_DATABASE_URL`, else the throwaway Postgres on port 55432. CI sets it to its own service on 5432.
- Tests run one at a time (one database, one demo organization). The smoke test signs in as Pat and follows the bylaws and the schedule, and checks that a meeting link signed out goes to sign-in and keeps the link. The visual pass captures the sign-in page, the dashboard, the bylaws, the Live Meetings page, Settings and the style guide in both palettes as screenshots, attached to the report and uploaded by CI; they are not compared to a baseline. It also checks what a unit test can't: that the page is `paper` in each palette and that Public Sans was loaded from the app.

- [ ] **Step 1: The seed presides and counts**

Run: `grep -n "eligibleVoters\|chairUserId" backend-node/src/demo/demoSeed.ts`
If it prints lines, the server work already did this step: go on to Step 4.

In `backend-node/src/__integration__/demoSeed.test.ts`, after `expect(members.find((m) => m.role === 'admin')?.user.name).toBe('Dana Okafor');` add:

```ts
// 142 lots, one vote each; the bylaws' Section 4.2 sets the quorum at 20%
expect(org).toMatchObject({ eligibleVoters: 142, quorumPercent: 20, quorumCount: null });
```

and after `expect(packet.agendaItems).toHaveLength(7);` add:

```ts
// The president presides
const dana = members.find((m) => m.user.email === 'dana@maplegrove.example');
expect(packet.chairUserId).toBe(dana?.userId);
```

Run: `cd backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/demoSeed.test.ts`
Expected: FAIL in "creates Maple Grove HOA with its people, bylaws, amendment, meeting and packet": `eligibleVoters` is null and `quorumCount` 3, and `chairUserId` is null.

- [ ] **Step 2: Set them in `backend-node/src/demo/demoSeed.ts`**

In the organization's `create`, replace:

```ts
      description:
        'The homeowners association of the Maple Grove subdivision: 142 lots, the clubhouse, the pool and the common areas.',
```

with:

```ts
      description:
        'The homeowners association of the Maple Grove subdivision: 142 lots, the clubhouse, the pool and the common areas.',
      // 142 lots, one vote each; the bylaws' Section 4.2 sets the quorum at 20%
      eligibleVoters: 142,
      quorumPercent: 20,
      quorumCount: null,
```

In the packet's `create`, replace:

```ts
      scheduledFor: new Date('2026-10-20T19:00:00-05:00'),
```

with:

```ts
      scheduledFor: new Date('2026-10-20T19:00:00-05:00'),
      // The president presides
      chairUserId: idOf('dana@maplegrove.example'),
```

- [ ] **Step 3: Run the seed's tests**

Run: `cd backend-node && npx tsc --noEmit -p . && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/demoSeed.test.ts`
Expected: a clean type-check; all tests in the file pass.

- [ ] **Step 4: Add Playwright**

Run: `npm install -D -E @playwright/test@1.63.0`
Expected: the root `package.json` lists `"@playwright/test": "1.63.0"` under `devDependencies` (exact: the CI cache key and the browser build follow this version).

Then install its Chromium once on this machine: `npx playwright install chromium`. If it says host system dependencies are missing, run `sudo npx playwright install-deps chromium` once.

In the root `package.json` `scripts`, add after `"db:studio": "npm run db:studio -w backend-node"`:

```json
    "e2e": "npm run build:shared && npm run build -w frontend-unified && playwright test -c e2e"
```

(and a comma at the end of the `db:studio` line).

- [ ] **Step 5: The proxy target in `frontend-unified/vite.config.ts`**

Replace:

```ts
export default defineConfig({
  plugins: [tailwindcss(), react()],
```

with:

```ts
// The API the dev server and `vite preview` forward to: 3001 in development. The Playwright
// harness (e2e/) runs its own on another port.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [tailwindcss(), react()],
```

and replace:

```ts
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
```

with:

```ts
    // `vite preview` uses this too (preview.proxy falls back to server.proxy)
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiTarget,
        ws: true,
      },
    },
```

- [ ] **Step 6: Create the harness**

`e2e/env.ts`:

```ts
/**
 * Where the Playwright harness runs the app. The database: E2E_DATABASE_URL, else the throwaway
 * Postgres on port 55432 (never 5432 locally, which belongs to another project); CI sets
 * E2E_DATABASE_URL to its own service.
 */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:55432/robbie';

/** The API and the web app, on ports apart from the development servers (3001 and 5173) */
export const API_PORT = 3101;
export const WEB_PORT = 4173;

/**
 * The backend's environment. Variables set here win over backend-node/.env (dotenv doesn't
 * override them): test sign-in with the code 000000, no per-address sign-in limit (NODE_ENV=test),
 * no email provider (emails are logged), and uploads in a temp folder.
 */
export function backendEnv(uploadDir: string): Record<string, string> {
  return {
    PORT: String(API_PORT),
    DATABASE_URL,
    DIRECT_URL: DATABASE_URL,
    NODE_ENV: 'test',
    ENABLE_TEST_AUTH: 'true',
    CLIENT_ORIGIN: `http://localhost:${WEB_PORT}`,
    UPLOAD_DIR: uploadDir,
    RESEND_API_KEY: '',
    SENDGRID_API_KEY: '',
    SMTP_HOST: '',
    EMAIL_FROM: '',
    LOG_LEVEL: 'warn',
  };
}
```

`e2e/playwright.config.ts`:

```ts
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, WEB_PORT, backendEnv } from './env';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // One database and one demo organization: the tests run one at a time
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Playwright starts these before the global setup runs, so the API applies the migrations itself
  webServer: [
    {
      command: 'npx prisma migrate deploy && npx tsx src/index.ts',
      cwd: '../backend-node',
      url: `http://localhost:${API_PORT}/api/health`,
      env: backendEnv(path.join(os.tmpdir(), 'robbie-e2e-uploads')),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // The production build (npm run e2e builds it), proxying /api and /socket.io to the API
      command: `npx vite preview --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend-unified',
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
```

`e2e/global-setup.ts`:

```ts
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { DATABASE_URL } from './env';

/**
 * Runs once, after the web servers are up: clears the live meetings and seeds the Maple Grove HOA
 * demo again, so every run starts from the same organization, people and schedule.
 */
export default async function globalSetup(): Promise<void> {
  // Live meetings are kept outside Prisma (backend-node/src/db/meetingStorage.ts creates the
  // table at startup): a reseeded organization would otherwise find last run's meetings under
  // its codes
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM meetings');
  } finally {
    await client.end();
  }

  execFileSync('npx', ['tsx', 'src/scripts/seedDemo.ts', '--reset'], {
    cwd: path.resolve(__dirname, '../backend-node'),
    env: { ...process.env, DATABASE_URL, DIRECT_URL: DATABASE_URL },
    stdio: 'inherit',
  });
}
```

`e2e/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';

/**
 * The demo's people (backend-node/src/demo/demoSeed.ts): named, past the terms step, and signed in
 * with the test code
 */
export const PEOPLE = {
  /** Owner: the secretary in the scenario */
  pat: 'pat@maplegrove.example',
  /** Admin: the president, who presides over the demo's meetings */
  dana: 'dana@maplegrove.example',
  /** Members: homeowners */
  alice: 'alice@maplegrove.example',
  ben: 'ben@maplegrove.example',
  /** Viewers: a display, and a guest in a meeting */
  morgan: 'morgan@maplegrove.example',
  sam: 'sam@maplegrove.example',
} as const;

/** Sign a page's browser context in as one of the demo's people, with the test code */
export async function signIn(page: Page, email: string): Promise<void> {
  const response = await page.request.post('/api/auth/verify', {
    data: { email, code: '000000' },
  });
  expect(response.ok(), `sign in as ${email}`).toBe(true);
}
```

`e2e/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

`e2e/tests/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { PEOPLE, signIn } from '../helpers';

test('Pat signs in, opens the bylaws and finds the annual meeting on the schedule', async ({
  page,
}) => {
  await signIn(page, PEOPLE.pat);
  await page.goto('/');
  await expect(page.getByText('Welcome to Maple Grove HOA')).toBeVisible();

  const bylaws = 'Bylaws of Maple Grove Homeowners Association';
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: bylaws }).click();
  await expect(page.getByRole('heading', { name: bylaws })).toBeVisible();

  await page.getByRole('link', { name: 'Live Meetings' }).click();
  await expect(page.getByRole('heading', { name: 'Live meetings' })).toBeVisible();
  // Dana presides over it, so Pat joins it
  await expect(page.getByRole('link', { name: 'Join 2026 Annual Meeting' })).toBeVisible();
});

test('a meeting link opened signed out goes to sign-in and keeps the link', async ({ page }) => {
  await page.goto('/meetings/MAPLE1');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fmeetings%2FMAPLE1$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});
```

`e2e/tests/visual.spec.ts`:

```ts
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { PEOPLE, signIn } from '../helpers';

/** The pages captured after signing in, each with the heading that says it is ready */
const PAGES = [
  { name: 'dashboard', path: '/', heading: 'Dashboard' },
  { name: 'live-meetings', path: '/meetings', heading: 'Live meetings' },
  { name: 'settings', path: '/settings', heading: 'Settings' },
  { name: 'style-guide', path: '/style-guide', heading: 'Style guide' },
];

/** The paper token in each palette (docs/design-brief.md): the page background */
const PAPER = { light: 'rgb(247, 243, 236)', dark: 'rgb(21, 19, 15)' } as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`the ${scheme} palette`, () => {
    // The app follows the system palette until the user picks one in Settings
    test.use({ colorScheme: scheme });

    test('the sign-in page', async ({ page }, testInfo) => {
      await page.goto('/sign-in');
      await expect(page.getByLabel('Email')).toBeVisible();
      await expectPalette(page, scheme);
      await capture(page, testInfo, `sign-in-${scheme}`);
    });

    test('the main pages', async ({ page }, testInfo) => {
      await signIn(page, PEOPLE.pat);
      for (const { name, path, heading } of PAGES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        await expectPalette(page, scheme);
        await capture(page, testInfo, `${name}-${scheme}`);
      }

      const bylaws = 'Bylaws of Maple Grove Homeowners Association';
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: bylaws })
        .click();
      await expect(page.getByRole('heading', { name: bylaws })).toBeVisible();
      await capture(page, testInfo, `bylaws-${scheme}`);
    });
  });
}

/** The page is paper in this palette, and its type is Public Sans, served by the app */
async function expectPalette(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(PAPER[scheme]);
  const publicSans = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (face) => face.family.replace(/"/g, '') === 'Public Sans' && face.status === 'loaded',
    );
  });
  expect(publicSans).toBe(true);
}

/** A full-page screenshot, attached to the report (CI uploads it); never compared */
async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}
```

- [ ] **Step 7: Keep the harness's output out of git and lint**

Append to `.gitignore`:

```
# Playwright
e2e/test-results/
e2e/playwright-report/
.playwright-mcp/
```

In `eslint.config.mjs`, in the first block's `ignores` list, add after `'**/coverage/**',`:

```js
      '**/test-results/**',
      '**/playwright-report/**',
```

- [ ] **Step 8: Run it locally**

Check that nothing listens on 3101 or 4173: `ss -ltn | grep -E ':(3101|4173) '` prints nothing. Start the throwaway Postgres if `docker ps --filter name=robbie-ci-pg` doesn't list it (see the conventions). Then:

Run: `npx tsc --noEmit -p e2e/tsconfig.json && npm run e2e`
Expected: a clean type-check; the shared build and the web build; Playwright starts both servers, the global setup prints the seed's "Created Maple Grove HOA (maple-grove-hoa): 17 people, ..." and its list of people, then `6 passed` (2 in `smoke.spec.ts`, 4 in `visual.spec.ts`). The screenshots are in `e2e/test-results/` (one folder per test, twelve `.png` files in all).

Open two of them, `dashboard-light.png` and `dashboard-dark.png`, and check by eye: paper background, a `surface-2` sidebar with the gavel bar on Documents, Fraunces headings, no blue anywhere, and in the dark one no white card or white heading left.

- [ ] **Step 9: The CI job**

In `.github/workflows/ci.yml`, append to `jobs:` (after the `ci` job, at the same indentation as `ci:`):

```yaml
e2e:
  runs-on: ubuntu-latest

  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: robbie
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5

  env:
    # This job's own Postgres service; locally the harness uses the throwaway one on 55432
    E2E_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/robbie
    NODE_ENV: test

  steps:
    - name: Checkout code
      uses: actions/checkout@v7

    - name: Setup Node.js 24
      uses: actions/setup-node@v7
      with:
        node-version: 24
        cache: npm

    - name: Install dependencies
      run: npm ci

    - name: Build shared package
      run: npm run build:shared

    - name: Generate Prisma client
      run: npm run db:generate -w backend-node

    - name: Build the web app
      run: npm run build -w frontend-unified

    - name: Type-check the harness
      run: npx tsc --noEmit -p e2e/tsconfig.json

    - name: Find the Playwright version
      id: playwright
      run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"

    - name: Cache Playwright browsers
      id: playwright-cache
      uses: actions/cache@v6
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}

    - name: Install Chromium
      if: steps.playwright-cache.outputs.cache-hit != 'true'
      run: npx playwright install --with-deps chromium

    - name: Install Chromium's system libraries
      if: steps.playwright-cache.outputs.cache-hit == 'true'
      run: npx playwright install-deps chromium

    - name: Playwright
      run: npx playwright test -c e2e

    - name: Upload screenshots and the report
      if: always()
      uses: actions/upload-artifact@v7
      with:
        name: playwright
        path: |
          e2e/test-results
          e2e/playwright-report
        retention-days: 14
```

The job has its own Postgres service (services belong to a job; this one is defined as the `ci` job's is) and runs beside `ci`. The browsers are cached by Playwright version; on a cache hit only the system libraries are installed.

- [ ] **Step 10: Format, lint and commit**

```bash
npx prettier --write package.json frontend-unified/vite.config.ts eslint.config.mjs e2e .github/workflows/ci.yml backend-node/src/demo/demoSeed.ts backend-node/src/__integration__/demoSeed.test.ts && npm run lint
git add package.json package-lock.json frontend-unified/vite.config.ts eslint.config.mjs .gitignore .github/workflows/ci.yml e2e backend-node/src/demo/demoSeed.ts backend-node/src/__integration__/demoSeed.test.ts
git commit -m "test(e2e): a Playwright harness on the Maple Grove HOA demo

e2e/ starts the API (migrations, test sign-in, port 3101) and a preview of
the web build (port 4173), reseeds the demo, signs in as its people with the
test code, and runs a smoke test and a visual pass that saves screenshots of
the main pages in both palettes. CI runs it in its own job with cached
browsers. The demo's annual meeting is presided over by Dana, and the HOA
counts 142 voting members with a quorum of 20%."
```

---

### Task 10: Docs, a look in the browser, and the final check

**Files:** `spec.md`, `CLAUDE.md`

- [ ] **Step 1: `spec.md`**

Under `### M9. Web client completion`, after the paragraph that starts `**Fixed 2026-10-05 (was the M9 blocker):**`, add:

```markdown
**Done 2026-10-06 (design system, the first half of MVP phase B):** the web app is on the design brief's language (`docs/design-brief.md`): paper, ink and gavel tokens in a day and an evening palette (CSS variables Tailwind reads through `@theme inline`, so a `.dark` subtree flips them), Fraunces and Public Sans served by the app, the brief's buttons, cards, badges and inputs, a `surface-2` sidebar, and a style guide at `/style-guide`. The meetings module's raw palette classes (about 730) and emoji icons are gone, the dead `components/mobile` code is deleted, and `scripts/check-palette.sh` (in `npm run lint`) keeps them out; Tailwind's own palette is switched off. A live meeting is its link (`/meetings/:code`, joined after sign-in), the Live Meetings page lists the organization's schedule with Join and Start, and the home page's upcoming meetings come from it. A Playwright harness (`e2e/`, `npm run e2e`, its own CI job) signs in as the demo's people with the test code, runs a smoke test, and saves screenshots of the main pages in both palettes. Still to do: the overlap check at 390px and 1280px described below.
```

Under `### M3. Organization authorization (REST and socket)`, replace the bullet that starts `- Follow-up: the demo seed (` with:

```markdown
- **Done 2026-10-06:** the demo seed's annual meeting is presided over by Dana Okafor, and the Maple Grove HOA has 142 voting members with a quorum of 20% (29).
```

- [ ] **Step 2: `CLAUDE.md`**

- In "### Testing", inside the code block, add after the `npm run lint` line:

  ```bash
  npm run lint:palette     # The design-token check alone (npm run lint runs it): no raw palette classes or emoji icons
  npm run e2e              # Playwright: builds, starts the API (3101) and the web build (4173) on E2E_DATABASE_URL (default: the throwaway Postgres on 55432), reseeds the demo
  ```

- Under "**Routing Structure:**", replace the lines for `/meetings` and `/meetings/:code` with:

  ```markdown
  - `/meetings` - Live Meetings: the organization's schedule (Join, and Start for the presiding officer) and the code box (Robbie)
  - `/meetings/:code` - The live meeting with that code, over Socket.io; the link (or its QR code) joins after sign-in (Robbie)
  - `/style-guide` - The design language: the tokens and components in both palettes
  ```

- Under "## Key Conventions", add after the last numbered item, with the next number:

  ```markdown
  **Design tokens (web):** `docs/design-brief.md` is authoritative for look and feel. Use the tokens from `frontend-unified/src/styles/index.css` (`bg-paper`, `bg-surface`, `bg-surface-2`, `text-ink`, `text-ink-muted`, `border-rule`, `bg-gavel`, `text-carried`, `text-caution-ink` for caution text, and the `-tint`s) and its utilities (`btn-primary`/`btn-secondary`/`btn-ghost`, `card`, `badge-*`, `label-caps`, `page-title`, `card-title`, `meeting-code`, `animate-reveal`/`-stamp`/`-crossfade`); they flip with `.dark` on any element, so a subtree can be forced into the evening palette. Never raw Tailwind palette classes, `white` or `black`, or emoji icons (lucide only): `scripts/check-palette.sh` fails `npm run lint` on them, and Tailwind's own palette is switched off. The old `primary-`, `secondary-`, `accent-`, `success-` and `danger-` names still work (they point at the token scales) but new code doesn't use them. `/style-guide` shows everything.
  ```

  (Start the paragraph with the item's number, as the items before it do.)

- Under "### Frontend Unified" in "## Environment Variables", add after the code block:

  ```markdown
  `vite.config.ts` proxies `/api` and `/socket.io` to `API_PROXY_TARGET` (default `http://localhost:3001`) in both `vite` and `vite preview`; the Playwright harness points it at its own API.
  ```

- [ ] **Step 3: Format, then the full check**

Run: `npx prettier --write spec.md CLAUDE.md`

Run (from the repository root):

```bash
npm run build:shared && npm run format:check && npm run lint && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npx tsc --noEmit -p e2e/tsconfig.json && npm run test:run -w shared && npm run test:run -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -w backend-node && npm run e2e
```

Expected: all pass. Lint warnings no more than before this plan; lint ends with `Palette check passed (0 files on the allowlist).`; `npm run e2e` reports `6 passed`. No commit of this plan touches `mobile/`.

- [ ] **Step 4: A look in the browser**

The visual pass covers the main pages in both palettes; this step covers the live meeting by link, which the screens plan redesigns.

- Check that nothing listens on 3001 or 5173: `ss -ltn | grep -E ':(3001|5173) '` prints nothing.
- Backend: from `backend-node`, run `npx tsx src/index.ts` in the background with `PORT=3001`, `DATABASE_URL` and `DIRECT_URL` set to `postgresql://postgres:postgres@localhost:55432/robbie`, `ENABLE_TEST_AUTH=true`, `NODE_ENV=test`, and `RESEND_API_KEY=` (empty); record its PID. The demo is seeded (the e2e run reseeded it).
- Web: from `frontend-unified`, run `npx vite --port 5173` in the background; record its PID.

With the Playwright MCP browser:

1. Open `http://localhost:5173/meetings/MAPLE1` signed out: it goes to `/sign-in?next=%2Fmeetings%2FMAPLE1`. Sign in as `dana@maplegrove.example` with `000000`: it comes back to `/meetings/MAPLE1` and shows the meeting (the chair's view, on the new tokens).
2. Leave the meeting: the Live Meetings page lists "2026 Annual Meeting", "Tue, Oct 20, 7:00 PM, Dana Okafor presiding" (the time in the browser's zone), the code `MAPLE1`, and "Start". The code box beside it says "Join with a code".
3. Type `nope01` in the code box and Join: the page goes to `/meetings/NOPE01`, which shows "No meeting with that code" with Try again and Leave meeting (the screens plan turns this into the code box with the message).
4. Settings, Appearance: choose Dark. The sidebar, header, cards and the Live Meetings page are on the evening palette; nothing white is left. Open `/style-guide`: the evening panel matches the rest of the page now; switch back to Light and the evening panel stays dark while the page is light.

Note anything that differs in the report, with a screenshot. Stop both servers by PID, and remove any `.playwright-mcp/` folder the browser tool created.

- [ ] **Step 5: Commit**

```bash
git add spec.md CLAUDE.md
git commit -m "docs: record the design system and meeting links"
```

---

## Self-review notes

- **Coverage (the request's items, the design and the brief):**
  1. Tokens and fonts (Task 1): the brief's twelve tokens with its exact values in both palettes, as CSS variables flipped by `.dark` and read by Tailwind 4 through `@theme inline` (the mechanism is explained in Task 1); `primary-*` on the gavel scale and `secondary-*` on the ink scale, as the brief says, and `accent-`, `success-`, `danger-` and `meeting-` on the others; `@fontsource-variable/fraunces` 5.3.0 (its `full.css`, with the optical size and `SOFT` axes) and `@fontsource/public-sans` 5.3.0 (400, 500, 600), checked with `npm view`; `--font-heading` and `--font-body`; the type scale (Tailwind's xs, sm, base, lg plus `title` 1.375, `page` 1.75, `question` 2.5, and the display's 72, 40, 96 and 28px); `label-caps`; the `@utility` classes rewritten (buttons 40px and 56px, 8px radius, no gradients; cards 12px, no shadow; badges as labels in a tint; inputs; the focus ring); the motion utilities with reduced motion keeping only the crossfade. The palette check (Task 2) with an allowlist that only shrinks and is wired into `npm run lint`, which CI runs.
  2. The shell (Task 3): the sidebar as the brief draws it, the header, user menu, organization switcher, sign-in, terms and legal pages, the ui kit, toasts; the evening palette is checked in the browser by the visual pass (Task 9), not in unit tests.
  3. The documents side (Task 4), mechanically, with page titles in Fraunces.
  4. The meetings module (Tasks 5 and 6), every file the grep found (60, with their raw-class counts in the allowlist's history: the whole module had about 730), the dead `components/mobile/*` deleted, the allowlist down to zero, and Tailwind's palette closed.
  5. Deep link, QR, the Live Meetings page and the home page (Task 7).
  6. The Playwright harness (Task 9) with the seed it needs, a smoke test, the visual pass in both palettes, and the CI job with cached browsers; how to run it locally on 55432 is in Task 9, Step 8, and in `CLAUDE.md`.
  7. Docs, a look in the browser and the final check (Task 10).
  - The roadmap's design-system phase also asks for a style guide page (Task 8).
- **Where the code, the server plan, the brief or the request didn't agree, and what this plan does:**
  - **The demo seed.** The request says the server plan adds `chairUserId`, `eligibleVoters` and `quorumPercent` to the seed; the server plan only lists them as a follow-up (it was written before the seed existed) and doesn't touch `demoSeed.ts`. Task 9 adds them, with a check that skips the step if they are already there.
  - **Contrast.** The brief says every pair meets 4.5:1. The day `caution` is 3.2:1 on `caution-tint` and 3.6:1 on `surface`, and the evening `gavel` on `gavel-tint` is 4.3:1. This plan adds one token, `caution-ink` (`#7F5410` day, the brief's `caution` in the evening), for caution-colored text, and puts `ink` text on `gavel-tint` badges. The brief's token values are unchanged.
  - **White and black.** The brief's rule names `gray-`, `blue-`, `indigo-`, `green-`; the check also covers `white` and `black`, because the brief's primary buttons have paper text, its cards are `surface`, and `bg-white` was the main thing breaking the evening palette on the documents side. Overlays use the fixed `ink-900` shade.
  - **Red.** The brief reserves red for the gavel and destructive confirmations and says a failed result is not red. `btn-danger` and the `danger-` palette are the gavel's red; `badge-failed` is ink; the codemod maps the meetings module's raw reds (actions and destructive buttons there) to the gavel. Nay counts are still on the old `danger-` tint in the chair's vote panel until the screens plan replaces it.
  - **Phase names.** The roadmap's phase B is "in the room" and includes moving the whole app onto the brief's tokens and starting the Playwright harness, so this plan and the screens plan are two halves of phase B with the server plan. This plan leaves the roadmap alone; the screens plan's last task marks phase B done.
  - **`vite preview` and the proxy.** It uses `server.proxy` when `preview.proxy` is unset (Vite 8's `resolvePreviewOptions`), so the harness can run the production build; only the target became configurable.
  - **Playwright's order.** `webServer` starts before `globalSetup` (plugin setup tasks run first), so the migrations run in the backend's server command and the global setup only clears live meetings and reseeds.
  - **The remembered meeting.** `SocketProvider` kept the last meeting code in `localStorage` and rejoined it on `/meetings`; with the link as the meeting that is gone (a reload keeps the URL). A visitor at `/meetings` sees the schedule instead of being pulled back into the last meeting.
  - **The home page's test** exists (it covers the empty states for lower roles); Task 7 changes its API mock from the meeting records to the schedule and adds the upcoming-meetings test beside its two tests.
  - **The stamp's tilt** is the `-rotate-4` class, not part of the keyframes, so reduced motion (which stops the animation) keeps it; the keyframes only scale. The screens plan's `Stamp` relies on this.
  - **Font for documents.** The brief names two typefaces; `--font-document` (the bylaws text) was Georgia and is now Fraunces, so there are two.
- **Order:** each task leaves the app building, type-checking and passing its tests. The codemod exists from Task 2 and is deleted in Task 6, after its last use; the palette closes only when the allowlist is empty. Task 7's `HomePage` snippets are the text as Task 4's codemod and Prettier left it.
- **Placeholder scan:** no "TBD", no "similar to"; every new file is given whole; every change is a before and after or an exact command. The allowlist's 94 lines were produced by the check's own pattern on this branch; if a file was added since, Task 2 says what to do. The expected codemod outputs (file counts, sample classes) were checked by running the codemod on a copy of `frontend-unified/src`.
- **Names used across tasks and by the screens plan:** tokens `paper`, `surface`, `surface-2`, `ink`, `ink-muted`, `rule`, `gavel`, `gavel-tint`, `carried`, `carried-tint`, `caution`, `caution-tint`, `caution-ink`; scales `gavel-*`, `ink-*`, `carried-*`, `caution-*`; utilities `font-serif-soft`, `page-title`, `card-title`, `label-caps`, `meeting-code`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-lg`, `card`, `badge-chair`, `badge-admin`, `badge-member`, `badge-guest`, `badge-present`, `badge-marked`, `badge-absent`, `animate-reveal`, `animate-stamp`, `animate-count-pulse`, `animate-crossfade`; text sizes `text-title`, `text-page`, `text-question`, `text-question-phone`, `text-display-question`, `text-display-line`, `text-display-number`, `text-display-label`; `RoleBadge`, `PresenceBadge`, `Presence`; `schedule.list`, `ScheduledMeeting`, `formatMeetingTime`; `MEETING_CODE`, `normalizeMeetingCode`, `meetingPath`, `joinUrl`; `QrCode`; `SocketProvider({ meetingCode })`, `SocketContextValue.meetingCode`, `leaveMeeting`; `LiveMeetingsPage`, `JoinMeetingScreen({ message, initialCode })`; `StyleGuidePage`; e2e `PEOPLE`, `signIn`, `DATABASE_URL`, `API_PORT`, `WEB_PORT`, `backendEnv`.
