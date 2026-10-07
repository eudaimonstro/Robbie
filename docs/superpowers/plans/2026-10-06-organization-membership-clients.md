# Organization Membership (Clients) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the web and mobile apps up to the organization membership server (Phase A of `docs/mvp-roadmap.md`): users accept the Terms of Service and Privacy Policy, see only their organizations with their role, create organizations, manage members in Settings, schedule meetings in the current organization, and see only the actions their role allows. A demo seed creates the Maple Grove HOA from the roadmap's scenario.

**Architecture:**

- **Web.**
  - The API client reports a 403 with code `TERMS_NOT_ACCEPTED` to a handler, as it reports a 401 today. `SessionProvider` keeps `termsAccepted` from `GET /api/auth/me`; `RequireSession` shows a terms step until it is true, before the organization provider makes its first request.
  - The name step of `/sign-in` carries the terms checkbox for new users. `/terms` and `/privacy` are public pages with a draft of each document.
  - `OrganizationContext` exposes the user's `role` in the current organization and a `useCan(minRole)` hook built on `utils/roles.ts`, a copy of the server's role order. Pages hide actions the role can't take; the server still decides.
  - Settings gets a members card (list, add by email, change role, remove, pending additions), Leave, and Delete confirmed by typing the name.
  - Scheduling creates the meeting's packet with `POST /api/organizations/:orgId/packets`. A missing packet (404) is "no documents", and an unlinked meeting (404) is "not linked".
- **Mobile.** `getMe` returns `termsAccepted`; the name screen has the same checkbox; a terms screen covers existing users and a socket refused for the terms. Nothing else changes.
- **Server.** Only the demo seed (`npm run seed:demo -w backend-node`) and its integration test.

**Tech Stack:** React 19, React Router 7, Vite 8, Vitest 5 with Testing Library (web); Expo SDK 57, expo-router, jest-expo, `@testing-library/react-native` 14 (mobile); Node 24, Prisma 7, Vitest 5 (seed).

**Design:** `docs/superpowers/specs/2026-10-06-organization-membership-design.md`, section "Clients". The server side is done on this branch (`docs/superpowers/plans/2026-10-06-organization-membership-server.md` and the review fixes after it). Product direction: `docs/mvp-roadmap.md`, Phase A.

**Server API this plan uses:**

| Call                                                  | Body                                                  | Answer                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/auth/me`                                    |                                                       | `{ user, termsAccepted }`, or 401                                                                                                                                                                                                                                            |
| `POST /api/auth/accept-terms`                         | `{ version }`                                         | `{ termsAccepted: true }`; a version other than `TERMS_VERSION` is 409 "The terms have changed. Reload to see the current terms."                                                                                                                                            |
| `GET /api/organizations`                              |                                                       | Only the user's organizations, each with the user's `role`                                                                                                                                                                                                                   |
| `POST /api/organizations`                             | `{ name, description?, slug? }`                       | 201, the organization with `role: 'owner'`. Without a slug the server makes one from the name. 400 "Organization with slug '<slug>' already exists"; 429 "You can own at most 3 organizations"                                                                               |
| `PUT /api/organizations/:id`                          | `{ name?, description? }`                             | The organization (admin)                                                                                                                                                                                                                                                     |
| `DELETE /api/organizations/:id`                       |                                                       | 204 (owner)                                                                                                                                                                                                                                                                  |
| `GET /api/organizations/:id/members`                  |                                                       | `{ members: [{ userId, name, email, role }], invites? }`; `invites` (`{ id, email, role, createdAt }`) only for admins                                                                                                                                                       |
| `POST /api/organizations/:id/members`                 | `{ email, role }`                                     | 201 `{ status: 'added', member, emailSent }` or `{ status: 'invited', invite, emailSent }`; 200 `{ status: 'updated', invite, emailSent: false }`. 409 "That person is already a member"; 429 "This organization has added 20 people today. Try again tomorrow."; admin only |
| `PUT /api/organizations/:id/members/:userId`          | `{ role }`                                            | `{ member }`; 409 "An organization needs at least one owner"                                                                                                                                                                                                                 |
| `DELETE /api/organizations/:id/members/:userId`       |                                                       | 204. An admin removes; anyone removes themselves (leave). 409 "An organization needs at least one owner"                                                                                                                                                                     |
| `DELETE /api/organizations/:id/invites/:inviteId`     |                                                       | 204 (admin)                                                                                                                                                                                                                                                                  |
| `POST /api/organizations/:orgId/packets`              | `{ robbieCode, title?, description?, scheduledFor? }` | 201, the packet (with `organizationId`); 409 "That meeting code is already in use" (secretary)                                                                                                                                                                               |
| `GET /api/packets/:robbieCode`                        |                                                       | The packet, or 404 when the code has none (it no longer creates one)                                                                                                                                                                                                         |
| `GET /api/bylawyer/organizations`                     |                                                       | The user's organizations, each with `role`                                                                                                                                                                                                                                   |
| `POST /api/bylawyer/link-meeting`                     | `{ meetingCode, organizationId }`                     | `{ success, meetingCode, organization }`; 409 "That meeting code is already in use" (secretary in that organization)                                                                                                                                                         |
| `DELETE /api/bylawyer/link-meeting/:meetingCode`      |                                                       | `{ success }`; 409 "Remove the agenda and attachments first"                                                                                                                                                                                                                 |
| `GET /api/bylawyer/meeting/:meetingCode/organization` |                                                       | `{ linked: true, organization }`, or 404 for a code with no packet (or one in an organization the user isn't in)                                                                                                                                                             |
| `GET /api/robbie/sync-status/:meetingCode/:motionId`  |                                                       | `{ synced, amendmentId?, status?, applied? }`, or 404 for an unlinked code                                                                                                                                                                                                   |

- Every other `/api` route answers 403 `{ error: 'Accept the terms to continue', code: 'TERMS_NOT_ACCEPTED' }` until the user accepts `TERMS_VERSION` (`@robbie-bylawyer/shared/constants`, now `'2026-10-06'`). `/api/auth/*`, including `PATCH /api/auth/me`, doesn't check the terms.
- The socket refuses the same user: `connect_error` with message "Accept the terms to continue" and `err.data.code === 'TERMS_NOT_ACCEPTED'` (`backend-node/src/socket/socketAuth.ts`). socket.io-client types `err.data` as `any`.
- Outside an organization: 404 `{ error: 'Not found' }`. Role too low: 403 `{ error: 'You need the <role> role for this' }`.
- Amendments carry `createdById`. A member may edit, add changes to and delete only a draft they created; status changes and apply need secretary.
- Meeting codes are 4 to 8 letters or digits, stored in upper case. Document responses no longer include `shareToken` (the web types never had it).
- `/api/bylawyer/link-meeting` validates its body, so a bad one gets `{ error: { code, message, details } }`, which the client's existing message helper already reads.

**Conventions:**

- Use `&&` between shell commands, never `;`.
- Node 24 (`.nvmrc`).
- Web tests: `TZ=America/Chicago npx vitest run <path>` in `frontend-unified`. The web Vitest config has no `clearMocks`, so each test file clears its own mocks (`vi.clearAllMocks()` in `beforeEach`). Type-check: `npx tsc --noEmit -p .` in `frontend-unified` (it includes the tests).
- Mobile tests: `npx jest <path>` in `mobile`. `jest.mock` factories may use only variables whose names start with `mock`. With RNTL 14, `render`, `renderHook`, `fireEvent` and `act` are awaited.
- `TERMS_VERSION` comes from the built shared package. Run `npm run build:shared` (from the repository root) before the first test run if `shared/dist` is missing or older than `shared/constants/terms.ts`. This plan changes nothing in `shared/`; if a task ever does, rebuild it.
- Never point anything at port 5432 (another project's database; `backend-node/.env` points there). The seed, the live check and integration tests use the throwaway Postgres on port 55432, passed as `DATABASE_URL`/`DIRECT_URL` on the command line, which dotenv doesn't override. Start it once if `docker ps --filter name=robbie-ci-pg` doesn't list it:

  ```bash
  docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine
  ```

- Before/after snippets show the code as it is when the task starts. Prettier formats the code blocks of this plan, so a fragment may show less indentation than the file has: match a snippet by its text, and keep the file's indentation.
- Before each commit, run `npx prettier --write` on the files you changed (from the repository root); CI checks formatting.
- Commit messages carry no `Co-Authored-By` or other attribution lines.
- Role checks in the clients are for display only. Never remove a server check because the UI hides the action.

---

## File structure

**Web** (`frontend-unified/src`):

| File                                                                                                           | Responsibility                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `utils/roles.ts`                                                                                               | `ROLES`, `OrgRole`, `ROLE_LABELS`, `atLeast`, `assignableRoles`, `canEditAmendment`                        |
| `api/client.ts`                                                                                                | Terms refusals (`setTermsHandler`), no retry of a 429 write, members, roles, 404s, `auth.me`/`acceptTerms` |
| `context/SessionContext.tsx`                                                                                   | `termsAccepted`, `acceptTerms()`, `markTermsNotAccepted()`                                                 |
| `pages/legal/LegalPage.tsx`, `TermsPage.tsx`, `PrivacyPage.tsx`                                                | Public draft Terms of Service and Privacy Policy                                                           |
| `components/auth/TermsCheckbox.tsx`, `TermsStep.tsx`                                                           | The checkbox; the step `RequireSession` shows                                                              |
| `pages/SignInPage.tsx`, `components/auth/RequireSession.tsx`, `App.tsx`                                        | Checkbox at the name step; the terms step; the public routes                                               |
| `context/OrganizationContext.tsx`                                                                              | `role`, `useCan(minRole)`                                                                                  |
| `components/layout/OrganizationSwitcher.tsx`, `Header.tsx`                                                     | The switcher, out of the header, with roles and "New organization"; the name "Robbie"                      |
| `components/organizations/NewOrganizationModal.tsx`, `NoOrganizations.tsx`                                     | Create an organization; the empty state                                                                    |
| Document, amendment and meeting record pages, `Sidebar.tsx`                                                    | Hide actions by role                                                                                       |
| `modules/documents/components/MembersCard.tsx`, `DeleteOrganizationDialog.tsx`                                 | Members; delete confirmed by typing the name                                                               |
| `modules/documents/pages/SettingsPage.tsx`                                                                     | Members, admin-only edit, Leave, owner-only Delete, "About Robbie"                                         |
| `modules/meetings/components/scheduling/*`                                                                     | `getPacket`, `createPacket`; the scheduler creates the packet in the current organization                  |
| `modules/meetings/components/BylawyerLinkPanel.tsx`, `chair/MeetingDocumentsPanel.tsx`                         | Secretary organizations only, 404 as not linked; 404 as no documents                                       |
| `modules/meetings/hooks/useSocketConnection.ts`, `context/SocketContext.tsx`, `context/OrganizationBridge.tsx` | Socket refused for the terms; the role in the bridge                                                       |

**Mobile** (`mobile`):

| File                                           | Responsibility                                             |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `lib/api.ts`, `app.config.js`                  | `getMe` with `termsAccepted`, `acceptTerms`, `getWebUrl`   |
| `context/SessionContext.tsx`                   | `termsAccepted`, `acceptTerms()`, `markTermsNotAccepted()` |
| `components/TermsAgreement.tsx`                | The checkbox, with links that open the web pages           |
| `app/(auth)/name.tsx`, `app/terms.tsx`         | The checkbox at the name step; the terms screen            |
| `app/_layout.tsx`, `context/SocketContext.tsx` | Route to the terms screen; the socket's terms refusal      |

**Server** (`backend-node`):

| File                                   | Responsibility                             |
| -------------------------------------- | ------------------------------------------ |
| `src/demo/demoSeed.ts`                 | `seedDemo({ reset })`: the Maple Grove HOA |
| `src/scripts/seedDemo.ts`              | `npm run seed:demo`                        |
| `src/__integration__/demoSeed.test.ts` | Runs `seedDemo` against the test database  |

---

### Task 1: Roles and the API client (web)

**Files:**

- Create: `frontend-unified/src/utils/roles.ts`
- Modify: `frontend-unified/src/api/client.ts`
- Test: `frontend-unified/src/utils/__tests__/roles.test.ts`, `frontend-unified/src/api/__tests__/client.test.ts`

Work in `frontend-unified/`.

- [ ] **Step 1: Write the failing tests**

`src/utils/__tests__/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assignableRoles, atLeast, canEditAmendment } from '../roles';

describe('roles', () => {
  it('ranks roles as the server does', () => {
    expect(atLeast('secretary', 'member')).toBe(true);
    expect(atLeast('member', 'secretary')).toBe(false);
    expect(atLeast('owner', 'owner')).toBe(true);
    expect(atLeast('viewer', 'viewer')).toBe(true);
  });

  it('lets an admin give roles up to admin, and only an owner give owner', () => {
    expect(assignableRoles('admin')).toEqual(['viewer', 'member', 'secretary', 'admin']);
    expect(assignableRoles('owner')).toEqual(['viewer', 'member', 'secretary', 'admin', 'owner']);
    expect(assignableRoles('secretary')).toEqual([]);
  });

  it('lets a member edit only their own draft, and a secretary any amendment', () => {
    const draft = { status: 'draft', createdById: 7 };
    expect(canEditAmendment('member', 7, draft)).toBe(true);
    expect(canEditAmendment('member', 8, draft)).toBe(false);
    expect(canEditAmendment('member', 7, { ...draft, status: 'proposed' })).toBe(false);
    expect(canEditAmendment('viewer', 7, draft)).toBe(false);
    expect(canEditAmendment('secretary', 8, draft)).toBe(true);
  });
});
```

In `src/api/__tests__/client.test.ts`, replace the import at the top with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  organizations,
  documents,
  versions,
  amendments,
  auth,
  members,
  bylawSync,
  apiFetch,
  HttpError,
  setSignedOutHandler,
  setTermsHandler,
} from '../client';
```

and append:

```ts
describe('terms refusals', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setTermsHandler(null);
  });

  it('reports a refusal for terms not accepted, with its code', async () => {
    const onTerms = vi.fn();
    setTermsHandler(onTerms);
    mockResponse(403, { error: 'Accept the terms to continue', code: 'TERMS_NOT_ACCEPTED' });
    const error = await organizations.list().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).code).toBe('TERMS_NOT_ACCEPTED');
    expect(onTerms).toHaveBeenCalledOnce();
  });

  it('does not report a role refusal as terms', async () => {
    const onTerms = vi.fn();
    setTermsHandler(onTerms);
    mockResponse(403, { error: 'You need the owner role for this' });
    await expect(organizations.delete('o1')).rejects.toThrow('You need the owner role for this');
    expect(onTerms).not.toHaveBeenCalled();
  });

  it('reports a terms refusal from a plain fetch, and leaves the body readable', async () => {
    const onTerms = vi.fn();
    setTermsHandler(onTerms);
    mockResponse(403, { error: 'Accept the terms to continue', code: 'TERMS_NOT_ACCEPTED' });
    const response = await apiFetch('/packets/DEMO');
    expect(onTerms).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({
      error: 'Accept the terms to continue',
      code: 'TERMS_NOT_ACCEPTED',
    });
  });
});

describe('organization calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds a member by email with a role', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'invited',
            invite: { id: 'i1', email: 'kim@example.org', role: 'member', createdAt: '' },
            emailSent: true,
          }),
          { status: 201 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await members.add('o1', 'kim@example.org', 'member');
    expect(result.status).toBe('invited');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/organizations/o1/members');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'kim@example.org', role: 'member' });
  });

  it("shows a limit's message at once instead of retrying the write", async () => {
    // A daily limit or the 3-owned limit won't clear in the seconds a retry waits
    const limit = 'This organization has added 20 people today. Try again tomorrow.';
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: limit }), { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(members.add('o1', 'kim@example.org', 'member')).rejects.toThrow(limit);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('treats a meeting code without a packet as not linked', async () => {
    mockResponse(404, { error: 'Not found' });
    expect(await bylawSync.getMeetingOrganization('ABCD')).toEqual({
      linked: false,
      organization: null,
    });
  });

  it('treats the sync status of an unlinked meeting as not synced', async () => {
    mockResponse(404, { error: 'Not found' });
    expect(await bylawSync.getSyncStatus('ABCD', 41)).toEqual({ synced: false });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/utils src/api`
Expected: FAIL. `../roles` is not found, and `members`, `setTermsHandler` and `HttpError.code` don't exist.

- [ ] **Step 3: Create `src/utils/roles.ts`**

```ts
/**
 * Organization roles, lowest first, as the server ranks them (backend-node/src/orgs/roles.ts).
 * The server decides what each role may do; the app uses these only to hide actions a role
 * can't take.
 */
export const ROLES = ['viewer', 'member', 'secretary', 'admin', 'owner'] as const;

export type OrgRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<OrgRole, string> = {
  viewer: 'Viewer',
  member: 'Member',
  secretary: 'Secretary',
  admin: 'Admin',
  owner: 'Owner',
};

/** Whether `role` is `min` or higher */
export function atLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

/** The roles someone with `role` may give others: an owner any, an admin up to admin */
export function assignableRoles(role: OrgRole): OrgRole[] {
  if (role === 'owner') return [...ROLES];
  if (role === 'admin') return ROLES.filter((r) => r !== 'owner');
  return [];
}

/**
 * Whether a user may edit, add changes to or delete an amendment: a secretary any, a member
 * only a draft they created (the server's canEditAmendment)
 */
export function canEditAmendment(
  role: OrgRole,
  userId: number,
  amendment: { status: string; createdById: number | null },
): boolean {
  if (atLeast(role, 'secretary')) return true;
  return (
    atLeast(role, 'member') && amendment.status === 'draft' && amendment.createdById === userId
  );
}
```

- [ ] **Step 4: Change `src/api/client.ts`**

Add as the first line of the file:

```ts
import type { OrgRole } from '../utils/roles';
```

Replace the `HttpError` class with:

```ts
/** An error response from the API, with its HTTP status and, for some refusals, a code */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
```

After the `noteUnauthorized` function, add:

```ts
/** The code of a refusal because the user hasn't accepted the current terms */
export const TERMS_NOT_ACCEPTED = 'TERMS_NOT_ACCEPTED';

// Called when a request is refused until the user accepts the current terms, so the app can
// show the terms step
let termsHandler: (() => void) | null = null;

export function setTermsHandler(handler: (() => void) | null): void {
  termsHandler = handler;
}

function noteTermsRefusal(status: number, code: string | undefined): void {
  if (status === 403 && code === TERMS_NOT_ACCEPTED) termsHandler?.();
}
```

Replace `apiFetch` with:

```ts
/**
 * A plain same-origin fetch of `/api${endpoint}`, for callers that read the response
 * themselves. A 401 is reported as a lost session and a terms refusal as one, the same as for
 * the rest of the client.
 */
export async function apiFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE}${endpoint}`, init);
  noteUnauthorized(endpoint, response.status);
  if (response.status === 403) {
    // Read a copy, so the caller can still read the body
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    noteTermsRefusal(response.status, body?.code);
  }
  return response;
}
```

Replace the `errorMessage` function (and the comment above it) with:

```ts
// The backend sends { error: string } from route handlers (with a code for some refusals), or
// { error: { code, message, details? } } from validation and the error handler
async function readError(response: Response): Promise<{ message: string; code?: string }> {
  const body = await response.json().catch(() => null);
  const error = body?.error;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  if (typeof error === 'string') return { message: error, code };
  if (error && typeof error.message === 'string') {
    const detail = Array.isArray(error.details) ? error.details[0] : null;
    const message = detail?.message
      ? `${error.message} (${detail.path ? `${detail.path}: ` : ''}${detail.message})`
      : error.message;
    return { message, code: typeof error.code === 'string' ? error.code : code };
  }
  return { message: `HTTP ${response.status}`, code };
}

async function errorMessage(response: Response): Promise<string> {
  return (await readError(response)).message;
}
```

Replace `shouldRetry` with:

```ts
function shouldRetry(status: number, attempt: number, isGet: boolean): boolean {
  // Retry on network errors and 5xx server errors. A 429 is retried only for reads: on a write
  // it is a limit (organizations owned, people added in a day) that a retry can't get past, and
  // retrying would hold back the server's message for several seconds.
  return attempt < MAX_RETRIES && (status >= 500 || status === 0 || (status === 429 && isGet));
}
```

In `request()`, replace:

```ts
        if (!endpoint.startsWith('/auth/') && shouldRetry(response.status, attempt)) {
```

with:

```ts
        if (!endpoint.startsWith('/auth/') && shouldRetry(response.status, attempt, isGet)) {
```

and replace:

```ts
throw new HttpError(await errorMessage(response), response.status);
```

with:

```ts
const { message, code } = await readError(response);
noteTermsRefusal(response.status, code);
throw new HttpError(message, response.status, code);
```

In `organizations`, replace the `list` and `create` lines:

```ts
  list: () => request<OrganizationWithRole[]>('/organizations'),
  get: (id: string) => request<Organization>(`/organizations/${id}`),
  create: (data: OrganizationCreate) =>
    request<OrganizationWithRole>('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
```

(the `get` line is unchanged; it answers without a role). After the `organizations` object, add:

```ts
// Members of an organization
export const members = {
  /** The members, and for admins the pending additions */
  list: (orgId: string) => request<MemberList>(`/organizations/${orgId}/members`, {}, false),
  add: (orgId: string, email: string, role: OrgRole) =>
    request<AddMemberResult>(`/organizations/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
  changeRole: (orgId: string, userId: number, role: OrgRole) =>
    request<{ member: OrgMember }>(`/organizations/${orgId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  /** Remove a member, or leave the organization when userId is the signed-in user's */
  remove: (orgId: string, userId: number) =>
    request<void>(`/organizations/${orgId}/members/${userId}`, { method: 'DELETE' }),
  cancelInvite: (orgId: string, inviteId: string) =>
    request<void>(`/organizations/${orgId}/invites/${inviteId}`, { method: 'DELETE' }),
};
```

After the `OrganizationUpdate` interface, add:

```ts
/** One of the signed-in user's organizations, with their role in it */
export interface OrganizationWithRole extends Organization {
  role: OrgRole;
}

export interface OrgMember {
  userId: number;
  name: string | null;
  email: string;
  role: OrgRole;
}

/** An addition by email that waits until that email first signs in */
export interface PendingInvite {
  id: string;
  email: string;
  role: OrgRole;
  createdAt: string;
}

export interface MemberList {
  members: OrgMember[];
  /** Only for admins */
  invites?: PendingInvite[];
}

export type AddMemberResult =
  | { status: 'added'; member: OrgMember; emailSent: boolean }
  | { status: 'invited'; invite: PendingInvite; emailSent: boolean }
  | { status: 'updated'; invite: PendingInvite; emailSent: false };
```

In `interface Amendment`, after `resultingVersionId: string | null;`, add:

```ts
/** Who created it; null for amendments synced from a live meeting or made before this was kept */
createdById: number | null;
```

In `bylawSync`, replace `getOrganizations`, `getMeetingOrganization` and `getSyncStatus` with:

```ts
  // The user's organizations, each with their role (the link needs secretary)
  getOrganizations: () => request<OrganizationWithRole[]>('/bylawyer/organizations'),
```

```ts
  // The organization a meeting is linked to. A code without a packet, or with one in an
  // organization the user isn't in, is a 404: not linked, as far as this user can tell.
  getMeetingOrganization: async (meetingCode: string): Promise<MeetingOrganizationResponse> => {
    try {
      return await request<MeetingOrganizationResponse>(
        `/bylawyer/meeting/${meetingCode}/organization`,
        {},
        false,
      );
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return { linked: false, organization: null };
      }
      throw err;
    }
  },
```

```ts
  // Check sync status for a motion; an unlinked meeting (404) has synced nothing
  getSyncStatus: async (meetingCode: string, motionId: number): Promise<SyncStatusResponse> => {
    try {
      return await request<SyncStatusResponse>(
        `/robbie/sync-status/${meetingCode}/${motionId}`,
        {},
        false,
      );
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return { synced: false };
      throw err;
    }
  },
```

`useBylawAmendmentData.ts` also calls `getMeetingOrganization`; with the 404 handled here it gets `{ linked: false }` and shows its "No Organization Linked" state instead of "Could not connect to server". It needs no change.

Replace the comment `// Robbie-Bylawyer Integration (bylaw sync)` with `// Live meetings and the bylaws they amend (bylaw sync)`: the product is Robbie (Task 11 checks that the old name is gone).

- [ ] **Step 5: Run them to see them pass**

Run: `TZ=America/Chicago npx vitest run src/utils src/api && npx tsc --noEmit -p .`
Expected: all pass; type-check clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/roles.ts src/utils/__tests__/roles.test.ts src/api/client.ts src/api/__tests__/client.test.ts
git commit -m "feat(web): add organization roles, member calls and terms refusals to the API client"
```

---

### Task 2: Terms acceptance in the session (web)

**Files:**

- Modify: `frontend-unified/src/api/client.ts`, `frontend-unified/src/context/SessionContext.tsx`
- Test: `frontend-unified/src/api/__tests__/client.test.ts`, `frontend-unified/src/context/__tests__/SessionContext.test.tsx`

Work in `frontend-unified/`. `POST /api/auth/verify` answers only `{ user }`, so after verifying, the session asks `me` whether the user accepted the current terms. If that check fails, the session assumes not: accepting again is harmless, and showing the app to a user who hasn't accepted only gets 403s.

- [ ] **Step 1: Write the failing tests**

In `src/api/__tests__/client.test.ts`, add `TERMS_VERSION` to the imports:

```ts
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
```

and in `describe('sign-in calls')`, replace the test "returns the signed-in user, or null when signed out" with:

```ts
it('returns the signed-in user and their terms acceptance, or null when signed out', async () => {
  const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };
  mockResponse(200, { user: ann, termsAccepted: false });
  expect(await auth.me()).toEqual({ user: ann, termsAccepted: false });
  mockResponse(401, { error: 'Not signed in' });
  expect(await auth.me()).toBeNull();
});

