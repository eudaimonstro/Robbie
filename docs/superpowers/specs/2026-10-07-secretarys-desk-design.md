# The secretary's desk (MVP Phase C)

Status: design, 2026-10-07. Phase C of `docs/mvp-roadmap.md`.

## Why

After Phase B a meeting can be run in the room, but the paperwork around it is still missing. The bylaws can only be typed in one section at a time, so the first thing a new organization does is the most tedious. Nothing produces minutes: the meeting log exists, the minutes generator in `shared/utils/minutesGenerator.ts` is never called, and `backend-node/src/bylawyer/services/minutesService.ts` is dead code. The minutes from the last meeting can't be approved, because nothing puts them in front of the meeting. Export offers HTML and PDF items that call routes that don't exist, the header search calls an endpoint that doesn't exist, and an amendment's effect can't be previewed although the server can compute it.

This phase covers steps 2 and 14 of the roadmap's acceptance scenario: pasting the bylaws in, and the secretary publishing the minutes afterward.

## Decisions

- **Minutes are their own record, not a bylaws-style document.** A `Minutes` row per scheduled meeting holds Markdown text, a status (draft, published, approved) and who did what when. Markdown is what a secretary edits, what prints well and what exports cleanly; the section tree suits bylaws, not minutes. `minutesService.ts` and its tests are deleted.
- **The draft is written by the app at adjournment**, from the final meeting state, and is only ever a starting point: the secretary edits freely.
- **Published minutes are what the next meeting approves.** When a meeting's live state is created, the organization's most recent published, not yet approved minutes are loaded into it. Approving them in the meeting (with or without corrections) marks them approved.
- **PDF comes from the browser.** "Print or save as PDF" opens a print-ready page; the browser's print dialog saves a PDF. No server-side PDF engine.
- **Import parses text the same way whatever the source.** Pasted text, `.txt`, `.md` and `.docx` all become plain text with heading markers, and one parser turns that into the section tree.

## Bylaws import

### Parsing

`shared/utils/bylawsParser.ts` exports `parseBylaws(text: string): ParsedSection[]`, where `ParsedSection` is `{ numberLabel: string | null; title: string | null; content: string; children: ParsedSection[] }`. It recognizes, case-insensitively, at the start of a line:

- Articles: `Article I`, `ARTICLE 1`, `Article One`, optionally followed by a separator (`.`, `:`, `-`, a dash) and a title on the same line, or the title alone on the next line when that line is short and has no ending period.
- Sections: `Section 1`, `Section 1.1`, `Sec. 4.2`, `§ 3`, and bare decimal labels `4.2` or `4.2.1` at the start of a line followed by a title or text.
- Markdown headings (`#`, `##`, `###`) as a fallback level structure when no article or section labels are found.

Text between headings is the content of the nearest heading, with paragraphs kept (blank lines). Sections nest under the current article; decimal labels with more parts (`4.2.1`) nest under the matching shorter label. Text before the first heading becomes a preamble section with no label. The parser is pure and has table-driven tests with real-world shapes (all caps, mixed numbering, titles on their own lines, Markdown).

### Sources

- **Paste**: a textarea.
- **`.txt` and `.md`**: read in the browser.
- **`.docx`**: `POST /api/documents/:id/import/docx` (secretary, 5 MB limit, raw body like uploads) converts with `mammoth` to text, keeping heading paragraphs as lines, and returns `{ text }`. The client then parses as for paste. The server never stores the file.

### Flow

On a document with no versions, and from the document's menu as "Import a new version", an **Import** screen:

1. Choose a source (paste, or a file).
2. **Review**: the parsed tree on the left with counts ("6 articles, 29 sections"), the source text on the right. The secretary can fix it before saving: rename a label or title, merge a section into the one above, split nothing (they fix the text and parse again). A "Parse again" button re-runs the parser on edited text.
3. **Save** as a new version (effective date and notes fields, as the New Version form has) through `POST /api/documents/:id/versions/import` (secretary) with `{ effectiveDate?, notes?, sections: ParsedSection[] }`, which creates the version and its sections in one transaction and makes it current.

## Export and print

- **Print or save as PDF**: `/documents/:id/print?version=` (viewer) and `/share/:token/print` (public) render the version in the document typeface with print CSS: page margins, the organization and document title in a running header, "Version 2, effective March 15, 2026" under the title, articles starting on a new page when long, no app chrome. The page calls `window.print()` when opened with `?print=1`.
- **Markdown**: as today.
- The HTML and PDF items that call missing routes are removed, along with their client functions.

## Amendment preview

The amendment page gets a **Preview** tab beside the changes list, from `GET /api/amendments/:id/preview`: the document as it would read after the amendment, with added sections marked in carried, removed ones struck through in muted ink, and modified ones showing the new text with a "Changed" badge and a toggle to show the old text. It is shown for drafts and proposed amendments; a passed and applied amendment links to the version it produced instead.

## Search

`GET /api/organizations/:orgId/search?q=` (viewer, at least 2 characters, at most 20 results) searches the current version of each of the organization's documents: section number labels, titles and content, case-insensitively, returning `{ documentId, documentTitle, versionId, sectionId, numberLabel, title, snippet }` with the snippet around the first match. The header search uses it for the current organization and opens the document at the section (`/documents/:id#section-<sectionId>`; the document page scrolls to and highlights the section). The public share page's search stays as it is.

