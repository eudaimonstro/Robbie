# Organization membership and authorization (spec M3, part 2 of 3)

Status: design, 2026-10-06

## Why

Part 1 made every API call need a signed-in user, but any signed-in user can still read, change or delete any organization's data through all 93 routes. Nothing records who belongs to an organization. Three gaps go beyond missing role checks:

- **Meeting packets, agenda items and attachments have no organization.** A packet hangs off a free-text meeting code. The only path from a code to an organization is the legacy `meetings.bylawyer_org_id` column, which Prisma can't reach and which anyone can set through `POST /api/bylawyer/link-meeting`.
- **`POST /api/robbie/sync-motion` lets any user create and apply a "passed" amendment on any document.** Nothing calls it; the socket layer calls `bylawSyncService` directly.
- **The live bylaw sync checks only that the meeting is linked, not that the amended document belongs to the linked organization.**

Several routes also take two resources without checking they belong together: a version diff, an amendment change's target section, a vote's meeting and amendment, reorder lists, and linking a document to a packet.

This part adds organization membership with roles, checks every route, closes those gaps, and records acceptance of the Terms of Service. Part 3 (meeting roles and guests) is unchanged.

## Decisions

Chosen by the owner, 2026-10-06:

- **People join by being added by email.** An admin enters an email and a role. An existing account becomes a member at once; for an unknown email the membership waits and attaches the first time that email signs in. There are no invite links or accept step, since signing in already proves the email. The person gets an email saying they were added.
- **Members can draft amendments.** A member can create amendment drafts and edit or delete their own drafts. Proposing, recording outcomes, applying and editing documents directly need the secretary role.
- **Any signed-in user can create an organization** and becomes its owner, with two limits: a user can own at most 3 organizations, and an organization can add at most 20 people by email per day.
- **New users accept the Terms of Service and Privacy Policy.** Existing users accept on their next visit, and again whenever the terms change.

Also decided here:

- **An organization can have several owners.** The last owner can't leave, be removed or be demoted. Account deletion (the next piece) builds on this rule.
- **A meeting packet belongs to one organization.** It becomes the only record of which organization a live meeting belongs to, replacing the legacy column.
- **To someone outside an organization, its resources don't exist** (404). A member whose role is too low gets 403.

## Roles

Ranked lowest to highest. Each role can do everything the roles below it can.

| Role      | Can                                                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| viewer    | Read the organization, its documents, versions, sections, diffs, amendments, meetings, votes, packets, agenda items and attachments. List members.                                                                                                            |
| member    | Create amendment drafts. Edit, add changes to and delete drafts they created.                                                                                                                                                                                 |
| secretary | Edit documents, versions and sections. Propose, withdraw, table, pass, fail and apply any amendment, and edit or delete any draft. Record meetings and votes. Create and edit packets, agenda items and attachments. Link a live meeting to the organization. |
| admin     | Change the organization's name and description. Turn share links on and off. Add, change and remove members up to admin. Cancel pending additions.                                                                                                            |
| owner     | Add, change and remove owners. Delete the organization.                                                                                                                                                                                                       |

Anyone can leave an organization, except its last owner.

## Approaches considered

**A. Route-level rules with resource resolvers (chosen).** A middleware `requireRole(minRole, resolve)` runs before each handler. `resolve` maps the request to an organization id, for example `:id` of a version, through version, then document, then organization. The middleware loads the user's membership and sets `req.org = { id, role }`, or answers 404 or 403. Handlers that take two resources check the second one against `req.org.id` themselves.

- Every rule is visible next to its route.
- A test can walk the router and fail if any `/api` route outside `/api/auth` and `/api/share` has no rule, so a new route can't silently skip the check.

**B. Checks inside each handler or service.** More flexible, but every handler must remember to call it, and there is nothing to test mechanically.

**C. Postgres row-level security.** Strong, but Prisma would need a per-request database role and session variables, the legacy pg-pool code bypasses it, and the errors are hard to turn into useful API responses. Too much machinery for one node.