it('accepts the terms version this app shows', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ termsAccepted: true })));
  vi.stubGlobal('fetch', fetchMock);
  await auth.acceptTerms();
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/auth/accept-terms');
  expect(JSON.parse(init.body as string)).toEqual({ version: TERMS_VERSION });
});
```

Replace `src/context/__tests__/SessionContext.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { client, HttpError } = vi.hoisted(() => {
  class HttpError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  const client = {
    me: vi.fn(),
    verify: vi.fn(),
    updateName: vi.fn(),
    acceptTerms: vi.fn(async () => ({ termsAccepted: true })),
    signOut: vi.fn(async () => ({ success: true })),
    signOutEverywhere: vi.fn(async () => ({ success: true })),
    requestCode: vi.fn(async () => ({ success: true })),
    signedOutHandler: null as null | (() => void),
    termsHandler: null as null | (() => void),
  };
  return { client, HttpError };
});
vi.mock('../../api/client', () => ({
  auth: client,
  HttpError,
  setSignedOutHandler: (h: (() => void) | null) => {
    client.signedOutHandler = h;
  },
  setTermsHandler: (h: (() => void) | null) => {
    client.termsHandler = h;
  },
}));

const { SessionProvider, useSession } = await import('../SessionContext');
const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };
type TestUser = { id: number; email: string; name: string | null };
/** What auth.me answers for a signed-in user */
const me = (user: TestUser = ann, termsAccepted = true) => ({ user, termsAccepted });

async function signedIn(answer = me()) {
  client.me.mockResolvedValueOnce(answer);
  const hook = renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe('signedIn'));
  return hook;
}

describe('SessionProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the signed-in user and whether they accepted the current terms', async () => {
    client.me.mockResolvedValueOnce(me(ann, false));
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(result.current.user).toEqual(ann);
    expect(result.current.termsAccepted).toBe(false);
  });

  it('is signed out without a session', async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(result.current.termsAccepted).toBe(false);
  });

  it('signs in, checks the terms, names the user and signs out', async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    client.verify.mockResolvedValueOnce({ ...ann, name: null });
    client.me.mockResolvedValueOnce(me({ ...ann, name: null }, true));
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(result.current.user?.name).toBeNull();
    expect(result.current.termsAccepted).toBe(true);

    client.updateName.mockResolvedValueOnce(ann);
    await act(() => result.current.setName('Ann'));
    expect(result.current.user).toEqual(ann);

    await act(() => result.current.signOut());
    expect(client.signOut).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
    expect(result.current.termsAccepted).toBe(false);
  });

  it("asks for the terms after signing in when they couldn't be checked", async () => {
    client.me.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    client.verify.mockResolvedValueOnce(ann);
    client.me.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual(ann);
    expect(result.current.termsAccepted).toBe(false);
  });

  it('accepts the current terms', async () => {
    const { result } = await signedIn(me(ann, false));
    await act(() => result.current.acceptTerms());
    expect(client.acceptTerms).toHaveBeenCalledOnce();
    expect(result.current.termsAccepted).toBe(true);
  });

  it('keeps asking when the terms changed after the page loaded', async () => {
    const { result } = await signedIn(me(ann, false));
    client.acceptTerms.mockRejectedValueOnce(
      new HttpError('The terms have changed. Reload to see the current terms.', 409),
    );
    await act(() => expect(result.current.acceptTerms()).rejects.toThrow('The terms have changed'));
    expect(result.current.termsAccepted).toBe(false);
    expect(result.current.status).toBe('signedIn');
  });

  it('is signed out when the session ended before accepting', async () => {
    const { result } = await signedIn(me(ann, false));
    client.acceptTerms.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() =>
      expect(result.current.acceptTerms()).rejects.toThrow('Your sign-in has expired'),
    );
    expect(result.current.status).toBe('signedOut');
  });

  it('shows the terms step again when the API refuses for the terms', async () => {
    const { result } = await signedIn();
    expect(result.current.termsAccepted).toBe(true);
    act(() => client.termsHandler?.());
    expect(result.current.termsAccepted).toBe(false);
    expect(result.current.status).toBe('signedIn');
  });

  it('can be told the terms are not accepted, as the socket does', async () => {
    const { result } = await signedIn();
    act(() => result.current.markTermsNotAccepted());
    expect(result.current.termsAccepted).toBe(false);
  });

  it('becomes signed out when the API reports a lost session', async () => {
    const { result } = await signedIn();
    act(() => client.signedOutHandler?.());
    expect(result.current.status).toBe('signedOut');
  });

  it('is unreachable, not signed out, when the session check fails', async () => {
    client.me.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));

    client.me.mockResolvedValueOnce(me());
    await act(() => result.current.retry());
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual(ann);
    expect(result.current.termsAccepted).toBe(true);
  });

  it('stays signed in when the sign-out request never reaches the server', async () => {
    const { result } = await signedIn();
    client.signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(() =>
      expect(result.current.signOut()).rejects.toThrow(
        "Couldn't sign out. Check your connection and try again.",
      ),
    );
    expect(result.current.status).toBe('signedIn');
  });

  it('stays signed in when a proxy answers the sign-out with an error', async () => {
    const { result } = await signedIn();
    client.signOut.mockRejectedValueOnce(new HttpError('HTTP 502', 502));
    await act(() =>
      expect(result.current.signOut()).rejects.toThrow(
        "Couldn't sign out. Check your connection and try again.",
      ),
    );
    expect(result.current.status).toBe('signedIn');
  });

  it('is signed out when the sign-out finds the session already ended', async () => {
    const { result } = await signedIn();
    client.signOut.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() => result.current.signOut());
    expect(result.current.status).toBe('signedOut');
  });

  it('stays signed in when signing out everywhere fails', async () => {
    const { result } = await signedIn();
    client.signOutEverywhere.mockRejectedValueOnce(new HttpError('Failed to sign out', 500));
    await act(() =>
      expect(result.current.signOutEverywhere()).rejects.toThrow('Failed to sign out'),
    );
    expect(result.current.status).toBe('signedIn');

    client.signOutEverywhere.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() => result.current.signOutEverywhere());
    expect(result.current.status).toBe('signedOut');
  });

  it('is signed out when the server no longer accepts the session while naming', async () => {
    const { result } = await signedIn(me({ ...ann, name: null }));
    client.updateName.mockRejectedValueOnce(new HttpError('Not signed in', 401));
    await act(() =>
      expect(result.current.setName('Ann')).rejects.toThrow('Your sign-in has expired'),
    );
    expect(result.current.status).toBe('signedOut');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/api src/context/__tests__/SessionContext.test.tsx`
Expected: FAIL. `auth.me` returns the user alone, `auth.acceptTerms` doesn't exist, and the session has no `termsAccepted`.

- [ ] **Step 3: Change `auth` in `src/api/client.ts`**

Add after the first line (the `OrgRole` import):

```ts
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
```

After the `SessionUser` interface, add:

```ts
/** The signed-in user, and whether they accepted the current Terms of Service and Privacy Policy */
export interface Me {
  user: SessionUser;
  termsAccepted: boolean;
}
```

Replace `auth.me` with:

```ts
  /** The signed-in user and their terms acceptance, or null when there is no session */
  me: async (): Promise<Me | null> => {
    const response = await fetch(`${API_BASE}/auth/me`, { credentials: 'same-origin' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(await errorMessage(response));
    return (await response.json()) as Me;
  },
```

and add to `auth`, after `updateName`:

```ts
  /** Accept the current terms: the version this app shows, so a stale page can't accept others */
  acceptTerms: () =>
    request<{ termsAccepted: boolean }>(
      '/auth/accept-terms',
      { method: 'POST', body: JSON.stringify({ version: TERMS_VERSION }) },
      false,
    ),
```

- [ ] **Step 4: Replace `src/context/SessionContext.tsx`**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  auth,
  HttpError,
  setSignedOutHandler,
  setTermsHandler,
  type SessionUser,
} from '../api/client';

// 'unreachable': the session couldn't be checked (offline, or the server failed), so it is
// neither known to be signed in nor signed out
export type SessionStatus = 'loading' | 'signedIn' | 'signedOut' | 'unreachable';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** Whether the user accepted the current Terms of Service and Privacy Policy */
  termsAccepted: boolean;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<SessionUser>;
  setName: (name: string) => Promise<void>;
  /** Accept the current terms (the version this app shows) */
  acceptTerms: () => Promise<void>;
  /** A request or the socket was refused until the terms are accepted: show the terms step */
  markTermsNotAccepted: () => void;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  /** Check the session again after it was unreachable */
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const SIGN_OUT_FAILED = "Couldn't sign out. Check your connection and try again.";
const SESSION_EXPIRED = 'Your sign-in has expired. Sign in again.';

interface SessionState {
  user: SessionUser | null;
  termsAccepted: boolean;
  status: SessionStatus;
}

const SIGNED_OUT: SessionState = { user: null, termsAccepted: false, status: 'signedOut' };

/** The session's user, terms acceptance and status, from the server */
async function checkSession(): Promise<SessionState> {
  try {
    const me = await auth.me();
    return me ? { user: me.user, termsAccepted: me.termsAccepted, status: 'signedIn' } : SIGNED_OUT;
  } catch {
    // Offline or a server error: the cookie may still be good, so don't send them to sign in
    return { user: null, termsAccepted: false, status: 'unreachable' };
  }
}

/** The signed-in user for the whole app. The session itself is an httpOnly cookie. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [status, setStatus] = useState<SessionStatus>('loading');

  const apply = useCallback((state: SessionState) => {
    setUser(state.user);
    setTermsAccepted(state.termsAccepted);
    setStatus(state.status);
  }, []);

  const markSignedOut = useCallback(() => apply(SIGNED_OUT), [apply]);
  const markTermsNotAccepted = useCallback(() => setTermsAccepted(false), []);

  /** A 401 from an auth call means the session ended: show sign-in, and say so */
  const expiredOr = useCallback(
    (err: unknown): unknown => {
      if (err instanceof HttpError && err.status === 401) {
        markSignedOut();
        return new Error(SESSION_EXPIRED, { cause: err });
      }
      return err;
    },
    [markSignedOut],
  );

  useEffect(() => {
    let current = true;
    void checkSession().then((result) => {
      if (current) apply(result);
    });
    setSignedOutHandler(markSignedOut);
    setTermsHandler(markTermsNotAccepted);
    return () => {
      current = false;
      setSignedOutHandler(null);
      setTermsHandler(null);
    };
  }, [apply, markSignedOut, markTermsNotAccepted]);

  const retry = useCallback(async () => {
    setStatus('loading');
    apply(await checkSession());
  }, [apply]);

  const requestCode = useCallback(async (email: string) => {
    await auth.requestCode(email);
  }, []);

  const verify = useCallback(
    async (email: string, code: string) => {
      const signedIn = await auth.verify(email, code);
      // The verify answer has only the user; whether they accepted the current terms comes from
      // me. If that check fails, ask for the terms: accepting again is harmless.
      const me = await auth.me().catch(() => null);
      apply({
        user: me?.user ?? signedIn,
        termsAccepted: me?.termsAccepted ?? false,
        status: 'signedIn',
      });
      return signedIn;
    },
    [apply],
  );

  const setName = useCallback(
    async (name: string) => {
      try {
        setUser(await auth.updateName(name));
      } catch (err) {
        throw expiredOr(err);
      }
    },
    [expiredOr],
  );

  const acceptTerms = useCallback(async () => {
    try {
      await auth.acceptTerms();
      setTermsAccepted(true);
    } catch (err) {
      // A 409 says the terms changed since this page loaded; the message asks for a reload
      throw expiredOr(err);
    }
  }, [expiredOr]);

  const signOut = useCallback(async () => {
    try {
      await auth.signOut();
    } catch (err) {
      // Only a 401 (the session had already ended) confirms it. A network failure, or a 502
      // from the proxy that never reached the server, leaves the cookie and session in place:
      // showing signed out would leave the next person at this computer signed in as this user.
      // A 500 that did clear the cookie is harmless, since a retry then succeeds.
      if (!(err instanceof HttpError && err.status === 401)) {
        throw new Error(SIGN_OUT_FAILED, { cause: err });
      }
    }
    markSignedOut();
  }, [markSignedOut]);

  const signOutEverywhere = useCallback(async () => {
    try {
      await auth.signOutEverywhere();
    } catch (err) {
      // A 401 means this session had already ended. Any other failure may have left the
      // cookie in place, since this route clears it only after ending the sessions.
      if (!(err instanceof HttpError)) throw new Error(SIGN_OUT_FAILED, { cause: err });
      if (err.status !== 401) throw err;
    }
    markSignedOut();
  }, [markSignedOut]);

  const value = useMemo(
    () => ({
      status,
      user,
      termsAccepted,
      requestCode,
      verify,
      setName,
      acceptTerms,
      markTermsNotAccepted,
      signOut,
      signOutEverywhere,
      retry,
    }),
    [
      status,
      user,
      termsAccepted,
      requestCode,
      verify,
      setName,
      acceptTerms,
      markTermsNotAccepted,
      signOut,
      signOutEverywhere,
      retry,
    ],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `TZ=America/Chicago npx vitest run src/api src/context && npx tsc --noEmit -p .`
Expected: all pass; type-check clean. (Nothing reads `termsAccepted` yet; Task 3 does.)

- [ ] **Step 6: Commit**

```bash
git add src/api/client.ts src/api/__tests__/client.test.ts src/context/SessionContext.tsx src/context/__tests__/SessionContext.test.tsx
git commit -m "feat(web): track acceptance of the current terms in the session"
```

---

### Task 3: Terms pages, the sign-in checkbox and the terms step (web)

**Files:**

- Create: `frontend-unified/src/pages/legal/LegalPage.tsx`, `frontend-unified/src/pages/legal/TermsPage.tsx`, `frontend-unified/src/pages/legal/PrivacyPage.tsx`, `frontend-unified/src/components/auth/TermsCheckbox.tsx`, `frontend-unified/src/components/auth/TermsStep.tsx`
- Modify: `frontend-unified/src/pages/SignInPage.tsx`, `frontend-unified/src/components/auth/RequireSession.tsx`, `frontend-unified/src/App.tsx`
- Test: `frontend-unified/src/pages/legal/__tests__/LegalPages.test.tsx`, `frontend-unified/src/components/auth/__tests__/TermsStep.test.tsx`, `frontend-unified/src/pages/__tests__/SignInPage.test.tsx`, `frontend-unified/src/components/auth/__tests__/RequireSession.test.tsx`

Work in `frontend-unified/`.

**Behavior:**

- `RequireSession`: loading, unreachable, then signed out or no name sends to `/sign-in` (as now), then **no `termsAccepted` shows `TermsStep` instead of the children**. The children include `OrganizationProvider`, so a user who hasn't accepted makes no organization request to be refused.
- The name step of `/sign-in` shows the checkbox when `termsAccepted` is false, and Continue stays disabled until it is ticked. Continue **accepts the terms first, then sets the name**: the Privacy Policy covers the name, so it is stored only once the user agreed. If naming then fails (a bad name), the checkbox is gone and only the name is asked again; if accepting fails (the 409 for terms that changed), nothing was stored and the message says to reload.
- An existing user who has a name but hasn't accepted signs in, `SignInPage` sends them on to the page they asked for, and `RequireSession` shows the terms step there.
- The links in the checkbox open `/terms` and `/privacy` in a new tab, so the step keeps its state.
- The pages carry a placeholder contact address, `privacy@robbie.scouch.dev` (`CONTACT_EMAIL`). The owner confirms the mailbox before the reviewed text replaces the draft.

- [ ] **Step 1: Write the failing tests**

`src/pages/legal/__tests__/LegalPages.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import TermsPage from '../TermsPage';
import PrivacyPage from '../PrivacyPage';

describe('legal pages', () => {
  it('shows the terms as a dated draft', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeTruthy();
    expect(screen.getByText('Draft, not yet reviewed by a lawyer.')).toBeTruthy();
    expect(screen.getByText(`Version ${TERMS_VERSION}`)).toBeTruthy();
    expect(screen.getByText(/You must be 13 or older/)).toBeTruthy();
    expect(screen.getByText(/does not give legal or parliamentary advice/)).toBeTruthy();
  });

  it('says what the privacy policy keeps and who sends the email', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy();
    expect(screen.getByText('Draft, not yet reviewed by a lawyer.')).toBeTruthy();
    expect(screen.getByText(/through Resend/)).toBeTruthy();
    expect(screen.getByText(/and your votes/)).toBeTruthy();
  });
});
```

`src/components/auth/__tests__/TermsStep.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const session = vi.hoisted(() => ({
  acceptTerms: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));

const { TermsStep } = await import('../TermsStep');
const agreement = "I'm 13 or older and I agree to the Terms of Service and Privacy Policy";

describe('TermsStep', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts the terms once the box is ticked', async () => {
    render(<TermsStep />);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('checkbox', { name: agreement }));
    fireEvent.click(button);
    await waitFor(() => expect(session.acceptTerms).toHaveBeenCalledOnce());
  });

  it("shows the server's message when the terms changed meanwhile", async () => {
    session.acceptTerms.mockRejectedValueOnce(
      new Error('The terms have changed. Reload to see the current terms.'),
    );
    render(<TermsStep />);
    fireEvent.click(screen.getByRole('checkbox', { name: agreement }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('The terms have changed. Reload to see the current terms.'),
    ).toBeTruthy();
  });

  it('can sign out instead', async () => {
    render(<TermsStep />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalledOnce());
  });
});
```

In `src/pages/__tests__/SignInPage.test.tsx`:

- In the hoisted `session`, add after `user`:

  ```ts
    termsAccepted: true as boolean,
  ```

  and after `setName`:

  ```ts
    acceptTerms: vi.fn(async () => {}),
  ```

- In `beforeEach`, add after `session.user = null;`:

  ```ts
  session.termsAccepted = true;
  // The last existing test makes setName throw; clearAllMocks keeps implementations
  session.setName.mockImplementation(async () => {});
  ```

- Append these tests inside `describe('SignInPage')`:

```tsx
it('has a new user agree to the terms with their name, agreeing first', async () => {
  session.status = 'signedIn';
  session.user = { id: 1, email: 'ann@example.org', name: null };
  session.termsAccepted = false;
  renderAt('/sign-in');

  fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Ann' } });
  const continueButton = screen.getByRole('button', { name: 'Continue' });
  expect(continueButton).toHaveProperty('disabled', true);

  fireEvent.click(
    screen.getByRole('checkbox', {
      name: "I'm 13 or older and I agree to the Terms of Service and Privacy Policy",
    }),
  );
  fireEvent.click(continueButton);

  await waitFor(() => expect(session.setName).toHaveBeenCalledWith('Ann'));
  expect(session.acceptTerms).toHaveBeenCalledOnce();
  expect(session.acceptTerms.mock.invocationCallOrder[0]).toBeLessThan(
    session.setName.mock.invocationCallOrder[0],
  );
});

it('opens the terms and the privacy policy in a new tab', async () => {
  session.status = 'signedIn';
  session.user = { id: 1, email: 'ann@example.org', name: null };
  session.termsAccepted = false;
  renderAt('/sign-in');

  const terms = await screen.findByRole('link', { name: 'Terms of Service' });
  expect(terms.getAttribute('href')).toBe('/terms');
  expect(terms.getAttribute('target')).toBe('_blank');
  expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
    '/privacy',
  );
});

it('asks only for the name when the terms are already accepted', async () => {
  session.status = 'signedIn';
  session.user = { id: 1, email: 'ann@example.org', name: null };
  renderAt('/sign-in');

  fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Ann' } });
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(session.setName).toHaveBeenCalledWith('Ann'));
  expect(session.acceptTerms).not.toHaveBeenCalled();
});
```

In `src/components/auth/__tests__/RequireSession.test.tsx`:

- Change the vitest import to `import { describe, it, expect, vi, beforeEach } from 'vitest';`.
- Replace the hoisted `session` with:

  ```ts
  const session = vi.hoisted(() => ({
    status: 'signedOut' as SessionStatus,
    user: null as null | { id: number; email: string; name: string | null },
    termsAccepted: true as boolean,
    retry: vi.fn(async () => {}),
    acceptTerms: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }));
  ```

- Add as the first line inside `describe('RequireSession')`:

  ```ts
  beforeEach(() => {
    session.termsAccepted = true;
  });
  ```

- Append inside the `describe`:

```tsx
it('shows the terms step, not the page, until the current terms are accepted', () => {
  session.status = 'signedIn';
  session.user = { id: 1, email: 'a@b.c', name: 'Ann' };
  session.termsAccepted = false;
  renderAt('/documents/d1');
  expect(screen.getByRole('heading', { name: 'Before you go on' })).toBeTruthy();
  expect(screen.queryByText('Document page')).toBeNull();
});

it('asks a new user for a name, where the terms are asked too, before the terms step', () => {
  session.status = 'signedIn';
  session.user = { id: 1, email: 'a@b.c', name: null };
  session.termsAccepted = false;
  renderAt('/documents/d1');
  expect(screen.getByText(/^sign-in/)).toBeTruthy();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/pages src/components/auth`
Expected: FAIL. The legal pages, `TermsStep` and the checkbox don't exist.

- [ ] **Step 3: Create the legal pages**

`src/pages/legal/LegalPage.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';

/** Where to write about an account or its data. The owner confirms the mailbox before launch. */
export const CONTACT_EMAIL = 'privacy@robbie.scouch.dev';

/**
 * A public page for one of the documents users accept. Each change to either document replaces
 * this draft and bumps TERMS_VERSION, so everyone accepts again.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-secondary-50 dark:bg-secondary-900 p-4 md:p-8">
      <article className="card max-w-2xl mx-auto p-6 md:p-8">
        <Link to="/" className="flex items-center gap-2 mb-6 text-primary-600">
          <Scale className="w-6 h-6" aria-hidden="true" />
          <span className="font-heading font-bold">Robbie</span>
        </Link>
        <h1 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
          {title}
        </h1>
        <p className="text-sm text-secondary-500 mt-1">Version {TERMS_VERSION}</p>
        <p
          role="note"
          className="mt-4 rounded-md border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700 dark:border-accent-800 dark:bg-accent-900/20 dark:text-accent-400"
        >
          Draft, not yet reviewed by a lawyer.
        </p>
        <div className="mt-6 space-y-6 text-secondary-700 dark:text-secondary-300">{children}</div>
        <nav className="mt-8 pt-4 border-t border-secondary-200 dark:border-secondary-700 flex gap-4 text-sm">
          <Link to="/terms" className="text-primary-600 hover:underline">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-primary-600 hover:underline">
            Privacy Policy
          </Link>
        </nav>
      </article>
    </main>
  );
}

/** One titled part of a legal page */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">{heading}</h2>
      {children}
    </section>
  );
}

/** The contact address as a mail link */
export function ContactLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary-600 underline">
      {CONTACT_EMAIL}
    </a>
  );
}
```

`src/pages/legal/TermsPage.tsx`:

```tsx
import { ContactLink, LegalPage, LegalSection } from './LegalPage';

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms cover your use of Robbie, an app for running meetings and keeping an
        organization's governing documents. By using Robbie you agree to them.
      </p>
      <LegalSection heading="Who can use Robbie">
        <p>
          You must be 13 or older. If you use Robbie for an organization, you confirm that you may
          act for it.
        </p>
      </LegalSection>
      <LegalSection heading="A tool, not advice">
        <p>
          Robbie helps you follow Robert's Rules of Order and keep bylaws up to date. It does not
          give legal or parliamentary advice, and it can be wrong. Its quorum counts, vote results,
          minutes and document versions are aids: check them before you rely on them, and ask a
          lawyer or a parliamentarian when it matters.
        </p>
      </LegalSection>
      <LegalSection heading="Your organization's responsibility">
        <p>
          Each organization is responsible for following its own bylaws and the law that applies to
          it, including its rules on notice, quorum, voting and records. The chair and the
          organization, not Robbie, decide how a meeting is run and what was adopted.
        </p>
      </LegalSection>
      <LegalSection heading="Content">
        <p>
          Organizations own the documents, minutes, files and other content they put in Robbie, and
          decide who in the organization can see and change it. You let Robbie store that content
          and show it to the people your organization allows, and to anyone who has a public share
          link you create. Only upload content you have the right to share.
        </p>
      </LegalSection>
      <LegalSection heading="Acceptable use">
        <p>
          Don't use Robbie to break the law, to harass anyone, to get into organizations you don't
          belong to, or to interfere with the service.
        </p>
      </LegalSection>
      <LegalSection heading="Limitation of liability">
        <p>
          Robbie is provided as is, without warranties of any kind. To the extent the law allows,
          its makers are not liable for indirect, incidental or consequential damages, for lost
          data, or for decisions made in or about meetings, and their total liability for any claim
          is limited to what you paid to use Robbie in the twelve months before the claim.
        </p>
      </LegalSection>
      <LegalSection heading="Changes and ending">
        <p>
          Robbie and these terms may change. When the terms change, Robbie asks you to accept them
          again before you go on. You can stop using Robbie at any time, and an account that breaks
          these terms may be suspended.
        </p>
      </LegalSection>
      <LegalSection heading="Contact">
        <p>
          Questions about these terms: <ContactLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
```

`src/pages/legal/PrivacyPage.tsx`:

```tsx
import { ContactLink, LegalPage, LegalSection } from './LegalPage';

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy says what Robbie keeps about you, why, and who can see it.</p>
      <LegalSection heading="What Robbie keeps">
        <ul className="list-disc pl-6 space-y-1">
          <li>Your email address and the name you give, to sign you in and show who you are.</li>
          <li>
            Your sign-in sessions: whether each is on the web or the phone app, and when it was last
            used.
          </li>
          <li>The organizations you belong to, and your role in each.</li>
          <li>
            What you do in meetings: when you are present, the motions you make, when you speak, and
            your votes.
          </li>
          <li>The minutes, documents, amendments and files your organizations keep in Robbie.</li>
          <li>When you accepted these documents, and which version.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="Who can see it">
        <p>
          Members of an organization see its content as their role allows. The people in a meeting
          see your name, whether you are there, and what you do in it; whether a vote shows names
          depends on the kind of vote. Anyone with a document's public share link can read that
          document. Robbie doesn't sell your information or show ads.
        </p>
      </LegalSection>
      <LegalSection heading="Your organization controls its content">
        <p>
          Each organization decides what goes into its records and who can see them. Minutes and
          votes are the organization's records and can keep your name after you leave it. To change
          an organization's records, ask its secretary or an admin.
        </p>
      </LegalSection>
      <LegalSection heading="Email">
        <p>
          Robbie sends sign-in codes, and notices that you were added to an organization, through
          Resend, an email delivery service, which receives your email address and the message.
        </p>
      </LegalSection>
      <LegalSection heading="Cookies">
        <p>
          Robbie uses one cookie, to keep you signed in. It uses no tracking or advertising cookies.
        </p>
      </LegalSection>
      <LegalSection heading="How long it is kept">
        <p>
          Sign-in codes expire after 15 minutes, and sessions 30 days after they were last used.
          Everything else is kept while your account or your organization exists.
        </p>
      </LegalSection>
      <LegalSection heading="Deleting your account">
        <p>
          To delete your account, write to <ContactLink /> from the address you sign in with. Your
          account and sessions are deleted; an organization's records, such as minutes, may keep
          your name.
        </p>
      </LegalSection>
      <LegalSection heading="Children">
        <p>Robbie is not for children under 13.</p>
      </LegalSection>
      <LegalSection heading="Changes">
        <p>When this policy changes, Robbie asks you to accept it again before you go on.</p>
      </LegalSection>
    </LegalPage>
  );
}
```

- [ ] **Step 4: Create the checkbox and the terms step**

`src/components/auth/TermsCheckbox.tsx`:

```tsx
/** The agreement to the current terms. The links open the documents in a new tab. */
export function TermsCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-secondary-700 dark:text-secondary-300">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I'm 13 or older and I agree to the{' '}
        <a href="/terms" target="_blank" rel="noreferrer" className="text-primary-600 underline">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary-600 underline">
          Privacy Policy
        </a>
      </span>
    </label>
  );
}
```

`src/components/auth/TermsStep.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Scale } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { TermsCheckbox } from './TermsCheckbox';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';

