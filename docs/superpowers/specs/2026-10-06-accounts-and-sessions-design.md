# Accounts and sessions (spec M2, part 1 of 3)

Status: design, 2026-10-06

## Why

Sign-in exists only for joining a meeting. Each sign-in names one meeting code, users live in memory (a restart forgets everyone and reuses IDs, so an old token can resolve to a different person), and the documents half of the app has no sign-in at all: every `/api` route is open to anyone, including deleting an organization.

Accounts and authorization are split into three pieces, built in order:

1. **Accounts and sessions** (this design): persistent users, one sign-in for the whole app, sessions for web and mobile, and no anonymous API access.
2. **Organization membership and authorization** (M3): roles per organization, invitations, a role check on every route and socket action, member management in Settings.
3. **Meeting roles and guests** (M3): organization members join linked meetings with their role; anyone else with the code joins as a non-voting guest; chair assignment.

After piece 1 every API call needs a signed-in user, but any signed-in user can still reach any organization. Piece 2 closes that.

## Decisions

- **Sign-in is by emailed code only.** Enter an email, receive a 6-digit code, enter it. No passwords. (Chosen by the owner, 2026-10-06.)
- **Sessions are server-side** (approach A below).
- **New users give a display name once**, right after their first sign-in. It is the name shown in meetings and can be changed in Settings.
- **Any signed-in user can join a live meeting by its code.** This matches today, where anyone with an email address can join any code. Piece 3 decides member or guest.

## Approaches considered

**A. Server-side sessions (chosen).** A random 32-byte token identifies the session. The server stores only its SHA-256 hash in a `Session` table. Web keeps the token in an httpOnly cookie; mobile keeps it in the device's secure store and sends it as a bearer token.

- Sign-out really ends the session, and "sign out everywhere" is one query.
- Piece 2's role changes take effect on the next request, because nothing about the user is baked into the token.
- One indexed lookup per request is negligible on a single node.

**B. Longer-lived JWTs with users in the database.** Smallest change from today. But a JWT can't be revoked before it expires, so sign-out only clears the cookie, a stolen token keeps working, and anything copied into the token goes stale.

**C. Short access JWTs plus refresh tokens in the database.** Revocable at refresh time and stateless in between, but two token types, refresh rotation and reuse detection are more machinery than a single-node app needs.

## Data model (Prisma)

All new tables, created by one migration. The legacy hand-made `users`, `email_verifications` and `meeting_participants` tables are left alone; nothing uses them, and M5 deletes them.

```prisma
model User {
  id        Int       @id @default(autoincrement())
  email     String    @unique   // lowercased
  name      String?             // null until set after first sign-in
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  sessions  Session[]
}

model Session {
  id         String   @id @default(uuid())
  tokenHash  String   @unique   // SHA-256 of the token, hex
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  client     String             // "web" or "mobile"
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @default(now())
  expiresAt  DateTime
  @@index([userId])
}

model SignInCode {
  id         String    @id @default(uuid())
  email      String
  codeHash   String             // SHA-256 of the 6-digit code
  expiresAt  DateTime
  attempts   Int       @default(0)
  consumedAt DateTime?
  createdAt  DateTime  @default(now())
  @@index([email, createdAt])
}
```

`User.id` is an integer, an exception to the UUID convention: live meeting state identifies members by number (`Member.id`, `voterId`, `moverId`), and changing that is out of scope. No production meeting data exists yet; meetings stored by earlier development builds may show the wrong names and can be discarded.

## Sign-in flow

1. `POST /api/auth/request-code { email }`
   - A new code is created (15 minutes) and sent by email (Resend). Once it has been sent, any earlier unused codes for that email stop working. If the send fails, the new code is deleted and the earlier one still works.
   - The response is the same whether or not the email has an account, so it reveals nothing.
   - Limits: 5 codes per email per hour (counted in `SignInCode`), plus the existing per-IP limiter.
2. `POST /api/auth/verify { email, code, client? }`
   - The latest unused, unexpired code for that email must match. Each guess claims an attempt in one conditional update before it is compared, so concurrent guesses can't get past the limit. The 5th wrong guess consumes the code.
   - On success the code is consumed, the user is found or created, and a session starts:
     - **web** (the default): the token is set as the `session` cookie (httpOnly, `SameSite=Lax`, `Secure` in production, 30 days) and is not in the body;
     - **mobile** (`client: "mobile"`): the token is returned in the body, and no cookie is set.
   - The response includes the user, `{ id, email, name }`. `name: null` tells the client to ask for a display name.
3. `PATCH /api/auth/me { name }` sets or changes the display name (2 to 100 characters).
4. `GET /api/auth/me` returns the signed-in user, or 401. The web app calls it on load, since it can't read the cookie.
5. `POST /api/auth/sign-out` deletes the current session, if there is one, and always clears the cookie, so an expired or unknown session still signs out cleanly. `POST /api/auth/sign-out-everywhere` requires a session and deletes all of the user's sessions.

**Sessions** last 30 days from last use. Each authenticated request extends `expiresAt`, at most once an hour, so active users stay signed in. When a web session is extended, the cookie is sent again with a fresh 30 days, so the browser keeps it as long as the server does. Expired sessions and codes are deleted by an hourly cleanup.

**Test sign-in.** With `ENABLE_TEST_AUTH=true` outside production, the code `000000` (or `TEST_VERIFICATION_CODE`) signs in any email, as `DEMO` does today. It stays refused in production.

**Removed:**