## Data model (Prisma)

One migration.

```prisma
enum OrgRole {
  viewer
  member
  secretary
  admin
  owner
}

model OrganizationMember {
  organizationId String
  userId         Int
  role           OrgRole
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([organizationId, userId])
  @@index([userId])
}

// One row per add-by-email, kept after it is used, so the daily limit can count them
model OrganizationInvite {
  id             String       @id @default(uuid())
  organizationId String
  email          String       // lowercased
  role           OrgRole
  invitedById    Int?
  createdAt      DateTime     @default(now())
  acceptedAt     DateTime?    // set when it became a membership
  canceledAt     DateTime?
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  invitedBy      User?        @relation(fields: [invitedById], references: [id], onDelete: SetNull)
  @@index([organizationId, createdAt])
  @@index([email])
}
```

Changes to existing models:

- `User` gains `termsVersion String?` and `termsAcceptedAt DateTime?`.
- `Amendment` gains `createdById Int?` (a relation to `User`, `onDelete: SetNull`), so a member's own drafts can be told apart. Existing amendments have none, so only secretaries can edit them.
- `MeetingPacket` gains a required `organizationId` (a relation to `Organization`, cascade). Existing packets are development data. The migration deletes them, with their agenda items and attachment records, before adding the column. This is a hand-written step in the generated migration.

Existing organizations have no members after the migration, so nobody can see them. A script adds a member, for development data and for support:

```
npm run org:add-member -w backend-node -- --org <slug> --email <email> --role owner
```

## Server

### The authorization module (`src/orgs/`)

- `roles.ts`: the role order and `atLeast(role, min)`.
- `resolvers.ts`: one function per resource kind (organization, document, version, section, amendment, amendment change, meeting, vote, packet by id, packet by code, agenda item, attachment). Each returns the organization id, or null when the resource doesn't exist.
- `requireRole(min, resolve)`: Express middleware. It answers 404 `{ error: "Not found" }` when the resource doesn't exist or the user isn't a member, and 403 `{ error: "You need the <role> role for this" }` when the role is too low. Otherwise it sets `req.org`. Each use carries a marker the route test can find.
- `membershipService.ts`: list members and pending additions, add by email, change role, remove, leave, the last-owner rule, and turning pending additions into memberships at sign-in.

### Route rules

Every route in the explorer's route map gets a rule, by these defaults:

- **GET:** viewer.
- **Creating or changing documents, versions and sections:** secretary.
- **Meeting records, votes, packets, agenda items and attachments:** secretary.
- **Amendments:**
  - `POST /documents/:docId/amendments`: member, recording `createdById`.
  - `PUT` and `DELETE /amendments/:id`, `POST /amendments/:id/changes`, and `DELETE` of a change: member when the amendment is a draft the user created, otherwise secretary.
  - Status changes and apply: secretary.
- **Organizations:**
  - `PUT /organizations/:id`: admin.
  - `DELETE /organizations/:id`: owner.
  - `PUT` copies only `name` and `description`, not the whole body.
- **Share:** all four `/documents/:id/share` routes need admin. The public `/api/share` responses stop including `Section.annotation`, which holds internal commentary.

The routes that list or create organizations change shape:

- `GET /organizations` and `GET /bylawyer/organizations` return only the user's organizations, each with the user's `role`.
- `POST /organizations` makes the creator its owner, in one transaction. It answers 429 "You can own at most 3 organizations" when the user already owns 3.
- `GET /organizations/by-slug/:slug` follows the same 404 rule.

### Routes that take two resources

Each answers 404 when the second resource isn't in `req.org`:

- `GET /versions/:id/diff/:otherId`: both versions must belong to the same document.
- `POST /amendments/:id/changes`: `targetSectionId` and `parentSectionId` must be sections of the amendment's document's current version.
- `POST /meetings/:id/votes`: the amendment must be in the meeting's organization.
- `PUT /agenda-items/reorder` and `PUT /attachments/reorder`: every id must share one packet (or one agenda item) in `req.org`; otherwise 400.
- `POST /attachments/link-document`: the document must be in the packet's organization.
- `POST /agenda-items/bulk` and `POST /attachments/upload`: resolved through the body or query packet.

### Live meetings and packets

- **Creating a packet:**
  - Packets are created with `POST /organizations/:orgId/packets { robbieCode, title?, description?, scheduledFor? }` (secretary).
  - The code must be unused; otherwise 409 "That meeting code is already in use".
  - `GET /packets/:robbieCode` no longer creates a packet; it answers 404 when there is none.
  - The old `POST /packets` is removed.
- **Linking (`POST /bylawyer/link-meeting { meetingCode, organizationId }`):**
  - Requires secretary in that organization.
  - Creates the packet if there is none.
  - If the code is already linked to that organization it succeeds; if it belongs to another organization, the answer is 409.
- **Unlinking (`DELETE /bylawyer/link-meeting/:meetingCode`):** requires secretary in the packet's organization. It deletes the packet only when it has no agenda items or attachments; otherwise 409 "Remove the agenda and attachments first".
- **Finding a meeting's organization:** `GET /bylawyer/meeting/:meetingCode/organization` and `bylawSyncService` read the packet, not the legacy column. The legacy column is no longer written or read; M5 drops it.
- **Live sync:** `bylawSyncService` skips (and logs) a motion whose document isn't in the meeting's organization.
- **Removed routes:**
  - `POST /robbie/sync-motion`, since nothing calls it and the socket path is the only sync;
  - `GET /robbie/amendments`, which lists every organization's data and has no client.
  - The two remaining `/robbie` routes get viewer rules.

### Adding people by email

`POST /organizations/:id/members { email, role }` (admin; only an owner can add an owner):

- Every add records an `OrganizationInvite`.
  - **The email has an account:** the membership is created at once and the invite gets `acceptedAt`.
  - **The email has no account:** the invite waits.
  - **The email is already a member:** 409.
  - **The email already has a pending invite:** that invite's role is updated, and no new email is sent.
- The organization may record at most 20 invites in 24 hours; past that, 429 "This organization has added 20 people today. Try again tomorrow."
- An email tells the person who added them and to which organization, with a link to the app. If the send fails, the add still stands and the response says `emailSent: false`.
- **At sign-in:** `verifySignInCode`, in the transaction that finds or creates the user, turns every pending invite for that email into a membership. An invite isn't pending once it's accepted or canceled, or if it's older than 30 days.

Other member routes:

- `GET /organizations/:id/members`: viewer. Returns members (`userId`, `name`, `email`, `role`) and, for admins, pending invites.
- `PUT /organizations/:id/members/:userId { role }`: admin.
  - Admins can't change owners, and can't make anyone an owner.
  - The last owner can't be demoted.
- `DELETE /organizations/:id/members/:userId`: admin, or the member themselves to leave. The same owner rules apply.
- `DELETE /organizations/:id/invites/:inviteId`: admin.

### Terms acceptance

- **Current version:** `TERMS_VERSION` in `shared` (a date string, `2026-10-06`) names the current terms.
- **`GET /api/auth/me`** adds `termsAccepted: boolean`. It is true when the user's `termsVersion` equals the current version.
- **`POST /api/auth/accept-terms { version }`** records acceptance. A version other than the current one gets 409, so a stale client can't accept terms the user never saw.
- **REST:** `requireTerms` runs after `authenticate` on every `/api` route outside `/api/auth`. Without acceptance it answers 403 `{ error: "Accept the terms to continue", code: "TERMS_NOT_ACCEPTED" }`.
- **Sockets:** `socketAuth` refuses the connection the same way.

## Clients

### Web