/**
 * Shown in place of the app to a signed-in user who hasn't accepted the current terms: they
 * changed since the user last accepted, or a request was refused for that reason
 */
export function TermsStep() {
  const { acceptTerms, signOut } = useSession();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (agreed) void run(acceptTerms);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-secondary-50 dark:bg-secondary-900 p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Scale className="w-6 h-6 text-primary-600" aria-hidden="true" />
          <h1 className="text-xl font-heading font-bold text-secondary-900 dark:text-white">
            Before you go on
          </h1>
        </div>
        <p className="text-sm text-secondary-600 dark:text-secondary-400">
          Robbie needs your agreement to its Terms of Service and Privacy Policy. If you agreed
          before, they have changed since.
        </p>
        <TermsCheckbox checked={agreed} onChange={setAgreed} />
        <button type="submit" className="btn-primary w-full" disabled={busy || !agreed}>
          Continue
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={busy}
          onClick={() => void run(signOut)}
        >
          Sign out
        </button>
        {error && (
          <p role="alert" className="text-sm text-danger-600 dark:text-danger-400">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Change `src/pages/SignInPage.tsx`**

Add the import after the `useSession` import:

```tsx
import { TermsCheckbox } from '../components/auth/TermsCheckbox';
```

Replace:

```tsx
const { status, user, requestCode, verify, setName, signOut } = useSession();
```

with:

```tsx
const { status, user, termsAccepted, requestCode, verify, setName, acceptTerms, signOut } =
  useSession();
```

After `const [name, setNameInput] = useState('');`, add:

```tsx
const [agreed, setAgreed] = useState(false);
```

Replace `onName` and `onDifferentEmail` with:

```tsx
const onName = (e: FormEvent) => {
  e.preventDefault();
  if (!termsAccepted && !agreed) return;
  run(async () => {
    // Agree first: the Privacy Policy covers the name, so it is stored only once the user
    // agreed. If naming then fails, the checkbox is gone and only the name is asked again.
    if (!termsAccepted) await acceptTerms();
    await setName(name.trim());
  });
};
const onDifferentEmail = () => {
  run(async () => {
    await signOut();
    setEmail('');
    setNameInput('');
    setAgreed(false);
  });
};
```

In the name step, replace:

<!-- prettier-ignore -->
```tsx
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              Continue
            </button>
```

with:

<!-- prettier-ignore -->
```tsx
            {!termsAccepted && <TermsCheckbox checked={agreed} onChange={setAgreed} />}
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy || (!termsAccepted && !agreed)}
            >
              Continue
            </button>
```

(This snippet appears once: the email and code steps have "Send code" and "Sign in" buttons.)

- [ ] **Step 6: Change `src/components/auth/RequireSession.tsx`**

Add the import:

```tsx
import { TermsStep } from './TermsStep';
```

Replace the doc comment and the first line of the component:

```tsx
/** Show the children only to a signed-in user with a name; send anyone else to sign in */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status, user, retry } = useSession();
```

with:

```tsx
/**
 * Show the children only to a signed-in user with a name who accepted the current terms. Anyone
 * signed out or without a name goes to sign in (the name step asks for the terms too); a user
 * who hasn't accepted the current terms gets the terms step, before the children make any
 * request the server would refuse.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status, user, termsAccepted, retry } = useSession();
```

and replace the last line before the closing brace:

```tsx
return <>{children}</>;
```

with:

```tsx
if (!termsAccepted) return <TermsStep />;
return <>{children}</>;
```

- [ ] **Step 7: Add the public routes to `src/App.tsx`**

After `const SignInPage = lazy(() => import('./pages/SignInPage'));`, add:

```tsx
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
```

After `<Route path="/sign-in" element={<SignInPage />} />`, add:

```tsx
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
```

- [ ] **Step 8: Run them to see them pass**

Run: `TZ=America/Chicago npx vitest run src/pages src/components/auth && npx tsc --noEmit -p .`
Expected: all pass; type-check clean.

- [ ] **Step 9: Commit**

```bash
git add src/pages src/components/auth src/App.tsx
git commit -m "feat(web): ask for the terms at sign-in and before using the app"
```

---

### Task 4: Organizations with roles, New organization, and the product name (web)

**Files:**

- Create: `frontend-unified/src/components/layout/OrganizationSwitcher.tsx`, `frontend-unified/src/components/organizations/NewOrganizationModal.tsx`, `frontend-unified/src/components/organizations/NoOrganizations.tsx`
- Modify: `frontend-unified/src/context/OrganizationContext.tsx`, `frontend-unified/src/components/layout/Header.tsx`, `frontend-unified/src/modules/documents/pages/HomePage.tsx`, `frontend-unified/index.html`
- Test: `frontend-unified/src/context/__tests__/OrganizationContext.test.tsx`, `frontend-unified/src/components/layout/__tests__/OrganizationSwitcher.test.tsx`, `frontend-unified/src/components/organizations/__tests__/NewOrganizationModal.test.tsx`, `frontend-unified/src/components/organizations/__tests__/NoOrganizations.test.tsx`

Work in `frontend-unified/`.

**Behavior:**

- `OrganizationContext` stores the list as `OrganizationWithRole[]` (the server already returns only the user's organizations) and exposes `role`, the user's role in the current organization, or null. `useCan(min)` is true when that role is `min` or higher.
- The switcher moves out of `Header.tsx` into `OrganizationSwitcher.tsx`. It lists each organization with its role label, and ends with "New organization".
- `NewOrganizationModal` asks for a name and an optional description. It sends no slug: the server makes one from the name. It shows the server's message in the modal (400 for a slug taken, 429 "You can own at most 3 organizations"), and on success refreshes the list and selects the new organization.
- A user with no organizations sees `NoOrganizations` on the home page: "Create an organization, or ask your organization's secretary to add <email>." with a "New organization" button. (Settings uses it in Task 6.)
- The product name: the document title and the header heading say "Robbie". `RouteAnnouncer` announces `document.title`, so the screen reader text follows. The sign-in page already says "Sign in to Robbie"; `mobile/app.json` already says "Robbie".

- [ ] **Step 1: Write the failing tests**

Replace `src/context/__tests__/OrganizationContext.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OrganizationWithRole } from '../../api/client';
import type { OrgRole } from '../../utils/roles';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', () => ({ organizations: { list } }));

const { OrganizationProvider, useOrganization, useCan } = await import('../OrganizationContext');

const org = (id: string, name: string, role: OrgRole = 'member') =>
  ({ id, name, slug: id, role }) as OrganizationWithRole;
const wrapper = ({ children }: { children: ReactNode }) => (
  <OrganizationProvider>{children}</OrganizationProvider>
);

describe('OrganizationProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    list.mockReset();
    list.mockResolvedValueOnce([org('a', 'Alpha'), org('b', 'Beta')]);
  });

  async function selectedAlpha() {
    const hook = renderHook(() => useOrganization(), { wrapper });
    await waitFor(() => expect(hook.result.current.currentOrganization?.id).toBe('a'));
    return hook;
  }

  it('shows a rename of the current organization after a refresh', async () => {
    const { result } = await selectedAlpha();
    list.mockResolvedValueOnce([org('a', 'Alpha Renamed'), org('b', 'Beta')]);

    await act(() => result.current.refreshOrganizations());

    expect(result.current.currentOrganization?.name).toBe('Alpha Renamed');
  });

  it('selects another organization when the current one is deleted', async () => {
    const { result } = await selectedAlpha();
    list.mockResolvedValueOnce([org('b', 'Beta')]);

    await act(() => result.current.refreshOrganizations());

    expect(result.current.currentOrganization?.id).toBe('b');
  });

  it("exposes the user's role in the current organization, and what it allows", async () => {
    list.mockReset();
    list.mockResolvedValueOnce([org('a', 'Alpha', 'secretary')]);
    const { result } = renderHook(
      () => ({ ...useOrganization(), canEdit: useCan('secretary'), canManage: useCan('admin') }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.role).toBe('secretary'));
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canManage).toBe(false);
  });

  it('allows nothing without an organization', async () => {
    list.mockReset();
    list.mockResolvedValueOnce([]);
    const { result } = renderHook(() => ({ ...useOrganization(), canView: useCan('viewer') }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.role).toBeNull();
    expect(result.current.canView).toBe(false);
  });
});
```

`src/components/layout/__tests__/OrganizationSwitcher.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const orgState = vi.hoisted(() => {
  const organizations = [
    { id: 'o1', name: 'Maple Grove HOA', slug: 'maple-grove-hoa', role: 'owner' },
    { id: 'o2', name: 'Chess Club', slug: 'chess-club', role: 'viewer' },
  ];
  return {
    organizations,
    currentOrganization: organizations[0] as (typeof organizations)[number] | null,
    setCurrentOrganization: vi.fn(),
  };
});
vi.mock('../../../context/OrganizationContext', () => ({ useOrganization: () => orgState }));
vi.mock('../../organizations/NewOrganizationModal', () => ({
  NewOrganizationModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <p>New organization form</p> : null,
}));

const { OrganizationSwitcher } = await import('../OrganizationSwitcher');

function open() {
  render(
    <MemoryRouter>
      <OrganizationSwitcher />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Maple Grove HOA/ }));
}

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.currentOrganization = orgState.organizations[0];
  });

  it("lists the user's organizations, each with their role", () => {
    open();
    expect(screen.getByRole('menuitem', { name: /Maple Grove HOA.*Owner/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Chess Club.*Viewer/ })).toBeTruthy();
  });

  it('switches to another organization', () => {
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Chess Club/ }));
    expect(orgState.setCurrentOrganization).toHaveBeenCalledWith(orgState.organizations[1]);
  });

  it('opens the new organization form', () => {
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'New organization' }));
    expect(screen.getByText('New organization form')).toBeTruthy();
  });
});
```

`src/components/organizations/__tests__/NewOrganizationModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const create = vi.hoisted(() => vi.fn());
vi.mock('../../../api/client', () => ({ organizations: { create } }));
const orgContext = vi.hoisted(() => ({
  refreshOrganizations: vi.fn(async () => {}),
  setCurrentOrganization: vi.fn(),
}));
vi.mock('../../../context/OrganizationContext', () => ({ useOrganization: () => orgContext }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => toast }));

const { NewOrganizationModal } = await import('../NewOrganizationModal');

function renderModal(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <NewOrganizationModal isOpen onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

describe('NewOrganizationModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the organization with its description and switches to it', async () => {
    const created = { id: 'o9', name: 'Maple Grove HOA', slug: 'maple-grove-hoa', role: 'owner' };
    create.mockResolvedValueOnce(created);
    const onClose = renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Maple Grove HOA ' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: '142 lots' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(orgContext.setCurrentOrganization).toHaveBeenCalledWith(created));
    expect(create).toHaveBeenCalledWith({ name: 'Maple Grove HOA', description: '142 lots' });
    expect(orgContext.refreshOrganizations).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the server's message, such as the limit on organizations owned", async () => {
    create.mockRejectedValueOnce(new Error('You can own at most 3 organizations'));
    const onClose = renderModal();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fourth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByText('You can own at most 3 organizations')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

`src/components/organizations/__tests__/NoOrganizations.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 1, email: 'kim@example.org', name: 'Kim' } }),
}));
vi.mock('../NewOrganizationModal', () => ({
  NewOrganizationModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <p>New organization form</p> : null,
}));

const { NoOrganizations } = await import('../NoOrganizations');