## Minutes

### Data model

```prisma
enum MinutesStatus {
  draft
  published
  approved
}

model Minutes {
  id             String        @id @default(uuid())
  organizationId String
  packetId       String        @unique
  status         MinutesStatus @default(draft)
  body           String        // Markdown
  generatedAt    DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  updatedById    Int?
  publishedAt    DateTime?
  publishedById  Int?
  approvedAt     DateTime?
  approvedAtPacketId String?   // the meeting that approved them
  corrections    String?       // corrections made when approved
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  packet         MeetingPacket @relation(fields: [packetId], references: [id], onDelete: Cascade)
  @@index([organizationId, status])
}
```

### The draft

When `END_MEETING` is applied (in the action handler, after the broadcast, like the bylaw sync), the server builds the draft with `generateMeetingMinutes(state)` and a new `formatMinutesAsMarkdown(minutes, context)` and saves it, unless minutes for that packet already exist (a restarted meeting adds nothing; the secretary can regenerate). The generator is fixed and extended first:

- Header: organization name, "Minutes of the <title>", date and place (from the packet), the presiding officer, called to order at and adjourned at (from the log's timestamps, formatted in the organization's time zone; today it produces "Invalid Date").
- The organization's time zone is a new `Organization.timeZone String` (an IANA name). The web app sends the creator's browser time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) when an organization is created, existing organizations get `America/Chicago` from the migration, and admins can change it in Settings next to the quorum settings.
- Attendance: members present by name (device or marked), the headcount with its names, guests by name, absent members, and whether a quorum was present at the call to order and at each vote.
- Each agenda item in order, and under it every disposition in the order it happened: motions with their text, mover and seconder (today hard-coded empty), the vote with both parts ("Carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5") or "Adopted by unanimous consent", motions withdrawn or that died for lack of a second, amendments and how they changed the motion, chair rulings and appeals, elections with each ballot's results and who was elected, approval of the previous minutes with any corrections.
- Adjournment time.

Ballot votes record totals only, never names.

The meeting record also needs the facts the generator can't infer from the log alone: who moved and seconded each motion, and when each disposition happened. Each `CompletedMotion` gains `seconder` and `decidedAt`, and the reducer records motions that never reached a vote (withdrawn, died for lack of a second, adopted by unanimous consent) in `completedMotions` with a `disposition` field (`'carried' | 'failed' | 'unanimous' | 'withdrawn' | 'no-second'`). The generator reads those, not log strings.

### The secretary's flow

- A **Minutes** page for the organization (`/minutes`, sidebar item) lists minutes by meeting date with their status.
- The **minutes editor** (`/minutes/:id`, secretary to edit, viewer to read when published): a Markdown editor with a live preview side by side (stacked on phones), autosave every few seconds of idle typing, "Regenerate from the meeting" (with a confirmation, since it replaces the text), **Publish** (secretary; makes them readable by every member and puts them in front of the next meeting), and once published, **Print or save as PDF** and **Download Markdown**.
- Members see published and approved minutes read-only. Drafts are visible to secretaries and above only.
- `GET/PUT /api/minutes/:id`, `POST /api/minutes/:id/publish`, `POST /api/minutes/:id/regenerate`, `GET /api/organizations/:orgId/minutes`, all with `requireRole` rules and covered by the route coverage test.

### Approval at the next meeting

- When a meeting's live state is created from its packet, the organization's most recent published minutes (not yet approved, and not this meeting's own) are loaded: `minutesFromPreviousMeeting` gets the Markdown and a new `previousMinutesId` records which.
- The chair console's "Approval of the minutes" item (the minutes-approval stage or the agenda item the chair calls) shows the minutes and two actions: **Approve as read** (`APPROVE_MINUTES`) and **Approve with corrections** (`APPROVE_MINUTES { corrections }`, a text the chair types). The phone view and the display show the minutes' heading and "Any corrections?".
- After the action, the server marks the minutes approved with `approvedAtPacketId` and the corrections, best effort like the bylaw sync. The minutes page shows "Approved at the <meeting> with corrections: ..." under the heading.

## Testing

- Shared: the parser table (at least 12 shapes), the minutes generator and Markdown formatter against a full scenario state (attendance with headcount, a hybrid vote, a ballot, unanimous consent, an election, approval with corrections).
- Server: the import route (docx conversion with a fixture file, size limit), versions/import (transaction, roles), search (roles, snippet, cross-organization isolation), minutes routes (matrix rules, draft visibility to members is 404, publish, regenerate), the draft at adjournment (once per packet), loading previous minutes into a new meeting, approval marking the minutes.
- Web: the import screen (paste, parse, edit, save), the print page, the amendment preview tab, header search, the minutes list and editor (autosave, publish, read-only for members).
- e2e: extend the meeting scenario: after adjourning, Pat opens the draft minutes, sees the pool motion with both parts of the vote, publishes them; and a short import scenario that pastes the Maple Grove bylaws text and checks the article and section counts.

## Out of scope

- Word (`.docx`) export; Markdown and print cover the MVP.
- Collaborative editing of minutes by two people at once (last save wins; the editor shows who saved last).
- Importing PDFs.