- **Organization switcher:** shows only the user's organizations, with a "New organization" action.
- **No organizations yet:** the user sees "Create an organization, or ask your organization's secretary to add `<your email>`".
- **Role awareness:** `OrganizationContext` exposes the current role. A `useCan(minRole)` helper hides or disables actions the role can't take. The server stays the authority.
- **Settings:**
  - **Members:** list, add by email with a role, change role, remove, plus pending additions with Cancel.
  - **Organization:** name and description (admin).
  - **Leave organization.**
  - **Delete organization** (owner), confirmed by typing its name.
- **Meeting scheduling:**
  - Creates the packet under the current organization.
  - The chair's documents panel reads it by code and treats 404 as "no packet yet".
  - `BylawyerLinkPanel` lists only organizations where the user is secretary or above.
- **Terms at sign-in:**
  - New users tick "I'm 13 or older and agree to the Terms of Service and Privacy Policy" at the name step.
  - A signed-in user whose `termsAccepted` is false gets a terms step before anything else.
  - The API client treats a 403 with `TERMS_NOT_ACCEPTED` the same way.
  - `/terms` and `/privacy` are public pages.
- **Terms text:** the repository ships a short draft of both documents, marked "Draft, not yet reviewed". It must be replaced with reviewed text before launch, and each replacement bumps `TERMS_VERSION`.

### Mobile

- **Terms:** the name screen gets the same checkbox, and a terms screen covers existing users. The links open the web pages.
- **Socket:** a refused connection with "Accept the terms" sends the user to the terms screen.
- **Organizations:** mobile uses none in this part.

## Error handling

- Not a member, or the resource doesn't exist: 404 `{ error: "Not found" }`.
- Role too low: 403 `{ error: "You need the <role> role for this" }`.
- Terms not accepted: 403 with code `TERMS_NOT_ACCEPTED`.
- The last-owner rule: 409 "An organization needs at least one owner".
- The limits: 429 with the messages above.

## Testing

- **Route coverage test:** walks the Express router and fails if a route under `/api` (outside `/api/auth`, `/api/share` and `/api/health`) has no `requireRole` rule.
- **Integration matrix:** for every route, a table-driven test checks:
  - 401 without a session;
  - 404 for a member of another organization;
  - 403 for a role one step too low;
  - success for the minimum role.
- **Routes that take two resources:** each gets a cross-organization test.
- **Membership:**
  - add an existing user;
  - add an unknown email, then sign in as it;
  - re-adding a pending email updates its role;
  - the 20-a-day and 3-owned limits;
  - the last-owner rule for demote, remove and leave;
  - admins can't touch owners.
- **Terms:**
  - `me` reports acceptance;
  - accepting a stale version fails;
  - REST and socket refuse a user who hasn't accepted.
- **Live sync:** a motion whose document is in another organization is skipped.
- **Web:**
  - the switcher shows only the user's organizations;
  - the empty state;
  - the members page actions;
  - `useCan` hides actions;
  - the terms step for new and existing users.
- **Mobile:** the terms checkbox and the terms screen.

## Out of scope

- Meeting roles, guests, and who may create or chair a live meeting (part 3). `ADMIN_EMAILS` keeps deciding the live-meeting admin role until then.
- Account deletion and data export (the next piece, built on the last-owner rule).
- Transferring an organization's documents to another organization.
- Dropping the legacy `meetings.bylawyer_org_id` column (M5).

## Known limits

- **Meeting codes can be claimed first.** Anyone who is a secretary in some organization can claim an unused code for it, so a code someone else meant to use can be taken. Generated codes are random, so this matters only for chosen codes. Part 3 decides how codes are created.
- **Additions stay pending until sign-in.** A pending addition gives nothing until that email signs in. An admin who added the wrong email can cancel it, but an email that was already sent can't be recalled.
- **The daily limit counts additions, not emails sent.** Repeated adds of the same pending email update the role without sending a second email, so they can't be used to flood one address.