describe('NoOrganizations', () => {
  it('asks the user to create an organization or to be added by email', () => {
    render(<NoOrganizations />);
    expect(
      screen.getByText(
        "Create an organization, or ask your organization's secretary to add kim@example.org.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New organization' }));
    expect(screen.getByText('New organization form')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/context src/components`
Expected: FAIL. `useCan`, `role`, the switcher and the organization components don't exist.

- [ ] **Step 3: Replace `src/context/OrganizationContext.tsx`**

```tsx
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { organizations, type OrganizationWithRole } from '../api/client';
import { atLeast, type OrgRole } from '../utils/roles';

interface OrganizationContextType {
  /** The signed-in user's organizations, each with their role */
  organizations: OrganizationWithRole[];
  currentOrganization: OrganizationWithRole | null;
  /** The user's role in the current organization, or null without one */
  role: OrgRole | null;
  setCurrentOrganization: (org: OrganizationWithRole | null) => void;
  loading: boolean;
  error: string | null;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<OrganizationWithRole[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await organizations.list();
      setOrgs(data);

      // Re-resolve the selection from the fresh list, so a rename or a new role shows and a
      // deleted or left organization is replaced. Otherwise use the saved choice, or the first.
      setCurrentOrganization((current) => {
        const stillListed = current && data.find((o) => o.id === current.id);
        if (stillListed) return stillListed;
        const savedOrgId = localStorage.getItem('selectedOrganizationId');
        return data.find((o) => o.id === savedOrgId) ?? data[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshOrganizations();
  }, [refreshOrganizations]);

  // Save selected org to localStorage
  useEffect(() => {
    if (currentOrganization) {
      localStorage.setItem('selectedOrganizationId', currentOrganization.id);
    }
  }, [currentOrganization]);

  return (
    <OrganizationContext.Provider
      value={{
        organizations: orgs,
        currentOrganization,
        role: currentOrganization?.role ?? null,
        setCurrentOrganization,
        loading,
        error,
        refreshOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

/**
 * Whether the user's role in the current organization is `min` or higher, to hide actions the
 * role can't take. The server still decides.
 */
export function useCan(min: OrgRole): boolean {
  const { role } = useOrganization();
  return role !== null && atLeast(role, min);
}
```

- [ ] **Step 4: Create the organization components**

`src/components/organizations/NewOrganizationModal.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Modal from '../ui/Modal';
import { organizations } from '../../api/client';
import { useOrganization } from '../../context/OrganizationContext';
import { useToast } from '../../context/ToastContext';
import { showsOneOrganizationsRecord } from '../../utils/organizationPages';

/** Create an organization with the signed-in user as its owner, and switch to it */
export function NewOrganizationModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshOrganizations, setCurrentOrganization } = useOrganization();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setDescription('');
    setError(null);
    onClose();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      // No slug: the server makes one from the name
      const created = await organizations.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      await refreshOrganizations();
      // A document, amendment or meeting page belongs to the organization being left
      if (showsOneOrganizationsRecord(location.pathname)) navigate('/');
      setCurrentOrganization(created);
      showToast('success', `Created ${created.name}`);
      close();
    } catch (err) {
      // For example "You can own at most 3 organizations", or a name whose slug is taken
      setError(err instanceof Error ? err.message : 'Failed to create the organization');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="New organization">
      <form onSubmit={onSubmit}>
        <div className="mb-4">
          <label htmlFor="newOrgName" className="label">
            Name
          </label>
          <input
            id="newOrgName"
            className="input"
            maxLength={200}
            placeholder="e.g., Maple Grove HOA"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="mb-4">
          <label htmlFor="newOrgDescription" className="label">
            Description (optional)
          </label>
          <textarea
            id="newOrgDescription"
            className="textarea h-24"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-danger-600 dark:text-danger-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={close} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!name.trim() || creating}>
            {creating ? 'Creating...' : 'Create organization'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

`src/components/organizations/NoOrganizations.tsx`:

```tsx
import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import { useSession } from '../../context/SessionContext';
import { NewOrganizationModal } from './NewOrganizationModal';

/** For a user in no organization: create one, or ask to be added by email */
export function NoOrganizations() {
  const { user } = useSession();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <EmptyState
        icon={Building2}
        title="No organizations yet"
        description={`Create an organization, or ask your organization's secretary to add ${user?.email ?? 'your email'}.`}
        action={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
            New organization
          </button>
        }
      />
      <NewOrganizationModal isOpen={creating} onClose={() => setCreating(false)} />
    </>
  );
}
```

`src/components/layout/OrganizationSwitcher.tsx`:

```tsx
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, Plus } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import type { OrganizationWithRole } from '../../api/client';
import { ROLE_LABELS } from '../../utils/roles';
import { showsOneOrganizationsRecord } from '../../utils/organizationPages';
import { NewOrganizationModal } from '../organizations/NewOrganizationModal';

/** The current organization; the user's organizations with their roles; "New organization" */
export function OrganizationSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { organizations: orgs, currentOrganization, setCurrentOrganization } = useOrganization();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const choose = (org: OrganizationWithRole) => {
    // A document, amendment or meeting page belongs to the old one
    if (org.id !== currentOrganization?.id && showsOneOrganizationsRecord(location.pathname)) {
      navigate('/');
    }
    setCurrentOrganization(org);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-700 hover:bg-secondary-50 dark:hover:bg-secondary-600 transition-colors"
      >
        <Building2 className="w-4 h-4 text-secondary-500" aria-hidden="true" />
        <span className="max-w-[200px] truncate">
          {currentOrganization?.name ?? 'No organization'}
        </span>
        <ChevronDown className="w-4 h-4 text-secondary-400" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-1 w-64 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg z-20 py-1"
          >
            {orgs.length > 0 ? (
              <>
                <div className="max-h-48 overflow-y-auto scrollbar-thin">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      role="menuitem"
                      onClick={() => choose(org)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors ${
                        currentOrganization?.id === org.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                          : 'text-secondary-700 dark:text-secondary-300'
                      }`}
                    >
                      <span className="block truncate">{org.name}</span>
                      <span className="block text-xs text-secondary-500">
                        {ROLE_LABELS[org.role]}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-secondary-200 dark:border-secondary-700 my-1" />
              </>
            ) : (
              <p className="px-4 py-2 text-sm text-secondary-500">No organizations yet</p>
            )}
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="w-full text-left px-4 py-2 text-sm text-primary-600 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              New organization
            </button>
          </div>
        </>
      )}

      <NewOrganizationModal isOpen={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
```

- [ ] **Step 5: Replace `src/components/layout/Header.tsx`**

The search is unchanged; the switcher and its create modal move out, and the heading says Robbie.

```tsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Menu, Search, X, FileText, Hash } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { search as searchApi, SearchResultItem } from '../../api/client';
import { UserMenu } from './UserMenu';
import { OrganizationSwitcher } from './OrganizationSwitcher';

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await searchApi.query(searchQuery, currentOrganization?.id);
        setSearchResults(result.results);
        setShowSearchResults(true);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, currentOrganization?.id]);

  const handleSearchResultClick = (result: SearchResultItem) => {
    setShowSearchResults(false);
    setSearchQuery('');
    navigate(`/documents/${result.documentId}`);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  return (
    <header className="h-14 border-b border-secondary-200 dark:border-secondary-700 bg-white dark:bg-secondary-800 px-4 md:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="p-2 -ml-2 text-secondary-600 hover:text-secondary-900 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:text-white dark:hover:bg-secondary-700 rounded-md md:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Scale className="w-6 h-6 text-primary-600" aria-hidden="true" />
        <h1 className="text-xl font-heading font-bold text-primary-600">Robbie</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block" ref={searchRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
              placeholder="Search documents..."
              className="w-64 pl-9 pr-8 py-1.5 text-sm border border-secondary-300 dark:border-secondary-600 rounded-md bg-white dark:bg-secondary-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:ring-primary-400 dark:focus:border-primary-400"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-secondary-400 hover:text-secondary-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults && (
            <div className="absolute top-full left-0 mt-1 w-96 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
              {isSearching ? (
                <div className="p-4 text-center text-secondary-500 text-sm">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-secondary-500 text-sm">
                  No results found for "{searchQuery}"
                </div>
              ) : (
                <div className="py-1">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleSearchResultClick(result)}
                      className="w-full text-left px-4 py-2 hover:bg-secondary-50 dark:hover:bg-secondary-700 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {result.type === 'document' ? (
                            <FileText className="w-4 h-4 text-primary-600" />
                          ) : (
                            <Hash className="w-4 h-4 text-secondary-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-secondary-900 dark:text-white truncate">
                            {result.title}
                          </div>
                          {result.type === 'section' && (
                            <div className="text-xs text-secondary-500 truncate">
                              in {result.documentTitle}
                            </div>
                          )}
                          <div className="text-xs text-secondary-400 mt-0.5 line-clamp-2">
                            {result.snippet}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <OrganizationSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
```

(`handleSearchResultClick` navigated to the same document page from both branches of an if; it is one line now.)

- [ ] **Step 6: The empty state on the home page, and the title**

In `src/modules/documents/pages/HomePage.tsx`, add the import:

```tsx
import { NoOrganizations } from '../../../components/organizations/NoOrganizations';
```

Replace:

```tsx
const { currentOrganization, loading: orgLoading } = useOrganization();
```

with:

```tsx
const { currentOrganization, organizations: orgs, loading: orgLoading } = useOrganization();
```

and replace:

```tsx
  if (!currentOrganization) {
    return (
```

with:

```tsx
  if (!currentOrganization) {
    if (orgs.length === 0) return <NoOrganizations />;
    return (
```

In `frontend-unified/index.html`, replace `<title>Robbie-Bylawyer</title>` with `<title>Robbie</title>`.

- [ ] **Step 7: Run everything**

Run: `TZ=America/Chicago npx vitest run && npx tsc --noEmit -p .`
Expected: all pass; type-check clean. `grep -rn "Robbie-Bylawyer" src/components index.html` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add index.html src/context src/components src/modules/documents/pages/HomePage.tsx
git commit -m "feat(web): show the user's organizations with their role, and create them"
```

---

### Task 5: Hide actions the role can't take (web)

**Files:**

- Modify:
  - `frontend-unified/src/components/layout/Sidebar.tsx`
  - `frontend-unified/src/modules/documents/pages/DocumentPage.tsx`, `documentPage/DocumentHeader.tsx`, `documentPage/DocumentContentCard.tsx`
  - `frontend-unified/src/modules/documents/pages/AmendmentDetailPage.tsx`, `amendmentDetailPage/AmendmentHeader.tsx`
  - `frontend-unified/src/modules/documents/pages/MeetingsPage.tsx`, `MeetingDetailPage.tsx`, `meetingDetailPage/MeetingHeader.tsx`
- Test: `frontend-unified/src/components/layout/__tests__/Sidebar.test.tsx`, `frontend-unified/src/modules/documents/pages/documentPage/__tests__/DocumentContentCard.test.tsx`, `documentPage/__tests__/DocumentHeader.test.tsx` (new), `amendmentDetailPage/__tests__/AmendmentHeader.test.tsx` (new)

Work in `frontend-unified/`. Paths below under `pages/` are in `src/modules/documents/pages/`.

**Rules (the server's, from the design):**

| Action                                                                               | Needs                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------ |
| New document, New Version, Add Section, edit, delete, reorder or add a child section | secretary                                  |
| Propose Amendment (create a draft)                                                   | member                                     |
| Edit a draft, add or delete its changes                                              | member for their own draft, else secretary |
| Propose, Withdraw, Mark Passed, Mark Failed, Apply to Document                       | secretary                                  |
| Share                                                                                | admin                                      |
| Schedule Meeting (meeting records), edit, start, complete or cancel one, Record Vote | secretary                                  |

Organization settings (admin) and delete (owner) are in Task 6; scheduling a live meeting and linking one are in Task 7.

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/__tests__/Sidebar.test.tsx`:

- Change the vitest import to `import { describe, it, expect, vi, beforeEach } from 'vitest';`.
- Replace the organization mock:

  ```tsx
  const org = vi.hoisted(() => ({ currentOrganization: { id: 'org-1', name: 'Org' }, can: true }));
  vi.mock('../../../context/OrganizationContext', () => ({
    useOrganization: () => org,
    useCan: () => org.can,
  }));
  ```

- Add as the first line inside `describe('Sidebar')`:

  ```tsx
  beforeEach(() => {
    org.can = true;
  });
  ```

- Append inside the `describe`:

```tsx
it('offers New Document only to secretaries and above', () => {
  list.mockResolvedValueOnce([]);
  org.can = false;
  render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar onNewDocument={() => {}} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button', { name: /New Document/ })).toBeNull();
});
```

Replace `pages/documentPage/__tests__/DocumentContentCard.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentContentCard } from '../DocumentContentCard';
import type { Version } from '../../../../../api/client';

const version: Version = {
  id: 'v1',
  documentId: 'd1',
  versionNumber: 1,
  effectiveDate: null,
  adoptedAt: null,
  notes: null,
  createdAt: '2026-10-01T00:00:00Z',
};

function renderCard(props: { canEdit: boolean; selectedVersion: Version | null }) {
  render(
    <DocumentContentCard
      sectionTree={[]}
      selectedSection={null}
      onSelectSection={vi.fn()}
      onEditSection={vi.fn()}
      onDeleteSection={vi.fn()}
      onAddChild={vi.fn()}
      onReorder={vi.fn()}
      onAddSection={vi.fn()}
      onCreateVersion={vi.fn()}
      {...props}
    />,
  );
}

describe('DocumentContentCard', () => {
  it('disables Add Section until the document has a version', () => {
    renderCard({ canEdit: true, selectedVersion: null });

    // A section needs a version to belong to; saving one without it did nothing
    expect(screen.getByRole('button', { name: 'Add Section' })).toHaveProperty('disabled', true);
  });

  it('shows a role below secretary no way to change the document', () => {
    renderCard({ canEdit: false, selectedVersion: version });

    expect(screen.queryByRole('button', { name: 'Add Section' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New Version' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add First Section' })).toBeNull();
    expect(screen.getByText('This document has no sections yet.')).toBeTruthy();
  });
});
```

`pages/documentPage/__tests__/DocumentHeader.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Document } from '../../../../../api/client';

vi.mock('../../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const { DocumentHeader } = await import('../DocumentHeader');

const doc = { id: 'd1', title: 'Bylaws', docType: 'bylaws', currentVersionId: null } as Document;

function renderHeader(can: { canDraft: boolean; canShare: boolean }) {
  render(
    <MemoryRouter>
      <DocumentHeader
        doc={doc}
        versions={[]}
        selectedVersion={null}
        organizationName="Maple Grove HOA"
        onVersionChange={vi.fn()}
        onProposeAmendment={vi.fn()}
        onShare={vi.fn()}
        {...can}
      />
    </MemoryRouter>,
  );
}

describe('DocumentHeader', () => {
  it('shows a viewer neither Share nor Propose Amendment', () => {
    renderHeader({ canDraft: false, canShare: false });
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Propose Amendment' })).toBeNull();
  });

  it('lets a member draft an amendment, and only an admin share', () => {
    renderHeader({ canDraft: true, canShare: false });
    expect(screen.getByRole('button', { name: 'Propose Amendment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});
```

`pages/amendmentDetailPage/__tests__/AmendmentHeader.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Amendment, Document } from '../../../../../api/client';
import { AmendmentHeader } from '../AmendmentHeader';

const doc = { id: 'd1', title: 'Bylaws' } as Document;
const amendment = (status: Amendment['status']) =>
  ({
    id: 'a1',
    documentId: 'd1',
    title: 'Lower the quorum to 15%',
    status,
    changes: [{ id: 'c1' }],
    resultingVersionId: null,
    createdById: 7,
  }) as unknown as Amendment;

function renderHeader(a: Amendment, can: { canDecide: boolean; canEditDraft: boolean }) {
  render(
    <MemoryRouter>
      <AmendmentHeader
        amendment={a}
        document={doc}
        organizationName="Maple Grove HOA"
        onEdit={vi.fn()}
        onPropose={vi.fn()}
        onWithdraw={vi.fn()}
        onPass={vi.fn()}
        onFail={vi.fn()}
        onApply={vi.fn()}
        {...can}
      />
    </MemoryRouter>,
  );
}

describe('AmendmentHeader', () => {
  it('lets a member edit their own draft but not propose or withdraw it', () => {
    renderHeader(amendment('draft'), { canDecide: false, canEditDraft: true });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Propose' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('shows a viewer no actions', () => {
    renderHeader(amendment('proposed'), { canDecide: false, canEditDraft: false });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('lets a secretary decide a proposed amendment', () => {
    renderHeader(amendment('proposed'), { canDecide: true, canEditDraft: false });
    expect(screen.getByRole('button', { name: 'Mark Passed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark Failed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/components/layout src/modules/documents`
Expected: FAIL. The components don't take `canEdit`, `canDraft`, `canShare`, `canDecide` or `canEditDraft`, and the sidebar ignores the role.

- [ ] **Step 3: The sidebar**

In `src/components/layout/Sidebar.tsx`, replace:

```tsx
import { useOrganization } from '../../context/OrganizationContext';
```

with:

```tsx
import { useOrganization, useCan } from '../../context/OrganizationContext';
```

After `const { currentOrganization } = useOrganization();`, add:

```tsx
// Documents are created by secretaries and above
const canCreate = useCan('secretary');
```

Replace the "New Document Button" block:

<!-- prettier-ignore -->
```tsx
      {/* New Document Button */}
      <div className="p-4 pt-2 md:pt-4">
        <button
          onClick={onNewDocument}
          disabled={!currentOrganization}
          className="w-full btn bg-accent-500 hover:bg-accent-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Document
        </button>
      </div>
```

with:

<!-- prettier-ignore -->
```tsx
      {/* New Document Button (a role implies a current organization) */}
      {canCreate && (
        <div className="p-4 pt-2 md:pt-4">
          <button
            onClick={onNewDocument}
            className="w-full btn bg-accent-500 hover:bg-accent-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Document
          </button>
        </div>
      )}
```

- [ ] **Step 4: The document page**

Replace `pages/documentPage/DocumentContentCard.tsx` with:

```tsx
import { Plus, FileText, Clock } from 'lucide-react';
import { Version, SectionTree as SectionTreeType } from '../../../../api/client';
import SectionTree from '../../components/SectionTree';
import { formatCalendarDate } from '../../../../utils/dates';

interface DocumentContentCardProps {
  selectedVersion: Version | null;
  sectionTree: SectionTreeType[];
  selectedSection: SectionTreeType | null;
  /** Whether the user may change the document (secretary and above) */
  canEdit: boolean;
  onSelectSection: (section: SectionTreeType | null) => void;
  onEditSection: (section: SectionTreeType) => void;
  onDeleteSection: (section: SectionTreeType) => void;
  onAddChild: (parent: SectionTreeType) => void;
  onReorder: (updates: Array<{ id: string; position: number }>) => Promise<void>;
  onAddSection: () => void;
  onCreateVersion: () => void;
}

export function DocumentContentCard({
  selectedVersion,
  sectionTree,
  selectedSection,
  canEdit,
  onSelectSection,
  onEditSection,
  onDeleteSection,
  onAddChild,
  onReorder,
  onAddSection,
  onCreateVersion,
}: DocumentContentCardProps) {
  return (
    <>
      <div className="card">
        <div className="px-4 py-3 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
          <h3 className="font-semibold text-secondary-900 dark:text-white">Document Content</h3>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button onClick={onCreateVersion} className="btn-ghost btn-sm">
                <Plus className="w-4 h-4 mr-1" />
                New Version
              </button>
              {/* A section belongs to a version; there is none to add to until one exists */}
              <button
                onClick={onAddSection}
                className="btn-primary btn-sm"
                disabled={!selectedVersion}
                title={selectedVersion ? undefined : 'Create a version first'}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Section
              </button>
            </div>
          )}
        </div>

        <div className="p-4">
          {!selectedVersion ? (
            <EmptyState
              message={
                canEdit
                  ? 'Create a version to start adding content.'
                  : 'This document has no content yet.'
              }
              action={
                canEdit ? { text: 'Create First Version', onClick: onCreateVersion } : undefined
              }
            />
          ) : sectionTree.length === 0 ? (
            <EmptyState
              message="This document has no sections yet."
              action={canEdit ? { text: 'Add First Section', onClick: onAddSection } : undefined}
            />
          ) : (
            <SectionTree
              sections={sectionTree}
              selectedSectionId={selectedSection?.id}
              onSelectSection={onSelectSection}
              onEditSection={onEditSection}
              onDeleteSection={onDeleteSection}
              onAddChild={onAddChild}
              onReorder={canEdit ? onReorder : undefined}
              editable={canEdit}
            />
          )}
        </div>
      </div>

      {/* Version info */}
      {selectedVersion && (
        <div className="mt-4 card p-4">
          <div className="flex items-center gap-4 text-sm text-secondary-600 dark:text-secondary-400">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              Created: {new Date(selectedVersion.createdAt).toLocaleString()}
            </div>
            {selectedVersion.effectiveDate && (
              <div>Effective: {formatCalendarDate(selectedVersion.effectiveDate)}</div>
            )}
            {selectedVersion.notes && (
              <div className="flex-1 truncate">Notes: {selectedVersion.notes}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { text: string; onClick: () => void };
}) {
  return (
    <div className="text-center py-8">
      <FileText className="w-10 h-10 text-secondary-400 mx-auto mb-3" />
      <p className={`text-secondary-600 dark:text-secondary-400 ${action ? 'mb-4' : ''}`}>
        {message}
      </p>
      {action && (
        <button onClick={action.onClick} className="btn-primary btn-sm">
          <Plus className="w-4 h-4 mr-1" />
          {action.text}
        </button>
      )}
    </div>
  );
}
```

Replace `pages/documentPage/DocumentHeader.tsx` with:

```tsx
import { Link } from 'react-router-dom';
import { ChevronRight, Edit, GitCompare, Share2, Users } from 'lucide-react';
import { Document, Version } from '../../../../api/client';
import { DocumentTypeBadge } from '../../../../components/ui/Badge';
import { ExportDropdown } from './ExportDropdown';
import { formatCalendarDate } from '../../../../utils/dates';

interface DocumentHeaderProps {
  doc: Document;
  versions: Version[];
  selectedVersion: Version | null;
  organizationName?: string;
  /** Whether the user may draft an amendment (member and above) */
  canDraft: boolean;
  /** Whether the user may turn share links on and off (admin and above) */
  canShare: boolean;
  onVersionChange: (versionId: string) => void;
  onProposeAmendment: () => void;
  onShare: () => void;
}

export function DocumentHeader({
  doc,
  versions,
  selectedVersion,
  organizationName,
  canDraft,
  canShare,
  onVersionChange,
  onProposeAmendment,
  onShare,
}: DocumentHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm text-secondary-500 mb-1">
          <Link to="/" className="hover:text-primary-600">
            {organizationName}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span>{doc.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
            {doc.title}
          </h2>
          <DocumentTypeBadge type={doc.docType} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Version selector */}
        <select
          value={selectedVersion?.id || ''}
          onChange={(e) => onVersionChange(e.target.value)}
          className="select w-auto text-sm py-1.5"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              Version {v.versionNumber}
              {v.id === doc.currentVersionId ? ' (Current)' : ''}
              {v.effectiveDate && ` - ${formatCalendarDate(v.effectiveDate)}`}
            </option>
          ))}
        </select>

        <ExportDropdown selectedVersion={selectedVersion} />

        <Link to={`/documents/${doc.id}/diff`} className="btn-secondary btn-sm">
          <GitCompare className="w-4 h-4 mr-2" />
          Compare
        </Link>

        {canShare && (
          <button onClick={onShare} className="btn-secondary btn-sm">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </button>
        )}

        <Link to="/meetings" className="btn-secondary btn-sm">
          <Users className="w-4 h-4 mr-2" />
          Meetings
        </Link>

        {canDraft && (
          <button onClick={onProposeAmendment} className="btn-primary btn-sm">
            <Edit className="w-4 h-4 mr-2" />
            Propose Amendment
          </button>
        )}
      </div>
    </div>
  );
}
```

In `pages/DocumentPage.tsx`, replace:

```tsx
import { useOrganization } from '../../../context/OrganizationContext';
```

with:

```tsx
import { useOrganization, useCan } from '../../../context/OrganizationContext';
```

After `const { currentOrganization } = useOrganization();`, add:

```tsx
const canEdit = useCan('secretary');
const canDraft = useCan('member');
const canShare = useCan('admin');
```

In the `<DocumentHeader` element, add after `organizationName={currentOrganization?.name}`:

<!-- prettier-ignore -->
```tsx
          canDraft={canDraft}
          canShare={canShare}
```

In the `<DocumentContentCard` element, add after `selectedSection={selectedSection}`:

<!-- prettier-ignore -->
```tsx
          canEdit={canEdit}
```

- [ ] **Step 5: The amendment page**

Replace `pages/amendmentDetailPage/AmendmentHeader.tsx` with:

```tsx
import { Link } from 'react-router-dom';
import { ChevronRight, Edit2, Send, XCircle, CheckCircle, RotateCcw } from 'lucide-react';
import { Amendment, Document } from '../../../../api/client';
import { StatusBadge } from '../../../../components/ui/Badge';

interface AmendmentHeaderProps {
  amendment: Amendment;
  document: Document;
  organizationName?: string;
  /** Whether the user may propose, withdraw, decide and apply amendments (secretary and above) */
  canDecide: boolean;
  /** Whether the user may edit this amendment: a draft, theirs or as a secretary */
  canEditDraft: boolean;
  onEdit: () => void;
  onPropose: () => void;
  onWithdraw: () => void;
  onPass: () => void;
  onFail: () => void;
  onApply: () => void;
}

export function AmendmentHeader({
  amendment,
  document,
  organizationName,
  canDecide,
  canEditDraft,
  onEdit,
  onPropose,
  onWithdraw,
  onPass,
  onFail,
  onApply,
}: AmendmentHeaderProps) {
  const isDraft = amendment.status === 'draft';
  const isProposed = amendment.status === 'proposed';
  const isPassed = amendment.status === 'passed';
  const canEdit = isDraft && canEditDraft;
  const canPropose = canDecide && isDraft && (amendment.changes?.length ?? 0) > 0;
  const canWithdraw = canDecide && (isDraft || isProposed);
  const canVote = canDecide && isProposed;
  const canApply = canDecide && isPassed && !amendment.resultingVersionId;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-sm text-secondary-500 mb-1">
        <Link to="/" className="hover:text-primary-600">
          {organizationName}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <Link to={`/documents/${document.id}`} className="hover:text-primary-600">
          {document.title}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span>Amendment</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
            {amendment.title}
          </h2>
          <StatusBadge status={amendment.status} />
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={onEdit} className="btn-ghost btn-sm">
              <Edit2 className="w-4 h-4 mr-1" />
              Edit
            </button>
          )}
          {canWithdraw && (
            <button onClick={onWithdraw} className="btn-ghost btn-sm text-secondary-600">
              <XCircle className="w-4 h-4 mr-1" />
              Withdraw
            </button>
          )}
          {canPropose && (
            <button onClick={onPropose} className="btn-primary btn-sm">
              <Send className="w-4 h-4 mr-1" />
              Propose
            </button>
          )}
          {canVote && (
            <>
              <button onClick={onFail} className="btn-danger btn-sm">
                <XCircle className="w-4 h-4 mr-1" />
                Mark Failed
              </button>
              <button onClick={onPass} className="btn-success btn-sm">
                <CheckCircle className="w-4 h-4 mr-1" />
                Mark Passed
              </button>
            </>
          )}
          {canApply && (
            <button onClick={onApply} className="btn-primary btn-sm">
              <RotateCcw className="w-4 h-4 mr-1" />
              Apply to Document
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

In `pages/AmendmentDetailPage.tsx`, replace:

```tsx
import { useOrganization } from '../../../context/OrganizationContext';
```

with:

```tsx
import { useOrganization, useCan } from '../../../context/OrganizationContext';
import { useSession } from '../../../context/SessionContext';
import { canEditAmendment } from '../../../utils/roles';
```

Replace:

```tsx
const { currentOrganization } = useOrganization();
```

with:

```tsx
const { currentOrganization, role } = useOrganization();
const { user } = useSession();
// Proposing, withdrawing, deciding and applying need the secretary role
const canDecide = useCan('secretary');
```

Replace:

```tsx
const isDraft = amendment.status === 'draft';
```

with:

```tsx
const isDraft = amendment.status === 'draft';
// A member edits only drafts they created; a secretary any draft (the server's rule)
const canEditDraft =
  isDraft && role !== null && user !== null && canEditAmendment(role, user.id, amendment);
```

In the `<AmendmentHeader` element, add after `organizationName={currentOrganization?.name}`:

<!-- prettier-ignore -->
```tsx
        canDecide={canDecide}
        canEditDraft={canEditDraft}
```

In the `<AmendmentChangesList` element, replace `canEdit={isDraft}` with `canEdit={canEditDraft}`.

- [ ] **Step 6: The meeting record pages**

In `pages/meetingDetailPage/MeetingHeader.tsx`:

- In `MeetingHeaderProps`, add after `organizationName?: string;`:

  ```tsx
  /** Whether the user may change the record (secretary and above) */
  canManage: boolean;
  ```

- In the destructured parameters, add `canManage,` after `organizationName,`.
- Replace `{!isCancelled && !isCompleted && (` with `{canManage && !isCancelled && !isCompleted && (`.
- Replace `{isScheduled && (` with `{canManage && isScheduled && (`.
- Replace `{isInProgress && (` with `{canManage && isInProgress && (`.

In `pages/MeetingDetailPage.tsx`:

- Replace `import { useOrganization } from '../../../context/OrganizationContext';` with `import { useOrganization, useCan } from '../../../context/OrganizationContext';`.
- After `const { currentOrganization } = useOrganization();`, add:

  ```tsx
  // Changing the record and recording votes need the secretary role
  const canManage = useCan('secretary');
  ```

- In the `<MeetingHeader` element, add `canManage={canManage}` after `organizationName={currentOrganization?.name}`.
- In the `<PendingAmendmentsPanel` element, replace `isInProgress={isInProgress}` with `isInProgress={isInProgress && canManage}` (the panel offers Record Vote only while in progress).

In `pages/MeetingsPage.tsx`:

- Replace `import { useOrganization } from '../../../context/OrganizationContext';` with `import { useOrganization, useCan } from '../../../context/OrganizationContext';`.
- After `const { currentOrganization } = useOrganization();`, add:

  ```tsx
  // Meeting records are kept by secretaries and above
  const canRecord = useCan('secretary');
  ```

- Replace:

  <!-- prettier-ignore -->
  ```tsx
          <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Schedule Meeting
          </button>
  ```

  with:

  <!-- prettier-ignore -->
  ```tsx
          {canRecord && (
            <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              Schedule Meeting
            </button>
          )}
  ```

- Replace `{meetings.length === 0 && (` with `{meetings.length === 0 && canRecord && (`.

- [ ] **Step 7: Run everything**

Run: `TZ=America/Chicago npx vitest run && npx tsc --noEmit -p .`
Expected: all pass; type-check clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/layout src/modules/documents/pages
git commit -m "feat(web): hide actions the user's role can't take"
```

---

### Task 6: Members and organization settings (web)

**Files:**

- Create: `frontend-unified/src/modules/documents/components/MembersCard.tsx`, `frontend-unified/src/modules/documents/components/DeleteOrganizationDialog.tsx`
- Modify: `frontend-unified/src/modules/documents/pages/SettingsPage.tsx`
- Test: `frontend-unified/src/modules/documents/components/__tests__/MembersCard.test.tsx`, `frontend-unified/src/modules/documents/pages/__tests__/SettingsPage.test.tsx`

Work in `frontend-unified/`.

**Behavior:**

- **Members card** (everyone in the organization sees it):
  - The members, with name, email and role; "(you)" by the signed-in user.
  - Admins also get: the "Add by email" form with a role, a role menu and Remove on each member they may change, and the pending additions ("Waiting to sign in") with Cancel.
  - Owner rules: the role menu offers `assignableRoles(role)` (an admin can't give owner), and an admin gets no menu, Remove or Cancel on an owner or an owner addition. Your own row has none: you change your own membership by leaving.
  - Each change shows its outcome in the card (a `status` line) or the server's message (an `alert` line), then reloads the list. After adding: "added" says so, "invited" says they join the first time they sign in, "updated" says the waiting addition's role changed, and `emailSent: false` adds "We couldn't email them, so let them know yourself."
  - The limits (429) and the last-owner rule (409) come back as the server's messages.
- **Settings page:**
  - The organization card shows the name and description; Edit (name and description) is admin only.
  - The danger zone has Leave for everyone (a confirm dialog; the last owner gets the server's 409 message as a toast), and Delete for owners, confirmed by typing the organization's name.
  - With no organization, `NoOrganizations` replaces the "No Organization Selected" card.
  - "About Robbie-Bylawyer" becomes "About Robbie". The two copies of the Appearance card become one `AppearanceCard` in the file.

- [ ] **Step 1: Write the failing tests**

`src/modules/documents/components/__tests__/MembersCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  changeRole: vi.fn(async () => ({})),
  remove: vi.fn(async () => {}),
  cancelInvite: vi.fn(async () => {}),
}));
vi.mock('../../../../api/client', () => ({ members: api }));
const orgState = vi.hoisted(() => ({
  rank: ['viewer', 'member', 'secretary', 'admin', 'owner'],
  currentOrganization: { id: 'o1', name: 'Maple Grove HOA', role: 'admin' },
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({
    currentOrganization: orgState.currentOrganization,
    role: orgState.currentOrganization.role,
  }),
  useCan: (min: string) =>
    orgState.rank.indexOf(orgState.currentOrganization.role) >= orgState.rank.indexOf(min),
}));
vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 2, email: 'dana@maplegrove.example', name: 'Dana Okafor' } }),
}));

const { MembersCard } = await import('../MembersCard');

const people = {
  members: [
    { userId: 1, name: 'Pat Lindqvist', email: 'pat@maplegrove.example', role: 'owner' },
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', role: 'admin' },
    { userId: 4, name: 'Alice Brennan', email: 'alice@maplegrove.example', role: 'member' },
  ],
  invites: [{ id: 'i1', email: 'new@example.org', role: 'member', createdAt: '' }],
};

function addByEmail(email: string, role?: string) {
  fireEvent.change(screen.getByLabelText('Add by email'), { target: { value: email } });
  if (role) fireEvent.change(screen.getByLabelText('Role'), { target: { value: role } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}

describe('MembersCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.currentOrganization = { id: 'o1', name: 'Maple Grove HOA', role: 'admin' };
    api.list.mockResolvedValue(people);
  });

  it('shows a viewer the members and their roles, and nothing to change', async () => {
    orgState.currentOrganization = { ...orgState.currentOrganization, role: 'viewer' };
    api.list.mockResolvedValue({ members: people.members });
    render(<MembersCard />);
    expect(await screen.findByText('Alice Brennan')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.queryByLabelText('Add by email')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('new@example.org')).toBeNull();
  });

  it('adds someone by email and says when they will join', async () => {
    api.add.mockResolvedValueOnce({
      status: 'invited',
      invite: { id: 'i2', email: 'kim@example.org', role: 'member', createdAt: '' },
      emailSent: true,
    });
    render(<MembersCard />);
    await screen.findByText('Alice Brennan');
    addByEmail('Kim@Example.org');
    expect(
      await screen.findByText('kim@example.org will join as Member the first time they sign in.'),
    ).toBeTruthy();
    expect(api.add).toHaveBeenCalledWith('o1', 'kim@example.org', 'member');
  });

  it("says when the email couldn't be sent", async () => {
    api.add.mockResolvedValueOnce({
      status: 'added',
      member: { userId: 9, name: 'Kim', email: 'kim@example.org', role: 'secretary' },
      emailSent: false,
    });
    render(<MembersCard />);
    await screen.findByText('Alice Brennan');
    addByEmail('kim@example.org', 'secretary');
    expect(
      await screen.findByText(
        "kim@example.org was added as Secretary. We couldn't email them, so let them know yourself.",
      ),
    ).toBeTruthy();
  });

  it("shows the server's message for the daily limit", async () => {
    const limit = 'This organization has added 20 people today. Try again tomorrow.';
    api.add.mockRejectedValueOnce(new Error(limit));
    render(<MembersCard />);
    await screen.findByText('Alice Brennan');
    addByEmail('kim@example.org');
    expect((await screen.findByRole('alert')).textContent).toBe(limit);
  });

  it('lets an admin change roles up to admin, but not touch an owner', async () => {
    render(<MembersCard />);
    const select = await screen.findByLabelText('Role of Alice Brennan');
    expect(within(select).queryByRole('option', { name: 'Owner' })).toBeNull();
    expect(screen.queryByLabelText('Role of Pat Lindqvist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Pat Lindqvist' })).toBeNull();

    fireEvent.change(select, { target: { value: 'secretary' } });
    await waitFor(() => expect(api.changeRole).toHaveBeenCalledWith('o1', 4, 'secretary'));
    expect(await screen.findByText('Alice Brennan is now Secretary.')).toBeTruthy();
  });

  it('removes a member after confirming', async () => {
    render(<MembersCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Alice Brennan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('o1', 4));
  });

  it('cancels a pending addition', async () => {
    render(<MembersCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel adding new@example.org' }));
    await waitFor(() => expect(api.cancelInvite).toHaveBeenCalledWith('o1', 'i1'));
  });
});
```

`src/modules/documents/pages/__tests__/SettingsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const orgState = vi.hoisted(() => {
  const organization = (role: string) => ({
    id: 'o1',
    name: 'Maple Grove HOA',
    slug: 'maple-grove-hoa',
    description: null,
    createdAt: '2026-10-01T00:00:00Z',
    role,
  });
  return {
    organization,
    rank: ['viewer', 'member', 'secretary', 'admin', 'owner'],
    currentOrganization: organization('viewer') as ReturnType<typeof organization> | null,
    refreshOrganizations: vi.fn(async () => {}),
    setCurrentOrganization: vi.fn(),
  };
});
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => orgState,
  useCan: (min: string) =>
    orgState.currentOrganization !== null &&
    orgState.rank.indexOf(orgState.currentOrganization.role) >= orgState.rank.indexOf(min),
}));
const api = vi.hoisted(() => ({
  update: vi.fn(),
  deleteOrganization: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
}));
vi.mock('../../../../api/client', () => ({
  organizations: { update: api.update, delete: api.deleteOrganization },
  members: { remove: api.remove },
}));
vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({
    user: { id: 5, email: 'morgan@maplegrove.example', name: 'Morgan Lee' },
    setName: vi.fn(),
  }),
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('../../components/MembersCard', () => ({ MembersCard: () => <p>Members list</p> }));
vi.mock('../../../../components/organizations/NoOrganizations', () => ({
  NoOrganizations: () => <p>No organizations yet</p>,
}));

const { default: SettingsPage } = await import('../SettingsPage');

function leave() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
  fireEvent.click(screen.getByRole('button', { name: 'Leave organization' }));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgState.currentOrganization = orgState.organization('viewer');
  });

  it('lets a viewer see the members and leave, but not edit or delete', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Members list')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('leaves the organization', async () => {
    leave();
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('o1', 5));
    expect(orgState.setCurrentOrganization).toHaveBeenCalledWith(null);
    expect(orgState.refreshOrganizations).toHaveBeenCalled();
  });

  it("shows the server's message when the last owner tries to leave", async () => {
    orgState.currentOrganization = orgState.organization('owner');
    api.remove.mockRejectedValueOnce(new Error('An organization needs at least one owner'));
    leave();
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith(
        'error',
        'An organization needs at least one owner',
      ),
    );
    expect(orgState.setCurrentOrganization).not.toHaveBeenCalled();
  });

  it('deletes the organization only after its name is typed', async () => {
    orgState.currentOrganization = orgState.organization('owner');
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('button', { name: 'Delete organization' });
    expect(confirm).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'Maple Grove HOA' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.deleteOrganization).toHaveBeenCalledWith('o1'));
  });

  it('offers a way in to a user with no organization', () => {
    orgState.currentOrganization = null;
    render(<SettingsPage />);
    expect(screen.getByText('No organizations yet')).toBeTruthy();
    expect(screen.queryByText('Members list')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/modules/documents/components src/modules/documents/pages/__tests__/SettingsPage.test.tsx`
Expected: FAIL. `MembersCard` doesn't exist, and Settings has no Leave.

- [ ] **Step 3: Create `src/modules/documents/components/MembersCard.tsx`**

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserPlus, Users, X } from 'lucide-react';
import {
  members as membersApi,
  type AddMemberResult,
  type OrgMember,
  type PendingInvite,
} from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useSession } from '../../../context/SessionContext';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { ROLE_LABELS, assignableRoles, type OrgRole } from '../../../utils/roles';

type Notice = { kind: 'status' | 'alert'; text: string };

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

/** What happened after adding someone by email, in words */
function addedMessage(email: string, result: AddMemberResult): string {
  const role = ROLE_LABELS[result.status === 'added' ? result.member.role : result.invite.role];
  if (result.status === 'updated') {
    return `${email} was already waiting to join. Their role is now ${role}.`;
  }
  const unsent = result.emailSent ? '' : " We couldn't email them, so let them know yourself.";
  if (result.status === 'added') return `${email} was added as ${role}.${unsent}`;
  return `${email} will join as ${role} the first time they sign in.${unsent}`;
}

/** The organization's members; for admins, adding, changing and removing them */
export function MembersCard() {
  const { currentOrganization, role } = useOrganization();
  const { user } = useSession();
  const isAdmin = useCan('admin');
  const orgId = currentOrganization?.id;
  const assignable = role ? assignableRoles(role) : [];

  const [list, setList] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<OrgRole>('member');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<OrgMember | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const result = await membersApi.list(orgId);
      setList(result.members);
      setInvites(result.invites ?? []);
    } catch (err) {
      setNotice({ kind: 'alert', text: messageOf(err, 'Failed to load the members') });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a change, show its outcome or the server's message, and reload the list */
  const act = async (change: () => Promise<string>, fallback: string) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ kind: 'status', text: await change() });
    } catch (err) {
      setNotice({ kind: 'alert', text: messageOf(err, fallback) });
    } finally {
      setBusy(false);
    }
    await load();
  };

  // Admins change members up to admin; only an owner changes an owner. Your own membership
  // changes by leaving, in the danger zone.
  const canManage = (target: OrgRole, userId?: number) =>
    isAdmin && userId !== user?.id && (role === 'owner' || target !== 'owner');

  const nameOf = (member: OrgMember) => member.name ?? member.email;

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    const address = email.trim().toLowerCase();
    void act(async () => {
      const result = await membersApi.add(orgId, address, newRole);
      setEmail('');
      return addedMessage(address, result);
    }, 'Failed to add them');
  };

  const onChangeRole = (member: OrgMember, next: OrgRole) => {
    if (!orgId) return;
    void act(async () => {
      await membersApi.changeRole(orgId, member.userId, next);
      return `${nameOf(member)} is now ${ROLE_LABELS[next]}.`;
    }, 'Failed to change the role');
  };

  const onRemove = () => {
    const member = removing;
    setRemoving(null);
    if (!orgId || !member) return;
    void act(async () => {
      await membersApi.remove(orgId, member.userId);
      return `${nameOf(member)} was removed.`;
    }, 'Failed to remove them');
  };

  const onCancelInvite = (invite: PendingInvite) => {
    if (!orgId) return;
    void act(async () => {
      await membersApi.cancelInvite(orgId, invite.id);
      return `${invite.email} won't be added.`;
    }, 'Failed to cancel the addition');
  };

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
        <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
          <Users className="w-5 h-5" />
          Members
        </h3>
      </div>
      <div className="p-6 space-y-6">
        {notice && (
          <p
            role={notice.kind}
            className={`text-sm ${
              notice.kind === 'alert'
                ? 'text-danger-600 dark:text-danger-400'
                : 'text-success-700 dark:text-success-400'
            }`}
          >
            {notice.text}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-secondary-500">Loading members...</p>
        ) : (
          <ul className="divide-y divide-secondary-100 dark:divide-secondary-700">
            {list.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-secondary-900 dark:text-white truncate">
                    {nameOf(member)}
                    {member.userId === user?.id && (
                      <span className="font-normal text-secondary-500"> (you)</span>
                    )}
                  </p>
                  <p className="text-sm text-secondary-500 truncate">{member.email}</p>
                </div>
                {canManage(member.role, member.userId) ? (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Role of ${nameOf(member)}`}
                      className="select w-auto text-sm py-1"
                      value={member.role}
                      disabled={busy}
                      onChange={(e) => onChangeRole(member, e.target.value as OrgRole)}
                    >
                      {assignable.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={`Remove ${nameOf(member)}`}
                      className="btn-ghost btn-sm text-danger-600"
                      disabled={busy}
                      onClick={() => setRemoving(member)}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <span className="badge bg-secondary-100 text-secondary-700 dark:bg-secondary-700 dark:text-secondary-200">
                    {ROLE_LABELS[member.role]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && invites.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Waiting to sign in
            </h4>
            <ul className="divide-y divide-secondary-100 dark:divide-secondary-700">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-secondary-700 dark:text-secondary-300 truncate">
                    {invite.email}{' '}
                    <span className="text-secondary-500">({ROLE_LABELS[invite.role]})</span>
                  </span>
                  {canManage(invite.role) && (
                    <button
                      type="button"
                      aria-label={`Cancel adding ${invite.email}`}
                      className="btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onCancelInvite(invite)}
                    >
                      <X className="w-4 h-4 mr-1" aria-hidden="true" />
                      Cancel
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isAdmin && (
          <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[12rem]">
              <label htmlFor="memberEmail" className="label">
                Add by email
              </label>
              <input
                id="memberEmail"
                type="email"
                className="input"
                maxLength={254}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="memberRole" className="label">
                Role
              </label>
              <select
                id="memberRole"
                className="select"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as OrgRole)}
              >
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={busy || !email.trim()}>
              <UserPlus className="w-4 h-4 mr-2" aria-hidden="true" />
              Add
            </button>
          </form>
        )}
      </div>

      <ConfirmDialog
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={onRemove}
        title="Remove member"
        message={`Remove ${removing ? nameOf(removing) : ''} from ${currentOrganization?.name}? They lose access to its documents and meetings.`}
        confirmText="Remove"
        variant="danger"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/modules/documents/components/DeleteOrganizationDialog.tsx`**

```tsx
import { useState } from 'react';
import Modal from '../../../components/ui/Modal';

interface DeleteOrganizationDialogProps {
  organizationName: string;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Deleting an organization can't be undone, so the owner types its name to confirm. Render it
 * only while open, so the typed name starts empty each time.
 */
export function DeleteOrganizationDialog({
  organizationName,
  deleting,
  onClose,
  onConfirm,
}: DeleteOrganizationDialogProps) {
  const [typed, setTyped] = useState('');
  return (
    <Modal isOpen onClose={onClose} title="Delete organization" size="sm">
      <p className="text-secondary-600 dark:text-secondary-400 mb-4">
        This permanently deletes {organizationName} with all its documents, versions, amendments,
        meeting records and files. It can't be undone.
      </p>
      <label htmlFor="confirmOrganizationName" className="label">
        Type <strong>{organizationName}</strong> to confirm
      </label>
      <input
        id="confirmOrganizationName"
        className="input mb-6"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn-ghost btn-sm" disabled={deleting}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="btn-danger btn-sm"
          disabled={deleting || typed !== organizationName}
        >
          {deleting ? 'Deleting...' : 'Delete organization'}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Replace `src/modules/documents/pages/SettingsPage.tsx`**

```tsx
import { useState } from 'react';
import { Settings, Building2, UserCircle, Trash2, Sun, Moon, Monitor, LogOut } from 'lucide-react';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useSession } from '../../../context/SessionContext';
import { useTheme } from '../../../context/ThemeContext';
import { members as membersApi, organizations as organizationsApi } from '../../../api/client';
import Modal from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../context/ToastContext';
import { NoOrganizations } from '../../../components/organizations/NoOrganizations';
import { MembersCard } from '../components/MembersCard';
import { DeleteOrganizationDialog } from '../components/DeleteOrganizationDialog';

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function SettingsPage() {
  const { currentOrganization, refreshOrganizations, setCurrentOrganization } = useOrganization();
  // The organization's name and description are the admins'; deleting it is the owners'
  const isAdmin = useCan('admin');
  const isOwner = useCan('owner');
  const { showToast } = useToast();
  const { user, setName } = useSession();

  // Display name
  const [displayName, setDisplayName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingName(true);
      await setName(displayName.trim());
      showToast('success', 'Name updated');
    } catch (err) {
      showToast('error', messageOf(err, 'Failed to update your name'));
    } finally {
      setSavingName(false);
    }
  };

  // Edit organization
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Leave, and delete
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleEditOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !editName.trim()) return;

    try {
      setSaving(true);
      await organizationsApi.update(currentOrganization.id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      await refreshOrganizations();
      setEditModalOpen(false);
      showToast('success', 'Organization updated');
    } catch (err) {
      showToast('error', messageOf(err, 'Failed to update organization'));
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!currentOrganization || !user) return;
    const name = currentOrganization.name;
    try {
      setLeaving(true);
      await membersApi.remove(currentOrganization.id, user.id);
      setLeaveDialogOpen(false);
      setCurrentOrganization(null);
      await refreshOrganizations();
      showToast('success', `You left ${name}`);
    } catch (err) {
      // The last owner can't leave: "An organization needs at least one owner"
      setLeaveDialogOpen(false);
      showToast('error', messageOf(err, 'Failed to leave the organization'));
    } finally {
      setLeaving(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!currentOrganization) return;

    try {
      setDeleting(true);
      await organizationsApi.delete(currentOrganization.id);
      setDeleteDialogOpen(false);
      setCurrentOrganization(null);
      await refreshOrganizations();
      showToast('success', 'Organization deleted');
    } catch (err) {
      showToast('error', messageOf(err, 'Failed to delete organization'));
    } finally {
      setDeleting(false);
    }
  };

  const openEditModal = () => {
    if (currentOrganization) {
      setEditName(currentOrganization.name);
      setEditDescription(currentOrganization.description ?? '');
      setEditModalOpen(true);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
          Settings
        </h2>
        <p className="text-secondary-600 dark:text-secondary-400 mt-1">
          Your name, your organization and its members
        </p>
      </div>

      {/* Your name */}
      <div className="card mb-6">
        <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
          <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
            <UserCircle className="w-5 h-5" />
            Your name
          </h3>
        </div>
        <form onSubmit={handleSaveName} className="p-6">
          <label htmlFor="displayName" className="label">
            Your name
          </label>
          <input
            type="text"
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
            minLength={2}
            maxLength={100}
            required
          />
          <p className="text-sm text-secondary-500 mt-1">Shown to others in meetings.</p>
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              className="btn-primary"
              disabled={savingName || displayName.trim() === user?.name}
            >
              {savingName ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>

      {currentOrganization ? (
        <div className="space-y-6">
          {/* Organization */}
          <div className="card">
            <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
              <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Organization
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-secondary-500">Organization Name</p>
                  <p className="font-medium text-secondary-900 dark:text-white">
                    {currentOrganization.name}
                  </p>
                </div>
                {isAdmin && (
                  <button onClick={openEditModal} className="btn-secondary btn-sm">
                    Edit
                  </button>
                )}
              </div>
              {currentOrganization.description && (
                <div>
                  <p className="text-sm text-secondary-500">Description</p>
                  <p className="text-secondary-700 dark:text-secondary-300">
                    {currentOrganization.description}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-secondary-500">Created</p>
                <p className="text-secondary-700 dark:text-secondary-300">
                  {new Date(currentOrganization.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <MembersCard />

          {/* Danger Zone */}
          <div className="card border-danger-200 dark:border-danger-900">
            <div className="px-6 py-4 border-b border-danger-200 dark:border-danger-800 bg-danger-50 dark:bg-danger-900/20 rounded-t-lg">
              <h3 className="font-semibold text-danger-700 dark:text-danger-400">Danger Zone</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-secondary-900 dark:text-white">
                    Leave Organization
                  </p>
                  <p className="text-sm text-secondary-500">
                    You lose access to its documents and meetings. Its last owner can't leave.
                  </p>
                </div>
                <button onClick={() => setLeaveDialogOpen(true)} className="btn-secondary btn-sm">
                  <LogOut className="w-4 h-4 mr-1" />
                  Leave
                </button>
              </div>
              {isOwner && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-secondary-900 dark:text-white">
                      Delete Organization
                    </p>
                    <p className="text-sm text-secondary-500">
                      Permanently delete this organization and all its data
                    </p>
                  </div>
                  <button onClick={() => setDeleteDialogOpen(true)} className="btn-danger btn-sm">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          <AppearanceCard />

          {/* App Info */}
          <div className="card">
            <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
              <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5" />
                About Robbie
              </h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary-500">Version</span>
                <span className="text-sm text-secondary-700 dark:text-secondary-300">1.0.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary-500">Environment</span>
                <span className="text-sm text-secondary-700 dark:text-secondary-300">
                  Development
                </span>
              </div>
              <div className="pt-3 border-t border-secondary-200 dark:border-secondary-700">
                <p className="text-sm text-secondary-500">
                  Robbie runs meetings by Robert's Rules of Order and keeps your organization's
                  bylaws, with every version and amendment.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <NoOrganizations />
          <AppearanceCard />
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Organization"
      >
        <form onSubmit={handleEditOrganization}>
          <div className="mb-4">
            <label htmlFor="orgName" className="label">
              Organization Name
            </label>
            <input
              type="text"
              id="orgName"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input"
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label htmlFor="orgDescription" className="label">
              Description
            </label>
            <textarea
              id="orgDescription"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="textarea h-24"
              maxLength={2000}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditModalOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!editName.trim() || saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Leave Confirmation */}
      <ConfirmDialog
        isOpen={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        onConfirm={handleLeave}
        title="Leave Organization"
        message={`Leave ${currentOrganization?.name}? You lose access to its documents and meetings until someone adds you again.`}
        confirmText="Leave organization"
        variant="danger"
        loading={leaving}
      />

      {/* Delete Confirmation */}
      {deleteDialogOpen && currentOrganization && (
        <DeleteOrganizationDialog
          organizationName={currentOrganization.name}
          deleting={deleting}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={handleDeleteOrganization}
        />
      )}
    </div>
  );
}

const THEMES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const;

/** Light, dark or the system's color scheme */
function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-secondary-200 dark:border-secondary-700">
        <h3 className="font-semibold text-secondary-900 dark:text-white flex items-center gap-2">
          <Sun className="w-5 h-5" />
          Appearance
        </h3>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-secondary-900 dark:text-white">Theme</p>
            <p className="text-sm text-secondary-500">Choose your preferred color scheme</p>
          </div>
          <div className="flex gap-1 p-1 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  theme === value
                    ? 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white shadow-xs'
                    : 'text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white'
                }`}
                aria-label={`${label} theme`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run everything**

Run: `TZ=America/Chicago npx vitest run && npx tsc --noEmit -p .`
Expected: all pass; type-check clean. `grep -rn "Robbie-Bylawyer" src/modules/documents` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/modules/documents/components src/modules/documents/pages/SettingsPage.tsx src/modules/documents/pages/__tests__/SettingsPage.test.tsx
git commit -m "feat(web): manage members, leave and delete organizations in Settings"
```

---

### Task 7: Live meetings: packets, links and the socket's terms refusal (web)

**Files:**

- Modify:
  - `frontend-unified/src/modules/meetings/components/scheduling/types.ts`, `scheduling/api.ts`, `scheduling/MeetingScheduler.tsx`
  - `frontend-unified/src/modules/meetings/components/chair/MeetingDocumentsPanel.tsx`
  - `frontend-unified/src/modules/meetings/components/BylawyerLinkPanel.tsx`
  - `frontend-unified/src/modules/meetings/context/OrganizationBridge.tsx`, `views/JoinMeetingScreen.tsx`
  - `frontend-unified/src/modules/meetings/hooks/useSocketConnection.ts`, `context/SocketContext.tsx`
- Test: `scheduling/__tests__/api.test.ts`, `scheduling/__tests__/MeetingScheduler.test.tsx` (new), `components/__tests__/BylawyerLinkPanel.test.tsx` (new), `views/__tests__/JoinMeetingScreen.test.tsx`, `hooks/__tests__/useSocketConnection.test.ts`, `__tests__/MeetingsModule.test.tsx`

Work in `frontend-unified/`. Paths below are in `src/modules/meetings/`.

**Behavior:**

- **Scheduling** (meeting creation itself stays as it is; Phase C changes that model):
  - "Schedule a New Meeting" shows only to a secretary or above of the current organization. The scheduler reads the organization, with the role, from `useMeetingOrganization()`; the bridge now types it `OrganizationWithRole`.
  - "Next: Build Agenda" creates the packet with `createPacket(organizationId, { robbieCode, title, description, scheduledFor })`. The existing generator (6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) already fits `^[A-Z0-9]{4,8}$`; it now runs once, as the state's initial value. A 409 (code taken) tries a fresh code, up to 3 codes in all; any other failure shows the server's message.
  - Going back to the details and on again saves them with `updatePacket`, as "Save & Join Meeting" does.
- **Reading a packet:** `getOrCreatePacket` becomes `getPacket`, which returns null on 404. The chair's documents panel shows "No meeting documents." for no packet as for an empty one.
- **Linking** (`BylawyerLinkPanel`, in the admin view): lists only organizations where the user is secretary or above; suggests the current one when it qualifies; shows "Unlink" only to a secretary of the linked organization; shows the server's message for a 409 ("That meeting code is already in use", or "Remove the agenda and attachments first" when unlinking); says "You need the secretary role in an organization to link this meeting." when none qualifies. The 404 for an unlinked meeting is handled in the client (Task 1). The panel's heading becomes "Organization" (it said "Bylawyer Integration").
- **The socket's terms refusal:** `useSocketConnection` takes an optional third callback, `onTermsNotAccepted`, called for a `connect_error` whose `data.code` is `TERMS_NOT_ACCEPTED`. `SocketProvider` passes the session's `markTermsNotAccepted`, so `RequireSession` shows the terms step, which unmounts the meetings module and its socket. After accepting, the module mounts again, restores the remembered meeting code and connects. (The third parameter is optional so the 11 existing calls in the hook's test stay as they are.)

- [ ] **Step 1: Write the failing tests**

In `components/scheduling/__tests__/api.test.ts`, replace the imports with:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpError, setSignedOutHandler } from '../../../../../api/client';
import { createPacket, getAttachmentDownloadUrl, getPacket, uploadAttachment } from '../api';
```

replace each `getOrCreatePacket('DEMO')` in the file (three places) with `getPacket('DEMO')`, and append inside `describe('scheduling API')`:

```ts
it('reads a meeting without a packet as having none', async () => {
  mockFetch(404, { error: 'Not found' });
  expect(await getPacket('DEMO')).toBeNull();
});

it("creates a packet in an organization, with the server's message for a taken code", async () => {
  const fetchMock = mockFetch(409, { error: 'That meeting code is already in use' });
  const error = await createPacket('org-1', { robbieCode: 'MAPLE1', title: 'Annual' }).catch(
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(409);
  expect((error as HttpError).message).toBe('That meeting code is already in use');
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/organizations/org-1/packets');
  expect(JSON.parse(init.body as string)).toEqual({ robbieCode: 'MAPLE1', title: 'Annual' });
});
```

`components/scheduling/__tests__/MeetingScheduler.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpError } from '../../../../../api/client';

const api = vi.hoisted(() => ({ createPacket: vi.fn(), updatePacket: vi.fn() }));
vi.mock('../api', () => api);
vi.mock('../PacketBuilder', () => ({ PacketBuilder: () => <p>Agenda builder</p> }));
const bridge = vi.hoisted(() => ({
  currentOrganization: null as null | { id: string; name: string; slug: string; role: string },
}));
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

function schedule(title = 'Annual Meeting') {
  render(<MeetingScheduler onBack={vi.fn()} onJoinMeeting={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Meeting Title'), { target: { value: title } });
  fireEvent.click(screen.getByRole('button', { name: /Next: Build Agenda/ }));
}

describe('MeetingScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.currentOrganization = {
      id: 'org-1',
      name: 'Maple Grove HOA',
      slug: 'maple-grove-hoa',
      role: 'secretary',
    };
  });

  it('creates the meeting packet in the current organization', async () => {
    api.createPacket.mockImplementation(async (_org: string, data: { robbieCode: string }) =>
      packet(data.robbieCode),
    );
    schedule();
    expect(await screen.findByText('Agenda builder')).toBeTruthy();
    expect(api.createPacket).toHaveBeenCalledWith('org-1', {
      robbieCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
      title: 'Annual Meeting',
      description: undefined,
      scheduledFor: undefined,
    });
  });

  it('tries a fresh code when the generated one is taken', async () => {
    api.createPacket
      .mockRejectedValueOnce(new HttpError('That meeting code is already in use', 409))
      .mockImplementation(async (_org: string, data: { robbieCode: string }) =>
        packet(data.robbieCode),
      );
    schedule();
    expect(await screen.findByText('Agenda builder')).toBeTruthy();
    expect(api.createPacket).toHaveBeenCalledTimes(2);
    const [first, second] = api.createPacket.mock.calls.map(([, data]) => data.robbieCode);
    expect(second).not.toBe(first);
  });

  it("shows the server's message when the packet can't be created", async () => {
    api.createPacket.mockRejectedValueOnce(
      new HttpError('You need the secretary role for this', 403),
    );
    schedule();
    expect(await screen.findByText('You need the secretary role for this')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Agenda builder')).toBeNull());
  });

  it('explains who schedules meetings to a role below secretary', () => {
    bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'member' };
    render(<MeetingScheduler onBack={vi.fn()} onJoinMeeting={vi.fn()} />);
    expect(screen.getByText(/by its secretaries and admins/)).toBeTruthy();
    expect(screen.queryByLabelText('Meeting Title')).toBeNull();
  });
});
```

`components/__tests__/BylawyerLinkPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getOrganizations: vi.fn(),
  getMeetingOrganization: vi.fn(),
  linkMeeting: vi.fn(),
  unlinkMeeting: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({ bylawSync: api }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { BylawyerLinkPanel } = await import('../BylawyerLinkPanel');

const maple = {
  id: 'o1',
  name: 'Maple Grove HOA',
  slug: 'maple-grove-hoa',
  description: null,
  role: 'secretary',
};
const chess = {
  id: 'o2',
  name: 'Chess Club',
  slug: 'chess-club',
  description: null,
  role: 'member',
};

function renderPanel() {
  render(
    <MemoryRouter>
      <BylawyerLinkPanel meetingCode="MAPLE1" suggestedOrgId="o1" />
    </MemoryRouter>,
  );
}

describe('BylawyerLinkPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOrganizations.mockResolvedValue([maple, chess]);
    api.getMeetingOrganization.mockResolvedValue({ linked: false, organization: null });
  });

  it('offers only organizations where the user is secretary or above', async () => {
    renderPanel();
    expect(await screen.findByRole('option', { name: 'Maple Grove HOA (Current)' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Chess Club/ })).toBeNull();
  });

  it('links the meeting to the suggested organization', async () => {
    api.linkMeeting.mockResolvedValueOnce({ success: true });
    renderPanel();
    await screen.findByRole('option', { name: 'Maple Grove HOA (Current)' });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(api.linkMeeting).toHaveBeenCalledWith('MAPLE1', 'o1'));
  });

  it("shows the server's message when another organization has the code", async () => {
    api.linkMeeting.mockRejectedValueOnce(new Error('That meeting code is already in use'));
    renderPanel();
    await screen.findByRole('option', { name: 'Maple Grove HOA (Current)' });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith('error', 'That meeting code is already in use'),
    );
  });

  it('shows the linked organization, with Unlink only for its secretaries', async () => {
    api.getMeetingOrganization.mockResolvedValue({ linked: true, organization: chess });
    renderPanel();
    expect(await screen.findByText('Chess Club')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unlink/ })).toBeNull();
  });

  it('explains the secretary role when no organization qualifies', async () => {
    api.getOrganizations.mockResolvedValue([chess]);
    renderPanel();
    expect(
      await screen.findByText(
        'You need the secretary role in an organization to link this meeting.',
      ),
    ).toBeTruthy();
  });
});
```

In `views/__tests__/JoinMeetingScreen.test.tsx`, after the scheduling mock, add:

```tsx
const bridge = vi.hoisted(() => ({
  currentOrganization: null as null | { id: string; name: string; role: string },
}));
vi.mock('../../context/OrganizationBridge', () => ({ useMeetingOrganization: () => bridge }));
```

add `bridge.currentOrganization = null;` to the `beforeEach`, and append inside the `describe`:

```tsx
it('offers scheduling to a secretary of the current organization', () => {
  bridge.currentOrganization = { id: 'o1', name: 'Maple Grove HOA', role: 'secretary' };
  render(<JoinMeetingScreen />);
  fireEvent.click(screen.getByRole('button', { name: /Schedule a New Meeting/ }));
  expect(screen.getByText('Scheduler')).toBeTruthy();
});

it('does not offer scheduling to a member', () => {
  bridge.currentOrganization = { id: 'o1', name: 'Maple Grove HOA', role: 'member' };
  render(<JoinMeetingScreen />);
  expect(screen.queryByRole('button', { name: /Schedule a New Meeting/ })).toBeNull();
});
```

In `__tests__/MeetingsModule.test.tsx`, the bridge mock provides only the provider, and the join screen it renders now calls `useMeetingOrganization`. Replace the mock with:

```tsx
vi.mock('../context/OrganizationBridge', () => ({
  MeetingOrganizationProvider: ({ children }: { children: ReactNode }) => children,
  useMeetingOrganization: () => ({
    currentOrganization: null,
    availableOrganizations: [],
    loading: false,
  }),
}));
```

In `hooks/__tests__/useSocketConnection.test.ts`, append after the test "shows other connection errors without reporting a lost session":

```ts
it('reports a connection refused for the terms, without an error or a lost session', () => {
  const { handlers } = connectedSocket();
  const onNotSignedIn = vi.fn();
  const onTermsNotAccepted = vi.fn();
  const { result } = renderHook(() =>
    useSocketConnection('DEMO', onNotSignedIn, onTermsNotAccepted),
  );

  act(() =>
    handlers.connect_error(
      Object.assign(new Error('Accept the terms to continue'), {
        data: { code: 'TERMS_NOT_ACCEPTED' },
      }),
    ),
  );

  expect(onTermsNotAccepted).toHaveBeenCalledTimes(1);
  expect(onNotSignedIn).not.toHaveBeenCalled();
  expect(result.current.error).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `TZ=America/Chicago npx vitest run src/modules/meetings`
Expected: FAIL. `getPacket` and `createPacket` don't exist, the scheduler still calls `getOrCreatePacket`, the join screen always offers scheduling, the link panel lists every organization, and the hook shows the terms refusal as a connection error.

- [ ] **Step 3: The scheduling API**

In `components/scheduling/types.ts`, in `interface MeetingPacket`, add after `id: string;`:

```ts
/** The organization the meeting belongs to */
organizationId: string;
```

In `components/scheduling/api.ts`, replace:

```ts
import { apiFetch } from '../../../../api/client';

/**
 * Get or create a meeting packet for a meeting code
 */
export async function getOrCreatePacket(robbieCode: string): Promise<MeetingPacket> {
  const response = await apiFetch(`/packets/${robbieCode}`);
  if (!response.ok) {
    throw new Error('Failed to get meeting packet');
  }
  return response.json();
}
```

with:

```ts
import { apiFetch, HttpError } from '../../../../api/client';

/** The server's { error } message from a failed response, or the fallback */
async function serverMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : fallback;
}

/**
 * The meeting packet for a meeting code, or null when the meeting has none (a packet is made
 * when a meeting is scheduled or linked, never by reading)
 */
export async function getPacket(robbieCode: string): Promise<MeetingPacket | null> {
  const response = await apiFetch(`/packets/${robbieCode}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error('Failed to get meeting packet');
  }
  return response.json();
}

/**
 * Create the packet for a new meeting code in an organization (secretary and above). A code
 * that already has a packet, in any organization, is an HttpError with status 409.
 */
export async function createPacket(
  organizationId: string,
  data: { robbieCode: string; title?: string; description?: string; scheduledFor?: string },
): Promise<MeetingPacket> {
  const response = await apiFetch(`/organizations/${organizationId}/packets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new HttpError(
      await serverMessage(response, 'Failed to schedule the meeting'),
      response.status,
    );
  }
  return response.json();
}
```

- [ ] **Step 4: Replace `components/scheduling/MeetingScheduler.tsx`**

```tsx
/**
 * Meeting Scheduler Component
 *
 * Schedules a meeting in the current organization. Its details create the meeting's packet,
 * which claims the meeting code for the organization; the agenda and attachments are then added
 * to the packet.
 */

import { useState } from 'react';
import { Calendar, Clock, ArrowLeft, ArrowRight, Loader2, Check, Copy } from 'lucide-react';
import type { MeetingPacket } from './types';
import { PacketBuilder } from './PacketBuilder';
import { createPacket, updatePacket } from './api';
import { HttpError } from '../../../../api/client';
import { useMeetingOrganization } from '../../context/OrganizationBridge';
import { atLeast } from '../../../../utils/roles';

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
  const { currentOrganization } = useMeetingOrganization();
  const [step, setStep] = useState<Step>('details');
  const [meetingCode, setMeetingCode] = useState(generateMeetingCode);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [packet, setPacket] = useState<MeetingPacket | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Meetings are scheduled in the organization selected in the header, by its secretaries and
  // above
  const organization =
    currentOrganization && atLeast(currentOrganization.role, 'secretary')
      ? currentOrganization
      : null;

  const details = () => ({
    title: title || undefined,
    description: description || undefined,
    scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
  });

  /** Create the packet, with a fresh code if a generated one is already taken */
  const create = async (organizationId: string): Promise<MeetingPacket> => {
    let code = meetingCode;
    for (let attempt = 1; ; attempt++) {
      try {
        return await createPacket(organizationId, { robbieCode: code, ...details() });
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
      // The first time, creating the packet claims the code; after Edit Details, save them
      setPacket(packet ? await updatePacket(packet.id, details()) : await create(organization.id));
      setStep('agenda');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule the meeting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndJoin = async () => {
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
    onJoinMeeting(meetingCode);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(meetingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!organization) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="card p-6 text-center">
          <p className="text-secondary-600 dark:text-secondary-400 mb-4">
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
    <div className="max-w-7xl mx-auto">
      <div className="card w-full max-w-2xl mx-auto overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-r from-meeting-700 to-meeting-800 text-white p-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              aria-label="Back"
              className="bg-white/20 p-2 rounded-lg hover:bg-white/30 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Schedule Meeting</h1>
              <p className="text-meeting-200 text-sm">
                {organization.name}:{' '}
                {step === 'details' ? 'Step 1: Meeting Details' : 'Step 2: Build Agenda'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Meeting code display */}
          <div className="mb-6 bg-meeting-50 dark:bg-meeting-900/20 border border-meeting-200 dark:border-meeting-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-meeting-600 dark:text-meeting-400 font-medium">
                  Meeting Code
                </p>
                <p className="text-2xl font-mono font-bold text-meeting-800 dark:text-meeting-300">
                  {meetingCode}
                </p>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-2 px-3 py-2 bg-meeting-600 text-white rounded-lg hover:bg-meeting-700 text-sm transition-colors"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-meeting-600 dark:text-meeting-400 mt-2">
              Share this code with participants to join your meeting
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-400 px-4 py-3 rounded-lg"
            >
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
              <div>
                <label
                  htmlFor="meetingTitle"
                  className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
                >
                  Meeting Title
                </label>
                <input
                  id="meetingTitle"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Board Meeting - January 2025"
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="meetingDescription"
                  className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
                >
                  Description
                </label>
                <textarea
                  id="meetingDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional meeting description..."
                  rows={3}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white resize-none"
                />
              </div>

              <div>
                <label
                  htmlFor="meetingDate"
                  className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
                >
                  <Calendar size={16} className="inline mr-1" />
                  Date & Time
                </label>
                <input
                  id="meetingDate"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-meeting-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-meeting-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      Next: Build Agenda
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            packet && (
              <>
                {/* Editable details summary */}
                <div className="mb-6 p-4 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-secondary-800 dark:text-white">
                      {title || 'Untitled Meeting'}
                    </h3>
                    <button
                      onClick={() => setStep('details')}
                      className="text-sm text-meeting-600 dark:text-meeting-400 hover:underline"
                    >
                      Edit Details
                    </button>
                  </div>
                  {scheduledFor && (
                    <p className="text-sm text-secondary-600 dark:text-secondary-400 flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(scheduledFor).toLocaleString()}
                    </p>
                  )}
                </div>

                <PacketBuilder packet={packet} onPacketUpdate={setPacket} />

                <div className="flex gap-3 pt-6 mt-6 border-t border-secondary-200 dark:border-secondary-700">
                  <button
                    onClick={() => setStep('details')}
                    className="flex-1 py-3 px-4 border border-secondary-300 dark:border-secondary-600 text-secondary-700 dark:text-secondary-300 rounded-lg font-medium hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void handleSaveAndJoin()}
                    className="flex-1 flex items-center justify-center gap-2 bg-success-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-success-700 transition-colors"
                  >
                    {isSaving ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Check size={20} />
                        Save & Join Meeting
                      </>
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

`MeetingScheduler` no longer takes a `meetingCode` prop: nothing passed one.

- [ ] **Step 5: The join screen, the bridge and the documents panel**

In `context/OrganizationBridge.tsx`, replace:

```tsx
import type { Organization } from '../../../api/client';
```

with:

```tsx
import type { OrganizationWithRole } from '../../../api/client';
```

and in `MeetingOrganizationContextType`, replace the two fields:

```tsx
  /** The currently selected organization (from documents module) */
  currentOrganization: Organization | null;
  /** All available organizations */
  availableOrganizations: Organization[];
```

with:

```tsx
  /** The currently selected organization (from documents module), with the user's role */
  currentOrganization: OrganizationWithRole | null;
  /** The user's organizations, each with their role */
  availableOrganizations: OrganizationWithRole[];
```

In `views/JoinMeetingScreen.tsx`, add the imports:

```tsx
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { atLeast } from '../../../utils/roles';
```

After `const [scheduling, setScheduling] = useState(false);`, add:

```tsx
const { currentOrganization } = useMeetingOrganization();
// Meetings are scheduled in the current organization, by its secretaries and above
const canSchedule = currentOrganization !== null && atLeast(currentOrganization.role, 'secretary');
```

and replace:

<!-- prettier-ignore -->
```tsx
        <div className="mt-6 pt-6 border-t border-secondary-200 dark:border-secondary-700">
          <button onClick={() => setScheduling(true)} className="btn-secondary w-full">
            <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
            Schedule a New Meeting
          </button>
        </div>
```

with:

<!-- prettier-ignore -->
```tsx
        {canSchedule && (
          <div className="mt-6 pt-6 border-t border-secondary-200 dark:border-secondary-700">
            <button onClick={() => setScheduling(true)} className="btn-secondary w-full">
              <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
              Schedule a New Meeting
            </button>
          </div>
        )}
```

In `components/chair/MeetingDocumentsPanel.tsx`:

- Replace `import { getOrCreatePacket, getAttachmentDownloadUrl } from '../scheduling/api';` with `import { getPacket, getAttachmentDownloadUrl } from '../scheduling/api';`.
- Replace `const loadedPacket = await getOrCreatePacket(meetingCode);` with:

  ```tsx
  // A meeting that was never scheduled or linked has no packet (null): no documents
  const loadedPacket = await getPacket(meetingCode);
  ```

- Replace `No documents attached to this meeting.` with `No meeting documents.`

- [ ] **Step 6: Replace `components/BylawyerLinkPanel.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Building2, Link, Unlink, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import {
  bylawSync,
  type MeetingOrganizationResponse,
  type OrganizationWithRole,
} from '../../../api/client';
import { useToast } from '../../../context/ToastContext';
import { atLeast } from '../../../utils/roles';

interface BylawyerLinkPanelProps {
  meetingCode: string;
  suggestedOrgId?: string;
}

/**
 * Links this live meeting to one of the user's organizations, so a bylaw amendment passed in it
 * reaches that organization's documents. Linking and unlinking need the secretary role there.
 */
export function BylawyerLinkPanel({ meetingCode, suggestedOrgId }: BylawyerLinkPanelProps) {
  const { showToast } = useToast();
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>([]);
  const [linkedOrg, setLinkedOrg] = useState<MeetingOrganizationResponse | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // Only the organizations where the user may link a meeting
  const linkable = organizations.filter((org) => atLeast(org.role, 'secretary'));
  // The organization selected in the header, when the user may link to it
  const suggested = linkable.find((org) => org.id === suggestedOrgId) ?? null;
  const chosenOrgId = selectedOrgId || suggested?.id || '';

  // An unlinked meeting (404) comes back from the client as not linked
  const fetchLinkedOrg = useCallback(async () => {
    if (!meetingCode) return;
    try {
      setLinkedOrg(await bylawSync.getMeetingOrganization(meetingCode));
    } catch (err) {
      console.error('Error fetching linked organization:', err);
    }
  }, [meetingCode]);

  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setOrganizations(await bylawSync.getOrganizations());
      setUnavailable(false);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrganizations();
    void fetchLinkedOrg();
  }, [fetchOrganizations, fetchLinkedOrg]);

  const handleLink = async () => {
    if (!chosenOrgId || !meetingCode) return;
    try {
      setLoading(true);
      await bylawSync.linkMeeting(meetingCode, chosenOrgId);
      await fetchLinkedOrg();
      setSelectedOrgId('');
      showToast('success', 'Meeting linked to the organization');
    } catch (err) {
      // "That meeting code is already in use": the code belongs to another organization
      showToast('error', err instanceof Error ? err.message : 'Failed to link the meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!meetingCode) return;
    try {
      setLoading(true);
      await bylawSync.unlinkMeeting(meetingCode);
      setLinkedOrg({ linked: false, organization: null });
      showToast('success', 'Meeting unlinked from the organization');
    } catch (err) {
      // "Remove the agenda and attachments first" for a scheduled meeting
      showToast('error', err instanceof Error ? err.message : 'Failed to unlink the meeting');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    void fetchOrganizations();
    void fetchLinkedOrg();
  };

  const linked = linkedOrg?.linked ? linkedOrg.organization : null;
  const canUnlink = linked !== null && linkable.some((org) => org.id === linked.id);

  if (unavailable) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-800">
          <Building2 size={18} />
          Organization
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <AlertCircle className="mx-auto text-gray-400 mb-2" size={24} />
          <p className="text-gray-500 text-sm">Couldn't load your organizations</p>
          <button
            onClick={handleRefresh}
            className="mt-2 text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1 mx-auto"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2 text-gray-800">
          <Building2 size={18} />
          Organization
        </h3>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-gray-400 hover:text-gray-600 p-1"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {linked ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Link className="text-green-600" size={16} />
              <span className="font-medium text-green-800">Linked to</span>
            </div>
            <p className="text-green-900 font-semibold">{linked.name}</p>
            {linked.description && (
              <p className="text-green-700 text-sm mt-1">{linked.description}</p>
            )}
            <RouterLink
              to="/"
              className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 text-sm mt-2"
            >
              View Documents
              <ExternalLink size={12} />
            </RouterLink>
          </div>

          {canUnlink && (
            <button
              onClick={handleUnlink}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <Unlink size={16} />
              Unlink Organization
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-gray-600 text-sm">
            Link this meeting to one of your organizations to amend its bylaws from the meeting.
          </p>

          {linkedOrg?.warning && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-amber-700 text-sm">{linkedOrg.warning}</p>
            </div>
          )}

          {linkable.length > 0 ? (
            <>
              <div className="flex gap-2">
                <select
                  aria-label="Organization"
                  value={chosenOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  disabled={loading}
                  className="flex-1 p-2 border border-gray-300 rounded-lg bg-white disabled:bg-gray-100"
                >
                  <option value="">Select an organization...</option>
                  {linkable.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                      {org.id === suggestedOrgId ? ' (Current)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLink}
                  disabled={loading || !chosenOrgId}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <Link size={16} />
                  Link
                </button>
              </div>
              {suggested && (
                <p className="text-indigo-600 text-xs">
                  Suggested: {suggested.name} (your current organization)
                </p>
              )}
            </>
          ) : (
            !loading && (
              <p className="text-gray-500 text-sm italic">
                You need the secretary role in an organization to link this meeting.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: The socket's terms refusal**

In `hooks/useSocketConnection.ts`, add the import:

```ts
import { TERMS_NOT_ACCEPTED } from '../../../api/client';
```

Replace the signature:

```ts
export function useSocketConnection(
  meetingCode: string | null,
  onNotSignedIn: () => void,
): UseSocketConnectionReturn {
```

with:

```ts
export function useSocketConnection(
  meetingCode: string | null,
  onNotSignedIn: () => void,
  onTermsNotAccepted?: () => void,
): UseSocketConnectionReturn {
```

After the effect that updates `onNotSignedInRef`, add:

```ts
const onTermsNotAcceptedRef = useRef(onTermsNotAccepted);
useEffect(() => {
  onTermsNotAcceptedRef.current = onTermsNotAccepted;
}, [onTermsNotAccepted]);
```

In the `connect_error` handler, replace:

```ts
if (err.message === 'Not signed in') {
  onNotSignedInRef.current();
  return;
}
```

with:

```ts
if (err.message === 'Not signed in') {
  onNotSignedInRef.current();
  return;
}
// The user hasn't accepted the current terms: the app shows the terms step, and this
// connects again once they have
if (err.data?.code === TERMS_NOT_ACCEPTED) {
  onTermsNotAcceptedRef.current?.();
  return;
}
```

In `context/SocketContext.tsx`, replace:

```tsx
const { user } = useSession();
```

with:

```tsx
const { user, markTermsNotAccepted } = useSession();
```

and replace:

```tsx
const connection = useSocketConnection(meetingCode, handleNotSignedIn);
```

with:

```tsx
// Refused for the terms: RequireSession shows the terms step in place of this module
const connection = useSocketConnection(meetingCode, handleNotSignedIn, markTermsNotAccepted);
```

- [ ] **Step 8: Run everything**

Run: `TZ=America/Chicago npx vitest run && npx tsc --noEmit -p . && npx eslint src`
Expected: all pass; type-check clean; eslint reports no errors (warnings that were there before may remain). `grep -rn "getOrCreatePacket" src` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add src/modules/meetings
git commit -m "feat(web): schedule meetings in the current organization"
```

---

### Task 8: The Maple Grove HOA demo seed (server)

**Files:**

- Create: `backend-node/src/demo/demoSeed.ts`, `backend-node/src/scripts/seedDemo.ts`
- Modify: `backend-node/package.json`
- Test: `backend-node/src/__integration__/demoSeed.test.ts`

Work in `backend-node/`.

**What it makes** (the roadmap's acceptance scenario, before the meeting):

- 17 people, all named and with the current terms accepted: Pat Lindqvist (owner, keeps the records), Dana Okafor (admin, the president), Ray Castillo (secretary role, the treasurer), twelve homeowners (member) and two viewers. Emails are `<first name>@maplegrove.example`.
- The organization "Maple Grove HOA", slug `maple-grove-hoa`.
- "Bylaws of Maple Grove Homeowners Association", version 1, effective and adopted 2024-03-15: Articles I to VI with 23 sections (29 sections in all), including Section 4.2 Quorum at twenty percent.
- A draft amendment by Pat, "Lower the quorum to 15%", with one modify change on Section 4.2.
- The meeting record "2025 Annual Meeting" (completed).
- The meeting packet "2026 Annual Meeting" with code `MAPLE1` and the scenario's seven agenda items. (The budget PDF from the scenario needs an uploaded file; the seed leaves it out.)

It refuses to run when an organization has the slug, unless `--reset`: then it deletes that organization (the cascade removes its memberships, invites, documents, packets and meeting records, and the seed deletes its uploaded files as the delete route does) and creates it again. People are updated, never deleted. It also refuses when another organization holds the code `MAPLE1`.

- [ ] **Step 1: Write the failing test**

`src/__integration__/demoSeed.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { prisma } from '../db/prisma.js';
import { DEMO_MEETING_CODE, DEMO_SLUG, DemoSeedError, seedDemo } from '../demo/demoSeed.js';
import { resetDatabase } from './db.js';

describe('demo seed', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('creates Maple Grove HOA with its people, bylaws, amendment, meeting and packet', async () => {
    const summary = await seedDemo();
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: DEMO_SLUG } });
    expect(summary.organizationId).toBe(org.id);

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: org.id },
      include: { user: true },
    });
    const byRole: Record<string, number> = {};
    for (const member of members) byRole[member.role] = (byRole[member.role] ?? 0) + 1;
    expect(byRole).toEqual({ owner: 1, admin: 1, secretary: 1, member: 12, viewer: 2 });
    expect(members.every((m) => m.user.name && m.user.termsVersion === TERMS_VERSION)).toBe(true);
    expect(members.find((m) => m.role === 'admin')?.user.name).toBe('Dana Okafor');

    const document = await prisma.document.findFirstOrThrow({
      where: { organizationId: org.id },
      include: { versions: true },
    });
    expect(document.versions).toHaveLength(1);
    expect(document.currentVersionId).toBe(document.versions[0].id);
    expect(document.versions[0].effectiveDate?.toISOString().slice(0, 10)).toBe('2024-03-15');

    const sections = await prisma.section.findMany({
      where: { versionId: document.versions[0].id },
    });
    expect(sections).toHaveLength(29);
    expect(summary.sections).toBe(29);
    expect(sections.filter((s) => s.parentId === null)).toHaveLength(6);
    const quorum = sections.find((s) => s.numberLabel === 'Section 4.2');
    expect(quorum?.content).toContain('twenty percent (20%)');

    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { documentId: document.id },
      include: { changes: true },
    });
    expect(amendment).toMatchObject({ title: 'Lower the quorum to 15%', status: 'draft' });
    expect(amendment.changes).toMatchObject([
      { changeType: 'modify', targetSectionId: quorum?.id },
    ]);

    expect(await prisma.meeting.count({ where: { organizationId: org.id } })).toBe(1);
    const packet = await prisma.meetingPacket.findUniqueOrThrow({
      where: { robbieCode: DEMO_MEETING_CODE },
      include: { agendaItems: true },
    });
    expect(packet).toMatchObject({ organizationId: org.id, title: '2026 Annual Meeting' });
    expect(packet.agendaItems).toHaveLength(7);
  });

  it('refuses to run again without reset', async () => {
    await seedDemo();
    await expect(seedDemo()).rejects.toBeInstanceOf(DemoSeedError);
    expect(await prisma.organization.count()).toBe(1);
  });

  it('replaces the organization on reset and keeps the people', async () => {
    const first = await seedDemo();
    const pat = await prisma.user.findUniqueOrThrow({ where: { email: 'pat@maplegrove.example' } });

    const second = await seedDemo({ reset: true });

    expect(second.organizationId).not.toBe(first.organizationId);
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.user.count()).toBe(17);
    const patAgain = await prisma.user.findUniqueOrThrow({
      where: { email: 'pat@maplegrove.example' },
    });
    expect(patAgain.id).toBe(pat.id);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/demoSeed.test.ts`
Expected: FAIL, `../demo/demoSeed.js` not found.

- [ ] **Step 3: Create `src/demo/demoSeed.ts`**

```ts
/**
 * The Maple Grove HOA demo from docs/mvp-roadmap.md: an organization with its people, bylaws, a
 * draft amendment, last year's meeting record and the packet for this year's annual meeting
 */

import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import type { OrgRole, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { deleteFiles } from '../bylawyer/services/fileStorage.js';

export const DEMO_SLUG = 'maple-grove-hoa';
export const DEMO_MEETING_CODE = 'MAPLE1';

type Tx = Prisma.TransactionClient;

/** Why the seed didn't run: the demo, or its meeting code, is already there */
export class DemoSeedError extends Error {}

export interface DemoPerson {
  email: string;
  name: string;
  role: OrgRole;
}

/** Pat keeps the records (owner), Dana chairs (admin), Ray is the treasurer (secretary) */
export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { email: 'pat@maplegrove.example', name: 'Pat Lindqvist', role: 'owner' },
  { email: 'dana@maplegrove.example', name: 'Dana Okafor', role: 'admin' },
  { email: 'ray@maplegrove.example', name: 'Ray Castillo', role: 'secretary' },
  { email: 'alice@maplegrove.example', name: 'Alice Brennan', role: 'member' },
  { email: 'ben@maplegrove.example', name: 'Ben Whitaker', role: 'member' },
  { email: 'carmen@maplegrove.example', name: 'Carmen Diaz', role: 'member' },
  { email: 'david@maplegrove.example', name: 'David Nguyen', role: 'member' },
  { email: 'elena@maplegrove.example', name: 'Elena Petrova', role: 'member' },
  { email: 'frank@maplegrove.example', name: 'Frank Osei', role: 'member' },
  { email: 'grace@maplegrove.example', name: 'Grace Kim', role: 'member' },
  { email: 'hector@maplegrove.example', name: 'Hector Ramos', role: 'member' },
  { email: 'irene@maplegrove.example', name: 'Irene Walsh', role: 'member' },
  { email: 'james@maplegrove.example', name: 'James Holloway', role: 'member' },
  { email: 'keiko@maplegrove.example', name: 'Keiko Tanaka', role: 'member' },
  { email: 'luis@maplegrove.example', name: 'Luis Moreno', role: 'member' },
  { email: 'morgan@maplegrove.example', name: 'Morgan Lee', role: 'viewer' },
  { email: 'sam@maplegrove.example', name: 'Sam Ortiz', role: 'viewer' },
];

interface DemoSection {
  label: string;
  title: string;
  content: string;
}

interface DemoArticle {
  label: string;
  title: string;
  sections: DemoSection[];
}

const QUORUM_LABEL = 'Section 4.2';

const BYLAWS: readonly DemoArticle[] = [
  {
    label: 'Article I',
    title: 'Name and Purpose',
    sections: [
      {
        label: 'Section 1.1',
        title: 'Name',
        content:
          'The name of this corporation is Maple Grove Homeowners Association, Inc., referred to in these Bylaws as the "Association".',
      },
      {
        label: 'Section 1.2',
        title: 'Purpose',
        content:
          'The Association maintains the common areas of the Maple Grove subdivision, enforces the Declaration of Covenants, Conditions and Restrictions, and promotes the welfare of its residents.',
      },
      {
        label: 'Section 1.3',
        title: 'Principal Office',
        content:
          'The principal office of the Association is the Maple Grove Clubhouse, 400 Maple Grove Drive, or another place the Board designates.',
      },
    ],
  },
  {
    label: 'Article II',
    title: 'Membership and Voting Rights',
    sections: [
      {
        label: 'Section 2.1',
        title: 'Membership',
        content:
          'Every owner of a lot in Maple Grove is a member of the Association. Membership belongs to the lot and cannot be separated from it.',
      },
      {
        label: 'Section 2.2',
        title: 'Voting Rights',
        content:
          'Each lot has one vote. When a lot has more than one owner, the owners decide among themselves how its vote is cast; the vote cannot be split.',
      },
      {
        label: 'Section 2.3',
        title: 'Good Standing',
        content:
          'A member whose assessments are more than sixty days past due may not vote until the account is brought current.',
      },
      {
        label: 'Section 2.4',
        title: 'Proxies',
        content:
          'A member may vote by written proxy, dated and signed, and filed with the Secretary before the meeting. A proxy expires eleven months after its date.',
      },
    ],
  },
  {
    label: 'Article III',
    title: 'Board of Directors',
    sections: [
      {
        label: 'Section 3.1',
        title: 'Number',
        content:
          'The affairs of the Association are managed by a Board of five directors, each of whom must be a member in good standing.',
      },
      {
        label: 'Section 3.2',
        title: 'Election and Term',
        content:
          'Directors are elected at the annual meeting for staggered two-year terms. Two directors are elected in even-numbered years and three in odd-numbered years.',
      },
      {
        label: 'Section 3.3',
        title: 'Vacancies',
        content:
          'A vacancy on the Board is filled by a majority of the remaining directors. The person chosen serves the rest of the term.',
      },
      {
        label: 'Section 3.4',
        title: 'Officers',
        content:
          'Each year the Board elects a President, a Secretary and a Treasurer from among its directors.',
      },
    ],
  },
  {
    label: 'Article IV',
    title: 'Meetings of Members',
    sections: [
      {
        label: 'Section 4.1',
        title: 'Annual Meeting',
        content:
          'The annual meeting of the members is held each year at a date, time and place set by the Board.',
      },
      {
        label: QUORUM_LABEL,
        title: 'Quorum',
        content:
          'The presence, in person or by proxy, of members holding twenty percent (20%) of the votes of the Association constitutes a quorum at any meeting of the members.',
      },
      {
        label: 'Section 4.3',
        title: 'Notice',
        content:
          'Written notice of each meeting of the members, stating its place, date and hour, is mailed or emailed to every member at least ten and no more than sixty days before the meeting.',
      },
      {
        label: 'Section 4.4',
        title: 'Special Meetings',
        content:
          'The President, a majority of the Board, or members holding ten percent of the votes may call a special meeting of the members.',
      },
      {
        label: 'Section 4.5',
        title: 'Rules of Order',
        content:
          "Robert's Rules of Order Newly Revised governs meetings of the members in all cases where it is consistent with these Bylaws and the Declaration.",
      },
    ],
  },
  {
    label: 'Article V',
    title: 'Assessments',
    sections: [
      {
        label: 'Section 5.1',
        title: 'Annual Assessment',
        content:
          'Each lot is subject to an annual assessment set by the Board in the budget it adopts before the start of each fiscal year.',
      },
      {
        label: 'Section 5.2',
        title: 'Due Date',
        content:
          'The annual assessment is due on January 31. An assessment not paid within thirty days of its due date incurs a late fee of twenty-five dollars.',
      },
      {
        label: 'Section 5.3',
        title: 'Special Assessments',
        content:
          'A special assessment for a capital improvement requires a majority of the votes cast at a meeting of the members at which a quorum is present.',
      },
      {
        label: 'Section 5.4',
        title: 'Reserve Fund',
        content:
          'The Association keeps a reserve fund for the repair and replacement of the common areas, funded with at least ten percent of the annual assessments.',
      },
    ],
  },
  {
    label: 'Article VI',
    title: 'Amendments',
    sections: [
      {
        label: 'Section 6.1',
        title: 'Proposal',
        content:
          'An amendment to these Bylaws may be proposed by the Board or by a petition signed by members holding ten percent of the votes.',
      },
      {
        label: 'Section 6.2',
        title: 'Adoption',
        content:
          'These Bylaws may be amended at a meeting of the members by two thirds of the votes cast, if the text of the amendment was included in the notice of the meeting.',
      },
      {
        label: 'Section 6.3',
        title: 'Effective Date',
        content: 'An amendment takes effect when it is adopted, unless it states a later date.',
      },
    ],
  },
];

const LOWER_QUORUM =
  'The presence, in person or by proxy, of members holding fifteen percent (15%) of the votes of the Association constitutes a quorum at any meeting of the members.';

const AGENDA = [
  { title: 'Call to order', estimatedMinutes: 2, presenter: 'Dana Okafor' },
  {
    title: 'Approval of the minutes of the 2025 annual meeting',
    estimatedMinutes: 5,
    presenter: 'Pat Lindqvist',
  },
  {
    title: "Treasurer's report and the 2027 budget",
    estimatedMinutes: 15,
    presenter: 'Ray Castillo',
  },
  { title: 'Old business: pool resurfacing contract', estimatedMinutes: 20 },
  { title: 'New business: amend Section 4.2 to lower the quorum to 15%', estimatedMinutes: 20 },
  { title: 'Election of two directors', estimatedMinutes: 25 },
  { title: 'Adjournment', estimatedMinutes: 1 },
];

export interface DemoSeedSummary {
  organizationId: string;
  people: number;
  /** Articles and their sections */
  sections: number;
  agendaItems: number;
}

/**
 * Create the demo. Refuses when an organization has the demo's slug, unless reset, which
 * deletes that organization first; people are updated, never deleted.
 */
export async function seedDemo(options: { reset?: boolean } = {}): Promise<DemoSeedSummary> {
  const existing = await prisma.organization.findUnique({
    where: { slug: DEMO_SLUG },
    select: { id: true },
  });
  if (existing && !options.reset) {
    throw new DemoSeedError(
      `An organization with the slug "${DEMO_SLUG}" already exists. Run with --reset to replace it.`,
    );
  }
  if (existing) await deleteOrganization(existing.id);

  const codeTaken = await prisma.meetingPacket.findUnique({
    where: { robbieCode: DEMO_MEETING_CODE },
    select: { id: true },
  });
  if (codeTaken) {
    throw new DemoSeedError(
      `Another organization has the meeting code ${DEMO_MEETING_CODE}. Delete its packet first.`,
    );
  }

  return prisma.$transaction((tx) => create(tx), { timeout: 30_000 });
}

/** Delete an organization, and the uploaded files its cascade would leave on disk */
async function deleteOrganization(organizationId: string): Promise<void> {
  const uploads = await prisma.attachment.findMany({
    where: {
      type: 'uploaded_file',
      OR: [{ meetingPacket: { organizationId } }, { agendaItem: { packet: { organizationId } } }],
    },
    select: { storagePath: true },
  });
  await prisma.organization.delete({ where: { id: organizationId } });
  await deleteFiles(uploads.map((upload) => upload.storagePath));
}

async function create(tx: Tx): Promise<DemoSeedSummary> {
  const now = new Date();

  // The people, named and with the current terms accepted, so they sign in straight to the app
  const userIds = new Map<string, number>();
  for (const person of DEMO_PEOPLE) {
    const user = await tx.user.upsert({
      where: { email: person.email },
      update: { name: person.name, termsVersion: TERMS_VERSION, termsAcceptedAt: now },
      create: {
        email: person.email,
        name: person.name,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: now,
      },
      select: { id: true },
    });
    userIds.set(person.email, user.id);
  }
  const idOf = (email: string) => userIds.get(email)!;

  const organization = await tx.organization.create({
    data: {
      name: 'Maple Grove HOA',
      slug: DEMO_SLUG,
      description:
        'The homeowners association of the Maple Grove subdivision: 142 lots, the clubhouse, the pool and the common areas.',
      members: {
        create: DEMO_PEOPLE.map((person) => ({ userId: idOf(person.email), role: person.role })),
      },
    },
  });

  // The bylaws, version 1
  const document = await tx.document.create({
    data: {
      organizationId: organization.id,
      title: 'Bylaws of Maple Grove Homeowners Association',
      docType: 'bylaws',
    },
  });
  const adopted = new Date('2024-03-15');
  const version = await tx.version.create({
    data: {
      documentId: document.id,
      versionNumber: 1,
      effectiveDate: adopted,
      adoptedAt: adopted,
      notes: 'Adopted at the 2024 annual meeting',
    },
  });
  let sections = 0;
  let quorumSectionId: string | null = null;
  for (const [articleIndex, article] of BYLAWS.entries()) {
    const parent = await tx.section.create({
      data: {
        versionId: version.id,
        position: articleIndex,
        numberLabel: article.label,
        title: article.title,
      },
    });
    sections++;
    for (const [sectionIndex, section] of article.sections.entries()) {
      const child = await tx.section.create({
        data: {
          versionId: version.id,
          parentId: parent.id,
          position: sectionIndex,
          numberLabel: section.label,
          title: section.title,
          content: section.content,
        },
      });
      sections++;
      if (section.label === QUORUM_LABEL) quorumSectionId = child.id;
    }
  }
  await tx.document.update({
    where: { id: document.id },
    data: { currentVersionId: version.id },
  });

  // The amendment the annual meeting takes up as new business
  await tx.amendment.create({
    data: {
      documentId: document.id,
      title: 'Lower the quorum to 15%',
      description:
        'The last three annual meetings fell short of the 20% quorum. Lowering it to 15% lets the annual meeting do its business.',
      createdById: idOf('pat@maplegrove.example'),
      changes: {
        create: {
          changeType: 'modify',
          targetSectionId: quorumSectionId,
          newContent: LOWER_QUORUM,
          position: 0,
        },
      },
    },
  });

  // Last year's meeting, whose minutes this year's approves
  await tx.meeting.create({
    data: {
      organizationId: organization.id,
      title: '2025 Annual Meeting',
      meetingType: 'annual',
      scheduledDate: new Date('2025-03-20T19:00:00-05:00'),
      location: 'Maple Grove Clubhouse',
      status: 'completed',
      notes: 'Quorum was not reached; the meeting adjourned after the reports.',
    },
  });

  // This year's annual meeting, scheduled with its agenda
  await tx.meetingPacket.create({
    data: {
      organizationId: organization.id,
      robbieCode: DEMO_MEETING_CODE,
      title: '2026 Annual Meeting',
      description: 'Maple Grove Clubhouse, 400 Maple Grove Drive',
      scheduledFor: new Date('2026-10-20T19:00:00-05:00'),
      agendaItems: { create: AGENDA.map((item, position) => ({ ...item, position })) },
    },
  });

  return {
    organizationId: organization.id,
    people: DEMO_PEOPLE.length,
    sections,
    agendaItems: AGENDA.length,
  };
}
```

- [ ] **Step 4: Create `src/scripts/seedDemo.ts` and the npm script**

```ts
/**
 * Create the Maple Grove HOA demo (docs/mvp-roadmap.md) in the database DATABASE_URL names
 *
 * Usage: npm run seed:demo -w backend-node [-- --reset]
 */

/* eslint-disable no-console -- CLI output */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma } from '../db/prisma.js';
import { DEMO_MEETING_CODE, DEMO_PEOPLE, DEMO_SLUG, seedDemo } from '../demo/demoSeed.js';

const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });

try {
  const summary = await seedDemo({ reset: values.reset });
  console.log(
    `Created Maple Grove HOA (${DEMO_SLUG}): ${summary.people} people, bylaws version 1 with ${summary.sections} sections, a draft amendment, the 2025 annual meeting record, and the packet for meeting ${DEMO_MEETING_CODE} with ${summary.agendaItems} agenda items.`,
  );
  console.log('');
  console.log('People (all have accepted the current terms):');
  for (const person of DEMO_PEOPLE) {
    console.log(`  ${person.role.padEnd(9)} ${person.name} <${person.email}>`);
  }
  console.log('');
  console.log(
    'To sign in as one of them, run the server with ENABLE_TEST_AUTH=true and use the code 000000.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
```

In `package.json`, add after the `"org:add-member"` script (and add a comma after it):

```json
    "seed:demo": "tsx src/scripts/seedDemo.ts"
```

- [ ] **Step 5: Run it to see it pass**

Run: `INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -- src/__integration__/demoSeed.test.ts && npx tsc --noEmit -p .`
Expected: 3 passed; type-check clean.

Then run the script against the throwaway database:

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run seed:demo -- --reset`
Expected: the first line is "Created Maple Grove HOA (maple-grove-hoa): 17 people, bylaws version 1 with 29 sections, a draft amendment, the 2025 annual meeting record, and the packet for meeting MAPLE1 with 7 agenda items.", then the 17 people and the sign-in line. Running it again without `-- --reset` prints 'An organization with the slug "maple-grove-hoa" already exists. Run with --reset to replace it.' and exits with status 1. (The integration tests empty this database, so run the seed after them.)

- [ ] **Step 6: Commit**

```bash
git add src/demo src/scripts/seedDemo.ts src/__integration__/demoSeed.test.ts package.json
git commit -m "feat(server): add the Maple Grove HOA demo seed"
```

---

### Task 9: Live check in a browser (web)

**Files:** none (verification only).

The Vite dev server proxies `/api` and `/socket.io` to port 3001, so the backend runs on 3001; its database is the throwaway Postgres on 55432.

- [ ] **Step 1: Prepare the database and the seed**

From the repository root, if `docker ps --filter name=robbie-ci-pg` lists nothing, start it with the command in the conventions. Then:

```bash
npm run build:shared && cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx prisma migrate deploy && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run seed:demo -- --reset
```

Expected: the migrations apply (or "No pending migrations to apply"), then "Created Maple Grove HOA (maple-grove-hoa): 17 people, bylaws version 1 with 29 sections, ..." and the list of people.

- [ ] **Step 2: Start the server and the web app**

- Check that nothing listens on 3001 or 5173: `ss -ltn | grep -E ':(3001|5173) '` prints nothing.
- Backend: from `backend-node`, run `npm run build`, then `node dist/index.js` in the background with these environment variables, and record its PID:
  - `PORT=3001`;
  - `DATABASE_URL` and `DIRECT_URL` set to `postgresql://postgres:postgres@localhost:55432/robbie`;
  - `ENABLE_TEST_AUTH=true` (the code `000000` signs in any email);
  - `ADMIN_EMAILS=dana@maplegrove.example`;
  - `RESEND_API_KEY=` and `EMAIL_FROM=` (both empty: emails are logged, not sent).
- Web: from `frontend-unified`, run `npx vite --port 5173` in the background, and record its PID.

- [ ] **Step 3: Walk through it with the Playwright MCP browser**

1. **A new user.** Open `http://localhost:5173/`; it redirects to `/sign-in`. Sign in as `newcomer@example.org` with code `000000`. The name step shows "Your name" and the checkbox "I'm 13 or older and I agree to the Terms of Service and Privacy Policy"; Continue is disabled. Click "Terms of Service": a new tab shows the terms with "Draft, not yet reviewed by a lawyer."; close it. Enter "New Comer", tick the box, Continue. The home page shows "No organizations yet" and "Create an organization, or ask your organization's secretary to add newcomer@example.org." The header says "Robbie", and the tab title is "Robbie".
2. **A seeded user.** Open the user menu, Sign out. Sign in as `pat@maplegrove.example` with `000000`: no name step and no terms step; the dashboard says "Welcome to Maple Grove HOA".
3. **The switcher.** Open it: "Maple Grove HOA" with "Owner" under it, then "New organization".
4. **Members.** Go to Settings. The Members card lists the 17 seeded people; Dana Okafor shows a role menu set to Admin, and Pat Lindqvist's row says "(you)" with no menu.
5. **Add someone.** Add `newhomeowner@example.org` as Member. The card says "newhomeowner@example.org will join as Member the first time they sign in." (without a provider, the server logs the email and counts it as sent), and "Waiting to sign in" lists the address with Cancel.
6. **Change a role.** Set Luis Moreno to Secretary. The card says "Luis Moreno is now Secretary."
7. **Cancel the addition.** Click Cancel by `newhomeowner@example.org`. The card says "newhomeowner@example.org won't be added." and the waiting list no longer shows it.
8. **Schedule a meeting.** Go to Live Meetings, click "Schedule a New Meeting", enter the title "Board Meeting", click "Next: Build Agenda". The agenda builder appears under the meeting code. Note the code, open `http://localhost:5173/api/packets/<code>` in the same tab, and see JSON with `"title":"Board Meeting"` and an `organizationId`. Go back.
9. **A viewer.** Sign out, sign in as `morgan@maplegrove.example`. Open "Bylaws of Maple Grove Homeowners Association" from the sidebar: there is no "New Document" in the sidebar, and the document has no "New Version", "Add Section", "Share" or "Propose Amendment", and no drag handles or edit buttons on sections. Settings shows the members with role badges only, no "Add by email", no Edit, and Leave but no Delete. Live Meetings has no "Schedule a New Meeting".
10. **Terms that changed.** Clear Dana's acceptance:

    ```bash
    docker exec robbie-ci-pg psql -U postgres -d robbie -c "UPDATE \"User\" SET \"termsVersion\" = NULL WHERE email = 'dana@maplegrove.example'"
    ```

    Sign out, sign in as `dana@maplegrove.example`: "Before you go on" appears with the checkbox. Tick it and Continue: the dashboard loads.

Note anything that differs in the report, with a screenshot.

- [ ] **Step 4: Stop both servers by PID**

Remove any `.playwright-mcp/` folder the browser tool created in the repository.

---

### Task 10: Terms on mobile

**Files:**

- Create: `mobile/components/TermsAgreement.tsx`, `mobile/app/terms.tsx`
- Modify: `mobile/lib/api.ts`, `mobile/app.config.js`, `mobile/context/SessionContext.tsx`, `mobile/app/(auth)/name.tsx`, `mobile/app/_layout.tsx`, `mobile/context/SocketContext.tsx`
- Test: `mobile/__tests__/lib/api.test.ts`, `mobile/__tests__/context/SessionContext.test.tsx`, `mobile/__tests__/app/layout.test.tsx`, `mobile/__tests__/app/auth-screens.test.tsx`, `mobile/__tests__/context/SocketContext.test.tsx`

Work in `mobile/`. Nothing else changes on mobile.

**Behavior:**

- `getMe(token)` returns `{ user, termsAccepted }` or null; `acceptTerms(token)` posts `TERMS_VERSION` and returns false when the token no longer works.
- The session keeps `termsAccepted`; after `verify` it asks `getMe` (the verify answer has only the user), and assumes not accepted if that fails. `acceptTerms()` and `markTermsNotAccepted()` mirror the web.
- The name screen shows the checkbox when the terms aren't accepted and accepts them before setting the name (the same order and reason as the web).
- The root layout, after the name check: a signed-in user who hasn't accepted the current terms goes to `/terms`, as `unreachable` goes to `/offline`.
- The terms screen has the checkbox, Continue and Sign out, like `offline.tsx`.
- The socket connects only once the terms are accepted. A `connect_error` with `data.code === 'TERMS_NOT_ACCEPTED'` calls `markTermsNotAccepted()`; the layout shows the terms screen, and the socket connects again once they are accepted.
- The links open the web pages with `Linking.openURL(getWebUrl() + '/terms')`. `getWebUrl()` reads `extra.webUrl`, which `app.config.js` sets from `EXPO_PUBLIC_WEB_URL` and otherwise from the API URL: in production the web app and the API share an origin (CLAUDE.md). In development, set `EXPO_PUBLIC_WEB_URL=http://localhost:5173` to open the local pages.

- [ ] **Step 1: Write the failing tests**

In `__tests__/lib/api.test.ts`, replace the first import with:

```ts
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { acceptTerms, getMe, requestCode, signOut, updateName, verifyCode } from '../../lib/api';
```

and append:

```ts
describe('terms calls', () => {
  it('reads whether the user accepted the current terms', async () => {
    const user = { id: 1, email: 'a@b.c', name: 'A' };
    globalThis.fetch = jest.fn(
      async () => new Response(JSON.stringify({ user, termsAccepted: false })),
    ) as jest.Mock;
    expect(await getMe('tok')).toEqual({ user, termsAccepted: false });
  });

  it('accepts the terms version this app shows', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ termsAccepted: true })));
    globalThis.fetch = fetchMock as jest.Mock;
    expect(await acceptTerms('tok')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/accept-terms$/);
    expect(JSON.parse(init.body as string)).toEqual({ version: TERMS_VERSION });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it("shows the server's message when the terms changed", async () => {
    respond(
      409,
      JSON.stringify({ error: 'The terms have changed. Reload to see the current terms.' }),
    );
    await expect(acceptTerms('tok')).rejects.toThrow('The terms have changed');
  });

  it('reports a token that no longer works', async () => {
    respond(401, JSON.stringify({ error: 'Not signed in' }));
    expect(await acceptTerms('old')).toBe(false);
  });
});
```

Replace `__tests__/context/SessionContext.test.tsx` with:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

jest.mock('../../lib/storage', () => ({
  getToken: jest.fn(),
  storeToken: jest.fn(async () => {}),
  removeToken: jest.fn(async () => {}),
}));
jest.mock('../../lib/api', () => ({
  getMe: jest.fn(),
  requestCode: jest.fn(async () => {}),
  verifyCode: jest.fn(),
  updateName: jest.fn(),
  acceptTerms: jest.fn(async () => true),
  signOut: jest.fn(async () => {}),
}));

import * as storage from '../../lib/storage';
import * as api from '../../lib/api';
import { SessionProvider, useSession } from '../../context/SessionContext';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SessionProvider>{children}</SessionProvider>
);
const ann = { id: 1, email: 'ann@example.org', name: 'Ann' };
type TestUser = { id: number; email: string; name: string | null };
/** What getMe answers for a signed-in user */
const me = (user: TestUser = ann, termsAccepted = true) => ({ user, termsAccepted });

async function restored(answer = me()) {
  (storage.getToken as jest.Mock).mockResolvedValue('tok');
  (api.getMe as jest.Mock).mockResolvedValue(answer);
  const hook = await renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe('signedIn'));
  return hook;
}

describe('SessionProvider (mobile)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores the session and the terms acceptance from the secure store on launch', async () => {
    const { result } = await restored(me(ann, false));
    expect(result.current.user).toEqual(ann);
    expect(result.current.token).toBe('tok');
    expect(result.current.termsAccepted).toBe(false);
  });

  it('forgets a token the server no longer accepts', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('old');
    (api.getMe as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(storage.removeToken).toHaveBeenCalled();
  });

  it('signs in, checks the terms, stores the token, and signs out', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    (api.verifyCode as jest.Mock).mockResolvedValue({ user: ann, token: 'new' });
    (api.getMe as jest.Mock).mockResolvedValue(me(ann, false));
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(storage.storeToken).toHaveBeenCalledWith('new');
    expect(api.getMe).toHaveBeenCalledWith('new');
    expect(result.current.status).toBe('signedIn');
    expect(result.current.termsAccepted).toBe(false);

    await act(() => result.current.signOut());
    expect(api.signOut).toHaveBeenCalledWith('new');
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });

  it("asks for the terms after signing in when they couldn't be checked", async () => {
    (storage.getToken as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));

    (api.verifyCode as jest.Mock).mockResolvedValue({ user: ann, token: 'new' });
    (api.getMe as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await act(() => result.current.verify('ann@example.org', '123456'));
    expect(result.current.user).toEqual(ann);
    expect(result.current.termsAccepted).toBe(false);
  });

  it('accepts the current terms', async () => {
    const { result } = await restored(me(ann, false));
    await act(() => result.current.acceptTerms());
    expect(api.acceptTerms).toHaveBeenCalledWith('tok');
    expect(result.current.termsAccepted).toBe(true);
  });

  it('forgets the token when accepting finds it no longer works', async () => {
    const { result } = await restored(me(ann, false));
    (api.acceptTerms as jest.Mock).mockResolvedValueOnce(false);
    await act(() => result.current.acceptTerms());
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });

  it('shows the terms screen again when told the terms are not accepted', async () => {
    const { result } = await restored();
    await act(async () => result.current.markTermsNotAccepted());
    expect(result.current.termsAccepted).toBe(false);
  });

  it('treats an unreadable secure store as signed out', async () => {
    (storage.getToken as jest.Mock).mockRejectedValue(new Error('Could not decrypt'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it("keeps the token when the server can't be reached at launch", async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    expect(result.current.token).toBe('tok');
    expect(storage.removeToken).not.toHaveBeenCalled();
  });

  it('is signed in when a retry reaches the server', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockRejectedValueOnce(new Error("Couldn't load your account"));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));

    (api.getMe as jest.Mock).mockResolvedValueOnce(me());
    await act(() => result.current.retry());
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual(ann);
  });

  it('retries when the app comes back to the foreground', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('tok');
    (api.getMe as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unreachable'));

    const calls = (AppState.addEventListener as jest.Mock).mock.calls;
    const onChange = calls[calls.length - 1][1] as (state: string) => void;
    (api.getMe as jest.Mock).mockResolvedValueOnce(me());
    await act(async () => onChange('active'));
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
  });

  it('is signed out even when the secure store fails to remove the token', async () => {
    (storage.getToken as jest.Mock).mockResolvedValue('old');
    (api.getMe as jest.Mock).mockResolvedValue(null);
    (storage.removeToken as jest.Mock).mockRejectedValueOnce(new Error('Keychain error'));
    const { result } = await renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
  });

  it('forgets the token when the server no longer accepts it while naming', async () => {
    const { result } = await restored(me({ ...ann, name: null }));
    (api.updateName as jest.Mock).mockResolvedValueOnce(null);
    await act(() => result.current.setName('Ann'));
    expect(storage.removeToken).toHaveBeenCalled();
    expect(result.current.status).toBe('signedOut');
  });
});
```

Replace `__tests__/app/layout.test.tsx` with:

```tsx
import type { ReactNode } from 'react';
import { render } from '@testing-library/react-native';

let mockStatus = 'loading';
let mockUser: { id: number; email: string; name: string | null } | null = null;
let mockTermsAccepted = true;
let mockSegments: string[] = [];
const mockReplace = jest.fn();
const mockHideAsync = jest.fn(async () => {});

jest.mock('../../context/SessionContext', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ status: mockStatus, user: mockUser, termsAccepted: mockTermsAccepted }),
}));
jest.mock('../../context/SocketContext', () => ({
  SocketProvider: ({ children }: { children: ReactNode }) => children,
  useSocket: () => ({ isConnected: false, isLoading: false, meetingCode: null }),
}));
jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    Stack,
    useRouter: () => ({ replace: mockReplace }),
    useSegments: () => mockSegments,
  };
});
// The real provider waits for the device's insets before rendering anything
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: () => mockHideAsync(),
}));

import RootLayout from '../../app/_layout';

describe('root layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = [];
    mockUser = null;
    mockTermsAccepted = true;
  });

  it("goes to the offline screen, not sign-in, when the session can't be checked", async () => {
    mockStatus = 'unreachable';
    mockSegments = ['(auth)', 'login'];
    await render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/offline');
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/login');
    expect(mockHideAsync).toHaveBeenCalled();
  });

  it('stays on the offline screen while the server is unreachable', async () => {
    mockStatus = 'unreachable';
    mockSegments = ['offline'];
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes to sign-in when signed out', async () => {
    mockStatus = 'signedOut';
    mockSegments = ['offline'];
    await render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('keeps the splash screen while the session loads', async () => {
    mockStatus = 'loading';
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  it('asks a new user for a name, where the terms are asked too, before the terms screen', async () => {
    mockStatus = 'signedIn';
    mockUser = { id: 1, email: 'a@b.c', name: null };
    mockTermsAccepted = false;
    mockSegments = ['(auth)', 'verify'];
    await render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/name');
  });

  it('asks a signed-in user for the current terms before anything else', async () => {
    mockStatus = 'signedIn';
    mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };
    mockTermsAccepted = false;
    mockSegments = ['(meeting)', 'join'];
    await render(<RootLayout />);
    expect(mockReplace).toHaveBeenCalledWith('/terms');
  });

  it('stays on the terms screen until the terms are accepted', async () => {
    mockStatus = 'signedIn';
    mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };
    mockTermsAccepted = false;
    mockSegments = ['terms'];
    await render(<RootLayout />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
```

In `__tests__/app/auth-screens.test.tsx`:

- Replace the first line with:

  ```tsx
  import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
  import { Linking } from 'react-native';
  ```

- In `mockSession`, add:

  ```tsx
    termsAccepted: false,
    acceptTerms: jest.fn(async () => {}),
  ```

- After `import OfflineScreen from '../../app/offline';`, add `import TermsScreen from '../../app/terms';`.
- Append inside `describe('auth screens')`:

```tsx
it('has a new user agree to the terms with their name, agreeing first', async () => {
  await render(<NameScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('John Smith'), 'Ann Lee');
  await fireEvent.press(screen.getByText('Continue'));
  expect(mockSession.setName).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('checkbox'));
  await fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(mockSession.setName).toHaveBeenCalledWith('Ann Lee'));
  expect(mockSession.acceptTerms).toHaveBeenCalledTimes(1);
  expect(mockSession.acceptTerms.mock.invocationCallOrder[0]).toBeLessThan(
    mockSession.setName.mock.invocationCallOrder[0],
  );
});

it('opens the terms on the web', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await render(<NameScreen />);
  await fireEvent.press(screen.getByText('Terms of Service'));
  expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/\/terms$/));
});

it('accepts the current terms from the terms screen', async () => {
  await render(<TermsScreen />);
  await fireEvent.press(screen.getByRole('checkbox'));
  await fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(mockSession.acceptTerms).toHaveBeenCalledTimes(1));
});

it('can sign out from the terms screen', async () => {
  await render(<TermsScreen />);
  await fireEvent.press(screen.getByText('Sign out'));
  expect(mockSession.signOut).toHaveBeenCalledTimes(1);
});
```

In `__tests__/context/SocketContext.test.tsx`:

- Replace the session mock and the variables above it:

  ```tsx
  const mockSignOut = jest.fn();
  let mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };
  jest.mock('../../context/SessionContext', () => ({
    useSession: () => ({
      token: 'tok',
      user: mockUser,
      signOut: mockSignOut,
    }),
  }));
  ```

  with:

  ```tsx
  const mockSignOut = jest.fn();
  const mockMarkTermsNotAccepted = jest.fn();
  let mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };
  let mockTermsAccepted = true;
  jest.mock('../../context/SessionContext', () => ({
    useSession: () => ({
      token: 'tok',
      user: mockUser,
      termsAccepted: mockTermsAccepted,
      signOut: mockSignOut,
      markTermsNotAccepted: mockMarkTermsNotAccepted,
    }),
  }));
  ```

- In `beforeEach`, add `mockTermsAccepted = true;` after `mockUser = { id: 1, email: 'a@b.c', name: 'Ann' };`.
- Append inside the `describe`:

```tsx
it('sends the user to the terms screen when the connection is refused for the terms', async () => {
  const { result } = await renderHook(() => useSocket(), { wrapper });
  await act(async () => result.current.joinMeeting('DEMO'));
  await waitFor(() => expect(mockSockets.length).toBe(1));
  await act(() =>
    mockSockets[0].handlers.connect_error(
      Object.assign(new Error('Accept the terms to continue'), {
        data: { code: 'TERMS_NOT_ACCEPTED' },
      }),
    ),
  );
  expect(mockMarkTermsNotAccepted).toHaveBeenCalled();
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(result.current.error).toBeNull();
});

it("doesn't connect until the current terms are accepted", async () => {
  mockTermsAccepted = false;
  const { result } = await renderHook(() => useSocket(), { wrapper });
  await act(async () => result.current.joinMeeting('DEMO'));
  expect(mockSockets).toHaveLength(0);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest __tests__/lib __tests__/context __tests__/app`
Expected: FAIL. `acceptTerms` and `termsAccepted` don't exist, `app/terms` is missing, and the name screen has no checkbox.

- [ ] **Step 3: The API and the app config**

In `lib/api.ts`, add after the `expo-constants` import:

```ts
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
```

After the `SessionUser` interface, add:

```ts
/** The signed-in user, and whether they accepted the current Terms of Service and Privacy Policy */
export interface Me {
  user: SessionUser;
  termsAccepted: boolean;
}
```

Replace `getMe` with:

```ts
/** The signed-in user and their terms acceptance, or null when the token no longer works */
export async function getMe(token: string): Promise<Me | null> {
  const response = await fetch(`${API_URL}/api/auth/me`, { headers: bearer(token) });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await errorMessage(response, "Couldn't load your account"));
  return (await response.json()) as Me;
}

/**
 * Accept the current terms: the version this app shows, so an old app can't accept terms the
 * user never saw. False when the token no longer works.
 */
export async function acceptTerms(token: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/api/auth/accept-terms`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ version: TERMS_VERSION }),
  });
  if (response.status === 401) return false;
  if (!response.ok) throw new Error(await errorMessage(response, "Couldn't record your agreement"));
  return true;
}
```

and add after `getApiUrl`:

```ts
/**
 * The web app, where the Terms of Service and Privacy Policy are. In production it is served on
 * the API's origin.
 */
export function getWebUrl(): string {
  return Constants.expoConfig?.extra?.webUrl ?? API_URL;
}
```

In `app.config.js`, in the returned `extra`, add after `apiUrl: getApiUrl(),`:

```js
      // The web app, for the terms pages; in production it shares the API's origin
      webUrl: process.env.EXPO_PUBLIC_WEB_URL || getApiUrl(),
```

- [ ] **Step 4: Replace `context/SessionContext.tsx`**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as api from '../lib/api';
import type { SessionUser } from '../lib/api';
import { getToken, removeToken, storeToken } from '../lib/storage';

// 'unreachable': there is a saved token but the server couldn't be reached to check it
export type SessionStatus = 'loading' | 'signedIn' | 'signedOut' | 'unreachable';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  token: string | null;
  /** Whether the user accepted the current Terms of Service and Privacy Policy */
  termsAccepted: boolean;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<SessionUser>;
  setName: (name: string) => Promise<void>;
  /** Accept the current terms (the version this app shows) */
  acceptTerms: () => Promise<void>;
  /** The socket was refused until the terms are accepted: show the terms screen */
  markTermsNotAccepted: () => void;
  signOut: () => Promise<void>;
  /** Check the saved session again after the server was unreachable */
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** The secure store's token, or null when there is none or it can't be read */
async function savedToken(): Promise<string | null> {
  try {
    return await getToken();
  } catch {
    // Android can't decrypt a value restored from a backup onto another device
    return null;
  }
}

/** The signed-in user. The token lives in the secure store and is restored on launch. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const forget = useCallback(async () => {
    try {
      await removeToken();
    } catch {
      // Signed out in the app regardless; the server no longer accepts the token anyway, or
      // the next launch finds it and asks the server again
    }
    setToken(null);
    setUser(null);
    setTermsAccepted(false);
    setStatus('signedOut');
  }, []);

  // The restore in progress, so a retry while one runs waits for it instead of starting another
  const restoringRef = useRef<Promise<void> | null>(null);

  const restore = useCallback(() => {
    restoringRef.current ??= (async () => {
      try {
        const saved = await savedToken();
        if (!saved) {
          setStatus('signedOut');
          return;
        }
        let me: api.Me | null;
        try {
          me = await api.getMe(saved);
        } catch {
          // Offline, or the server failed: keep the token and try again
          setToken(saved);
          setStatus('unreachable');
          return;
        }
        if (!me) {
          await forget();
          return;
        }
        setToken(saved);
        setUser(me.user);
        setTermsAccepted(me.termsAccepted);
        setStatus('signedIn');
      } finally {
        restoringRef.current = null;
      }
    })();
    return restoringRef.current;
  }, [forget]);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Try again when the user comes back to the app, since they may be back online
  useEffect(() => {
    if (status !== 'unreachable') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void restore();
    });
    return () => subscription.remove();
  }, [status, restore]);

  const requestCode = useCallback((email: string) => api.requestCode(email.trim()), []);

  const verify = useCallback(async (email: string, code: string) => {
    const result = await api.verifyCode(email.trim(), code.trim());
    await storeToken(result.token);
    // The verify answer has only the user; whether they accepted the current terms comes from
    // me. If that check fails, ask for the terms: accepting again is harmless.
    const me = await api.getMe(result.token).catch(() => null);
    setToken(result.token);
    setUser(me?.user ?? result.user);
    setTermsAccepted(me?.termsAccepted ?? false);
    setStatus('signedIn');
    return result.user;
  }, []);

  const setName = useCallback(
    async (name: string) => {
      if (!token) throw new Error('Not signed in');
      const updated = await api.updateName(token, name.trim());
      // The server no longer accepts the token: back to sign-in
      if (!updated) return forget();
      setUser(updated);
    },
    [token, forget],
  );

  const acceptTerms = useCallback(async () => {
    if (!token) throw new Error('Not signed in');
    // The server no longer accepts the token: back to sign-in
    if (!(await api.acceptTerms(token))) return forget();
    setTermsAccepted(true);
  }, [token, forget]);

  const markTermsNotAccepted = useCallback(() => setTermsAccepted(false), []);

  const signOut = useCallback(async () => {
    if (token) await api.signOut(token);
    await forget();
  }, [token, forget]);

  const value = useMemo(
    () => ({
      status,
      user,
      token,
      termsAccepted,
      requestCode,
      verify,
      setName,
      acceptTerms,
      markTermsNotAccepted,
      signOut,
      retry: restore,
    }),
    [
      status,
      user,
      token,
      termsAccepted,
      requestCode,
      verify,
      setName,
      acceptTerms,
      markTermsNotAccepted,
      signOut,
      restore,
    ],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
}
```

- [ ] **Step 5: The checkbox, the name screen and the terms screen**

`components/TermsAgreement.tsx`:

```tsx
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { getWebUrl } from '../lib/api';
import { colors, spacing, typography } from '../theme';

const AGREEMENT = "I'm 13 or older and I agree to the Terms of Service and Privacy Policy";

/** The agreement to the current terms. The links open the documents on the web. */
export function TermsAgreement({
  agreed,
  onChange,
}: {
  agreed: boolean;
  onChange: (agreed: boolean) => void;
}) {
  const open = (path: string) => {
    void Linking.openURL(`${getWebUrl()}${path}`);
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        accessibilityLabel={AGREEMENT}
        onPress={() => onChange(!agreed)}
        hitSlop={8}
        style={[styles.box, agreed && styles.boxChecked]}
      >
        {agreed && <Text style={styles.check}>✓</Text>}
      </Pressable>
      <Text style={styles.text}>
        I'm 13 or older and I agree to the{' '}
        <Text style={styles.link} accessibilityRole="link" onPress={() => open('/terms')}>
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text style={styles.link} accessibilityRole="link" onPress={() => open('/privacy')}>
          Privacy Policy
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  check: {
    color: colors.white,
    fontWeight: '700',
  },
  text: {
    flex: 1,
    fontSize: typography.sm.fontSize,
    color: colors.text.secondary,
  },
  link: {
    color: colors.primary[600],
    textDecorationLine: 'underline',
  },
});
```

In `app/(auth)/name.tsx`:

- Add the import: `import { TermsAgreement } from '../../components/TermsAgreement';`.
- Replace `const { setName, signOut } = useSession();` with `const { setName, signOut, termsAccepted, acceptTerms } = useSession();`.
- After `const [name, setNameText] = useState('');`, add `const [agreed, setAgreed] = useState(false);`.
- In `handleSubmit`, replace:

  ```tsx
      setIsSaving(true);
      setError(null);
      try {
        await setName(trimmed);
  ```

  with:

  ```tsx
      if (!termsAccepted && !agreed) return;

      setIsSaving(true);
      setError(null);
      try {
        // Agree first: the Privacy Policy covers the name, so it is stored only once the user
        // agreed. If naming then fails, the checkbox is gone and only the name is asked again.
        if (!termsAccepted) await acceptTerms();
        await setName(trimmed);
  ```

- Replace:

  ```tsx
            {error && (
  ```

  with:

  ```tsx
            {!termsAccepted && <TermsAgreement agreed={agreed} onChange={setAgreed} />}

            {error && (
  ```

- In the Continue `Button`, replace `disabled={isSaving}` with `disabled={isSaving || (!termsAccepted && !agreed)}` (the first `disabled={isSaving}` in the file; the "Use a different email" button keeps its own).

`app/terms.tsx`:

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../context/SessionContext';
import { Button, Card } from '../components/ui';
import { TermsAgreement } from '../components/TermsAgreement';
import { colors, spacing, typography } from '../theme';

/**
 * For a signed-in user who hasn't accepted the current terms: they changed since the user last
 * accepted, or the server refused the meeting connection for that reason
 */
export default function TermsScreen() {
  const { acceptTerms, signOut } = useSession();
  const [agreed, setAgreed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!agreed) return;
    setIsSaving(true);
    setError(null);
    try {
      await acceptTerms();
      // Navigation happens automatically via root layout once the terms are accepted
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record your agreement");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Before you go on</Text>
          <Text style={styles.subtitle}>
            Robbie needs your agreement to its Terms of Service and Privacy Policy. If you agreed
            before, they have changed since.
          </Text>
        </View>

        <Card style={styles.card}>
          <TermsAgreement agreed={agreed} onChange={setAgreed} />

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button
            title={isSaving ? 'Saving...' : 'Continue'}
            onPress={handleContinue}
            loading={isSaving}
            disabled={isSaving || !agreed}
            fullWidth
            size="lg"
          />
        </Card>

        <Button title="Sign out" onPress={signOut} disabled={isSaving} variant="ghost" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
  content: {
    flex: 1,
    padding: spacing[4],
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing[6],
    alignItems: 'center',
  },
  title: {
    fontSize: typography['2xl'].fontSize,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontSize: typography.base.fontSize,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  card: {
    marginBottom: spacing[4],
  },
  errorBanner: {
    backgroundColor: colors.danger[50],
    borderRadius: 8,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  errorText: {
    color: colors.danger[600],
    fontSize: typography.sm.fontSize,
    textAlign: 'center',
  },
});
```

- [ ] **Step 6: The root layout and the socket**

In `app/_layout.tsx`:

- Replace `const { status, user } = useSession();` with `const { status, user, termsAccepted } = useSession();`.
- Replace:

  ```tsx
  if (!user?.name) {
    if (screen !== 'name') router.replace('/(auth)/name');
    return;
  }
  ```

  with:

  ```tsx
  if (!user?.name) {
    if (screen !== 'name') router.replace('/(auth)/name');
    return;
  }
  // The current terms before anything else: they changed, or the socket was refused
  if (!termsAccepted) {
    if (group !== 'terms') router.replace('/terms');
    return;
  }
  ```

- In the effect's dependency list, add `termsAccepted` after `user?.name`.
- After `<Stack.Screen name="offline" options={{ headerShown: false }} />`, add:

  ```tsx
  <Stack.Screen name="terms" options={{ headerShown: false }} />
  ```

In `context/SocketContext.tsx`:

- Replace `const { token, user, signOut } = useSession();` with `const { token, user, termsAccepted, signOut, markTermsNotAccepted } = useSession();`.
- After the effect that updates `signOutRef`, add:

  ```tsx
  const markTermsNotAcceptedRef = useRef(markTermsNotAccepted);
  useEffect(() => {
    markTermsNotAcceptedRef.current = markTermsNotAccepted;
  }, [markTermsNotAccepted]);
  ```

- Replace:

  ```tsx
    // Connect to the meeting once signed in with a meeting code
    useEffect(() => {
      if (!token || !meetingCode) return;
  ```

  with:

  ```tsx
    // Connect to the meeting once signed in, with the current terms accepted and a meeting code
    useEffect(() => {
      if (!token || !termsAccepted || !meetingCode) return;
  ```

- In the `connect_error` handler, after the `Not signed in` block (`void signOutRef.current(); return; }`), add:

  ```tsx
  // The current terms aren't accepted: the root layout shows the terms screen, and this
  // connects again once they are
  if (err.data?.code === 'TERMS_NOT_ACCEPTED') {
    markTermsNotAcceptedRef.current();
    return;
  }
  ```

- In that effect's dependency list, replace `[token, meetingCode, setTemporaryError]` with `[token, termsAccepted, meetingCode, setTemporaryError]`.

- [ ] **Step 7: Run everything**

Run (in `mobile`): `npx tsc --noEmit -p . && npx jest`
Expected: type-check clean; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/api.ts app.config.js context components/TermsAgreement.tsx app __tests__
git commit -m "feat(mobile): ask for the terms at sign-in and when they change"
```

---

### Task 11: Docs and final check

**Files:** `spec.md`, `CLAUDE.md`, `README.md`, `docs/mvp-roadmap.md`

Work in the repository root.

- [ ] **Step 1: `spec.md`**

Under `### M3. Organization authorization (REST and socket)`, after the bullet that starts "**Done 2026-10-06 (server):**", add:

```markdown
- **Done 2026-10-06 (clients):** the web app shows only the user's organizations, with their role, and creates them ("New organization"); a user in none is asked to create one or to be added by email; `useCan(minRole)` hides actions the role can't take; Settings lists the members, adds people by email with a role, changes roles, removes members, cancels pending additions, and lets members leave and owners delete the organization after typing its name; scheduling a meeting creates its packet in the current organization, and the live meeting screens treat a missing packet or link (404) as none; new users accept the Terms of Service and Privacy Policy (drafts at `/terms` and `/privacy`) at the name step, and existing users get a terms step on web and mobile, also when a request or the socket is refused for the terms; `npm run seed:demo -w backend-node` creates the Maple Grove HOA demo from `docs/mvp-roadmap.md`.
```

Under `### M10. Mobile (participant only)`, add as the first bullet:

```markdown
- **Deferred 2026-10-06:** for the MVP, phones use the responsive web app (`docs/mvp-roadmap.md`). The Expo app keeps building and has the terms step, but gets no new features until after the MVP; the open items below wait until then.
```

- [ ] **Step 2: `CLAUDE.md`**

- Under "## Project Overview", after the line "Both applications now run from a **single unified backend** (backend-node) on port 3001.", add:

  ```markdown
  The product is called **Robbie** (`docs/mvp-roadmap.md`): the app says Robbie everywhere, and "Bylawyer" names only the documents side in code. Packages and folders keep their names.
  ```

- Under "### Database" in "## Commands", add after the `npm run db:studio` line inside the code block:

  ```bash
  npm run seed:demo        # Create the Maple Grove HOA demo (-- --reset replaces it); sign in with ENABLE_TEST_AUTH=true and code 000000
  ```

- Under "**Routing Structure:**", replace the line for `/sign-in` with:

  ```markdown
  - `/sign-in` - Sign in by emailed code (public, as are `/share/:shareToken`, `/terms` and `/privacy`)
  ```

- Under "**State Management:**", replace the `OrganizationContext` and `SessionContext` lines with:

  ```markdown
  - `OrganizationContext` - the user's organizations (each with their `role`), the current one, and the user's `role` in it; `useCan(minRole)` hides actions the role can't take (the server still decides; role order in `utils/roles.ts` mirrors `backend-node/src/orgs/roles.ts`)
  - `SessionContext` - signed-in user (cookie session) and `termsAccepted`/`acceptTerms()`; `RequireSession` guards every route except `/sign-in`, `/share`, `/terms` and `/privacy`, and shows the terms step until the current terms (`TERMS_VERSION`) are accepted. A 403 `TERMS_NOT_ACCEPTED` from the API or the socket brings the step back.
  ```

- [ ] **Step 3: `README.md`**

Replace the "### Available Scripts" table with:

```markdown
| Command                             | Description                                                |
| ----------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                       | Start the backend and the web app                          |
| `npm run build`                     | Build all packages                                         |
| `npm run test`                      | Run tests                                                  |
| `npm run db:studio`                 | Open Prisma Studio                                         |
| `npm run seed:demo -w backend-node` | Create the Maple Grove HOA demo (`-- --reset` replaces it) |
```

(The old rows `dev:robbie` and `dev:bylawyer` named scripts that no longer exist.) After the table, add:

```markdown
The demo's people sign in with the code `000000` when the server runs with `ENABLE_TEST_AUTH=true`; the seed prints their emails and roles.
```

- [ ] **Step 4: `docs/mvp-roadmap.md`**

In the phases table, change the last cell of the row for phase A from `next` to `done`, and the empty last cell of the row for phase B to `next`.

- [ ] **Step 5: Format, then the full check**

Run: `npx prettier --write spec.md CLAUDE.md README.md docs/mvp-roadmap.md`

Run (from the repository root):

```bash
npm run build:shared && npm run format:check && npm run lint && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npm run test:run -w shared && npm run test:run -w backend-node && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile
```

Expected: all pass. `grep -rn "Robbie-Bylawyer" frontend-unified/src frontend-unified/index.html` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add spec.md CLAUDE.md README.md docs/mvp-roadmap.md
git commit -m "docs: record organization membership in the clients"
```

---

## Self-review notes

- **Scope (the brief's items 1 to 8):**
  1. Terms on the web: the client's terms refusal and `auth.me`/`acceptTerms` (Tasks 1 and 2); `SessionContext.termsAccepted`, `acceptTerms()`, `markTermsNotAccepted()` (Task 2); `/terms`, `/privacy`, the checkbox at the name step, the terms step in `RequireSession` (Task 3); the socket's refusal (Task 7).
  2. Terms on mobile: Task 10.
  3. Organizations on the web: the switcher with roles and "New organization", the empty state, `role` and `useCan` (Task 4); the actions hidden by role (Task 5; organization settings and delete in Task 6; scheduling and linking in Task 7).
  4. Members in Settings, Leave, Delete by typing the name, the owner rules, the 429 and 409 messages: Task 6 (and the no-retry of a 429 write in Task 1).
  5. Scheduling: `createPacket` under the current organization, `getPacket` with 404 as none, the chair's panel, `BylawyerLinkPanel`'s secretary filter, its 404 and 409 handling, and the sync status 404: Tasks 1 and 7.
  6. Product name: the title and header (Task 4), "About Robbie" (Task 6), the link panel's heading (Task 7). `mobile/app.json` already says "Robbie".
  7. Demo seed and its integration test: Task 8.
  8. Docs and the full check: Task 11. Live check: Task 9.
- **Choices where the code or the brief left room:**
  - **Terms first, then the name**, on web and mobile: the Privacy Policy covers the name, so it is stored only once the user agreed; a failure of either leaves the user on the same step asked only for what is missing. Both calls are under `/api/auth`, so `requireTerms` blocks neither.
  - **The server makes the slug.** `POST /api/organizations` generates it from the name when none is sent, so the client sends none and shows the server's 400 for a slug taken.
  - **`verify` then `me`.** `POST /api/auth/verify` answers only `{ user }`, so the clients ask `me` for `termsAccepted`, and assume not accepted if that fails. A server change to return it from `verify` would save a request but is outside this plan.
  - **No retry of a 429 write.** The client retried every 429 three times with backoff, which held back the limit messages (3 owned organizations, 20 additions a day) for about 7 seconds. Reads still retry a 429.
  - **Roles in a client module** (`frontend-unified/src/utils/roles.ts`), not `shared`: only the web uses them, and the server's copy is typed by Prisma's enum. The web and the server lists must stay in the same order.
  - **`useSocketConnection`'s third parameter is optional**, so the 11 existing calls in its test stay as they are.
  - **Mobile terms state is `termsAccepted`, not a new status**, mirroring the web; the root layout routes on it after the name, as it routes `unreachable` to `/offline`.
  - **Mobile links** open `getWebUrl()`, from `EXPO_PUBLIC_WEB_URL` or the API URL (the same origin in production).
  - **The documents panel text** for a meeting without a packet and for an empty one is "No meeting documents.".
  - **The terms text is a draft** with a placeholder contact, `privacy@robbie.scouch.dev`. The owner confirms the mailbox, and reviewed text replaces the draft (bumping `TERMS_VERSION`) before launch.
- **Order:** each task leaves the web app type-checking and its tests passing: Task 1 changes only the client's internals and adds calls; Task 2 changes `auth.me` together with its only reader. Mobile changes only in Task 10. The seed (Task 8) comes before the live check (Task 9), which uses it.
- **Left as they are (noticed, out of scope):** the attachment uploader's "Link Bylawyer Document" lists all of the user's organizations, though the server accepts only documents of the packet's organization; `MeetingDocumentsPanel` links a document to `/bylawyer/documents/:id`, which isn't a route (it should be `/documents/:id`); the meetings module's other "Bylawyer" wording. Phase B redesigns those screens.
- **Names used across tasks:** `ROLES`, `OrgRole`, `ROLE_LABELS`, `atLeast`, `assignableRoles`, `canEditAmendment` (roles); `HttpError.code`, `TERMS_NOT_ACCEPTED`, `setTermsHandler`, `OrganizationWithRole`, `OrgMember`, `PendingInvite`, `MemberList`, `AddMemberResult`, `members`, `Me`, `auth.acceptTerms` (web client); `termsAccepted`, `acceptTerms`, `markTermsNotAccepted` (both sessions); `TermsCheckbox`, `TermsStep`, `LegalPage`, `LegalSection`, `ContactLink`, `CONTACT_EMAIL`; `useCan`, `role`; `OrganizationSwitcher`, `NewOrganizationModal`, `NoOrganizations`; `MembersCard`, `DeleteOrganizationDialog`, `AppearanceCard`; `getPacket`, `createPacket`, `CODE_ATTEMPTS`; `seedDemo`, `DemoSeedError`, `DEMO_SLUG`, `DEMO_MEETING_CODE`, `DEMO_PEOPLE`, `DemoSeedSummary`; mobile `getMe`, `acceptTerms`, `getWebUrl`, `TermsAgreement`, `TermsScreen`.