- the JWT and `jsonwebtoken` (`JWT_SECRET` is no longer needed; sessions are random tokens, so there is nothing to sign);
- `GET /api/auth/dev-code` and the global last-code variable;
- the per-meeting `request-verification`, `verify` and `logout` endpoints;
- the `test-role` endpoint (piece 3 replaces it with real chair assignment).

**Codes in logs.** Without an email provider (development only; production refuses to start without one), the code is logged at `debug`, which development shows and production never logs. Tests use an in-memory transport they read directly.

## Authentication on the server

`authenticate` middleware reads the token from the `session` cookie or an `Authorization: Bearer` header, looks up the session by hash, and sets `req.user = { id, email, name }`. It is mounted on every `/api` route except `/api/auth/*` (where `me`, rename and sign-out everywhere use it directly, and plain sign-out reads the token itself so it can always clear the cookie), `/api/health` and `/api/share/*`. A missing, unknown or expired session gets 401 `{ error: "Not signed in" }`.

**Socket.io** authenticates once at connection, in an `io.use` middleware, using the same cookie or `handshake.auth.token`. An unauthenticated connection is refused. `JOIN_MEETING` then carries only the meeting code, and the socket's user is taken from its session. Meeting roles keep today's rules (`ADMIN_EMAILS` gives admin) until piece 3. The socket records its session ID (`socket.data.sessionId`). Signing out disconnects the sockets with that session ID, and signing out everywhere disconnects all of the user's sockets.

## Clients

**Web**

- A `SessionProvider` (`useSession`) loads `GET /api/auth/me` on start and holds `{ user, status }`.
- A `/sign-in` page asks for the email, then the code, then the display name (new users only).
- Every route except `/share/:token` and `/sign-in` requires a session; signed-out users are sent to `/sign-in` and returned to the page they wanted.
- The header shows the user's name with a menu containing Settings and Sign out. Settings gains a "Your name" field.
- The meetings module's own sign-in (`useAuth`, `AuthScreen`, the token in `localStorage`) goes away. Joining a meeting asks only for the code.
- The API client sends credentials (cookies) and treats a 401 as "signed out": it clears the session and goes to `/sign-in`.

**Mobile**

- Sign in with email, code and name, as on the web, with `client: "mobile"`.
- The token is kept in `expo-secure-store`, which is encrypted at rest (AsyncStorage is not), and restored on launch, so reopening the app keeps you signed in.
- REST calls send `Authorization: Bearer`, and the socket sends `auth: { token }`. Joining asks only for the meeting code. Sign out deletes the session on the server and the stored token.

## Error handling

- Wrong or expired code: 401 "That code is wrong or has expired". After the attempt limit: 429 "Too many attempts. Request a new code."
- Code requests over the limit: 429 with a retry time.
- Email send failure: 502 "We couldn't send the email. Try again."; the code is deleted.
- Session lookup errors (database down): 503. A failed lookup never counts as signed in.

## Testing

- **Route-test harness** (from M3, needed here): split `src/index.ts` into `app.ts` (the Express app, no listening) and `index.ts` (HTTP server, Socket.io, start-up). Add supertest. Integration tests run only when `INTEGRATION_DATABASE_URL` is set, and never against `DATABASE_URL`; CI sets it to its Postgres.
- **Integration tests:**
  - the sign-in flow: code issued, wrong code, attempt limit, expiry, reuse, request limit, web cookie versus mobile token;
  - `me`, rename, sign-out and sign-out everywhere;
  - 401 on every protected router without a session, and 200 with one;
  - share and health stay public.
- **Unit tests:** token hashing and session expiry extension; the socket middleware accepts a cookie or a token and refuses neither.
- **Web tests:** the `/sign-in` steps; redirect to sign-in and back; a 401 from the API signs the user out.
- **Mobile tests:** the token is stored, restored on launch and removed on sign out.

## Out of scope

- Organization roles and per-organization checks, invitations, and the member list (piece 2). Until then any signed-in user can use every organization.
- Guests and meeting roles (piece 3).
- Moving the legacy Robbie tables into Prisma (M5).
- OAuth or passkeys.

## Known limits

Two trade-offs are accepted for now. Both are candidates for later work.

- **Anyone can keep a person from signing in.** Someone who knows a person's email can request codes for it, which replaces the person's code, and burn each code's attempts with wrong guesses. Staying within the per-IP limits is enough to keep this up.
- **There is no daily cap on wrong guesses per email.** The limits allow 5 codes an hour with 5 attempts each, so about 25 guesses an hour, even from one address. Each guess has a one in a million chance, but over a year that adds up to roughly a one in five chance of getting in.

Smaller gaps, to pick up in part 2 or 3:

- A socket's name falls back to the user's email until they set a display name.
- `PATCH /api/auth/me` doesn't rename sockets that are already connected; the new name shows after they reconnect.
- A socket stays connected after its session expires. Only signing out disconnects it.
- A sign-out that races a connecting socket can miss it, so that socket stays connected.
- Cookie-authenticated sockets have no Origin check. `SameSite=Lax` keeps the cookie from other sites, but not from sibling subdomains, which count as the same site.
- `JOIN_MEETING` still creates a meeting for any valid code. Part 3 decides who may create one.
- An invalid `TRUST_PROXY` stops the server with a stack trace rather than a logged error.

**Deployment.** Production must set `NODE_ENV=production`. That makes the cookie `Secure`, refuses the test code, and stops the server from starting without an email provider. Behind Caddy it must also set `TRUST_PROXY=1`, or the per-IP limits see every client as Caddy's address.
