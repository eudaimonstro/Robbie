# Onboarding a new HOA

Status: built (2026-10-08, #54). Batch C of the review pass: product review recommendations 1, 4, 5, 6, 7, 8 and 9, screens 12, 16 and 21, and the version-remap bug.

## Why

A volunteer secretary sets up the HOA alone, weeks before the first meeting. Today a new organization's quorum is silently 3, nothing guides the setup, members are added one email at a time, people added by email who never signed in can't be marked present, paper proxies don't count toward quorum, and the emails look like phishing. Each is small; together they decide whether the first meeting embarrasses the board.

## Decisions

### 1. Quorum at setup

- **New organization asks for both.** The dialog gets "How many voting members?" (homes or lots that vote, with help text) and "Quorum" (a percentage of them or a number of people, "from your bylaws"). Both are required in the dialog. One component, `QuorumFields`, serves the dialog, the Attendance card in Settings and the checklist, so the words match everywhere.
- **The server takes them on create** (`eligibleVoters`, `quorumPercent` or `quorumCount`, optional in the API for compatibility; the web always sends them).
- **"Set up" means** `eligibleVoters` is set and one of `quorumPercent`/`quorumCount` is set (`organizationReady` in `orgs/organizationService.ts`, `isQuorumSet` on the web). Requiring `eligibleVoters` is what catches the old silent default: every existing organization made without them has `quorumCount = 3` and no voting members, so it gets the same prompt.
- **The schema drops `@default(3)`** on `quorumCount` (a Prisma-generated migration; existing rows keep their values). "Counted from the members list" goes from the Attendance card: the voting members are a number from the bylaws.
- **A meeting can't open until set up.** The server refuses to create a live meeting's state (the first join, display included) for an organization that isn't set up: join answers `QUORUM_NOT_SET` with "This meeting can't open until the voting members and quorum are set in Settings." A live meeting already open goes on. The web shows the same on the meeting screen with a link to Settings, Attendance (`/settings#attendance`), and Live Meetings and Home replace Start/Join with a caution line and the link while the organization isn't set up.

### 2. Members added by email who never signed in

- **Model: they are counted in the room by name** (the headcount with names). Someone added by email who never signed in has no account, which is exactly what the headcount is ("people in the room without an account, with names for the minutes"). Marking them present adds their name to the headcount names and one to the count; marking them absent takes both back. Quorum, the display and the minutes already handle the headcount, so nothing new is counted twice or missed. Rejected: `MARK_PRESENT` with an invite id. A member in the live state needs a user id, the enricher looks people up by user id, the minutes would need a third kind of attendee, and it changes four files the elections work owns.
- **The roster lists them**: `GET /api/packets/:code/roster` returns pending additions with the member role or above as `{ id, name, role }` to those who mark people present: secretaries and above, and the presiding officer (emails for admins only, as now). The chair's roster shows them with "Added, not yet signed in", Mark present and, once counted, "Counted in the room" with Mark absent.
- **Taps don't lose each other.** `SET_HEADCOUNT` replaces the count and names, so the roster waits for the meeting to show one change before allowing the next (the buttons for people added by email are disabled meanwhile).
- **Counted twice**: when someone in the headcount names signs in and is present on a device, the panel says so ("Carmen Diaz is counted in the room and is now here on a device.") with a one-tap fix that takes them out of the headcount.
- **Names come from the addition.** `OrganizationInvite` gets `name` (optional, at most 100 characters), set by the single add (an optional Name field) and the bulk add. On sign-in, a new user without a name gets the name step pre-filled with it (`suggestedName` on `/api/auth/verify` and `/api/auth/me`).

### 3. Proxies and absentee ballots

- **One more count beside the headcount**: "Proxies and absentee ballots held". `SET_HEADCOUNT` gets an optional `proxiesHeld` (0 to `MAX_HEADCOUNT`; left out keeps the meeting's), the state `proxiesHeld` (default 0), `attendanceSummary` `proxiesHeld`, counted in `present` and so toward quorum. These are the only changes in the meeting's action pipeline: one field in `actionSchemas.ts`, a few lines in the reducer's `SET_HEADCOUNT` case (logging the proxies when they change) and in the minutes generator's attendance paragraph ("Proxies and absentee ballots held: 21, counted toward quorum.").
- **Shown separately**: the console's breakdown line ("12 on a device, 3 marked present, 25 counted in the room, 21 by proxy or absentee ballot"), and the TV's attendance block, under the quorum line, when there are any ("40 here, 21 by proxy or absentee ballot").
- The in-app proxies (`proxies`, `proxiesCountForQuorum`) are left as they are.

### 4. Setup checklist

On Home, for secretaries and above, while the organization isn't set up, a card "Set up <name>" with four steps that tick themselves off from data the page loads:

1. **Voting members and quorum**: the `QuorumFields` form inline for admins; others are told an admin sets them in Settings.
2. **The bylaws**: done when a bylaws document has a current version. The button creates a document titled "Bylaws" (or reuses the bylaws document without a version) and opens Import.
3. **Members**: done when the organization has another member or a pending addition. Links to Settings, Members (`/settings#members`), where the bulk add is.
4. **The first meeting**: done when anything is scheduled. Links to Live Meetings.

Hidden once all four are done. The Maple Grove demo is set up, so it never shows there.

### 5. Bulk add

- **Settings, Members: "Add several people"** opens a textarea: one person per line, "Name, email", "Name <email>", a spreadsheet row (tabs), or just an email. The preview lists each line: to add, already a member, waiting to sign in (role and name updated), or the problem ("No email address on this line", "Two email addresses on one line", "Listed twice", "The name is longer than 100 characters"). One role for the batch. Add sends only the good lines.
- **One request**: `POST /api/organizations/:id/members/bulk { people: [{ email, name? }], role }`, admin, under `heavyWriteLimiter`, at most 500 people, validated again on the server (zod: emails, names, no duplicates). Answers `{ results: [{ email, status }] }` with status `added`, `invited`, `updated` or `member`.
- **No emails from a bulk add.** The daily cap of 20 emailed additions (`MAX_ADDS_PER_DAY`) exists because the added email is the abuse vector; a bulk add sends none, so it doesn't count toward it. `OrganizationInvite.emailed` (default true) records which additions were emailed; the 20-a-day check counts only those. Bulk additions have their own cap, 1,000 a day per organization. The screen says so: "No emails are sent. Each person joins the first time they sign in with this address, for example from the meeting's link." (The meeting notice, batch G, will be the email they get.)

### 6. Emails

- **Sign-in code**: subject "482913 is your Robbie code" (the code shows on the lock screen and in the one-time-code suggestion). The HTML is the brand's paper, ink and gavel, no gradient, no tagline; the plain text says the same.
- **Added to an organization**: says who added them (quoted, with their email), that the organization uses Robbie for its meetings, bylaws and minutes, that there is nothing to install or pay, what to do (nothing until the meeting, or sign in with this address now), and that a stranger's addition can be ignored or left. Plain text only, as now.

### 7. People without a phone

"No phone? You still count: the chair will count you in the room." under the QR code on the display before the call to order, and on the sign-in page.

### 8. Screens

- **12, the scheduler**: placeholders become hints ("e.g. Annual meeting", "e.g. the clubhouse"), and an empty Place gets a muted line: "Add the place: it heads the minutes and members see it on their phones." Placeholder text gets a lighter ink in `index.css`.
- **16, the phone before the call to order**: one card. The empty question card ("Nothing is before the meeting yet.") goes; the lobby block says "You're checked in." once present, then "The meeting has not been called to order yet." with the time and the chair.
- **21, sign-in from a meeting link**: when `next` is `/meetings/<code>`, the heading is "Sign in to join meeting <code>"; the code step has "Send a new code"; a wrong code's message sits under the code field (`aria-invalid`, `aria-describedby`).

### 9. Versions remap open amendments

`POST /api/documents/:id/versions` (copy) and `POST /api/documents/:id/versions/import` give sections new ids. Both now remap the document's draft and proposed amendments, as applying an amendment does, through one exported `remapOpenAmendments(tx, documentId, versionId, idMap, except?)`:

- **Copy**: the id map from the copy.
- **Import**: old sections matched to new by number label (normalized, unique on both sides), then by title, then, for sections with neither, by position under a matched parent.
- **Unmatched**: the change keeps its old id and gets `targetLabel` filled from the old section if it had none, so the amendment page says "Section 4.2 is no longer in the bylaws" for it.

## Out of scope, known

- Owners with several lots, an owner roster, the meeting notice (batch G), board meetings.
- A public endpoint for a meeting's title before sign-in: the sign-in page names the meeting by its code, which is what the TV shows.

## Tests

Shared: `attendanceSummary` with `proxiesHeld`, the reducer's `SET_HEADCOUNT` with and without it. Backend unit: emails (subject, text), bulk parsing schema. Integration: organization create with the quorum, the join refused until set up, roster invites, bulk add (statuses, limit, no emails, cap), single add with a name, `suggestedName`, both version paths remapping (copy by id; import by label, title and position; unmatched keeps its label). Web: `QuorumFields`, the new-organization dialog, the checklist, the bulk add preview, the roster's invite rows and the counted-twice notice, the headcount form's proxies, the sign-in page from a meeting link, Live Meetings' gate, the phone lobby, the scheduler hints.
