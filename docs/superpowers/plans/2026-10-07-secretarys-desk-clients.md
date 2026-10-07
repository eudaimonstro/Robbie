# The Secretary's Desk (Clients) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app's half of the secretary's desk: an import screen that turns pasted bylaws, a `.txt`, `.md` or `.docx` file into reviewed sections and saves them as a version; print pages (the browser saves the PDF) and an export menu without the broken HTML and PDF items; a Preview tab on an amendment; a header search that finds sections and opens the document at them; a Minutes page and a minutes editor (Markdown beside its preview, autosave, regenerate, publish, print, download); the approval of the previous minutes in the chair console, the phone view and the display; the organization's time zone on creation and in Settings, and the meeting's place on the schedule; and two Playwright scenarios.

**Architecture:**

- **Import** (`/documents/:documentId/import`, `ImportBylawsPage`): a source step (paste, or a file read in the browser, or a `.docx` the server turns into text), then a review step with the parsed tree on the left (rename a label or title, merge a section into the one above; `parsedTree.ts`), the text on the right with "Parse again", and the save form (effective date, notes). It parses with the shared `parseBylaws` and counts with `describeParsedBylaws`.
- **Print** (`PrintableDocument`, `PrintShell`): `/documents/:documentId/print`, `/share/:shareToken/print` and `/minutes/:minutesId/print` render outside the app's chrome in the document typeface, with a running header and print CSS, and call `window.print()` when opened with `?print=1`. The document's export menu offers "Print or save as PDF" and "Markdown".
- **Amendment preview** (`AmendmentTabs`, `AmendmentPreview`): Changes and Preview tabs for drafts and proposed amendments; a link to the version an applied amendment produced (the document page reads `?version=`).
- **Search**: the header calls the organization search and navigates to `/documents/:id#section-<sectionId>`; the document page selects and scrolls to that section (`useSectionFromHash`).
- **Minutes** (`MinutesListPage` at `/minutes`, a sidebar item; `MinutesPage` at `/minutes/:minutesId`): a secretary edits drafts and published minutes, members read published and approved ones.
- **Approval in the meeting** (`minutesItemUnderWay`, `minutesHeading`; `MinutesApprovalCard` in the console's Now column, `MinutesNotice` on the phone, and the display's minutes view): the chair approves as read or with corrections; the phones and the display show the minutes' heading and "Any corrections?". The old `MinutesApprovalPanel` goes.
- **Settings and creation**: the browser's time zone is sent when an organization is created; `TimeZoneCard` beside the attendance settings; a Place field in the scheduler.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4.3 on the brief's tokens, react-markdown 10, Vitest 5 with Testing Library, `@playwright/test`; Node 24.

**Design:** `docs/superpowers/specs/2026-10-07-secretarys-desk-design.md` (Phase C of `docs/mvp-roadmap.md`), sections "Bylaws import" (Sources, Flow), "Export and print", "Amendment preview", "Search", "Minutes" (the secretary's flow, approval at the next meeting) and "Testing" (web and e2e); the look and feel is `docs/design-brief.md`, authoritative for every screen here. The server plan, `docs/superpowers/plans/2026-10-07-secretarys-desk-server.md`, is done when this one starts; every name below is spelled as it defines it.

**Server API this plan uses** (all from the server plan; this plan changes nothing on the server):

| Call                                                                                        | Answer                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/documents/:docId/import/docx`                                                    | Secretary. Raw body with `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`, at most 5 MB: `{ text }` (headings as `#` lines). 400 `{ error }` for no file or one that isn't a Word document; 413 over 5 MB                                                                                                                                                    |
| `POST /api/documents/:docId/versions/import`                                                | Secretary. `{ effectiveDate?, notes?, sections: ParsedSection[] }` (at most 2,000 sections, 6 levels): 201, the new current version with `sectionCount`                                                                                                                                                                                                                                             |
| `GET /api/organizations/:orgId/search?q=`                                                   | Viewer. `{ query, results: SearchHit[] }`, `SearchHit` = `{ documentId, documentTitle, versionId, sectionId, numberLabel, title, snippet }`, at most 20; 400 under 2 characters                                                                                                                                                                                                                     |
| `GET /api/amendments/:id/preview`                                                           | Viewer. `{ amendmentId, amendmentTitle, sections }`: the section tree after the amendment, each section with `modified`, `added`, `deleted`, `previous: { numberLabel, title, content } \| null` and `children`                                                                                                                                                                                     |
| `GET /api/organizations/:orgId/minutes`                                                     | Viewer. `MinutesSummary[]`, the latest meeting first: `{ id, status, generatedAt, updatedAt, publishedAt, approvedAt, packet: { id, robbieCode, title, scheduledFor } }`; drafts only for secretaries and above                                                                                                                                                                                     |
| `GET /api/minutes/:id`                                                                      | Viewer; a draft is 404 below secretary. `MinutesRecord`: `{ id, organizationId, packetId, status, body, generatedAt, updatedAt, publishedAt, approvedAt, corrections, packet: { id, robbieCode, title, scheduledFor, location }, organization: { id, name, timeZone }, updatedBy: { id, name } \| null, publishedBy: { id, name } \| null, approvedAtPacket: { id, title, scheduledFor } \| null }` |
| `PUT /api/minutes/:id`, `POST /api/minutes/:id/publish`, `POST /api/minutes/:id/regenerate` | Secretary. `{ body }` (at most 200,000 characters) / nothing / nothing: the `MinutesRecord`. 409 `{ error }` for approved minutes, for regenerating anything but a draft, and when the meeting has no live record                                                                                                                                                                                   |
| `POST /api/organizations`, `PUT /api/organizations/:id`                                     | Take `timeZone` (an IANA name); organizations carry `timeZone`                                                                                                                                                                                                                                                                                                                                      |
| `POST /api/organizations/:orgId/packets`, `PUT /api/packets/:id`                            | Take `location` (`null` clears it on update); packets and the schedule's rows carry `location`                                                                                                                                                                                                                                                                                                      |
| The meeting state                                                                           | `minutesFromPreviousMeeting` (Markdown) and `previousMinutesId`, loaded by the server before the call to order; `minutesApproved`; `minutesApproval: { corrections, timestamp, decidedAt?, agendaItemId? } \| null`; completed motions carry `disposition` (`'carried' \| 'failed' \| 'unanimous' \| 'withdrawn' \| 'no-second'`)                                                                   |
| `APPROVE_MINUTES { corrections?, timestamp }`                                               | The chair and admins; corrections at most 2,000 characters (`MAX_CORRECTIONS_LENGTH`); refused once approved (`MINUTES_ALREADY_APPROVED`)                                                                                                                                                                                                                                                           |
| Shared utils                                                                                | `parseBylaws(text): ParsedSection[]`, `describeParsedBylaws(sections)` ("6 articles, 23 sections", ", and a preamble", "No headings found"), `ParsedSection` = `{ numberLabel, title, content, children }`                                                                                                                                                                                          |
| The demo                                                                                    | Maple Grove keeps `America/Chicago`; the 2025 annual meeting (`MAPLE25`) has published minutes, put before every demo meeting not yet called to order; the 2026 meeting is at "Maple Grove Clubhouse, 400 Maple Grove Drive"                                                                                                                                                                        |

**Conventions:**

- Work on the branch the server plan made (`feat/secretarys-desk`).
- Paths are from the repository root. Run commands from the repository root unless a step says `cd frontend-unified &&`. Use `&&` between commands, never `;`.
- Use Node 24. The system `node` is 22; put Node 24 first on the PATH in each shell, and check that `node --version` prints `v24.21.0`:

  ```bash
  export PATH=/tmp/claude-1000/-home-steve-workspace-robbie/943dc342-9d15-4cdf-b298-60456f7372f0/scratchpad/node24/node-v24.21.0-linux-x64/bin:$PATH
  ```

- Web tests: `cd frontend-unified && TZ=America/Chicago npx vitest run <path>`; the whole suite is `npm run test:run -w frontend-unified`. The web Vitest config has no `clearMocks`, so each test file clears its own mocks (`vi.clearAllMocks()` in `beforeEach`). Type-check: `cd frontend-unified && npx tsc --noEmit -p .` (it includes the tests). There is no `user-event` and no jest-dom: tests use `fireEvent` and `toBeTruthy`.
- The server plan is done. If `shared/dist` is older than `shared/types/index.ts`, run `npm run build:shared` before type-checking the web app.
- Never point anything at port 5432 (another project's database; `backend-node/.env` points there). The Playwright harness and the live check use the throwaway Postgres on port 55432. Start it once if `docker ps --filter name=robbie-ci-pg` doesn't list it:

  ```bash
  docker run --rm -d --name robbie-ci-pg -p 55432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie postgres:16-alpine
  ```

  CI's Postgres service is on port 5432 inside the runner; that is the only place 5432 appears.

- Before/after snippets show the code as it is when the task starts. Match a snippet by its text and keep the file's indentation. They were written against `feat/in-the-room` at commit `217bded`, while Phase B was still landing: if a snippet no longer matches because Phase B changed the file, read it, make the change the step describes at the place it names, and keep Phase B's code. Files whose markup changes a lot are replaced whole.
- Before each commit, run `npx prettier --write` on the files you changed; CI checks formatting. `npm run lint` runs the palette check (`scripts/check-palette.sh`): every class in this plan is a token class, never a raw Tailwind palette class, `white` or `black`, and no emoji is used as an icon (lucide only, 16px in text, 20px in buttons).
- `git add` only the paths each commit step lists (and `git rm` the files a step deletes). Never run `git checkout`, `git stash` or `git reset`.
- Commit messages carry no `Co-Authored-By` or other attribution lines.
- No emdashes and American spelling in code, comments, copy and commit messages. The brief's voice: labels are nouns ("Attendance", "Minutes"), buttons are verbs ("Publish", "Parse again", "Approve as read"), results are declarations ("Approved", "Published").
- The mobile app is not touched by this plan.

---

## File structure

**Web** (`frontend-unified/src/`):

| File                                                                                                                                                                                                                                                           | Responsibility                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/client.ts`                                                                                                                                                                                                                                                | `bylawsImport`, `amendments.preview`, `minutes`, the new search, `timeZone` and `location` on their types; `versions.exportHtml` and `exportPdf` removed |
| `utils/dates.ts`, `utils/download.ts` (new), `utils/timeZones.ts` (new)                                                                                                                                                                                        | `formatLongDate`; `downloadText`; `browserTimeZone`, `timeZoneNames`                                                                                     |
| `styles/index.css`                                                                                                                                                                                                                                             | Print pages: page margins, the running header, page breaks                                                                                               |
| `modules/documents/components/PrintableDocument.tsx` (new)                                                                                                                                                                                                     | `PrintShell`, `PrintableDocument`                                                                                                                        |
| `modules/documents/pages/PrintDocumentPage.tsx`, `PublicPrintPage.tsx`, `MinutesPrintPage.tsx` (new), `App.tsx`                                                                                                                                                | The three print pages and their routes                                                                                                                   |
| `modules/documents/pages/documentPage/ExportDropdown.tsx`, `DocumentHeader.tsx`, `pages/PublicDocumentPage.tsx`                                                                                                                                                | "Print or save as PDF" and "Markdown"; the public page prints                                                                                            |
| `modules/documents/utils/parsedTree.ts` (new), `pages/ImportBylawsPage.tsx` (new), `documentPage/DocumentContentCard.tsx`, `DocumentPage.tsx`                                                                                                                  | `renameSection`, `mergeIntoPrevious`; the import screen; "Import the bylaws" and "Import a new version"                                                  |
| `modules/documents/pages/amendmentDetailPage/AmendmentPreview.tsx`, `AmendmentTabs.tsx` (new), `AmendmentDetailPage.tsx`, `documentPage/useDocumentData.ts`                                                                                                    | The Preview tab, the link to the version produced, `?version=` on the document page                                                                      |
| `components/layout/Header.tsx`, `modules/documents/components/SectionTree.tsx`, `documentPage/sectionFromHash.ts` (new)                                                                                                                                        | Search by section; `section-<id>` anchors; `findSection`, `useSectionFromHash`                                                                           |
| `components/layout/Sidebar.tsx`, `modules/documents/pages/MinutesListPage.tsx` (new), `MinutesPage.tsx` (new), `components/ui/Badge.tsx`                                                                                                                       | The Minutes item, the list, the editor and reader; `MinutesStatusBadge`                                                                                  |
| `modules/meetings/utils/minutesApproval.ts` (new), `components/console/MinutesApprovalCard.tsx` (new), `components/phone/MinutesNotice.tsx` (new), `views/ChairConsole.tsx`, `views/PhoneView.tsx`, `views/DisplayView.tsx`, `components/console/MoreArea.tsx` | `minutesItemUnderWay`, `minutesHeading`; the approval in the three screens                                                                               |
| Deleted                                                                                                                                                                                                                                                        | `modules/meetings/components/chair/MinutesApprovalPanel.tsx`                                                                                             |
| `components/organizations/NewOrganizationModal.tsx`, `modules/documents/components/TimeZoneCard.tsx` (new), `pages/SettingsPage.tsx`                                                                                                                           | The time zone on creation and in Settings                                                                                                                |
| `modules/meetings/components/scheduling/api.ts`, `types.ts`, `MeetingScheduler.tsx`                                                                                                                                                                            | The place on the schedule                                                                                                                                |

**Repository root:** `e2e/fixtures/maple-grove-bylaws.txt` (new), `e2e/tests/import.spec.ts` (new), `e2e/tests/meeting.spec.ts`; `spec.md`, `CLAUDE.md`, `docs/mvp-roadmap.md` (Task 11).

---

### Task 1: The API client for the secretary's desk

**Files:**

- Modify: `frontend-unified/src/api/client.ts`
- Test: `frontend-unified/src/api/__tests__/client.test.ts`

Everything the screens call, added without changing what exists yet: the header's search and the export functions change with their screens (Tasks 5 and 2), so every task compiles. A Word document goes up as its raw bytes, so it uses `apiFetch` and reads the error the same way the client does; the other calls use `request`. Minutes and the preview are read fresh each time (`useCache` false): a secretary and an autosave change them while the page is open.

- [ ] **Step 1: Write the failing tests**

In `frontend-unified/src/api/__tests__/client.test.ts`, replace:

```ts
  meetingPackets,
  schedule,
  apiFetch,
```

with:

```ts
  meetingPackets,
  schedule,
  bylawsImport,
  minutes,
  apiFetch,
```

and append:

```ts
describe('secretary calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a Word document as its raw bytes and reads its text', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: '# Article I' })));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['docx bytes'], 'bylaws.docx');

    expect(await bylawsImport.docxText('doc-1', file)).toBe('# Article I');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/documents/doc-1/import/docx');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(file);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it("shows the server's message when a Word document can't be read", async () => {
    mockResponse(400, { error: 'That file is not a Word document Robbie can read' });
    await expect(bylawsImport.docxText('doc-1', new File(['x'], 'x.docx'))).rejects.toThrow(
      'That file is not a Word document Robbie can read',
    );
  });

  it('saves parsed sections as a new version', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: 'v3', versionNumber: 3, sectionCount: 2 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const sections = [
      { numberLabel: 'Article I', title: 'Name', content: '', children: [] },
      { numberLabel: 'Article II', title: 'Members', content: '', children: [] },
    ];

    const saved = await bylawsImport.saveVersion('doc-1', { notes: 'Pasted', sections });
    expect(saved.sectionCount).toBe(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/documents/doc-1/versions/import');
    expect(JSON.parse(init.body as string)).toEqual({ notes: 'Pasted', sections });
  });

  it('reads minutes fresh each time, and saves, publishes and regenerates them', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'm1', body: '#' })));
    vi.stubGlobal('fetch', fetchMock);

    await minutes.get('m1');
    await minutes.get('m1');
    await minutes.list('org-1');
    await minutes.save('m1', '# Minutes');
    await minutes.publish('m1');
    await minutes.regenerate('m1');

    const calls = fetchMock.mock.calls.map((call) => {
      const [url, init] = call as unknown as [string, RequestInit | undefined];
      return `${init?.method ?? 'GET'} ${url}`;
    });
    expect(calls).toEqual([
      'GET /api/minutes/m1',
      'GET /api/minutes/m1',
      'GET /api/organizations/org-1/minutes',
      'PUT /api/minutes/m1',
      'POST /api/minutes/m1/publish',
      'POST /api/minutes/m1/regenerate',
    ]);
    const [, saveInit] = fetchMock.mock.calls[3] as unknown as [string, RequestInit];
    expect(JSON.parse(saveInit.body as string)).toEqual({ body: '# Minutes' });
  });

  it("reads an amendment's preview fresh each time", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sections: [] })));
    vi.stubGlobal('fetch', fetchMock);
    await amendments.preview('a1');
    await amendments.preview('a1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/amendments/a1/preview');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/api/__tests__/client.test.ts`
Expected: FAIL: `bylawsImport`, `minutes` and `amendments.preview` don't exist.

- [ ] **Step 3: Add the calls and types to `frontend-unified/src/api/client.ts`**

Replace:

```ts
import type { OrgRole } from '../utils/roles';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
```

with:

```ts
import type { OrgRole } from '../utils/roles';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import type { ParsedSection } from '@robbie-bylawyer/shared/utils';
```

In `export const amendments = {`, replace:

```ts
  deleteChange: (changeId: string) =>
    request<void>(`/amendment-changes/${changeId}`, { method: 'DELETE' }),
};
```

with:

```ts
  deleteChange: (changeId: string) =>
    request<void>(`/amendment-changes/${changeId}`, { method: 'DELETE' }),
  /** The document as it would read after the amendment. Not cached: changes are added often. */
  preview: (id: string) => request<AmendmentPreview>(`/amendments/${id}/preview`, {}, false),
};

/** The type of a .docx, which the import route reads raw */
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Bylaws import (secretary)
export const bylawsImport = {
  /** A Word document (at most 5 MB) as text with # heading lines, for parseBylaws */
  docxText: async (docId: string, file: File): Promise<string> => {
    const response = await apiFetch(`/documents/${docId}/import/docx`, {
      method: 'POST',
      headers: { 'Content-Type': DOCX_TYPE },
      body: file,
    });
    if (!response.ok) throw new HttpError(await errorMessage(response), response.status);
    return ((await response.json()) as { text: string }).text;
  },
  /** Parsed and reviewed sections as a new current version */
  saveVersion: (docId: string, data: ImportVersion) =>
    request<ImportedVersion>(`/documents/${docId}/versions/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Meeting minutes. Not cached: a secretary saves them while others read.
export const minutes = {
  list: (orgId: string) => request<MinutesSummary[]>(`/organizations/${orgId}/minutes`, {}, false),
  get: (id: string) => request<MinutesRecord>(`/minutes/${id}`, {}, false),
  save: (id: string, body: string) =>
    request<MinutesRecord>(`/minutes/${id}`, { method: 'PUT', body: JSON.stringify({ body }) }),
  publish: (id: string) => request<MinutesRecord>(`/minutes/${id}/publish`, { method: 'POST' }),
  regenerate: (id: string) =>
    request<MinutesRecord>(`/minutes/${id}/regenerate`, { method: 'POST' }),
};
```

In `interface Organization`, replace:

```ts
  quorumPercent?: number | null;
  quorumCount?: number | null;
}

export interface OrganizationCreate {
  name: string;
  description?: string;
  slug?: string;
}
```

with:

```ts
  quorumPercent?: number | null;
  quorumCount?: number | null;
  /** Where its meetings are held, as an IANA name: the minutes give times there */
  timeZone?: string;
}

export interface OrganizationCreate {
  name: string;
  description?: string;
  slug?: string;
  /** The creator's time zone; the server uses America/Chicago without one */
  timeZone?: string;
}
```

In `interface OrganizationUpdate`, replace:

```ts
  quorumPercent?: number;
  quorumCount?: number;
}
```

with:

```ts
  quorumPercent?: number;
  quorumCount?: number;
  timeZone?: string;
}
```

In `interface ScheduledMeeting`, replace:

```ts
description: string | null;
scheduledFor: string | null;
/** The presiding officer, who chairs the live meeting; null when the admins run it */
```

with:

```ts
description: string | null;
/** Where the meeting is held */
location: string | null;
scheduledFor: string | null;
/** The presiding officer, who chairs the live meeting; null when the admins run it */
```

After `export interface AmendmentChangeCreate { ... }` (the block that ends with `  position?: number;\n}` after `newTitle?: string;`), add:

```ts
/** A section of an amendment's preview: as it would read, and what the amendment does to it */
export interface PreviewSection {
  id: string;
  parentId: string | null;
  position: number;
  numberLabel: string | null;
  title: string | null;
  content: string | null;
  modified: boolean;
  added: boolean;
  deleted: boolean;
  /** Its text before the amendment, when modified or renumbered */
  previous: { numberLabel: string | null; title: string | null; content: string | null } | null;
  children: PreviewSection[];
}

export interface AmendmentPreview {
  amendmentId: string;
  amendmentTitle: string;
  sections: PreviewSection[];
}

/** What the import saves: the reviewed sections and the version's details */
export interface ImportVersion {
  effectiveDate?: string;
  notes?: string;
  sections: ParsedSection[];
}

export interface ImportedVersion extends Version {
  sectionCount: number;
}

export type MinutesStatus = 'draft' | 'published' | 'approved';

/** A meeting's minutes, as the Minutes page lists them */
export interface MinutesSummary {
  id: string;
  status: MinutesStatus;
  generatedAt: string;
  updatedAt: string;
  publishedAt: string | null;
  approvedAt: string | null;
  packet: { id: string; robbieCode: string; title: string | null; scheduledFor: string | null };
}

/** A meeting's minutes, with who did what and the meeting they are of */
export interface MinutesRecord {
  id: string;
  organizationId: string;
  packetId: string;
  status: MinutesStatus;
  /** Markdown */
  body: string;
  generatedAt: string;
  updatedAt: string;
  publishedAt: string | null;
  approvedAt: string | null;
  /** The corrections the meeting that approved them made */
  corrections: string | null;
  packet: {
    id: string;
    robbieCode: string;
    title: string | null;
    scheduledFor: string | null;
    location: string | null;
  };
  organization: { id: string; name: string; timeZone: string };
  updatedBy: { id: number; name: string | null } | null;
  publishedBy: { id: number; name: string | null } | null;
  /** The meeting that approved them */
  approvedAtPacket: { id: string; title: string | null; scheduledFor: string | null } | null;
}
```

- [ ] **Step 4: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/api/__tests__/client.test.ts && npx tsc --noEmit -p . && cd .. && npm run lint`
Expected: all pass (the five new cases among them); type-check clean; lint clean apart from its usual warnings.

- [ ] **Step 5: Commit**

```bash
npx prettier --write frontend-unified/src/api/client.ts frontend-unified/src/api/__tests__/client.test.ts
git add frontend-unified/src/api/client.ts frontend-unified/src/api/__tests__/client.test.ts
git commit -m "feat(web): the API client for the secretary's desk

Calls for the bylaws import (a Word document's text, and saving reviewed
sections as a version), an amendment's preview, and meeting minutes (list,
read, save, publish, regenerate), read fresh each time. Organizations carry
their time zone and scheduled meetings their place."
```

---

### Task 2: Print pages, and an export menu that works

**Files:**

- Create: `frontend-unified/src/modules/documents/components/PrintableDocument.tsx`, `frontend-unified/src/modules/documents/pages/PrintDocumentPage.tsx`, `frontend-unified/src/modules/documents/pages/PublicPrintPage.tsx`
- Replace: `frontend-unified/src/modules/documents/pages/documentPage/ExportDropdown.tsx`
- Modify: `frontend-unified/src/App.tsx`, `frontend-unified/src/modules/documents/pages/documentPage/DocumentHeader.tsx`, `frontend-unified/src/modules/documents/pages/PublicDocumentPage.tsx`, `frontend-unified/src/api/client.ts`, `frontend-unified/src/utils/dates.ts`, `frontend-unified/src/styles/index.css`
- Test: `frontend-unified/src/modules/documents/components/__tests__/PrintableDocument.test.tsx`, `frontend-unified/src/modules/documents/pages/__tests__/PrintDocumentPage.test.tsx`, `frontend-unified/src/modules/documents/pages/documentPage/__tests__/ExportDropdown.test.tsx` (all new), `frontend-unified/src/utils/__tests__/dates.test.ts`

The PDF comes from the browser: "Print or save as PDF" opens a print page in a new tab, which calls `window.print()` when opened with `?print=1`, and the print dialog saves the PDF (named after the page's title). The page has no app chrome: the organization and the document in a running header on every printed page (a fixed element, which browsers repeat on each page), the title, "Version 2, effective March 15, 2026", the sections in the document typeface, and a long article (more than four sections, or about a page of text) starting on a new page. The members' page is `/documents/:documentId/print?version=`; the share link's is `/share/:shareToken/print?version=`, public like the share page. The Export menu keeps Markdown and loses the HTML and PDF items, which called routes that never existed, with their client functions. The share page's Export menu becomes a print button: its Markdown item called a route that needs sign-in, so it never worked for the public.

- [ ] **Step 1: Write the failing tests**

In `frontend-unified/src/utils/__tests__/dates.test.ts`, replace:

```ts
  formatClockTime,
  formatMeetingTime,
```

with:

```ts
  formatClockTime,
  formatLongDate,
  formatMeetingTime,
```

and append:

```ts
describe('formatLongDate', () => {
  it('writes a calendar date out, on the day it was stored', () => {
    expect(formatLongDate('2026-03-15T00:00:00.000Z')).toBe('March 15, 2026');
    expect(formatLongDate(null)).toBe('');
    expect(formatLongDate('not a date')).toBe('');
  });
});
```

Create `frontend-unified/src/modules/documents/components/__tests__/PrintableDocument.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrintableDocument, type PrintSection } from '../PrintableDocument';

const rules = (prefix: string): PrintSection[] =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `${prefix}${i}`,
    numberLabel: `Section ${i + 1}`,
    title: 'Rule',
    content: 'Text.',
    children: [],
  }));

describe('PrintableDocument', () => {
  it('heads the version with the organization, the title and its effective date', () => {
    render(
      <PrintableDocument
        organizationName="Maple Grove HOA"
        documentTitle="Bylaws of Maple Grove"
        versionNumber={2}
        effectiveDate="2026-03-15T00:00:00.000Z"
        sections={[
          {
            id: 'a1',
            numberLabel: 'Article I',
            title: 'Name and Purpose',
            content: null,
            children: [
              {
                id: 's1',
                numberLabel: 'Section 1.1',
                title: 'Name',
                content: 'The name is **Maple Grove**.',
                children: [],
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Bylaws of Maple Grove' })).toBeTruthy();
    expect(screen.getByText('Version 2, effective March 15, 2026')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Article I Name and Purpose' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Section 1.1 Name' })).toBeTruthy();
    expect(screen.getByText('Maple Grove').tagName).toBe('STRONG');
    // Repeated at the top of every printed page, and only there
    expect(document.querySelector('.print-running-header')?.textContent).toBe(
      'Maple Grove HOA | Bylaws of Maple Grove',
    );
  });

  it('starts a long article on a new page, never the first', () => {
    render(
      <PrintableDocument
        organizationName="Maple Grove HOA"
        documentTitle="Bylaws"
        versionNumber={1}
        effectiveDate={null}
        sections={[
          {
            id: 'a1',
            numberLabel: 'Article I',
            title: 'Long',
            content: null,
            children: rules('a'),
          },
          {
            id: 'a2',
            numberLabel: 'Article II',
            title: 'Short',
            content: 'One line.',
            children: [],
          },
          {
            id: 'a3',
            numberLabel: 'Article III',
            title: 'Also long',
            content: null,
            children: rules('b'),
          },
        ]}
      />,
    );
    const article = (name: string) => screen.getByRole('heading', { name }).closest('section')!;
    expect(article('Article I Long').className).not.toContain('print-break-before');
    expect(article('Article II Short').className).not.toContain('print-break-before');
    expect(article('Article III Also long').className).toContain('print-break-before');
    expect(screen.getByText('Version 1')).toBeTruthy();
  });
});
```

Create `frontend-unified/src/modules/documents/pages/__tests__/PrintDocumentPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ getDocument: vi.fn(), listVersions: vi.fn(), getTree: vi.fn() }));
vi.mock('../../../../api/client', () => ({
  documents: { get: api.getDocument },
  versions: { list: api.listVersions, getTree: api.getTree },
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({ organizations: [{ id: 'org-1', name: 'Maple Grove HOA' }] }),
}));

const { default: PrintDocumentPage } = await import('../PrintDocumentPage');

const v1 = { id: 'v1', versionNumber: 1, effectiveDate: '2024-03-15T00:00:00.000Z' };
const v2 = { id: 'v2', versionNumber: 2, effectiveDate: '2026-03-15T00:00:00.000Z' };
const tree = [
  {
    id: 's1',
    numberLabel: 'Article I',
    title: 'Name and Purpose',
    content: null,
    children: [
      {
        id: 's2',
        numberLabel: 'Section 1.1',
        title: 'Name',
        content: 'The name is Maple Grove.',
        children: [],
      },
    ],
  },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/documents/:documentId/print" element={<PrintDocumentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrintDocumentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDocument.mockResolvedValue({
      id: 'd1',
      organizationId: 'org-1',
      title: 'Bylaws of Maple Grove',
      currentVersionId: 'v2',
    });
    api.listVersions.mockResolvedValue([v2, v1]);
    api.getTree.mockResolvedValue(tree);
    vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  it('shows the current version ready to print, without opening the dialog', async () => {
    renderAt('/documents/d1/print');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bylaws of Maple Grove' }),
    ).toBeTruthy();
    expect(screen.getByText('Version 2, effective March 15, 2026')).toBeTruthy();
    expect(screen.getByText('The name is Maple Grove.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the document' }).getAttribute('href')).toBe(
      '/documents/d1',
    );
    expect(api.getTree).toHaveBeenCalledWith('v2');
    // A saved PDF takes the page's title as its name
    expect(document.title).toBe('Bylaws of Maple Grove, version 2');
    expect(window.print).not.toHaveBeenCalled();
  });

  it('shows the version asked for, and opens the print dialog with print=1', async () => {
    renderAt('/documents/d1/print?version=v1&print=1');
    expect(await screen.findByText('Version 1, effective March 15, 2024')).toBeTruthy();
    expect(api.getTree).toHaveBeenCalledWith('v1');
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('says when there is nothing to print', async () => {
    api.listVersions.mockResolvedValue([]);
    renderAt('/documents/d1/print');
    expect(await screen.findByText('This document has no version to print yet.')).toBeTruthy();
  });
});
```

Create `frontend-unified/src/modules/documents/pages/documentPage/__tests__/ExportDropdown.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Version } from '../../../../../api/client';

const api = vi.hoisted(() => ({ exportMarkdown: vi.fn(async () => {}) }));
vi.mock('../../../../../api/client', () => ({ versions: { exportMarkdown: api.exportMarkdown } }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { ExportDropdown } = await import('../ExportDropdown');

const version = { id: 'v2', documentId: 'd1', versionNumber: 2 } as Version;

describe('ExportDropdown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prints the version shown in a new tab, or downloads it as Markdown, and nothing else', async () => {
    render(<ExportDropdown documentId="d1" selectedVersion={version} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Print or save as PDF',
      'Markdown',
    ]);
    const print = screen.getByRole('menuitem', { name: 'Print or save as PDF' });
    expect(print.getAttribute('href')).toBe('/documents/d1/print?version=v2&print=1');
    expect(print.getAttribute('target')).toBe('_blank');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Markdown' }));
    await waitFor(() => expect(api.exportMarkdown).toHaveBeenCalledWith('v2'));
  });

  it('says when the Markdown download fails', async () => {
    api.exportMarkdown.mockRejectedValueOnce(new Error('HTTP 500'));
    render(<ExportDropdown documentId="d1" selectedVersion={version} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Markdown' }));
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith('error', "Couldn't download the Markdown"),
    );
  });

  it('is off until a version is shown', () => {
    render(<ExportDropdown documentId="d1" selectedVersion={null} />);
    expect(screen.getByRole('button', { name: 'Export' })).toHaveProperty('disabled', true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/utils/__tests__/dates.test.ts src/modules/documents/components/__tests__/PrintableDocument.test.tsx src/modules/documents/pages/__tests__/PrintDocumentPage.test.tsx src/modules/documents/pages/documentPage/__tests__/ExportDropdown.test.tsx`
Expected: FAIL: `formatLongDate`, `PrintableDocument` and `PrintDocumentPage` don't exist, and the menu offers PDF, Markdown and HTML.

- [ ] **Step 3: The long date, in `frontend-unified/src/utils/dates.ts`**

After `formatCalendarDate`, add:

```ts
/**
 * A calendar date written out ("March 15, 2026"), in UTC for the same reason as
 * formatCalendarDate: "Version 2, effective March 15, 2026" on a print page
 */
export function formatLongDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
```

- [ ] **Step 4: Create `frontend-unified/src/modules/documents/components/PrintableDocument.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Printer } from 'lucide-react';
import type { SectionTree } from '../../../api/client';
import { formatLongDate } from '../../../utils/dates';

/** A section as printed; annotations, the members' notes, never are */
export type PrintSection = Pick<SectionTree, 'id' | 'numberLabel' | 'title' | 'content'> & {
  children: PrintSection[];
};

interface PrintShellProps {
  /** The browser tab's title, which a saved PDF takes as its name */
  title: string;
  backTo: string;
  backLabel: string;
  /** Open the print dialog once shown (the page was opened with ?print=1) */
  autoPrint: boolean;
  children: ReactNode;
}

/**
 * A print page's frame, without the app's chrome: paper, and a toolbar the printout leaves out.
 * The page that renders it has its content loaded, so the dialog opens on the whole text.
 */
export function PrintShell({ title, backTo, backLabel, autoPrint, children }: PrintShellProps) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);

  useEffect(() => {
    if (!autoPrint) return;
    // Print once the typefaces have loaded, so the PDF isn't set in a fallback face (jsdom, in
    // the tests, has no document.fonts)
    const fonts: FontFaceSet | undefined = document.fonts;
    if (fonts) void fonts.ready.then(() => window.print());
    else window.print();
  }, [autoPrint]);

  return (
    <div className="min-h-screen bg-paper px-4 py-6 print:bg-transparent print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-3xl items-center justify-between gap-3">
        <Link to={backTo} className="inline-flex items-center gap-1 text-gavel hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
        <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print or save as PDF
        </button>
      </div>
      {children}
    </div>
  );
}

/** Whether an article is long enough to start a page: more than 4 sections, or about a page */
function isLong(article: PrintSection): boolean {
  let sections = 0;
  let characters = (article.content ?? '').length;
  const walk = (section: PrintSection) => {
    sections++;
    characters += (section.content ?? '').length;
    section.children.forEach(walk);
  };
  article.children.forEach(walk);
  return sections > 4 || characters > 1500;
}

function PrintedSection({
  section,
  depth,
  breakBefore = false,
}: {
  section: PrintSection;
  depth: number;
  breakBefore?: boolean;
}) {
  const named = !!(section.numberLabel || section.title);
  return (
    <section className={breakBefore ? 'print-break-before' : undefined}>
      {named &&
        (depth === 0 ? (
          <h2 className="font-serif-soft text-title font-semibold">
            {section.numberLabel && (
              <span className="block text-sm font-semibold uppercase tracking-[0.08em] text-ink-muted">
                {section.numberLabel}
              </span>
            )}{' '}
            {section.title}
          </h2>
        ) : (
          <h3 className="font-semibold">
            {[section.numberLabel, section.title].filter(Boolean).join(' ')}
          </h3>
        ))}
      {section.content && (
        <div className="document-content mt-2">
          <ReactMarkdown>{section.content}</ReactMarkdown>
        </div>
      )}
      {section.children.length > 0 && (
        <div className={depth === 0 ? 'mt-4 space-y-4' : 'ml-5 mt-3 space-y-3'}>
          {section.children.map((child) => (
            <PrintedSection key={child.id} section={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

interface PrintableDocumentProps {
  organizationName: string;
  documentTitle: string;
  versionNumber: number;
  effectiveDate: string | null;
  sections: PrintSection[];
}

/**
 * A version of a document as printed: the organization and the document in a running header on
 * every page, the title and "Version 2, effective March 15, 2026", and the sections in the
 * document typeface, a long article starting a new page
 */
export function PrintableDocument({
  organizationName,
  documentTitle,
  versionNumber,
  effectiveDate,
  sections,
}: PrintableDocumentProps) {
  const effective = effectiveDate ? `, effective ${formatLongDate(effectiveDate)}` : '';
  return (
    <article className="print-document mx-auto max-w-3xl rounded-xl border border-rule bg-surface px-6 py-10 sm:px-12">
      <div className="print-running-header" aria-hidden="true">
        {organizationName ? `${organizationName} | ${documentTitle}` : documentTitle}
      </div>
      {/* Not a <header>: the print styles hide the app's header elements */}
      <div className="mb-10 text-center">
        {organizationName && <p className="label-caps">{organizationName}</p>}
        <h1 className="mt-2 font-serif-soft text-page font-semibold text-ink">{documentTitle}</h1>
        <p className="mt-2 text-ink-muted">{`Version ${versionNumber}${effective}`}</p>
      </div>
      <div className="space-y-8 font-document text-ink">
        {sections.map((section, index) => (
          <PrintedSection
            key={section.id}
            section={section}
            depth={0}
            breakBefore={index > 0 && isLong(section)}
          />
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 5: The two print pages**

Create `frontend-unified/src/modules/documents/pages/PrintDocumentPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  documents as documentsApi,
  versions as versionsApi,
  type Document,
  type SectionTree,
  type Version,
} from '../../../api/client';
import { useOrganization } from '../../../context/OrganizationContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { PrintShell, PrintableDocument } from '../components/PrintableDocument';

interface Loaded {
  doc: Document;
  version: Version;
  sections: SectionTree[];
}

/** A version of a document ready to print or save as PDF: /documents/:documentId/print?version= */
export default function PrintDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [params] = useSearchParams();
  const versionId = params.get('version');
  const { organizations } = useOrganization();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let canceled = false;
    const load = async (): Promise<Loaded> => {
      const [doc, list] = await Promise.all([
        documentsApi.get(documentId),
        versionsApi.list(documentId),
      ]);
      const version = list.find((v) => v.id === (versionId ?? doc.currentVersionId)) ?? list[0];
      if (!version) throw new Error('This document has no version to print yet.');
      return { doc, version, sections: await versionsApi.getTree(version.id) };
    };
    load()
      .then((result) => {
        if (!canceled) setLoaded(result);
      })
      .catch((err: unknown) => {
        if (!canceled) setError(err instanceof Error ? err.message : 'Failed to load the document');
      });
    return () => {
      canceled = true;
    };
  }, [documentId, versionId]);

  if (error) return <p className="p-8 text-center text-ink-muted">{error}</p>;
  if (!loaded) return <LoadingPage />;

  const { doc, version, sections } = loaded;
  return (
    <PrintShell
      title={`${doc.title}, version ${version.versionNumber}`}
      backTo={`/documents/${doc.id}`}
      backLabel="Back to the document"
      autoPrint={params.get('print') === '1'}
    >
      <PrintableDocument
        organizationName={organizations.find((o) => o.id === doc.organizationId)?.name ?? ''}
        documentTitle={doc.title}
        versionNumber={version.versionNumber}
        effectiveDate={version.effectiveDate}
        sections={sections}
      />
    </PrintShell>
  );
}
```

Create `frontend-unified/src/modules/documents/pages/PublicPrintPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicDocuments, type SharedDocument, type SharedVersion } from '../../../api/client';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { PrintShell, PrintableDocument } from '../components/PrintableDocument';

interface Loaded {
  shared: SharedDocument;
  version: SharedVersion;
}

/** A shared document ready to print, for anyone with the link: /share/:shareToken/print?version= */
export default function PublicPrintPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [params] = useSearchParams();
  const versionId = params.get('version');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) return;
    let canceled = false;
    const load = async (): Promise<Loaded> => {
      const shared = await publicDocuments.get(shareToken);
      const wanted = versionId ?? shared.currentVersion?.id ?? shared.versions[0]?.id;
      if (!wanted) throw new Error('This document has no version to print yet.');
      const version =
        shared.currentVersion?.id === wanted
          ? shared.currentVersion
          : await publicDocuments.getVersion(shareToken, wanted);
      return { shared, version };
    };
    load()
      .then((result) => {
        if (!canceled) setLoaded(result);
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setError(
            err instanceof Error && /no version/.test(err.message)
              ? err.message
              : 'This document is not available. The link may be invalid or sharing may have been disabled.',
          );
        }
      });
    return () => {
      canceled = true;
    };
  }, [shareToken, versionId]);

  if (error) return <p className="p-8 text-center text-ink-muted">{error}</p>;
  if (!loaded) return <LoadingPage />;

  const { shared, version } = loaded;
  return (
    <PrintShell
      title={`${shared.document.title}, version ${version.versionNumber}`}
      backTo={`/share/${shareToken}`}
      backLabel="Back to the document"
      autoPrint={params.get('print') === '1'}
    >
      <PrintableDocument
        organizationName={shared.document.organization.name}
        documentTitle={shared.document.title}
        versionNumber={version.versionNumber}
        effectiveDate={version.effectiveDate}
        sections={version.sections}
      />
    </PrintShell>
  );
}
```

- [ ] **Step 6: The routes, in `frontend-unified/src/App.tsx`**

Replace:

```tsx
const PublicDocumentPage = lazy(() => import('./modules/documents/pages/PublicDocumentPage'));
```

with:

```tsx
const PublicDocumentPage = lazy(() => import('./modules/documents/pages/PublicDocumentPage'));
const PublicPrintPage = lazy(() => import('./modules/documents/pages/PublicPrintPage'));
const PrintDocumentPage = lazy(() => import('./modules/documents/pages/PrintDocumentPage'));
```

replace:

```tsx
<Route path="/share/:shareToken" element={<PublicDocumentPage />} />
```

with:

```tsx
                <Route path="/share/:shareToken" element={<PublicDocumentPage />} />
                <Route path="/share/:shareToken/print" element={<PublicPrintPage />} />
```

and insert before `                {/* Everything else needs a signed-in user */}`:

```tsx
{
  /* A document's version to print: signed in, without the app's chrome */
}
<Route
  path="/documents/:documentId/print"
  element={
    <RequireSession>
      <OrganizationProvider>
        <PrintDocumentPage />
      </OrganizationProvider>
    </RequireSession>
  }
/>;
```

- [ ] **Step 7: Replace `frontend-unified/src/modules/documents/pages/documentPage/ExportDropdown.tsx`**

```tsx
import { useRef, useEffect, useState } from 'react';
import { ChevronDown, Download, FileText, Printer } from 'lucide-react';
import { versions as versionsApi, type Version } from '../../../../api/client';
import { useToast } from '../../../../context/ToastContext';

interface ExportDropdownProps {
  documentId: string;
  selectedVersion: Version | null;
}

/**
 * The document's Export menu: print the version shown (the browser's print dialog saves the
 * PDF), or download it as Markdown
 */
export function ExportDropdown({ documentId, selectedVersion }: ExportDropdownProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const downloadMarkdown = async () => {
    if (!selectedVersion) return;
    setOpen(false);
    setExporting(true);
    try {
      await versionsApi.exportMarkdown(selectedVersion.id);
    } catch {
      showToast('error', "Couldn't download the Markdown");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="btn-secondary btn-sm"
        disabled={exporting || !selectedVersion}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        {exporting ? 'Exporting...' : 'Export'}
        <ChevronDown className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && selectedVersion && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-rule bg-surface shadow-lg"
        >
          <a
            role="menuitem"
            href={`/documents/${documentId}/print?version=${selectedVersion.id}&print=1`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm text-ink hover:bg-surface-2"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print or save as PDF
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => void downloadMarkdown()}
            className="flex w-full items-center gap-2 rounded-b-lg px-4 py-2 text-left text-sm text-ink hover:bg-surface-2"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Markdown
          </button>
        </div>
      )}
    </div>
  );
}
```

In `frontend-unified/src/modules/documents/pages/documentPage/DocumentHeader.tsx`, replace:

```tsx
<ExportDropdown selectedVersion={selectedVersion} />
```

with:

```tsx
<ExportDropdown documentId={doc.id} selectedVersion={selectedVersion} />
```

In `frontend-unified/src/api/client.ts`, replace:

```ts
  exportMarkdown: (id: string) => downloadFile(`/versions/${id}/export/markdown`),
  exportHtml: (id: string) => downloadFile(`/versions/${id}/export/html`),
  exportPdf: (id: string) => downloadFile(`/versions/${id}/export/pdf`),
```

with:

```ts
  exportMarkdown: (id: string) => downloadFile(`/versions/${id}/export/markdown`),
```

- [ ] **Step 8: The share page prints, in `frontend-unified/src/modules/documents/pages/PublicDocumentPage.tsx`**

Replace:

```tsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, FileText, Download, ChevronDown, Eye, AlertCircle } from 'lucide-react';
import {
  publicDocuments,
  versions as versionsApi,
  PublicDocument,
  PublicVersion,
  SectionTree as SectionTreeType,
} from '../../../api/client';
```

with:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Clock, FileText, Eye, AlertCircle, Printer } from 'lucide-react';
import {
  publicDocuments,
  PublicDocument,
  PublicVersion,
  SectionTree as SectionTreeType,
} from '../../../api/client';
```

Delete these lines (the export menu's state, from `  // Export dropdown` through the effect that closes it):

```tsx
// Export dropdown
const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
const [exporting, setExporting] = useState(false);
const exportDropdownRef = useRef<HTMLDivElement>(null);

// Close export dropdown on outside click
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
      setExportDropdownOpen(false);
    }
  };

  if (exportDropdownOpen) {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }
}, [exportDropdownOpen]);
```

delete the whole `const handleExport = async (format: 'pdf' | 'markdown' | 'html') => { ... };` function (from that line through its closing `  };` and the blank line after it), and replace the export menu (from `            {/* Export dropdown */}` through the `</div>` that closes `exportDropdownRef`'s element):

```tsx
            {/* Export dropdown */}
            <div className="relative" ref={exportDropdownRef}>
```

(and everything down to its closing `            </div>`) with:

```tsx
{
  /* The browser's print dialog saves a PDF */
}
{
  selectedVersion && (
    <Link
      to={`/share/${shareToken}/print?version=${selectedVersion.id}&print=1`}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-secondary btn-sm"
    >
      <Printer className="w-4 h-4" aria-hidden="true" />
      Print or save as PDF
    </Link>
  );
}
```

- [ ] **Step 9: Print styles, at the end of `frontend-unified/src/styles/index.css`**

Append:

```css
/* The print pages (/documents/:id/print, /share/:token/print, /minutes/:id/print). The running
   header shows only on paper, fixed to the top of every page. */
.print-running-header {
  display: none;
}

@media print {
  @page {
    margin: 2cm 2cm 2.2cm;
  }

  .print-document {
    max-width: none !important;
    padding: 1.2cm 0 0 !important;
    border: 0 !important;
    background: white !important;
  }

  .print-running-header {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding-bottom: 0.15cm;
    border-bottom: 1px solid #ccc;
    font-size: 9pt;
    color: #444 !important;
  }

  .print-break-before {
    break-before: page;
  }
}
```

- [ ] **Step 10: Run the tests, the type-check, a build and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/utils/__tests__/dates.test.ts src/modules/documents && npx tsc --noEmit -p . && npm run build && cd .. && npm run lint`
Expected: all pass (`PrintableDocument.test.tsx` 2, `PrintDocumentPage.test.tsx` 3, `ExportDropdown.test.tsx` 3, and the new date case); type-check clean; the build succeeds; lint clean apart from its usual warnings. `grep -rn "exportHtml\|exportPdf" frontend-unified/src` prints nothing.

- [ ] **Step 11: Commit**

```bash
npx prettier --write frontend-unified/src/modules/documents frontend-unified/src/App.tsx frontend-unified/src/api/client.ts frontend-unified/src/utils/dates.ts frontend-unified/src/utils/__tests__/dates.test.ts frontend-unified/src/styles/index.css
git add frontend-unified/src/modules/documents/components/PrintableDocument.tsx frontend-unified/src/modules/documents/components/__tests__/PrintableDocument.test.tsx frontend-unified/src/modules/documents/pages/PrintDocumentPage.tsx frontend-unified/src/modules/documents/pages/PublicPrintPage.tsx frontend-unified/src/modules/documents/pages/__tests__/PrintDocumentPage.test.tsx frontend-unified/src/modules/documents/pages/documentPage/ExportDropdown.tsx frontend-unified/src/modules/documents/pages/documentPage/__tests__/ExportDropdown.test.tsx frontend-unified/src/modules/documents/pages/documentPage/DocumentHeader.tsx frontend-unified/src/modules/documents/pages/PublicDocumentPage.tsx frontend-unified/src/App.tsx frontend-unified/src/api/client.ts frontend-unified/src/utils/dates.ts frontend-unified/src/utils/__tests__/dates.test.ts frontend-unified/src/styles/index.css
git commit -m "feat(web): print or save as PDF, and an export menu that works

A document's version, and a shared one, open as print pages without the
app's chrome: a running header with the organization and the document, the
title and its version and effective date, the sections in the document
typeface, long articles on a new page. Opened with print=1 they open the
print dialog, which saves the PDF. The Export menu offers that and Markdown;
the HTML and PDF items, which called routes that never existed, are gone."
```

---

### Task 3: The import screen

**Files:**

- Create: `frontend-unified/src/modules/documents/utils/parsedTree.ts`, `frontend-unified/src/modules/documents/pages/ImportBylawsPage.tsx`
- Modify: `frontend-unified/src/modules/documents/pages/documentPage/DocumentContentCard.tsx`, `frontend-unified/src/modules/documents/pages/DocumentPage.tsx`, `frontend-unified/src/App.tsx`
- Test: `frontend-unified/src/modules/documents/utils/__tests__/parsedTree.test.ts`, `frontend-unified/src/modules/documents/pages/__tests__/ImportBylawsPage.test.tsx` (new), `frontend-unified/src/modules/documents/pages/documentPage/__tests__/DocumentContentCard.test.tsx`

The first thing a new organization does is put its bylaws in, and until now that meant typing them a section at a time. The import screen (`/documents/:documentId/import`, for secretaries) has two steps:

1. **Source**: paste the text, or choose a file. A `.txt` or `.md` file is read in the browser; a `.docx` goes to the server, which sends back its text with `#` heading lines (at most 5 MB, checked here first).
2. **Review**: what Robbie found on the left, with its count ("6 articles, 23 sections"), each section's label and title editable and a "Merge up" button that merges it into the section above (the parser took a line of text for a heading: its heading and text go back into the text of the section above, and its subsections follow); the text on the right, editable, with "Parse again" (which starts over from the text, dropping the changes on the left). Splitting is done in the text: the secretary adds the heading line and parses again. Then the effective date and notes, as on the New Version form, and "Save as a new version", which saves the sections in one request and opens the document.

The document's content card offers it: on a document with no version, "Import the bylaws" first and "Create First Version" beside it; on one with versions, "Import a new version" beside "New Version".

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/modules/documents/utils/__tests__/parsedTree.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ParsedSection } from '@robbie-bylawyer/shared/utils';
import { canMerge, mergeIntoPrevious, renameSection } from '../parsedTree';

function s(
  numberLabel: string | null,
  title: string | null,
  content = '',
  children: ParsedSection[] = [],
): ParsedSection {
  return { numberLabel, title, content, children };
}

const tree: ParsedSection[] = [
  s('Article I', 'Name', '', [
    s('Section 1.1', 'Name', 'The name is Maple Grove.'),
    s('Section 1.2', 'Purpose', 'Gardens.'),
  ]),
  s('Article II', 'Members', 'Each lot votes.'),
];

describe('renameSection', () => {
  it("changes one section's label or title, and leaves the tree it was given alone", () => {
    const renamed = renameSection(tree, [0, 1], { title: 'Aims' });
    expect(renamed[0].children[1]).toEqual(s('Section 1.2', 'Aims', 'Gardens.'));
    expect(tree[0].children[1].title).toBe('Purpose');
    expect(renameSection(tree, [1], { numberLabel: 'Article 2' })[1].numberLabel).toBe('Article 2');
  });

  it('takes an empty label or title as none', () => {
    expect(renameSection(tree, [1], { numberLabel: '  ' })[1].numberLabel).toBeNull();
    expect(renameSection(tree, [1], { title: '' })[1].title).toBeNull();
  });
});

describe('mergeIntoPrevious', () => {
  it('puts a section back into the text of the one before it at its level', () => {
    const merged = mergeIntoPrevious(tree, [0, 1]);
    expect(merged[0].children).toEqual([
      s('Section 1.1', 'Name', 'The name is Maple Grove.\n\nSection 1.2 Purpose\n\nGardens.'),
    ]);
  });

  it('merges a top-level section into the one before it, its subsections following', () => {
    const merged = mergeIntoPrevious(tree, [1]);
    expect(merged).toEqual([
      s('Article I', 'Name', 'Article II Members\n\nEach lot votes.', tree[0].children),
    ]);
  });

  it('merges the first at its level into its parent, keeping its subsections in place', () => {
    const nested = [
      s('Article I', 'Name', 'Intro.', [
        s('1.1', 'Odd', 'Text.', [s('1.1.1', 'Deep', 'More.')]),
        s('1.2', 'Next'),
      ]),
    ];
    expect(mergeIntoPrevious(nested, [0, 0])).toEqual([
      s('Article I', 'Name', 'Intro.\n\n1.1 Odd\n\nText.', [
        s('1.1.1', 'Deep', 'More.'),
        s('1.2', 'Next'),
      ]),
    ]);
  });

  it('leaves the very first section alone', () => {
    expect(canMerge([0])).toBe(false);
    expect(canMerge([0, 0])).toBe(true);
    expect(canMerge([1])).toBe(true);
    expect(mergeIntoPrevious(tree, [0])).toBe(tree);
  });
});
```

Create `frontend-unified/src/modules/documents/pages/__tests__/ImportBylawsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getDocument: vi.fn(),
  docxText: vi.fn(),
  saveVersion: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({
  documents: { get: api.getDocument },
  bylawsImport: { docxText: api.docxText, saveVersion: api.saveVersion },
}));
const org = vi.hoisted(() => ({ canEdit: true }));
vi.mock('../../../../context/OrganizationContext', () => ({
  useCan: () => org.canEdit,
  useSelectRecordOrganization: () => {},
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { default: ImportBylawsPage } = await import('../ImportBylawsPage');

const TEXT = [
  'Article I',
  'Name and Purpose',
  'Section 1.1 Name',
  'The name is Maple Grove.',
  'Section 1.2 Purpos',
  'Gardens.',
  'Article II',
  'Members',
  'Section 2.1 Membership',
  'Every owner is a member.',
].join('\n');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/documents/d1/import']}>
      <Routes>
        <Route path="/documents/:documentId/import" element={<ImportBylawsPage />} />
        <Route path="/documents/:documentId" element={<p>Document page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function readPasted(text: string) {
  renderPage();
  await screen.findByRole('heading', { name: 'Import the bylaws' });
  fireEvent.change(screen.getByLabelText('Bylaws text'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Read the bylaws' }));
}

function chooseFile(file: File) {
  fireEvent.click(screen.getByLabelText('A file (.txt, .md or .docx)'));
  fireEvent.change(screen.getByLabelText('File'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Read the bylaws' }));
}

describe('ImportBylawsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.canEdit = true;
    api.getDocument.mockResolvedValue({ id: 'd1', organizationId: 'org-1', title: 'Bylaws' });
    api.saveVersion.mockResolvedValue({ id: 'v2', versionNumber: 2, sectionCount: 5 });
  });

  it('reads pasted bylaws into articles and sections, takes a fix, and saves them', async () => {
    await readPasted(TEXT);
    expect(screen.getByText('2 articles, 3 sections')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Title of Section 1.2 Purpos'), {
      target: { value: 'Purpose' },
    });
    fireEvent.change(screen.getByLabelText('Effective date (optional)'), {
      target: { value: '2026-03-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as a new version' }));

    expect(await screen.findByText('Document page')).toBeTruthy();
    expect(api.saveVersion).toHaveBeenCalledWith('d1', {
      effectiveDate: '2026-03-15',
      notes: undefined,
      sections: [
        {
          numberLabel: 'Article I',
          title: 'Name and Purpose',
          content: '',
          children: [
            {
              numberLabel: 'Section 1.1',
              title: 'Name',
              content: 'The name is Maple Grove.',
              children: [],
            },
            { numberLabel: 'Section 1.2', title: 'Purpose', content: 'Gardens.', children: [] },
          ],
        },
        {
          numberLabel: 'Article II',
          title: 'Members',
          content: '',
          children: [
            {
              numberLabel: 'Section 2.1',
              title: 'Membership',
              content: 'Every owner is a member.',
              children: [],
            },
          ],
        },
      ],
    });
    expect(toast.showToast).toHaveBeenCalledWith('success', 'Saved version 2, with 5 sections');
  });

  it('merges a section into the one above, and parses edited text again', async () => {
    await readPasted(TEXT);
    fireEvent.click(
      screen.getByRole('button', { name: 'Merge Section 1.2 Purpos into the section above' }),
    );
    expect(screen.getByText('2 articles, 2 sections')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Bylaws text'), {
      target: { value: `${TEXT}\nSection 2.2 Dues\nDues are $20.` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parse again' }));
    expect(screen.getByText('2 articles, 4 sections')).toBeTruthy();
  });

  it('reads a Word document on the server', async () => {
    api.docxText.mockResolvedValueOnce('# Article I\n\n## Section 1.1 Name\n\nThe name is A.');
    renderPage();
    await screen.findByRole('heading', { name: 'Import the bylaws' });
    const docx = new File(['docx'], 'Bylaws.DOCX');
    chooseFile(docx);
    expect(await screen.findByText('1 article, 1 section')).toBeTruthy();
    expect(api.docxText).toHaveBeenCalledWith('d1', docx);
  });

  it('reads a text file in the browser', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Import the bylaws' });
    chooseFile(new File(['Article I\nName\nSection 1.1 Name\nText.'], 'bylaws.txt'));
    expect(await screen.findByText('1 article, 1 section')).toBeTruthy();
    expect(api.docxText).not.toHaveBeenCalled();
  });

  it('refuses other files, and a Word document over 5 MB', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Import the bylaws' });
    chooseFile(new File(['%PDF'], 'bylaws.pdf'));
    expect(await screen.findByText('Choose a .txt, .md or .docx file.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('File'), {
      target: { files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.docx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read the bylaws' }));
    expect(await screen.findByText('That file is over 5 MB.')).toBeTruthy();
    expect(api.docxText).not.toHaveBeenCalled();
  });

  it('is for secretaries and above', async () => {
    org.canEdit = false;
    renderPage();
    expect(
      await screen.findByText('Only a secretary or above can import the bylaws.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Read the bylaws' })).toBeNull();
  });
});
```

In `frontend-unified/src/modules/documents/pages/documentPage/__tests__/DocumentContentCard.test.tsx`, replace:

```tsx
import { render, screen } from '@testing-library/react';
```

with:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
```

replace:

```tsx
function renderCard(props: { canEdit: boolean; selectedVersion: Version | null }) {
```

with:

```tsx
function renderCard(props: {
  canEdit: boolean;
  selectedVersion: Version | null;
  onImport?: () => void;
}) {
```

and append inside `describe('DocumentContentCard', () => {`, before its closing `});`:

```tsx
it('offers to import the bylaws into an empty document, and a new version later', () => {
  const onImport = vi.fn();
  renderCard({ canEdit: true, selectedVersion: null, onImport });
  fireEvent.click(screen.getByRole('button', { name: 'Import the bylaws' }));
  expect(onImport).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Create First Version' })).toBeTruthy();

  cleanup();
  renderCard({ canEdit: true, selectedVersion: version, onImport });
  fireEvent.click(screen.getByRole('button', { name: 'Import a new version' }));
  expect(onImport).toHaveBeenCalledTimes(2);
});

it('offers a role below secretary no import', () => {
  renderCard({ canEdit: false, selectedVersion: null, onImport: vi.fn() });
  expect(screen.queryByRole('button', { name: 'Import the bylaws' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Import a new version' })).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/documents/utils src/modules/documents/pages/__tests__/ImportBylawsPage.test.tsx src/modules/documents/pages/documentPage/__tests__/DocumentContentCard.test.tsx`
Expected: FAIL: `parsedTree` and `ImportBylawsPage` don't exist, and the card has no import buttons.

- [ ] **Step 3: Create `frontend-unified/src/modules/documents/utils/parsedTree.ts`**

```ts
import type { ParsedSection } from '@robbie-bylawyer/shared/utils';

/** Where a section is in the tree: its index at each level, the top level first */
export type TreePath = number[];

/** The tree with the section at `path` changed, everything else as it was */
function update(
  sections: ParsedSection[],
  path: TreePath,
  change: (section: ParsedSection) => ParsedSection,
): ParsedSection[] {
  const [index, ...rest] = path;
  return sections.map((section, i) =>
    i !== index
      ? section
      : rest.length === 0
        ? change(section)
        : { ...section, children: update(section.children, rest, change) },
  );
}

function childrenAt(sections: ParsedSection[], path: TreePath): ParsedSection[] {
  return path.reduce<ParsedSection[]>((level, index) => level[index].children, sections);
}

/** The tree with one section's label or title changed; an empty one is none */
export function renameSection(
  sections: ParsedSection[],
  path: TreePath,
  changes: { numberLabel?: string; title?: string },
): ParsedSection[] {
  const orNone = (value: string) => (value.trim() === '' ? null : value);
  return update(sections, path, (section) => ({
    ...section,
    ...(changes.numberLabel !== undefined ? { numberLabel: orNone(changes.numberLabel) } : {}),
    ...(changes.title !== undefined ? { title: orNone(changes.title) } : {}),
  }));
}

/** Whether a section has one above it to merge into: every one but the very first */
export function canMerge(path: TreePath): boolean {
  return path.length > 1 || path[0] > 0;
}

/**
 * The tree with a section merged into the one above it: the one before it at its level, or its
 * parent when it is the first. The parser took a line of text for its heading, so its heading
 * and its text go back into that section's text, and its subsections follow it there.
 */
export function mergeIntoPrevious(sections: ParsedSection[], path: TreePath): ParsedSection[] {
  if (!canMerge(path)) return sections;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const siblings = childrenAt(sections, parentPath);
  const merged = siblings[index];
  const heading = [merged.numberLabel, merged.title].filter(Boolean).join(' ');
  const text = [heading, merged.content].filter(Boolean).join('\n\n');
  const withText = (content: string) => [content, text].filter(Boolean).join('\n\n');

  if (index === 0) {
    // The first at its level: into its parent, its subsections where it was
    return update(sections, parentPath, (parent) => ({
      ...parent,
      content: withText(parent.content),
      children: [...merged.children, ...parent.children.slice(1)],
    }));
  }

  const level = siblings
    .map((section, i) =>
      i === index - 1
        ? {
            ...section,
            content: withText(section.content),
            children: [...section.children, ...merged.children],
          }
        : section,
    )
    .filter((_, i) => i !== index);
  return parentPath.length === 0
    ? level
    : update(sections, parentPath, (parent) => ({ ...parent, children: level }));
}
```

(`childrenAt(sections, [])` is the top level itself.)

- [ ] **Step 4: Create `frontend-unified/src/modules/documents/pages/ImportBylawsPage.tsx`**

```tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileUp, ListTree, Merge } from 'lucide-react';
import {
  describeParsedBylaws,
  parseBylaws,
  type ParsedSection,
} from '@robbie-bylawyer/shared/utils';
import { bylawsImport, documents as documentsApi, type Document } from '../../../api/client';
import { useCan, useSelectRecordOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { canMerge, mergeIntoPrevious, renameSection, type TreePath } from '../utils/parsedTree';

/** The largest Word document the server reads */
const DOCX_LIMIT_BYTES = 5 * 1024 * 1024;

const PLACEHOLDER =
  'ARTICLE I\nNAME AND PURPOSE\n\nSection 1.1 Name. The name of this corporation is...';

/**
 * The bylaws pasted or from a file, read into sections, reviewed and saved as a new version
 * (/documents/:documentId/import, secretaries)
 */
export default function ImportBylawsPage() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [doc, setDoc] = useState<Document | null>(null);
  const [notFound, setNotFound] = useState(false);
  useSelectRecordOrganization(doc?.organizationId);
  const canImport = useCan('secretary');

  const [step, setStep] = useState<'source' | 'review'>('source');
  const [source, setSource] = useState<'paste' | 'file'>('paste');
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The review: the text, which can be edited and parsed again, and the sections found in it
  const [text, setText] = useState('');
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => describeParsedBylaws(sections), [sections]);

  useEffect(() => {
    let canceled = false;
    documentsApi
      .get(documentId)
      .then((found) => {
        if (!canceled) setDoc(found);
      })
      .catch(() => {
        if (!canceled) setNotFound(true);
      });
    return () => {
      canceled = true;
    };
  }, [documentId]);

  const review = (value: string) => {
    setText(value);
    setSections(parseBylaws(value));
    setStep('review');
  };

  const read = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (source === 'paste') {
      if (pasted.trim()) review(pasted);
      else setProblem('Paste the bylaws first.');
      return;
    }
    if (!file) {
      setProblem('Choose a file first.');
      return;
    }
    const name = file.name.toLowerCase();
    if (!/\.(txt|md|docx)$/.test(name)) {
      setProblem('Choose a .txt, .md or .docx file.');
      return;
    }
    if (name.endsWith('.docx') && file.size > DOCX_LIMIT_BYTES) {
      setProblem('That file is over 5 MB.');
      return;
    }
    setReading(true);
    try {
      review(
        name.endsWith('.docx') ? await bylawsImport.docxText(documentId, file) : await file.text(),
      );
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't read the file");
    } finally {
      setReading(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const version = await bylawsImport.saveVersion(documentId, {
        effectiveDate: effectiveDate || undefined,
        notes: notes.trim() || undefined,
        sections,
      });
      showToast(
        'success',
        `Saved version ${version.versionNumber}, with ${version.sectionCount} sections`,
      );
      navigate(`/documents/${documentId}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Couldn't save the version");
      setSaving(false);
    }
  };

  if (notFound) return <p className="py-12 text-center text-ink-muted">Document not found.</p>;
  if (!doc) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Link
          to={`/documents/${doc.id}`}
          className="inline-flex items-center gap-1 text-sm text-gavel hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {doc.title}
        </Link>
        <h2 className="page-title mt-1">Import the bylaws</h2>
        <p className="mt-1 text-ink-muted">
          Paste the text or choose a file. Robbie finds the articles and sections, and you check
          them before saving a new version.
        </p>
      </div>

      {!canImport ? (
        <p className="card p-6 text-ink-muted">Only a secretary or above can import the bylaws.</p>
      ) : step === 'source' ? (
        <form onSubmit={(e) => void read(e)} className="card max-w-3xl space-y-5 p-6">
          <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
            <legend className="label">Source</legend>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="source"
                className="accent-gavel"
                checked={source === 'paste'}
                onChange={() => setSource('paste')}
              />
              Paste the text
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="source"
                className="accent-gavel"
                checked={source === 'file'}
                onChange={() => setSource('file')}
              />
              A file (.txt, .md or .docx)
            </label>
          </fieldset>
          {source === 'paste' ? (
            <div>
              <label htmlFor="bylawsText" className="label">
                Bylaws text
              </label>
              <textarea
                id="bylawsText"
                className="textarea h-80 font-document"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={PLACEHOLDER}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="bylawsFile" className="label">
                File
              </label>
              <input
                id="bylawsFile"
                type="file"
                accept=".txt,.md,.docx"
                className="block text-sm text-ink"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-ink-muted">
                A Word document is read on the server and not kept. It can be up to 5 MB.
              </p>
            </div>
          )}
          {problem && (
            <p role="alert" className="text-sm text-gavel">
              {problem}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={reading}>
            <FileUp className="h-5 w-5" aria-hidden="true" />
            {reading ? 'Reading...' : 'Read the bylaws'}
          </button>
        </form>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="found-heading" className="card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 id="found-heading" className="card-title flex items-center gap-2">
                  <ListTree className="h-5 w-5" aria-hidden="true" />
                  What Robbie found
                </h3>
                <p className="text-sm tabular-nums text-ink-muted">{summary}</p>
              </div>
              {sections.length === 0 ? (
                <p className="text-ink-muted">
                  No sections yet. Check the text and parse it again.
                </p>
              ) : (
                <ol className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                  {sections.map((section, index) => (
                    <ParsedNode
                      key={index}
                      section={section}
                      path={[index]}
                      tree={sections}
                      onChange={setSections}
                    />
                  ))}
                </ol>
              )}
            </section>
            <section aria-labelledby="text-heading" className="card flex flex-col p-5">
              <h3 id="text-heading" className="card-title mb-4">
                The text
              </h3>
              <label htmlFor="reviewText" className="sr-only">
                Bylaws text
              </label>
              <textarea
                id="reviewText"
                className="textarea min-h-80 flex-1 font-document"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="mt-2 text-xs text-ink-muted">
                To split a section, add its heading line here and parse again. Parsing again starts
                over from the text.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setSections(parseBylaws(text))}
                >
                  Parse again
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setStep('source')}
                >
                  Choose another source
                </button>
              </div>
            </section>
          </div>
          <form
            onSubmit={(e) => void save(e)}
            className="card grid gap-4 p-6 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
          >
            <div>
              <label htmlFor="importEffectiveDate" className="label">
                Effective date (optional)
              </label>
              <input
                id="importEffectiveDate"
                type="date"
                className="input"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="importNotes" className="label">
                Version notes (optional)
              </label>
              <input
                id="importNotes"
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Imported from the 2024 bylaws"
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || sections.length === 0}
            >
              {saving ? 'Saving...' : 'Save as a new version'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

interface ParsedNodeProps {
  section: ParsedSection;
  path: TreePath;
  tree: ParsedSection[];
  onChange: (next: ParsedSection[]) => void;
}

/** One section found: its label and title to correct, and Merge up */
function ParsedNode({ section, path, tree, onChange }: ParsedNodeProps) {
  const name = [section.numberLabel, section.title].filter(Boolean).join(' ') || 'the preamble';
  return (
    <li className="rounded-lg border border-rule bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-36 py-1 text-sm"
          aria-label={`Label of ${name}`}
          placeholder="Label"
          value={section.numberLabel ?? ''}
          onChange={(e) => onChange(renameSection(tree, path, { numberLabel: e.target.value }))}
        />
        <input
          className="input min-w-0 flex-1 py-1 text-sm"
          aria-label={`Title of ${name}`}
          placeholder="Title"
          value={section.title ?? ''}
          onChange={(e) => onChange(renameSection(tree, path, { title: e.target.value }))}
        />
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={!canMerge(path)}
          aria-label={`Merge ${name} into the section above`}
          onClick={() => onChange(mergeIntoPrevious(tree, path))}
        >
          <Merge className="h-4 w-4" aria-hidden="true" />
          Merge up
        </button>
      </div>
      {section.content && (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink-muted">
          {section.content}
        </p>
      )}
      {section.children.length > 0 && (
        <ol className="ml-3 mt-2 space-y-2 border-l border-rule pl-3">
          {section.children.map((child, index) => (
            <ParsedNode
              key={index}
              section={child}
              path={[...path, index]}
              tree={tree}
              onChange={onChange}
            />
          ))}
        </ol>
      )}
    </li>
  );
}
```

- [ ] **Step 5: Offer it, in `DocumentContentCard.tsx` and `DocumentPage.tsx`**

In `frontend-unified/src/modules/documents/pages/documentPage/DocumentContentCard.tsx`, replace:

```tsx
import { Plus, FileText, Clock } from 'lucide-react';
```

with:

```tsx
import { Plus, FileText, Clock, FileUp } from 'lucide-react';
```

replace:

```tsx
  onAddSection: () => void;
  onCreateVersion: () => void;
}
```

with:

```tsx
  onAddSection: () => void;
  onCreateVersion: () => void;
  /** Open the import screen; without it, no import is offered */
  onImport?: () => void;
}
```

replace:

```tsx
  onAddSection,
  onCreateVersion,
}: DocumentContentCardProps) {
```

with:

```tsx
  onAddSection,
  onCreateVersion,
  onImport,
}: DocumentContentCardProps) {
```

replace:

```tsx
            <div className="flex items-center gap-2">
              <button onClick={onCreateVersion} className="btn-ghost btn-sm">
```

with:

```tsx
            <div className="flex items-center gap-2">
              {onImport && selectedVersion && (
                <button onClick={onImport} className="btn-ghost btn-sm">
                  <FileUp className="w-4 h-4 mr-1" />
                  Import a new version
                </button>
              )}
              <button onClick={onCreateVersion} className="btn-ghost btn-sm">
```

replace:

```tsx
<EmptyState
  message={
    canEdit ? 'Create a version to start adding content.' : 'This document has no content yet.'
  }
  action={canEdit ? { text: 'Create First Version', onClick: onCreateVersion } : undefined}
/>
```

with:

```tsx
<EmptyState
  message={
    !canEdit
      ? 'This document has no content yet.'
      : onImport
        ? 'Import the bylaws from text or a file, or create a version and add sections one at a time.'
        : 'Create a version to start adding content.'
  }
  action={
    !canEdit
      ? undefined
      : onImport
        ? { text: 'Import the bylaws', onClick: onImport }
        : { text: 'Create First Version', onClick: onCreateVersion }
  }
  secondary={
    canEdit && onImport ? { text: 'Create First Version', onClick: onCreateVersion } : undefined
  }
/>
```

and replace the `EmptyState` function at the end of the file with:

```tsx
function EmptyState({
  message,
  action,
  secondary,
}: {
  message: string;
  action?: { text: string; onClick: () => void };
  secondary?: { text: string; onClick: () => void };
}) {
  return (
    <div className="text-center py-8">
      <FileText className="w-10 h-10 text-ink-muted mx-auto mb-3" />
      <p className={`text-ink-muted ${action ? 'mb-4' : ''}`}>{message}</p>
      {action && (
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={action.onClick} className="btn-primary btn-sm">
            <Plus className="w-4 h-4 mr-1" />
            {action.text}
          </button>
          {secondary && (
            <button onClick={secondary.onClick} className="btn-secondary btn-sm">
              {secondary.text}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

In `frontend-unified/src/modules/documents/pages/DocumentPage.tsx`, replace:

```tsx
          onAddSection={handleAddSection}
          onCreateVersion={() => setVersionModalOpen(true)}
        />
```

with:

```tsx
          onAddSection={handleAddSection}
          onCreateVersion={() => setVersionModalOpen(true)}
          onImport={() => navigate(`/documents/${doc.id}/import`)}
        />
```

- [ ] **Step 6: The route, in `frontend-unified/src/App.tsx`**

Replace:

```tsx
const DocumentDiffPage = lazy(() => import('./modules/documents/pages/DocumentDiffPage'));
```

with:

```tsx
const DocumentDiffPage = lazy(() => import('./modules/documents/pages/DocumentDiffPage'));
const ImportBylawsPage = lazy(() => import('./modules/documents/pages/ImportBylawsPage'));
```

and:

```tsx
<Route path="documents/:documentId/diff" element={<DocumentDiffPage />} />
```

with:

```tsx
                  <Route path="documents/:documentId/diff" element={<DocumentDiffPage />} />
                  <Route path="documents/:documentId/import" element={<ImportBylawsPage />} />
```

- [ ] **Step 7: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/documents && npx tsc --noEmit -p . && cd .. && npm run lint`
Expected: all pass (`parsedTree.test.ts` 6, `ImportBylawsPage.test.tsx` 6, `DocumentContentCard.test.tsx` 4); type-check clean; lint clean apart from its usual warnings.

- [ ] **Step 8: Commit**

```bash
npx prettier --write frontend-unified/src/modules/documents frontend-unified/src/App.tsx
git add frontend-unified/src/modules/documents/utils/parsedTree.ts frontend-unified/src/modules/documents/utils/__tests__/parsedTree.test.ts frontend-unified/src/modules/documents/pages/ImportBylawsPage.tsx frontend-unified/src/modules/documents/pages/__tests__/ImportBylawsPage.test.tsx frontend-unified/src/modules/documents/pages/documentPage/DocumentContentCard.tsx frontend-unified/src/modules/documents/pages/documentPage/__tests__/DocumentContentCard.test.tsx frontend-unified/src/modules/documents/pages/DocumentPage.tsx frontend-unified/src/App.tsx
git commit -m "feat(web): import the bylaws from text, Markdown or a Word document

The import screen reads pasted text, a .txt or .md file in the browser, or
a .docx through the server, and shows what it found (\"6 articles, 23
sections\") beside the text: labels and titles can be corrected, a section
merged into the one above, and edited text parsed again. Saving makes the
sections a new version. An empty document offers Import the bylaws, and a
document with versions Import a new version."
```

---

### Task 4: The amendment's Preview tab

**Files:**

- Create: `frontend-unified/src/modules/documents/pages/amendmentDetailPage/AmendmentPreview.tsx`, `frontend-unified/src/modules/documents/pages/amendmentDetailPage/AmendmentTabs.tsx`
- Modify: `frontend-unified/src/modules/documents/pages/amendmentDetailPage/index.ts`, `frontend-unified/src/modules/documents/pages/AmendmentDetailPage.tsx`, `frontend-unified/src/modules/documents/pages/documentPage/useDocumentData.ts`, `frontend-unified/src/modules/documents/pages/DocumentPage.tsx`
- Test: `frontend-unified/src/modules/documents/pages/amendmentDetailPage/__tests__/AmendmentTabs.test.tsx` (new), `frontend-unified/src/modules/documents/pages/documentPage/__tests__/useDocumentData.test.ts`

A draft or a proposed amendment gets two tabs: Changes (the list as today) and Preview, the document as it would read after the amendment: added sections in carried with an "Added" badge, removed ones struck through in muted ink with "Removed", and changed ones with their new text, a "Changed" badge and "Show the old text" (the server's `previous`). The preview is fetched each time the tab opens, so it follows changes just added. An applied amendment has no preview; it links to the version it produced, which the document page now opens from `?version=`.

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/modules/documents/pages/amendmentDetailPage/__tests__/AmendmentTabs.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Amendment, AmendmentPreview, PreviewSection } from '../../../../../api/client';

const api = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('../../../../../api/client', () => ({ amendments: { preview: api.preview } }));

const { AmendmentTabs } = await import('../AmendmentTabs');

function section(overrides: Partial<PreviewSection> & Pick<PreviewSection, 'id'>): PreviewSection {
  return {
    parentId: null,
    position: 0,
    numberLabel: null,
    title: null,
    content: null,
    modified: false,
    added: false,
    deleted: false,
    previous: null,
    children: [],
    ...overrides,
  };
}

const preview: AmendmentPreview = {
  amendmentId: 'a1',
  amendmentTitle: 'Lower the quorum to 15%',
  sections: [
    section({
      id: 's1',
      numberLabel: 'Article IV',
      title: 'Meetings of Members',
      children: [
        section({
          id: 's2',
          numberLabel: 'Section 4.2',
          title: 'Quorum',
          content: 'Fifteen percent of the votes is a quorum.',
          modified: true,
          previous: {
            numberLabel: 'Section 4.2',
            title: 'Quorum',
            content: 'Twenty percent of the votes is a quorum.',
          },
        }),
        section({
          id: 's3',
          numberLabel: 'Section 4.3',
          title: 'Notice',
          content: 'Notice is mailed.',
          deleted: true,
        }),
        section({
          id: 'new-c1',
          numberLabel: 'Section 4.6',
          title: 'Remote Attendance',
          content: 'Members may attend by video.',
          added: true,
        }),
      ],
    }),
  ],
};

function amendment(status: Amendment['status'], resultingVersionId: string | null = null) {
  return {
    id: 'a1',
    documentId: 'd1',
    title: 'Lower the quorum to 15%',
    description: null,
    status,
    proposedAt: null,
    decidedAt: null,
    resultingVersionId,
    createdById: null,
    createdAt: '2026-10-01T00:00:00Z',
    changes: [],
  } as Amendment;
}

function renderTabs(value: Amendment) {
  return render(
    <MemoryRouter>
      <AmendmentTabs amendment={value} changes={<p>The changes</p>} />
    </MemoryRouter>,
  );
}

describe('AmendmentTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.preview.mockResolvedValue(preview);
  });

  it("shows a draft's changes, and the document as it would read after it", async () => {
    renderTabs(amendment('draft'));
    expect(screen.getByText('The changes')).toBeTruthy();
    expect(api.preview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    const changed = await screen.findByRole('region', { name: 'Section 4.2 Quorum' });
    expect(api.preview).toHaveBeenCalledWith('a1');
    expect(within(changed).getByText('Changed')).toBeTruthy();
    expect(within(changed).getByText('Fifteen percent of the votes is a quorum.')).toBeTruthy();
    expect(within(changed).queryByText('Twenty percent of the votes is a quorum.')).toBeNull();
    fireEvent.click(within(changed).getByRole('button', { name: 'Show the old text' }));
    expect(within(changed).getByText('Twenty percent of the votes is a quorum.')).toBeTruthy();

    const removed = screen.getByRole('region', { name: 'Section 4.3 Notice' });
    expect(within(removed).getByText('Removed')).toBeTruthy();
    expect(within(removed).getByText('Notice is mailed.').closest('div')?.className).toContain(
      'line-through',
    );
    const added = screen.getByRole('region', { name: 'Section 4.6 Remote Attendance' });
    expect(within(added).getByText('Added')).toBeTruthy();
    expect(screen.queryByText('The changes')).toBeNull();
  });

  it('previews a proposed amendment too', () => {
    renderTabs(amendment('proposed'));
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeTruthy();
  });

  it('links an applied amendment to the version it produced, with no preview', () => {
    renderTabs(amendment('passed', 'v3'));
    expect(screen.queryByRole('tab')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Open the version it produced' }).getAttribute('href'),
    ).toBe('/documents/d1?version=v3');
    expect(screen.getByText('The changes')).toBeTruthy();
  });

  it("says when the preview can't be loaded", async () => {
    api.preview.mockRejectedValueOnce(new Error('HTTP 500'));
    renderTabs(amendment('draft'));
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(await screen.findByText("Couldn't load the preview.")).toBeTruthy();
  });
});
```

In `frontend-unified/src/modules/documents/pages/documentPage/__tests__/useDocumentData.test.ts`, append inside `describe('useDocumentData', () => {` (before the file's last `});`):

```ts
it('shows the version asked for (?version=), when the document has it', async () => {
  api.getDocument.mockResolvedValue({ id: 'Q', title: 'Q', currentVersionId: 'q2' });
  api.listVersions.mockResolvedValue([
    { id: 'q2', versionNumber: 2 },
    { id: 'q1', versionNumber: 1 },
  ]);
  api.listAmendments.mockResolvedValue([]);
  api.getTree.mockResolvedValue([]);

  const { result } = renderHook(() => useDocumentData('Q', 'q1'));
  await waitFor(() => expect(result.current.selectedVersion?.id).toBe('q1'));
  expect(api.getTree).toHaveBeenCalledWith('q1');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/documents/pages/amendmentDetailPage src/modules/documents/pages/documentPage/__tests__/useDocumentData.test.ts`
Expected: FAIL: `AmendmentTabs` doesn't exist, and the hook shows the current version.

- [ ] **Step 3: Create `frontend-unified/src/modules/documents/pages/amendmentDetailPage/AmendmentPreview.tsx`**

```tsx
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { amendments as amendmentsApi, type PreviewSection } from '../../../../api/client';

/** The document as it would read if the amendment were adopted */
export function AmendmentPreview({ amendmentId }: { amendmentId: string }) {
  const [sections, setSections] = useState<PreviewSection[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let canceled = false;
    amendmentsApi
      .preview(amendmentId)
      .then((preview) => {
        if (!canceled) setSections(preview.sections);
      })
      .catch(() => {
        if (!canceled) setFailed(true);
      });
    return () => {
      canceled = true;
    };
  }, [amendmentId]);

  if (failed) return <p className="card p-6 text-ink-muted">Couldn&apos;t load the preview.</p>;
  if (!sections) return <p className="card p-6 text-ink-muted">Loading the preview...</p>;

  return (
    <div className="card p-5">
      <p className="text-sm text-ink-muted">
        The document as it would read if this amendment were adopted: added sections are marked,
        removed ones struck through, and changed ones can show their old text.
      </p>
      {sections.length === 0 ? (
        <p className="mt-4 text-ink-muted">The document has no current version to preview.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {sections.map((section) => (
            <PreviewNode key={section.id} section={section} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewNode({ section, depth }: { section: PreviewSection; depth: number }) {
  const [showOld, setShowOld] = useState(false);
  const heading = [section.numberLabel, section.title].filter(Boolean).join(' ');
  const change = section.added
    ? 'added'
    : section.deleted
      ? 'removed'
      : section.modified
        ? 'changed'
        : null;
  const frame =
    change === 'added'
      ? 'border-carried bg-carried-tint'
      : change === 'removed'
        ? 'border-rule'
        : change === 'changed'
          ? 'border-gavel'
          : 'border-transparent';
  const old = section.previous;
  const oldHeading = old ? [old.numberLabel, old.title].filter(Boolean).join(' ') : '';

  return (
    <div className={depth > 0 ? 'ml-6' : ''}>
      <section
        aria-label={heading || 'Untitled section'}
        data-change={change ?? undefined}
        className={`rounded-lg border-l-4 p-3 ${frame}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {heading && (
            <span
              className={`font-document font-semibold ${change === 'removed' ? 'text-ink-muted line-through' : 'text-ink'}`}
            >
              {heading}
            </span>
          )}
          {change === 'added' && <span className="badge-passed">Added</span>}
          {change === 'removed' && <span className="badge-withdrawn">Removed</span>}
          {change === 'changed' && <span className="badge-proposed">Changed</span>}
          {change === 'changed' && old && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-expanded={showOld}
              onClick={() => setShowOld((shown) => !shown)}
            >
              {showOld ? 'Hide the old text' : 'Show the old text'}
            </button>
          )}
        </div>
        {section.content &&
          (change === 'removed' ? (
            <div className="mt-2 font-document text-ink-muted line-through">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          ) : (
            <div className="document-content mt-2">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          ))}
        {showOld && old && (
          <div className="mt-3 border-l-2 border-rule pl-3">
            <p className="label-caps">Before</p>
            {oldHeading && oldHeading !== heading && (
              <p className="mt-1 font-document text-ink-muted">{oldHeading}</p>
            )}
            {old.content && (
              <div className="mt-1 font-document text-ink-muted">
                <ReactMarkdown>{old.content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </section>
      {section.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {section.children.map((child) => (
            <PreviewNode key={child.id} section={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend-unified/src/modules/documents/pages/amendmentDetailPage/AmendmentTabs.tsx`**

```tsx
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Amendment } from '../../../../api/client';
import { AmendmentPreview } from './AmendmentPreview';

const tabClass = (current: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${current ? 'bg-gavel-tint text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`;

/**
 * An amendment's changes and, while it is a draft or proposed, a Preview of the document as it
 * would read; an applied amendment links to the version it produced instead
 */
export function AmendmentTabs({
  amendment,
  changes,
}: {
  amendment: Amendment;
  changes: ReactNode;
}) {
  const [tab, setTab] = useState<'changes' | 'preview'>('changes');
  const previewable = amendment.status === 'draft' || amendment.status === 'proposed';
  const showPreview = previewable && tab === 'preview';

  return (
    <div className="space-y-3">
      {amendment.resultingVersionId && (
        <p className="card p-4 text-sm text-ink">
          Adopted and applied.{' '}
          <Link
            to={`/documents/${amendment.documentId}?version=${amendment.resultingVersionId}`}
            className="text-gavel hover:underline"
          >
            Open the version it produced
          </Link>
        </p>
      )}
      {previewable && (
        <div role="tablist" aria-label="The amendment" className="flex gap-2">
          <button
            type="button"
            role="tab"
            id="amendment-changes-tab"
            aria-selected={!showPreview}
            aria-controls="amendment-panel"
            className={tabClass(!showPreview)}
            onClick={() => setTab('changes')}
          >
            Changes
          </button>
          <button
            type="button"
            role="tab"
            id="amendment-preview-tab"
            aria-selected={showPreview}
            aria-controls="amendment-panel"
            className={tabClass(showPreview)}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
      )}
      <div
        id="amendment-panel"
        role={previewable ? 'tabpanel' : undefined}
        aria-labelledby={
          previewable
            ? showPreview
              ? 'amendment-preview-tab'
              : 'amendment-changes-tab'
            : undefined
        }
      >
        {/* Mounted each time the tab opens, so the preview follows changes just made */}
        {showPreview ? <AmendmentPreview amendmentId={amendment.id} /> : changes}
      </div>
    </div>
  );
}
```

In `frontend-unified/src/modules/documents/pages/amendmentDetailPage/index.ts`, append:

```ts
export { AmendmentTabs } from './AmendmentTabs';
```

- [ ] **Step 5: The tabs on the page, in `frontend-unified/src/modules/documents/pages/AmendmentDetailPage.tsx`**

Replace:

```tsx
  AmendmentChangesList,
  EditAmendmentModal,
```

with:

```tsx
  AmendmentChangesList,
  AmendmentTabs,
  EditAmendmentModal,
```

and replace:

```tsx
{
  /* Changes */
}
<AmendmentChangesList
  changes={amendment.changes || []}
  sectionTree={sectionTree}
  canEdit={canEditDraft}
  onAddChange={() => setChangeModalOpen(true)}
  onDeleteChange={(change) => {
    setDeletingChange(change);
    setDeleteChangeDialogOpen(true);
  }}
/>;
```

with:

```tsx
{
  /* The changes, and a preview of the document as it would read */
}
<AmendmentTabs
  amendment={amendment}
  changes={
    <AmendmentChangesList
      changes={amendment.changes || []}
      sectionTree={sectionTree}
      canEdit={canEditDraft}
      onAddChange={() => setChangeModalOpen(true)}
      onDeleteChange={(change) => {
        setDeletingChange(change);
        setDeleteChangeDialogOpen(true);
      }}
    />
  }
/>;
```

- [ ] **Step 6: The version asked for, in `useDocumentData.ts` and `DocumentPage.tsx`**

In `frontend-unified/src/modules/documents/pages/documentPage/useDocumentData.ts`, replace:

```ts
export function useDocumentData(documentId: string | undefined): UseDocumentDataReturn {
```

with:

```ts
/**
 * A document, its versions and amendments, and the section tree of the version shown: the one
 * asked for (`versionId`, from ?version=) when the document has it, else the current one
 */
export function useDocumentData(
  documentId: string | undefined,
  versionId: string | null = null,
): UseDocumentDataReturn {
```

replace:

```ts
// Select the current version, or the newest one if none is marked current
const currentVersion = fetchedDoc.currentVersionId
  ? vers.find((v) => v.id === fetchedDoc.currentVersionId)
  : vers.reduce<Version | undefined>(
      (newest, v) => (!newest || v.versionNumber > newest.versionNumber ? v : newest),
      undefined,
    );
```

with:

```ts
// Select the version asked for, else the current version, or the newest one if none is
// marked current
const asked = versionId ? vers.find((v) => v.id === versionId) : undefined;
const currentVersion =
  asked ??
  (fetchedDoc.currentVersionId
    ? vers.find((v) => v.id === fetchedDoc.currentVersionId)
    : vers.reduce<Version | undefined>(
        (newest, v) => (!newest || v.versionNumber > newest.versionNumber ? v : newest),
        undefined,
      ));
```

and replace:

```ts
  }, [documentId, showToast]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);
```

with:

```ts
  }, [documentId, versionId, showToast]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);
```

In `frontend-unified/src/modules/documents/pages/DocumentPage.tsx`, replace:

```tsx
import { useParams, useNavigate, Link } from 'react-router-dom';
```

with:

```tsx
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
```

and replace:

```tsx
  const { showToast } = useToast();

  const {
```

with:

```tsx
  const { showToast } = useToast();
  // A link may open a particular version (an applied amendment links to the one it produced)
  const [searchParams] = useSearchParams();

  const {
```

and:

```tsx
  } = useDocumentData(documentId);
```

with:

```tsx
  } = useDocumentData(documentId, searchParams.get('version'));
```

- [ ] **Step 7: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/documents && npx tsc --noEmit -p . && cd .. && npm run lint`
Expected: all pass (`AmendmentTabs.test.tsx` 4, and the hook's new case); type-check clean; lint clean apart from its usual warnings.

- [ ] **Step 8: Commit**

```bash
npx prettier --write frontend-unified/src/modules/documents
git add frontend-unified/src/modules/documents/pages/amendmentDetailPage/AmendmentPreview.tsx frontend-unified/src/modules/documents/pages/amendmentDetailPage/AmendmentTabs.tsx frontend-unified/src/modules/documents/pages/amendmentDetailPage/index.ts frontend-unified/src/modules/documents/pages/amendmentDetailPage/__tests__/AmendmentTabs.test.tsx frontend-unified/src/modules/documents/pages/AmendmentDetailPage.tsx frontend-unified/src/modules/documents/pages/documentPage/useDocumentData.ts frontend-unified/src/modules/documents/pages/documentPage/__tests__/useDocumentData.test.ts frontend-unified/src/modules/documents/pages/DocumentPage.tsx
git commit -m "feat(web): preview an amendment's effect on the document

A draft or proposed amendment has a Preview tab beside its changes: the
document as it would read, added sections marked, removed ones struck
through, and changed ones with a Changed badge and their old text on
request. An applied amendment links to the version it produced, which the
document page opens from ?version=."
```

---

### Task 5: Header search that finds sections

**Files:**

- Modify: `frontend-unified/src/api/client.ts`, `frontend-unified/src/components/layout/Header.tsx`, `frontend-unified/src/modules/documents/components/SectionTree.tsx`, `frontend-unified/src/modules/documents/pages/DocumentPage.tsx`
- Create: `frontend-unified/src/modules/documents/pages/documentPage/sectionFromHash.ts`
- Test: `frontend-unified/src/components/layout/__tests__/Header.test.tsx`, `frontend-unified/src/modules/documents/pages/documentPage/__tests__/sectionFromHash.test.tsx` (new)

The header's search called `/api/search`, which never existed, and swallowed the error. It now searches the current organization's bylaws (from 2 characters, a moment after typing stops) and lists sections with their document and the text around the match; choosing one opens the document at it (`/documents/:id#section-<sectionId>`), where the section is selected (the brief's gavel bar and tint) and scrolled into view. The box and its narrow-screen behavior stay as they are.

- [ ] **Step 1: Write the failing tests**

In `frontend-unified/src/components/layout/__tests__/Header.test.tsx`, replace:

```tsx
import { MemoryRouter } from 'react-router-dom';
```

with:

```tsx
import { MemoryRouter, useLocation } from 'react-router-dom';
```

replace:

```tsx
vi.mock('../../../api/client', () => ({ search: { query: vi.fn(async () => ({ results: [] })) } }));
```

with:

```tsx
const api = vi.hoisted(() => ({ query: vi.fn(async () => ({ query: '', results: [] })) }));
vi.mock('../../../api/client', () => ({ search: { query: api.query } }));
```

and append inside `describe('Header', () => {`, before its closing `});`:

```tsx
it('searches the bylaws of the current organization and opens the document at a section', async () => {
  api.query.mockResolvedValueOnce({
    query: 'quorum',
    results: [
      {
        documentId: 'd1',
        documentTitle: 'Bylaws of Maple Grove',
        versionId: 'v1',
        sectionId: 's42',
        numberLabel: 'Section 4.2',
        title: 'Quorum',
        snippet: '...twenty percent of the votes constitutes a quorum...',
      },
    ],
  });
  function Location() {
    const { pathname, hash } = useLocation();
    return <p>At {`${pathname}${hash}`}</p>;
  }
  render(
    <MemoryRouter>
      <Header onMenuClick={() => {}} />
      <Location />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Search documents' }), {
    target: { value: 'quorum' },
  });
  const hit = await screen.findByRole('button', { name: /Section 4\.2 Quorum/ });
  expect(api.query).toHaveBeenCalledWith('o1', 'quorum');
  expect(screen.getByText('in Bylaws of Maple Grove')).toBeTruthy();
  expect(screen.getByText('...twenty percent of the votes constitutes a quorum...')).toBeTruthy();

  fireEvent.click(hit);
  expect(screen.getByText('At /documents/d1#section-s42')).toBeTruthy();
});

it('waits for 2 characters', async () => {
  renderHeader();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search documents' }), {
    target: { value: 'q' },
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(api.query).not.toHaveBeenCalled();
});
```

Create `frontend-unified/src/modules/documents/pages/documentPage/__tests__/sectionFromHash.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { SectionTree } from '../../../../../api/client';
import { findSection, useSectionFromHash } from '../sectionFromHash';

const node = (id: string, children: SectionTree[] = []) =>
  ({ id, numberLabel: id, title: null, content: null, children }) as unknown as SectionTree;
const tree = [node('a1', [node('s1'), node('s2', [node('s3')])]), node('a2')];

const at = (path: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

describe('findSection', () => {
  it('finds a section at any depth, or nothing', () => {
    expect(findSection(tree, 's3')?.id).toBe('s3');
    expect(findSection(tree, 'a2')?.id).toBe('a2');
    expect(findSection(tree, 'nope')).toBeNull();
  });
});

describe('useSectionFromHash', () => {
  it('selects the section the link names once the tree has it', () => {
    const select = vi.fn();
    const { rerender } = renderHook(({ sections }) => useSectionFromHash(sections, select), {
      initialProps: { sections: [] as SectionTree[] },
      wrapper: at('/documents/d1#section-s3'),
    });
    expect(select).not.toHaveBeenCalled();
    rerender({ sections: tree });
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 's3' }));
  });

  it('does nothing without a section in the link', () => {
    const select = vi.fn();
    renderHook(() => useSectionFromHash(tree, select), { wrapper: at('/documents/d1') });
    expect(select).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/components/layout/__tests__/Header.test.tsx src/modules/documents/pages/documentPage/__tests__/sectionFromHash.test.tsx`
Expected: FAIL: the header calls the search with the query first and opens the document without a section, and `sectionFromHash` doesn't exist.

- [ ] **Step 3: The search call, in `frontend-unified/src/api/client.ts`**

Replace:

```ts
// Search
export const search = {
  query: (q: string, orgId?: string, docId?: string) => {
    let endpoint = `/search?q=${encodeURIComponent(q)}`;
    if (orgId) endpoint += `&org_id=${orgId}`;
    if (docId) endpoint += `&doc_id=${docId}`;
    return request<SearchResult>(endpoint, {}, false); // Don't cache search results
  },
};
```

with:

```ts
// Search the current version of each of an organization's documents, from 2 characters. Not
// cached: the results follow edits.
export const search = {
  query: (orgId: string, q: string) =>
    request<SearchResult>(`/organizations/${orgId}/search?q=${encodeURIComponent(q)}`, {}, false),
};
```

and replace:

```ts
export interface SearchResult {
  query: string;
  total: number;
  results: SearchResultItem[];
}

export interface SearchResultItem {
  type: 'document' | 'section';
  id: string;
  documentId: string;
  documentTitle: string;
  sectionId?: string;
  title: string;
  snippet: string;
  matchType: 'title' | 'content' | 'label';
}
```

with:

```ts
export interface SearchResult {
  query: string;
  results: SearchHit[];
}

/** A section that matched, with the text around the first match */
export interface SearchHit {
  documentId: string;
  documentTitle: string;
  versionId: string;
  sectionId: string;
  numberLabel: string | null;
  title: string | null;
  snippet: string;
}
```

- [ ] **Step 4: The header, in `frontend-unified/src/components/layout/Header.tsx`**

Replace:

```tsx
import { Scale, Menu, Search, X, FileText, Hash } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { search as searchApi, SearchResultItem } from '../../api/client';
```

with:

```tsx
import { Scale, Menu, Search, X, Hash } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { search as searchApi, type SearchHit } from '../../api/client';
```

replace:

```tsx
const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
```

with:

```tsx
const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
```

in the debounced search's effect, replace:

```tsx
    if (searchQuery.trim().length < 2) {
```

with:

```tsx
    // The current organization's bylaws, from 2 characters
    const organizationId = currentOrganization?.id;
    const query = searchQuery.trim();
    if (!organizationId || query.length < 2) {
```

and:

```tsx
const result = await searchApi.query(searchQuery, currentOrganization?.id);
```

with:

```tsx
const result = await searchApi.query(organizationId, query);
```

replace:

```tsx
const handleSearchResultClick = (result: SearchResultItem) => {
  setShowSearchResults(false);
  setSearchQuery('');
  navigate(`/documents/${result.documentId}`);
};
```

with:

```tsx
// The document opens at the section: it is selected and scrolled into view there
const handleSearchResultClick = (hit: SearchHit) => {
  setShowSearchResults(false);
  setSearchQuery('');
  setSearchOpen(false);
  navigate(`/documents/${hit.documentId}#section-${hit.sectionId}`);
};
```

and replace the results list, from `                  {searchResults.map((result) => (` through the `))}` that closes it:

```tsx
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
```

(down to its closing `                  ))}`), with:

```tsx
{
  searchResults.map((hit) => (
    <button
      key={hit.sectionId}
      onClick={() => handleSearchResultClick(hit)}
      className="w-full text-left px-4 py-2 hover:bg-surface-2 transition-colors"
    >
      <div className="flex items-start gap-3">
        <Hash className="mt-0.5 w-4 h-4 text-ink-muted" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink truncate">
            {[hit.numberLabel, hit.title].filter(Boolean).join(' ') || 'Section'}
          </div>
          <div className="text-xs text-ink-muted truncate">in {hit.documentTitle}</div>
          {hit.snippet && (
            <div className="text-xs text-ink-muted mt-0.5 line-clamp-2">{hit.snippet}</div>
          )}
        </div>
      </div>
    </button>
  ));
}
```

- [ ] **Step 5: Anchors and the section from the link**

In `frontend-unified/src/modules/documents/components/SectionTree.tsx`, in `SortableSectionNode`, replace:

```tsx
    <div ref={setNodeRef} style={style} className={depth > 0 ? 'ml-6' : ''}>
```

with:

```tsx
    <div
      ref={setNodeRef}
      id={`section-${section.id}`}
      style={style}
      className={`scroll-mt-4 ${depth > 0 ? 'ml-6' : ''}`}
    >
```

Create `frontend-unified/src/modules/documents/pages/documentPage/sectionFromHash.ts`:

```ts
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { SectionTree } from '../../../../api/client';

/** The section with this id, at any depth, or null */
export function findSection(sections: SectionTree[], id: string): SectionTree | null {
  for (const section of sections) {
    if (section.id === id) return section;
    const found = findSection(section.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * A document opened at a section (#section-<id>, from the header's search): once the tree has
 * the section, select it and scroll it into view
 */
export function useSectionFromHash(
  sections: SectionTree[],
  select: (section: SectionTree) => void,
): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash.startsWith('#section-')) return;
    const id = hash.slice('#section-'.length);
    const section = findSection(sections, id);
    if (!section) return;
    select(section);
    document.getElementById(`section-${id}`)?.scrollIntoView?.({ block: 'center' });
  }, [hash, sections, select]);
}
```

In `frontend-unified/src/modules/documents/pages/DocumentPage.tsx`, replace:

```tsx
  CreateVersionModal,
  CreateAmendmentModal,
} from './documentPage';
```

with:

```tsx
  CreateVersionModal,
  CreateAmendmentModal,
} from './documentPage';
import { useSectionFromHash } from './documentPage/sectionFromHash';
```

and replace:

```tsx
const [selectedSection, setSelectedSection] = useState<SectionTreeType | null>(null);
```

with:

```tsx
const [selectedSection, setSelectedSection] = useState<SectionTreeType | null>(null);
// Opened from search at a section: select it and bring it into view
useSectionFromHash(sectionTree, setSelectedSection);
```

- [ ] **Step 6: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/components/layout src/modules/documents && npx tsc --noEmit -p . && cd .. && npm run lint`
Expected: all pass (`Header.test.tsx` gains 2, `sectionFromHash.test.tsx` has 3); type-check clean; lint clean apart from its usual warnings.

- [ ] **Step 7: Commit**

```bash
npx prettier --write frontend-unified/src/api/client.ts frontend-unified/src/components/layout frontend-unified/src/modules/documents
git add frontend-unified/src/api/client.ts frontend-unified/src/components/layout/Header.tsx frontend-unified/src/components/layout/__tests__/Header.test.tsx frontend-unified/src/modules/documents/components/SectionTree.tsx frontend-unified/src/modules/documents/pages/documentPage/sectionFromHash.ts frontend-unified/src/modules/documents/pages/documentPage/__tests__/sectionFromHash.test.tsx frontend-unified/src/modules/documents/pages/DocumentPage.tsx
git commit -m "feat(web): header search that finds sections

The header searches the current organization's bylaws through the new
search route and lists the sections it finds, with their document and the
text around the match. Choosing one opens the document at the section,
which is selected and scrolled into view."
```

---

### Task 6: The Minutes page

**Files:**

- Create: `frontend-unified/src/modules/documents/pages/MinutesListPage.tsx`, `frontend-unified/src/modules/documents/utils/minutes.ts`
- Modify: `frontend-unified/src/components/ui/Badge.tsx`, `frontend-unified/src/components/ui/index.ts`, `frontend-unified/src/components/layout/Sidebar.tsx`, `frontend-unified/src/App.tsx`
- Test: `frontend-unified/src/modules/documents/pages/__tests__/MinutesListPage.test.tsx` (new)

A Minutes item in the sidebar opens `/minutes`: the current organization's minutes, the latest meeting first, each with its meeting's title and date and a status badge (Draft, Published, Approved). Members see published and approved minutes (the server leaves drafts out for them); secretaries see drafts too.

- [ ] **Step 1: Write the failing test**

Create `frontend-unified/src/modules/documents/pages/__tests__/MinutesListPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MinutesSummary } from '../../../../api/client';

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../api/client', () => ({ minutes: { list: api.list } }));
const org = vi.hoisted(() => ({
  currentOrganization: { id: 'org-1', name: 'Maple Grove HOA' } as {
    id: string;
    name: string;
  } | null,
  isSecretary: true,
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({ currentOrganization: org.currentOrganization }),
  useCan: () => org.isSecretary,
}));

const { default: MinutesListPage } = await import('../MinutesListPage');

function summary(overrides: Partial<MinutesSummary> & Pick<MinutesSummary, 'id'>): MinutesSummary {
  return {
    status: 'draft',
    generatedAt: '2026-10-21T02:00:00.000Z',
    updatedAt: '2026-10-21T02:00:00.000Z',
    publishedAt: null,
    approvedAt: null,
    packet: { id: 'p1', robbieCode: 'MAPLE1', title: '2026 Annual Meeting', scheduledFor: null },
    ...overrides,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <MinutesListPage />
    </MemoryRouter>,
  );

describe('MinutesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.currentOrganization = { id: 'org-1', name: 'Maple Grove HOA' };
    org.isSecretary = true;
  });

  it("lists the organization's minutes with their meetings and status", async () => {
    api.list.mockResolvedValue([
      summary({
        id: 'm2',
        packet: {
          id: 'p2',
          robbieCode: 'MAPLE1',
          title: '2026 Annual Meeting',
          scheduledFor: '2026-10-21T00:00:00.000Z',
        },
      }),
      summary({
        id: 'm1',
        status: 'approved',
        packet: {
          id: 'p1',
          robbieCode: 'MAPLE25',
          title: '2025 Annual Meeting',
          scheduledFor: null,
        },
      }),
    ]);
    renderPage();

    const latest = await screen.findByRole('link', { name: /2026 Annual Meeting/ });
    expect(latest.getAttribute('href')).toBe('/minutes/m2');
    expect(latest.textContent).toContain('Draft');
    // ICU may put a narrow no-break space before PM
    expect(latest.textContent).toMatch(/Tue, Oct 20, 7:00\sPM/);
    const last = screen.getByRole('link', { name: /2025 Annual Meeting/ });
    expect(last.getAttribute('href')).toBe('/minutes/m1');
    expect(last.textContent).toContain('Approved');
    expect(last.textContent).toContain('No date');
    expect(api.list).toHaveBeenCalledWith('org-1');
  });

  it('says when there are none yet', async () => {
    api.list.mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByText('No minutes yet. Robbie drafts them when a meeting adjourns.'),
    ).toBeTruthy();
  });

  it('tells a member what they will find', async () => {
    org.isSecretary = false;
    api.list.mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByText('The minutes of your meetings, once the secretary publishes them.'),
    ).toBeTruthy();
  });

  it('asks for an organization first', () => {
    org.currentOrganization = null;
    renderPage();
    expect(screen.getByText('Choose an organization to see its minutes.')).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/documents/pages/__tests__/MinutesListPage.test.tsx`
Expected: FAIL: `MinutesListPage` doesn't exist.

- [ ] **Step 3: The status badge, in `frontend-unified/src/components/ui/Badge.tsx`**

Append:

```tsx
const MINUTES_STATUS: Record<'draft' | 'published' | 'approved', [string, string]> = {
  draft: ['badge-draft', 'Draft'],
  published: ['badge-proposed', 'Published'],
  approved: ['badge-passed', 'Approved'],
};

/** A meeting's minutes: the secretary's draft, published for the members, or approved */
export function MinutesStatusBadge({ status }: { status: 'draft' | 'published' | 'approved' }) {
  const [className, label] = MINUTES_STATUS[status];
  return <span className={className}>{label}</span>;
}
```

In `frontend-unified/src/components/ui/index.ts`, replace:

```ts
  PresenceBadge,
  type Presence,
} from './Badge';
```

with:

```ts
  PresenceBadge,
  MinutesStatusBadge,
  type Presence,
} from './Badge';
```

- [ ] **Step 4: Create `frontend-unified/src/modules/documents/utils/minutes.ts`**

```ts
import type { MinutesRecord, MinutesSummary } from '../../../api/client';

/** The meeting minutes are of, by its title or else its code: "2026 Annual Meeting" */
export function meetingName(minutes: Pick<MinutesRecord | MinutesSummary, 'packet'>): string {
  return minutes.packet.title || `Meeting ${minutes.packet.robbieCode}`;
}
```

- [ ] **Step 5: Create `frontend-unified/src/modules/documents/pages/MinutesListPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { minutes as minutesApi, type MinutesSummary } from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { MinutesStatusBadge } from '../../../components/ui/Badge';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { formatMeetingTime } from '../../../utils/dates';
import { meetingName } from '../utils/minutes';

/** The current organization's minutes, the latest meeting first (/minutes) */
export default function MinutesListPage() {
  const { currentOrganization } = useOrganization();
  const isSecretary = useCan('secretary');
  const organizationId = currentOrganization?.id ?? null;
  // Kept with the organization they are of, so a switch never shows the last one's
  const [loaded, setLoaded] = useState<{ organizationId: string; list: MinutesSummary[] } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let canceled = false;
    minutesApi
      .list(organizationId)
      .then((list) => {
        if (!canceled) setLoaded({ organizationId, list });
      })
      .catch(() => {
        if (!canceled) setFailed(true);
      });
    return () => {
      canceled = true;
    };
  }, [organizationId]);

  if (!organizationId) {
    return (
      <p className="py-12 text-center text-ink-muted">Choose an organization to see its minutes.</p>
    );
  }
  if (failed)
    return <p className="py-12 text-center text-ink-muted">Couldn&apos;t load the minutes.</p>;
  const list = loaded?.organizationId === organizationId ? loaded.list : null;
  if (!list) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="page-title">Minutes</h2>
        <p className="mt-1 text-ink-muted">
          {isSecretary
            ? 'Robbie drafts the minutes when a meeting adjourns. Check them, then publish them for the members and the next meeting.'
            : 'The minutes of your meetings, once the secretary publishes them.'}
        </p>
      </div>
      {list.length === 0 ? (
        <p className="card p-6 text-ink-muted">
          No minutes yet. Robbie drafts them when a meeting adjourns.
        </p>
      ) : (
        <ul className="card divide-y divide-rule">
          {list.map((item) => (
            <li key={item.id}>
              <Link
                to={`/minutes/${item.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{meetingName(item)}</span>
                  <span className="block text-sm text-ink-muted">
                    {item.packet.scheduledFor
                      ? formatMeetingTime(item.packet.scheduledFor)
                      : 'No date'}
                  </span>
                </span>
                <MinutesStatusBadge status={item.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: The sidebar item and the route**

In `frontend-unified/src/components/layout/Sidebar.tsx`, replace:

```tsx
  X,
  Users,
} from 'lucide-react';
```

with:

```tsx
  X,
  Users,
  ScrollText,
} from 'lucide-react';
```

and:

```tsx
  { icon: Users, label: 'Live Meetings', path: '/meetings' },
];
```

with:

```tsx
  { icon: Users, label: 'Live Meetings', path: '/meetings' },
  { icon: ScrollText, label: 'Minutes', path: '/minutes' },
];
```

In `frontend-unified/src/App.tsx`, replace:

```tsx
const SettingsPage = lazy(() => import('./modules/documents/pages/SettingsPage'));
```

with:

```tsx
const SettingsPage = lazy(() => import('./modules/documents/pages/SettingsPage'));
const MinutesListPage = lazy(() => import('./modules/documents/pages/MinutesListPage'));
```

and:

```tsx
{
  /* Settings */
}
<Route path="settings" element={<SettingsPage />} />;
```

with:

```tsx
{
  /* Minutes of the organization's meetings */
}
<Route path="minutes" element={<MinutesListPage />} />;

{
  /* Settings */
}
<Route path="settings" element={<SettingsPage />} />;
```

- [ ] **Step 7: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/documents/pages/__tests__/MinutesListPage.test.tsx src/components && npx tsc --noEmit -p . && cd .. && npm run lint`
Expected: all pass (`MinutesListPage.test.tsx` 4; `Sidebar.test.tsx` as before); type-check clean; lint clean apart from its usual warnings.

- [ ] **Step 8: Commit**

```bash
npx prettier --write frontend-unified/src/modules/documents frontend-unified/src/components frontend-unified/src/App.tsx
git add frontend-unified/src/modules/documents/pages/MinutesListPage.tsx frontend-unified/src/modules/documents/pages/__tests__/MinutesListPage.test.tsx frontend-unified/src/modules/documents/utils/minutes.ts frontend-unified/src/components/ui/Badge.tsx frontend-unified/src/components/ui/index.ts frontend-unified/src/components/layout/Sidebar.tsx frontend-unified/src/App.tsx
git commit -m "feat(web): the Minutes page

A Minutes item in the sidebar lists the organization's minutes, the latest
meeting first, with each meeting's title and date and whether the minutes
are a draft, published or approved. Members see the published ones."
```

---

### Task 7: The minutes editor, and printing the minutes

**Files:**

- Create: `frontend-unified/src/modules/documents/pages/MinutesPage.tsx`, `frontend-unified/src/modules/documents/pages/MinutesPrintPage.tsx`, `frontend-unified/src/utils/download.ts`
- Modify: `frontend-unified/src/App.tsx`
- Test: `frontend-unified/src/modules/documents/pages/__tests__/MinutesPage.test.tsx`, `frontend-unified/src/utils/__tests__/download.test.ts` (new)

`/minutes/:minutesId` shows a meeting's minutes under "Minutes of the <meeting>", with the status badge, the date and place, and for approved minutes "Approved at the <meeting> with corrections: ..." (or ", as read."). A secretary edits drafts and published minutes (approved ones are the record): the Markdown on the left and its preview on the right (stacked on phones), saved two seconds after typing stops, with a status line that names who saved last ("last save wins"). On a draft: "Publish" (saving first if needed) and "Regenerate from the meeting", which asks first since it replaces the text. Once published: "Print or save as PDF" (`/minutes/:minutesId/print`, outside the chrome like the other print pages) and "Download Markdown". Members read published and approved minutes with the same two.

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/utils/__tests__/download.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadText, fileName } from '../download';

describe('fileName', () => {
  it('makes a file name from a title', () => {
    expect(fileName('2026 Annual Meeting')).toBe('2026-annual-meeting');
    expect(fileName("Treasurer's report: Q3")).toBe('treasurer-s-report-q3');
    expect(fileName('***')).toBe('download');
  });
});

describe('downloadText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hands the browser a text file to save', () => {
    const createObjectURL = vi.fn(() => 'blob:minutes');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadText('minutes.md', '# Minutes');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toMatchObject({ download: 'minutes.md' });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:minutes');
    click.mockRestore();
  });
});
```

Create `frontend-unified/src/modules/documents/pages/__tests__/MinutesPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MinutesRecord } from '../../../../api/client';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  regenerate: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({ minutes: api }));
const org = vi.hoisted(() => ({ isSecretary: true }));
vi.mock('../../../../context/OrganizationContext', () => ({
  useCan: () => org.isSecretary,
  useSelectRecordOrganization: () => {},
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));
const download = vi.hoisted(() => ({ downloadText: vi.fn() }));
vi.mock('../../../../utils/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/download')>()),
  downloadText: download.downloadText,
}));

const { default: MinutesPage, AUTOSAVE_MS } = await import('../MinutesPage');
const { default: MinutesPrintPage } = await import('../MinutesPrintPage');

const BODY =
  '# Maple Grove HOA\n\nThe pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.';

function record(overrides: Partial<MinutesRecord> = {}): MinutesRecord {
  return {
    id: 'm1',
    organizationId: 'org-1',
    packetId: 'p1',
    status: 'draft',
    body: BODY,
    generatedAt: '2026-10-21T02:00:00.000Z',
    updatedAt: '2026-10-21T02:00:00.000Z',
    publishedAt: null,
    approvedAt: null,
    corrections: null,
    packet: {
      id: 'p1',
      robbieCode: 'MAPLE1',
      title: '2026 Annual Meeting',
      scheduledFor: '2026-10-21T00:00:00.000Z',
      location: 'Maple Grove Clubhouse',
    },
    organization: { id: 'org-1', name: 'Maple Grove HOA', timeZone: 'America/Chicago' },
    updatedBy: null,
    publishedBy: null,
    approvedAtPacket: null,
    ...overrides,
  };
}

function renderAt(path = '/minutes/m1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/minutes/:minutesId" element={<MinutesPage />} />
        <Route path="/minutes/:minutesId/print" element={<MinutesPrintPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const heading = () =>
  screen.findByRole('heading', { level: 2, name: 'Minutes of the 2026 Annual Meeting' });
const preview = () => within(screen.getByRole('region', { name: 'Preview' }));

describe('MinutesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.isSecretary = true;
    api.get.mockResolvedValue(record());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a draft beside its preview, and saves two seconds after typing stops', async () => {
    api.save.mockImplementation(async (_id: string, body: string) =>
      record({ body, updatedBy: { id: 1, name: 'Pat Lindqvist' } }),
    );
    renderAt();
    await heading();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText(/^Tue, Oct 20, 7:00\sPM, Maple Grove Clubhouse$/)).toBeTruthy();
    expect(
      preview().getByText(
        'The pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.',
      ),
    ).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText('Minutes text'), {
      target: { value: '# Maple Grove HOA\n\nFixed a name.' },
    });
    expect(screen.getByText('Not saved yet')).toBeTruthy();
    expect(preview().getByText('Fixed a name.')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    });
    expect(api.save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith('m1', '# Maple Grove HOA\n\nFixed a name.');
    expect(screen.getByText('Saved by Pat Lindqvist')).toBeTruthy();
  });

  it('publishes a draft, saving the last changes first', async () => {
    api.save.mockResolvedValue(record({ body: 'Edited' }));
    api.publish.mockResolvedValue(
      record({ body: 'Edited', status: 'published', publishedBy: { id: 1, name: 'Pat' } }),
    );
    renderAt();
    await heading();
    fireEvent.change(screen.getByLabelText('Minutes text'), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Published')).toBeTruthy();
    expect(api.save).toHaveBeenCalledWith('m1', 'Edited');
    expect(api.save.mock.invocationCallOrder[0]).toBeLessThan(
      api.publish.mock.invocationCallOrder[0],
    );
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Print or save as PDF' }).getAttribute('href')).toBe(
      '/minutes/m1/print?print=1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
    expect(download.downloadText).toHaveBeenCalledWith('2026-annual-meeting-minutes.md', 'Edited');
  });

  it('writes a draft again from the meeting, after asking', async () => {
    api.regenerate.mockResolvedValue(record({ body: '# Maple Grove HOA\n\nWritten again.' }));
    renderAt();
    await heading();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate from the meeting' }));
    expect(api.regenerate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Write them again' }));

    expect(await preview().findByText('Written again.')).toBeTruthy();
    expect((screen.getByLabelText('Minutes text') as HTMLTextAreaElement).value).toBe(
      '# Maple Grove HOA\n\nWritten again.',
    );
  });

  it('lets a member read published minutes and take them away, without editing', async () => {
    org.isSecretary = false;
    api.get.mockResolvedValue(record({ status: 'published' }));
    renderAt();
    await heading();
    expect(screen.queryByLabelText('Minutes text')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(
      screen.getByText(
        'The pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
    expect(download.downloadText).toHaveBeenCalledWith('2026-annual-meeting-minutes.md', BODY);
  });

  it('says where approved minutes were approved, and the corrections, and keeps them as they are', async () => {
    api.get.mockResolvedValue(
      record({
        status: 'approved',
        corrections: 'Twenty-two members were present',
        approvedAtPacket: { id: 'p2', title: '2027 Annual Meeting', scheduledFor: null },
      }),
    );
    renderAt();
    await heading();
    expect(
      screen.getByText(
        'Approved at the 2027 Annual Meeting with corrections: Twenty-two members were present',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Minutes text')).toBeNull();
  });

  it("says when the minutes aren't there", async () => {
    api.get.mockRejectedValue(new Error('Not found'));
    renderAt();
    expect(await screen.findByText("These minutes aren't available.")).toBeTruthy();
  });
});

describe('MinutesPrintPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(record({ status: 'published' }));
    vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  it('prints the minutes with the organization in the running header', async () => {
    renderAt('/minutes/m1/print?print=1');
    expect(
      await screen.findByText(
        'The pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.',
      ),
    ).toBeTruthy();
    expect(document.querySelector('.print-running-header')?.textContent).toBe(
      'Maple Grove HOA | Minutes of the 2026 Annual Meeting',
    );
    expect(document.title).toBe('Minutes of the 2026 Annual Meeting');
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/utils/__tests__/download.test.ts src/modules/documents/pages/__tests__/MinutesPage.test.tsx`
Expected: FAIL: `download`, `MinutesPage` and `MinutesPrintPage` don't exist.

- [ ] **Step 3: Create `frontend-unified/src/utils/download.ts`**

```ts
/** A file name from a title: lower case, words joined by hyphens */
export function fileName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'download'
  );
}

/** Hand the browser a text file to save, made here rather than fetched */
export function downloadText(name: string, text: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Create `frontend-unified/src/modules/documents/pages/MinutesPage.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Download, Printer, RefreshCw, Send } from 'lucide-react';
import { minutes as minutesApi, type MinutesRecord } from '../../../api/client';
import { useCan, useSelectRecordOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { MinutesStatusBadge } from '../../../components/ui/Badge';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { formatMeetingTime } from '../../../utils/dates';
import { downloadText, fileName } from '../../../utils/download';
import { meetingName } from '../utils/minutes';

/** How long the editor waits after the last keystroke before it saves */
export const AUTOSAVE_MS = 2000;

type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed';

/** A meeting's minutes (/minutes/:minutesId): a secretary edits them, members read them */
export default function MinutesPage() {
  const { minutesId = '' } = useParams<{ minutesId: string }>();
  const [record, setRecord] = useState<MinutesRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  useSelectRecordOrganization(record?.organizationId);
  const isSecretary = useCan('secretary');

  useEffect(() => {
    let canceled = false;
    minutesApi
      .get(minutesId)
      .then((found) => {
        if (!canceled) setRecord(found);
      })
      .catch(() => {
        if (!canceled) setNotFound(true);
      });
    return () => {
      canceled = true;
    };
  }, [minutesId]);

  if (notFound) {
    return <p className="py-12 text-center text-ink-muted">These minutes aren&apos;t available.</p>;
  }
  if (!record) return <LoadingPage />;

  // Approved minutes are the record: nobody edits them
  const editable = isSecretary && record.status !== 'approved';
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <MinutesHeading record={record} />
      {editable ? (
        <MinutesEditor key={record.id} record={record} onChange={setRecord} />
      ) : (
        <MinutesReader record={record} />
      )}
    </div>
  );
}

function MinutesHeading({ record }: { record: MinutesRecord }) {
  const when = record.packet.scheduledFor ? formatMeetingTime(record.packet.scheduledFor) : null;
  const approvedAt = record.approvedAtPacket?.title;
  return (
    <div>
      <Link
        to="/minutes"
        className="inline-flex items-center gap-1 text-sm text-gavel hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Minutes
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h2 className="page-title">Minutes of the {meetingName(record)}</h2>
        <MinutesStatusBadge status={record.status} />
      </div>
      {(when || record.packet.location) && (
        <p className="mt-1 text-ink-muted">
          {[when, record.packet.location].filter(Boolean).join(', ')}
        </p>
      )}
      {record.status === 'approved' && (
        <p className="mt-2 text-ink">
          {approvedAt ? `Approved at the ${approvedAt}` : 'Approved'}
          {record.corrections ? ` with corrections: ${record.corrections}` : ', as read.'}
        </p>
      )}
    </div>
  );
}

/** Print or save as PDF, and download the Markdown */
function TakeAway({ record, body }: { record: MinutesRecord; body: string }) {
  return (
    <>
      <a
        href={`/minutes/${record.id}/print?print=1`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary btn-sm"
      >
        <Printer className="h-4 w-4" aria-hidden="true" />
        Print or save as PDF
      </a>
      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={() => downloadText(`${fileName(meetingName(record))}-minutes.md`, body)}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download Markdown
      </button>
    </>
  );
}

function MinutesReader({ record }: { record: MinutesRecord }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <TakeAway record={record} body={record.body} />
      </div>
      <article className="card p-6 sm:p-10">
        <div className="document-content">
          <ReactMarkdown>{record.body}</ReactMarkdown>
        </div>
      </article>
    </>
  );
}

/**
 * The secretary's editor: Markdown and its preview, saved AUTOSAVE_MS after typing stops (the
 * last save wins, and the status names who made it)
 */
function MinutesEditor({
  record,
  onChange,
}: {
  record: MinutesRecord;
  onChange: (next: MinutesRecord) => void;
}) {
  const { showToast } = useToast();
  const [body, setBody] = useState(record.body);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [busy, setBusy] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  // The text as typed, for a save that runs after the render that scheduled it
  const latest = useRef(record.body);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const save = useCallback(async (): Promise<boolean> => {
    cancelTimer();
    const text = latest.current;
    setSaveState('saving');
    try {
      onChange(await minutesApi.save(record.id, text));
      // Typing during the save left newer text, which its own timer saves
      setSaveState(latest.current === text ? 'saved' : 'unsaved');
      return true;
    } catch {
      setSaveState('failed');
      return false;
    }
  }, [record.id, onChange]);

  useEffect(() => cancelTimer, []);

  const edit = (text: string) => {
    setBody(text);
    latest.current = text;
    setSaveState('unsaved');
    cancelTimer();
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };

  const publish = async () => {
    setBusy(true);
    try {
      if (saveState !== 'saved' && !(await save())) return;
      onChange(await minutesApi.publish(record.id));
      showToast(
        'success',
        'Published: the members can read them, and the next meeting will be asked to approve them',
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Couldn't publish the minutes");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setConfirmRegenerate(false);
    setBusy(true);
    cancelTimer();
    try {
      const written = await minutesApi.regenerate(record.id);
      setBody(written.body);
      latest.current = written.body;
      setSaveState('saved');
      onChange(written);
      showToast('success', 'The minutes were written again from the meeting');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Couldn't write the minutes again");
    } finally {
      setBusy(false);
    }
  };

  const status = {
    saved: record.updatedBy?.name ? `Saved by ${record.updatedBy.name}` : 'Saved',
    unsaved: 'Not saved yet',
    saving: 'Saving...',
    failed: "Couldn't save. Your text is still here; keep typing to try again.",
  }[saveState];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {record.status === 'draft' ? (
          <>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy}
              onClick={() => void publish()}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Publish
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={busy}
              onClick={() => setConfirmRegenerate(true)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Regenerate from the meeting
            </button>
          </>
        ) : (
          <TakeAway record={record} body={body} />
        )}
        <p role="status" className="ml-auto text-sm text-ink-muted">
          {status}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="minutes-text-heading" className="card flex flex-col p-4">
          <h3 id="minutes-text-heading" className="label-caps mb-2">
            Markdown
          </h3>
          <label htmlFor="minutesText" className="sr-only">
            Minutes text
          </label>
          <textarea
            id="minutesText"
            className="textarea min-h-[60vh] flex-1 text-sm"
            value={body}
            onChange={(e) => edit(e.target.value)}
          />
        </section>
        <section aria-labelledby="minutes-preview-heading" className="card p-6">
          <h3 id="minutes-preview-heading" className="label-caps mb-4">
            Preview
          </h3>
          <div className="document-content">
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>
        </section>
      </div>
      <ConfirmDialog
        isOpen={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={() => void regenerate()}
        title="Write the minutes again?"
        message="This replaces the text with minutes written again from the meeting's record. Your edits will be lost."
        confirmText="Write them again"
        variant="danger"
      />
    </>
  );
}
```

- [ ] **Step 5: Create `frontend-unified/src/modules/documents/pages/MinutesPrintPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { minutes as minutesApi, type MinutesRecord } from '../../../api/client';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { PrintShell } from '../components/PrintableDocument';
import { meetingName } from '../utils/minutes';

/** A meeting's minutes ready to print or save as PDF: /minutes/:minutesId/print */
export default function MinutesPrintPage() {
  const { minutesId = '' } = useParams<{ minutesId: string }>();
  const [params] = useSearchParams();
  const [record, setRecord] = useState<MinutesRecord | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let canceled = false;
    minutesApi
      .get(minutesId)
      .then((found) => {
        if (!canceled) setRecord(found);
      })
      .catch(() => {
        if (!canceled) setNotFound(true);
      });
    return () => {
      canceled = true;
    };
  }, [minutesId]);

  if (notFound) {
    return <p className="p-8 text-center text-ink-muted">These minutes aren&apos;t available.</p>;
  }
  if (!record) return <LoadingPage />;

  const title = `Minutes of the ${meetingName(record)}`;
  return (
    <PrintShell
      title={title}
      backTo={`/minutes/${record.id}`}
      backLabel="Back to the minutes"
      autoPrint={params.get('print') === '1'}
    >
      <article className="print-document mx-auto max-w-3xl rounded-xl border border-rule bg-surface px-6 py-10 sm:px-12">
        <div className="print-running-header" aria-hidden="true">
          {`${record.organization.name} | ${title}`}
        </div>
        <div className="document-content">
          <ReactMarkdown>{record.body}</ReactMarkdown>
        </div>
      </article>
    </PrintShell>
  );
}
```

- [ ] **Step 6: The routes, in `frontend-unified/src/App.tsx`**

Replace:

```tsx
const MinutesListPage = lazy(() => import('./modules/documents/pages/MinutesListPage'));
```

with:

```tsx
const MinutesListPage = lazy(() => import('./modules/documents/pages/MinutesListPage'));
const MinutesPage = lazy(() => import('./modules/documents/pages/MinutesPage'));
const MinutesPrintPage = lazy(() => import('./modules/documents/pages/MinutesPrintPage'));
```

replace:

```tsx
<Route path="minutes" element={<MinutesListPage />} />
```

with:

```tsx
                  <Route path="minutes" element={<MinutesListPage />} />
                  <Route path="minutes/:minutesId" element={<MinutesPage />} />
```

and insert before `                {/* Everything else needs a signed-in user */}`:

```tsx
{
  /* A meeting's minutes to print: signed in, without the app's chrome */
}
<Route
  path="/minutes/:minutesId/print"
  element={
    <RequireSession>
      <MinutesPrintPage />
    </RequireSession>
  }
/>;
```

- [ ] **Step 7: Run the tests, the type-check, a build and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/utils src/modules/documents && npx tsc --noEmit -p . && npm run build && cd .. && npm run lint`
Expected: all pass (`download.test.ts` 2, `MinutesPage.test.tsx` 7); type-check clean; the build succeeds; lint clean apart from its usual warnings.

If the autosave test fails on "Saved by Pat Lindqvist", add one more `await act(async () => {});` after the last `advanceTimersByTimeAsync`. Don't reach for `findBy` or `waitFor` there: under fake timers they wait on timers that never run.

- [ ] **Step 8: Commit**

```bash
npx prettier --write frontend-unified/src/utils frontend-unified/src/modules/documents frontend-unified/src/App.tsx
git add frontend-unified/src/utils/download.ts frontend-unified/src/utils/__tests__/download.test.ts frontend-unified/src/modules/documents/pages/MinutesPage.tsx frontend-unified/src/modules/documents/pages/MinutesPrintPage.tsx frontend-unified/src/modules/documents/pages/__tests__/MinutesPage.test.tsx frontend-unified/src/App.tsx
git commit -m "feat(web): the minutes editor, and printing the minutes

A secretary edits a meeting's minutes as Markdown beside a live preview,
saved two seconds after typing stops, with who saved last. A draft can be
written again from the meeting (after a confirmation) and published, which
makes it readable by every member and puts it before the next meeting.
Published and approved minutes print or save as PDF and download as
Markdown; approved ones say where they were approved and with what
corrections, and don't change."
```

---

### Task 8: Approving the minutes in the meeting

**Files:**

- Create: `frontend-unified/src/modules/meetings/utils/minutesApproval.ts`, `frontend-unified/src/modules/meetings/components/console/MinutesApprovalCard.tsx`, `frontend-unified/src/modules/meetings/components/phone/MinutesNotice.tsx`
- Modify: `frontend-unified/src/modules/meetings/views/ChairConsole.tsx`, `frontend-unified/src/modules/meetings/views/PhoneView.tsx`, `frontend-unified/src/modules/meetings/views/DisplayView.tsx`, `frontend-unified/src/modules/meetings/components/console/MoreArea.tsx`, `frontend-unified/src/modules/meetings/components/chair/index.ts`
- Delete: `frontend-unified/src/modules/meetings/components/chair/MinutesApprovalPanel.tsx`
- Test: `frontend-unified/src/modules/meetings/utils/__tests__/minutesApproval.test.ts`, `frontend-unified/src/modules/meetings/components/console/__tests__/MinutesApprovalCard.test.tsx`, `frontend-unified/src/modules/meetings/components/phone/__tests__/MinutesNotice.test.tsx` (all new), `frontend-unified/src/modules/meetings/views/__tests__/DisplayView.test.tsx`, `frontend-unified/src/modules/meetings/components/console/__tests__/MoreArea.test.tsx`

The server puts the organization's latest published minutes before a meeting (`minutesFromPreviousMeeting`). The approval is the business when the meeting is at its minutes-approval stage or the agenda item called is about minutes (the demo's "Approval of the minutes of the 2025 annual meeting"; any title with the word "minutes"), and nothing is pending. Then:

- **The chair console** shows, in its Now column under the question card, the minutes' title and text, the chair's line ("Are there any corrections to the minutes?"), and two actions: **Approve as read** (`APPROVE_MINUTES`) and **Approve with corrections**, which opens a box for the corrections the room agrees (`APPROVE_MINUTES { corrections }`, at most 2,000 characters). Once approved it says so, with the corrections. It replaces `MinutesApprovalPanel`, which only appeared at the stage and was buried in "More".
- **The phone view** shows the minutes' title and "Any corrections?" above the action block, and once approved, how.
- **The display** shows the same at display size in place of the question card.

The minutes' title is their first heading that names them ("Minutes of the 2025 Annual Meeting").

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/modules/meetings/utils/__tests__/minutesApproval.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { minutesHeading, minutesItemUnderWay } from '../minutesApproval';

const item = (title: string) => ({ id: 2, title, status: 'active' as const });
const inSession: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
};
const motion = { ...MOTIONS.mainMotion, id: 1, type: 'mainMotion', status: 'active' } as Motion;

describe('minutesItemUnderWay', () => {
  it('is the minutes stage, or an agenda item about the minutes, with nothing pending', () => {
    expect(minutesItemUnderWay({ ...inSession, meetingStage: 'minutes-approval' })).toBe(true);
    expect(
      minutesItemUnderWay({
        ...inSession,
        currentAgendaItem: item('Approval of the minutes of the 2025 annual meeting'),
      }),
    ).toBe(true);
    expect(
      minutesItemUnderWay({ ...inSession, currentAgendaItem: item("Treasurer's report") }),
    ).toBe(false);
  });

  it('gives way to a motion, and is never before the call to order', () => {
    const minutesItem = { ...inSession, currentAgendaItem: item('Minutes') };
    expect(minutesItemUnderWay({ ...minutesItem, currentMotion: motion })).toBe(false);
    expect(minutesItemUnderWay({ ...minutesItem, pendingSecond: motion })).toBe(false);
    expect(minutesItemUnderWay({ ...minutesItem, meetingActive: false })).toBe(false);
  });
});

describe('minutesHeading', () => {
  it('takes the first heading that names the minutes', () => {
    expect(
      minutesHeading('# Maple Grove HOA\n\n## Minutes of the 2025 Annual Meeting\n\nText.'),
    ).toBe('Minutes of the 2025 Annual Meeting');
  });

  it('says what they are without one', () => {
    expect(minutesHeading('The board met.')).toBe('The minutes of the previous meeting');
    expect(minutesHeading('')).toBe('The minutes of the previous meeting');
  });
});
```

Create `frontend-unified/src/modules/meetings/components/console/__tests__/MinutesApprovalCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { MinutesApprovalCard } from '../MinutesApprovalCard';

const MINUTES =
  '# Maple Grove HOA\n\n## Minutes of the 2025 Annual Meeting\n\nWithout a quorum, no business was taken up.';
const atTheMinutes: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
  currentAgendaItem: {
    id: 2,
    title: 'Approval of the minutes of the 2025 annual meeting',
    status: 'active',
  },
  minutesFromPreviousMeeting: MINUTES,
  previousMinutesId: 'm1',
};

const dispatch = vi.fn();

describe('MinutesApprovalCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the minutes and approves them as read', () => {
    render(<MinutesApprovalCard state={atTheMinutes} dispatch={dispatch} />);
    expect(screen.getByText('Approval of the minutes')).toBeTruthy();
    expect(screen.getAllByText('Minutes of the 2025 Annual Meeting').length).toBeGreaterThan(0);
    expect(screen.getByText('Without a quorum, no business was taken up.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Approve as read' }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPROVE_MINUTES',
      timestamp: expect.any(String),
    });
  });

  it('approves them with the corrections the room agrees', () => {
    render(<MinutesApprovalCard state={atTheMinutes} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve with corrections' }));
    const approve = screen.getByRole('button', { name: 'Approve with these corrections' });
    expect(approve).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Corrections'), {
      target: { value: ' Twenty-two members were present, not 21 ' },
    });
    fireEvent.click(approve);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPROVE_MINUTES',
      corrections: 'Twenty-two members were present, not 21',
      timestamp: expect.any(String),
    });
  });

  it('says once they are approved, and how', () => {
    render(
      <MinutesApprovalCard
        state={{
          ...atTheMinutes,
          minutesApproved: true,
          minutesApproval: { corrections: 'Twenty-two were present', timestamp: '' },
        }}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByText('Minutes approved')).toBeTruthy();
    expect(screen.getByText('With corrections: Twenty-two were present')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve as read' })).toBeNull();
  });

  it('lets minutes read from paper be approved when none were published', () => {
    render(
      <MinutesApprovalCard
        state={{ ...atTheMinutes, minutesFromPreviousMeeting: '', previousMinutesId: null }}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByText('No published minutes are before this meeting')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve as read' })).toBeTruthy();
  });

  it('stays out of the way at any other time', () => {
    const { container } = render(
      <MinutesApprovalCard
        state={{ ...atTheMinutes, currentAgendaItem: null }}
        dispatch={dispatch}
      />,
    );
    expect(container.textContent).toBe('');
  });
});
```

Create `frontend-unified/src/modules/meetings/components/phone/__tests__/MinutesNotice.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { MinutesNotice } from '../MinutesNotice';

const atTheMinutes: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'minutes-approval',
  minutesFromPreviousMeeting: '## Minutes of the 2025 Annual Meeting\n\nText.',
};

describe('MinutesNotice', () => {
  it("names the minutes and asks the chair's question", () => {
    render(<MinutesNotice state={atTheMinutes} />);
    expect(screen.getByText('Minutes of the 2025 Annual Meeting')).toBeTruthy();
    expect(screen.getByText('Any corrections?')).toBeTruthy();
  });

  it('says once they are approved', () => {
    render(
      <MinutesNotice
        state={{
          ...atTheMinutes,
          minutesApproved: true,
          minutesApproval: { corrections: null, timestamp: '' },
        }}
      />,
    );
    expect(screen.getByText('Approved as read')).toBeTruthy();
  });

  it('shows nothing at any other time', () => {
    const { container } = render(
      <MinutesNotice state={{ ...atTheMinutes, meetingStage: 'new-business' }} />,
    );
    expect(container.textContent).toBe('');
  });
});
```

In `frontend-unified/src/modules/meetings/views/__tests__/DisplayView.test.tsx`, append inside `describe('DisplayView', () => {`, before its closing `});`:

```tsx
it('puts the minutes before the room and asks for corrections', () => {
  socket.state = {
    ...inSession,
    currentAgendaItem: {
      id: 2,
      title: 'Approval of the minutes of the 2025 annual meeting',
      status: 'active',
    },
    minutesFromPreviousMeeting: '# Maple Grove HOA\n\n## Minutes of the 2025 Annual Meeting',
  };
  render(<DisplayView />);
  expect(screen.getByText('Minutes of the 2025 Annual Meeting')).toBeTruthy();
  expect(screen.getByText('Any corrections?')).toBeTruthy();
});
```

In `frontend-unified/src/modules/meetings/components/console/__tests__/MoreArea.test.tsx`, delete the line:

```tsx
  MinutesApprovalPanel: () => null,
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings/utils/__tests__/minutesApproval.test.ts src/modules/meetings/components/console/__tests__/MinutesApprovalCard.test.tsx src/modules/meetings/components/phone/__tests__/MinutesNotice.test.tsx src/modules/meetings/views/__tests__/DisplayView.test.tsx`
Expected: FAIL: the three new modules don't exist, and the display shows the floor as open.

- [ ] **Step 3: Create `frontend-unified/src/modules/meetings/utils/minutesApproval.ts`**

```ts
import type { MeetingState } from '@robbie-bylawyer/shared/types';

/** An agenda item for the minutes: "Approval of the minutes of the 2025 annual meeting" */
const MINUTES_ITEM = /\bminutes\b/i;

/**
 * Whether the approval of the previous minutes is the business now: the meeting is at its
 * minutes-approval stage or has called an agenda item about the minutes, and no question is
 * pending (a motion made during the item comes first)
 */
export function minutesItemUnderWay(state: MeetingState): boolean {
  const atMinutes =
    state.meetingStage === 'minutes-approval' ||
    MINUTES_ITEM.test(state.currentAgendaItem?.title ?? '');
  return (
    state.meetingActive &&
    atMinutes &&
    !state.currentMotion &&
    !state.pendingSecond &&
    !state.votingOpen
  );
}

/** The minutes' title: their first heading that names them, or a plain description */
export function minutesHeading(markdown: string): string {
  for (const line of markdown.split('\n')) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim())?.[1]?.trim();
    if (heading && /minutes/i.test(heading)) return heading;
  }
  return 'The minutes of the previous meeting';
}
```

- [ ] **Step 4: Create the console card and the phone notice**

Create `frontend-unified/src/modules/meetings/components/console/MinutesApprovalCard.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { CheckCircle } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { minutesHeading, minutesItemUnderWay } from '../../utils/minutesApproval';

/** The longest corrections the server takes (MAX_CORRECTIONS_LENGTH) */
const MAX_CORRECTIONS = 2000;

/**
 * The approval of the previous minutes while it is the business: the minutes the secretary
 * published, the chair's question, Approve as read and Approve with corrections
 */
export function MinutesApprovalCard({
  state,
  dispatch,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [corrections, setCorrections] = useState('');
  const correctionsId = useId();
  if (!minutesItemUnderWay(state)) return null;

  if (state.minutesApproved) {
    const made = state.minutesApproval?.corrections;
    return (
      <section aria-label="Approval of the minutes" className="card p-5">
        <p className="flex items-center gap-2 font-semibold text-carried">
          <CheckCircle className="h-5 w-5" aria-hidden="true" />
          Minutes approved
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {made ? `With corrections: ${made}` : 'As read.'}
        </p>
      </section>
    );
  }

  const minutes = state.minutesFromPreviousMeeting;
  const approve = (made?: string) =>
    dispatch({
      type: 'APPROVE_MINUTES',
      ...(made ? { corrections: made } : {}),
      timestamp: generateTimestamp(),
    });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (corrections.trim()) approve(corrections.trim());
  };

  return (
    <section aria-label="Approval of the minutes" className="card space-y-4 p-5">
      <div>
        <p className="label-caps">Approval of the minutes</p>
        <p className="mt-1 font-serif-soft text-title font-semibold text-ink">
          {minutes ? minutesHeading(minutes) : 'No published minutes are before this meeting'}
        </p>
      </div>
      {minutes ? (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-rule bg-surface-2 p-4">
          <div className="document-content text-sm">
            <ReactMarkdown>{minutes}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          The secretary publishes minutes from the Minutes page. Minutes read from paper can be
          approved here too.
        </p>
      )}
      <p className="text-sm text-ink-muted">Say: "Are there any corrections to the minutes?"</p>
      {correcting ? (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor={correctionsId} className="label">
            Corrections
          </label>
          <textarea
            id={correctionsId}
            className="textarea h-24"
            maxLength={MAX_CORRECTIONS}
            value={corrections}
            onChange={(e) => setCorrections(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={!corrections.trim()}>
              Approve with these corrections
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCorrecting(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => approve()}>
            Approve as read
          </button>
          <button type="button" className="btn-secondary" onClick={() => setCorrecting(true)}>
            Approve with corrections
          </button>
        </div>
      )}
    </section>
  );
}
```

Create `frontend-unified/src/modules/meetings/components/phone/MinutesNotice.tsx`:

```tsx
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import { minutesHeading, minutesItemUnderWay } from '../../utils/minutesApproval';

/** On a phone, while the previous minutes are the business: which minutes, and the question */
export function MinutesNotice({ state }: { state: MeetingState }) {
  if (!minutesItemUnderWay(state)) return null;
  const made = state.minutesApproval?.corrections;
  return (
    <section aria-label="Approval of the minutes" className="card space-y-1 p-4">
      <p className="label-caps">Approval of the minutes</p>
      <p className="font-serif-soft text-lg font-semibold text-ink">
        {minutesHeading(state.minutesFromPreviousMeeting)}
      </p>
      {state.minutesApproved ? (
        <p className="text-sm text-carried">
          {made ? `Approved with corrections: ${made}` : 'Approved as read'}
        </p>
      ) : (
        <p className="text-ink">Any corrections?</p>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Put them on the three screens, and retire the old panel**

In `frontend-unified/src/modules/meetings/views/ChairConsole.tsx`, replace:

```tsx
import { JoinInfoCard } from '../components/console/JoinInfoCard';
```

with:

```tsx
import { JoinInfoCard } from '../components/console/JoinInfoCard';
import { MinutesApprovalCard } from '../components/console/MinutesApprovalCard';
```

and replace the first line after the console's question card:

```tsx
          </QuestionCard>
```

with:

```tsx
          </QuestionCard>
          <MinutesApprovalCard state={state} dispatch={dispatch} />
```

In `frontend-unified/src/modules/meetings/views/PhoneView.tsx`, replace:

```tsx
import { AskTheChair } from '../components/phone/AskTheChair';
```

with:

```tsx
import { AskTheChair } from '../components/phone/AskTheChair';
import { MinutesNotice } from '../components/phone/MinutesNotice';
```

and replace:

```tsx
      <section aria-label="Your part" className="card p-4">
```

with:

```tsx
      <MinutesNotice state={state} />
      <section aria-label="Your part" className="card p-4">
```

In `frontend-unified/src/modules/meetings/views/DisplayView.tsx`, replace:

```tsx
import { STANCE_LABELS } from '../utils/phoneMoment';
```

with:

```tsx
import { STANCE_LABELS } from '../utils/phoneMoment';
import { minutesHeading, minutesItemUnderWay } from '../utils/minutesApproval';
```

in `InSession`, replace:

```tsx
const result = currentResult(state, voteResult);
```

with:

```tsx
const result = currentResult(state, voteResult);
// The previous minutes, while the room is asked to approve them
const minutes = minutesItemUnderWay(state);
```

and replace:

```tsx
          {result ? (
            <Stamp
              key={result.key}
              outcome={result.outcome}
              subject={result.subject}
              tally={result.tally}
              size="display"
            />
          ) : (
```

with:

```tsx
          {minutes ? (
            <MinutesOnDisplay state={state} />
          ) : result ? (
            <Stamp
              key={result.key}
              outcome={result.outcome}
              subject={result.subject}
              tally={result.tally}
              size="display"
            />
          ) : (
```

and add, before the `function SpeakerRail(` line:

```tsx
/** The minutes put before the room: their title, and the chair's question or the approval */
function MinutesOnDisplay({ state }: { state: MeetingState }) {
  const made = state.minutesApproval?.corrections;
  return (
    <div className="space-y-6">
      <p className={LABEL}>Approval of the minutes</p>
      <p className="font-serif-soft text-display-question font-semibold text-ink">
        {minutesHeading(state.minutesFromPreviousMeeting)}
      </p>
      <p className="text-display-line text-ink-muted">
        {state.minutesApproved
          ? made
            ? `Approved with corrections: ${made}`
            : 'Approved as read'
          : 'Any corrections?'}
      </p>
    </div>
  );
}
```

In `frontend-unified/src/modules/meetings/components/console/MoreArea.tsx`, delete the line `  MinutesApprovalPanel,` from the import of `'../chair'`, and the line:

```tsx
<MinutesApprovalPanel state={state} dispatch={dispatch} />
```

In `frontend-unified/src/modules/meetings/components/chair/index.ts`, delete the line:

```ts
export { MinutesApprovalPanel } from './MinutesApprovalPanel';
```

and delete the panel: `git rm frontend-unified/src/modules/meetings/components/chair/MinutesApprovalPanel.tsx`.

- [ ] **Step 6: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/modules/meetings && npx tsc --noEmit -p . && cd .. && npm run lint`
Expected: all pass (`minutesApproval.test.ts` 4, `MinutesApprovalCard.test.tsx` 5, `MinutesNotice.test.tsx` 3, and the display's new case; the console, phone and More tests as before); type-check clean; lint clean apart from its usual warnings. `grep -rn MinutesApprovalPanel frontend-unified/src` prints nothing.

- [ ] **Step 7: Commit**

```bash
npx prettier --write frontend-unified/src/modules/meetings
git add frontend-unified/src/modules/meetings/utils/minutesApproval.ts frontend-unified/src/modules/meetings/utils/__tests__/minutesApproval.test.ts frontend-unified/src/modules/meetings/components/console/MinutesApprovalCard.tsx frontend-unified/src/modules/meetings/components/console/__tests__/MinutesApprovalCard.test.tsx frontend-unified/src/modules/meetings/components/phone/MinutesNotice.tsx frontend-unified/src/modules/meetings/components/phone/__tests__/MinutesNotice.test.tsx frontend-unified/src/modules/meetings/views/ChairConsole.tsx frontend-unified/src/modules/meetings/views/PhoneView.tsx frontend-unified/src/modules/meetings/views/DisplayView.tsx frontend-unified/src/modules/meetings/views/__tests__/DisplayView.test.tsx frontend-unified/src/modules/meetings/components/console/MoreArea.tsx frontend-unified/src/modules/meetings/components/console/__tests__/MoreArea.test.tsx frontend-unified/src/modules/meetings/components/chair/index.ts
git commit -m "feat(web): approve the previous minutes in the meeting

While the minutes are the business (their stage, or an agenda item about
them), the chair console shows the minutes the secretary published with
Approve as read and Approve with corrections, and the phones and the
display show their title and Any corrections?, then how they were
approved. The old approval panel, buried in More, goes."
```

---

### Task 9: The time zone, and the meeting's place

**Files:**

- Create: `frontend-unified/src/utils/timeZones.ts`, `frontend-unified/src/modules/documents/components/TimeZoneCard.tsx`
- Modify: `frontend-unified/src/components/organizations/NewOrganizationModal.tsx`, `frontend-unified/src/modules/documents/pages/SettingsPage.tsx`, `frontend-unified/src/modules/meetings/components/scheduling/types.ts`, `frontend-unified/src/modules/meetings/components/scheduling/api.ts`, `frontend-unified/src/modules/meetings/components/scheduling/MeetingScheduler.tsx`
- Test: `frontend-unified/src/utils/__tests__/timeZones.test.ts`, `frontend-unified/src/modules/documents/components/__tests__/TimeZoneCard.test.tsx` (new), `frontend-unified/src/components/organizations/__tests__/NewOrganizationModal.test.tsx`, `frontend-unified/src/modules/documents/pages/__tests__/SettingsPage.test.tsx`, `frontend-unified/src/modules/meetings/components/scheduling/__tests__/MeetingScheduler.test.tsx`

The minutes give times in the organization's time zone. A new organization takes its creator's browser zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`); admins change it in Settings, in a Time zone card beside Attendance, from the zones the browser knows. The scheduler gets a Place field (`location`), which the minutes print under their title; the description is now for anything else members should know.

- [ ] **Step 1: Write the failing tests**

Create `frontend-unified/src/utils/__tests__/timeZones.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { browserTimeZone, timeZoneNames } from '../timeZones';

describe('time zones', () => {
  it("reads the browser's time zone", () => {
    // vitest.config.ts runs the suite in Chicago
    expect(browserTimeZone()).toBe('America/Chicago');
  });

  it('lists the zones the browser knows, always with the one in use', () => {
    const names = timeZoneNames('America/Chicago');
    expect(names).toContain('Europe/Paris');
    expect(names.filter((name) => name === 'America/Chicago')).toHaveLength(1);
    expect(timeZoneNames('Etc/Unknown')[0]).toBe('Etc/Unknown');
  });
});
```

Create `frontend-unified/src/modules/documents/components/__tests__/TimeZoneCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ update: vi.fn(async () => ({})) }));
vi.mock('../../../../api/client', () => ({ organizations: { update: api.update } }));
const org = vi.hoisted(() => ({
  currentOrganization: { id: 'org-1', name: 'Maple Grove HOA', timeZone: 'America/Chicago' },
  isAdmin: true,
  refreshOrganizations: vi.fn(async () => {}),
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => org,
  useCan: () => org.isAdmin,
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { TimeZoneCard } = await import('../TimeZoneCard');

describe('TimeZoneCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.isAdmin = true;
  });

  it("lets an admin change the organization's time zone", async () => {
    render(<TimeZoneCard />);
    const select = screen.getByLabelText('Meetings are held in') as HTMLSelectElement;
    expect(select.value).toBe('America/Chicago');
    fireEvent.change(select, { target: { value: 'Europe/Paris' } });
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('org-1', { timeZone: 'Europe/Paris' }),
    );
    await waitFor(() => expect(org.refreshOrganizations).toHaveBeenCalled());
    expect(toast.showToast).toHaveBeenCalledWith('success', 'Time zone saved');
  });

  it('shows anyone else the time zone', () => {
    org.isAdmin = false;
    render(<TimeZoneCard />);
    expect(screen.queryByLabelText('Meetings are held in')).toBeNull();
    expect(screen.getByText('America/Chicago')).toBeTruthy();
  });
});
```

In `frontend-unified/src/components/organizations/__tests__/NewOrganizationModal.test.tsx`, replace:

```tsx
expect(create).toHaveBeenCalledWith({ name: 'Maple Grove HOA', description: '142 lots' });
```

with:

```tsx
// With the creator's time zone (the suite runs in Chicago), for the minutes' times
expect(create).toHaveBeenCalledWith({
  name: 'Maple Grove HOA',
  description: '142 lots',
  timeZone: 'America/Chicago',
});
```

In `frontend-unified/src/modules/documents/pages/__tests__/SettingsPage.test.tsx`, replace:

```tsx
vi.mock('../../components/AttendanceSettingsCard', () => ({
  AttendanceSettingsCard: () => <p>Attendance settings</p>,
}));
```

with:

```tsx
vi.mock('../../components/AttendanceSettingsCard', () => ({
  AttendanceSettingsCard: () => <p>Attendance settings</p>,
}));
vi.mock('../../components/TimeZoneCard', () => ({ TimeZoneCard: () => <p>Time zone</p> }));
```

In `frontend-unified/src/modules/meetings/components/scheduling/__tests__/MeetingScheduler.test.tsx`, insert before `  it('offers members and above to preside, and names who does', async () => {`:

```tsx
it('records where the meeting is held', async () => {
  await schedule();
  fireEvent.change(screen.getByLabelText('Place'), {
    target: { value: 'Maple Grove Clubhouse' },
  });
  next();
  await screen.findByText('Agenda builder');
  expect(api.createPacket).toHaveBeenCalledWith(
    'org-1',
    expect.objectContaining({ location: 'Maple Grove Clubhouse' }),
  );
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/utils/__tests__/timeZones.test.ts src/modules/documents/components/__tests__/TimeZoneCard.test.tsx src/components/organizations src/modules/meetings/components/scheduling`
Expected: FAIL: `timeZones` and `TimeZoneCard` don't exist, the organization is created without a time zone, and the scheduler has no Place.

- [ ] **Step 3: Create `frontend-unified/src/utils/timeZones.ts`**

```ts
/** The browser's time zone (an IANA name), or undefined if it can't say */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** The time zones this browser knows, for a picker; the one in use is always among them */
export function timeZoneNames(current: string): string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return known.includes(current) ? known : [current, ...known];
}
```

- [ ] **Step 4: Send it when an organization is created, in `NewOrganizationModal.tsx`**

In `frontend-unified/src/components/organizations/NewOrganizationModal.tsx`, replace:

```tsx
import { showsOneOrganizationsRecord } from '../../utils/organizationPages';
```

with:

```tsx
import { showsOneOrganizationsRecord } from '../../utils/organizationPages';
import { browserTimeZone } from '../../utils/timeZones';
```

and replace:

```tsx
// No slug: the server makes one from the name
const created = await organizations.create({
  name: name.trim(),
  description: description.trim() || undefined,
});
```

with:

```tsx
// No slug: the server makes one from the name. The creator's time zone is the
// organization's until an admin changes it (the minutes give times in it).
const created = await organizations.create({
  name: name.trim(),
  description: description.trim() || undefined,
  timeZone: browserTimeZone(),
});
```

- [ ] **Step 5: Create `frontend-unified/src/modules/documents/components/TimeZoneCard.tsx`, and put it in Settings**

```tsx
import { useId, useState } from 'react';
import { Globe } from 'lucide-react';
import { organizations as organizationsApi } from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { timeZoneNames } from '../../../utils/timeZones';

/** A time zone's name as people read it: America/New_York is America/New York */
const readable = (zone: string) => zone.replace(/_/g, ' ');

/** Where the organization's meetings are held, which the minutes give their times in */
export function TimeZoneCard() {
  const { currentOrganization, refreshOrganizations } = useOrganization();
  const isAdmin = useCan('admin');
  const { showToast } = useToast();
  const selectId = useId();
  const [saving, setSaving] = useState(false);
  if (!currentOrganization) return null;

  const current = currentOrganization.timeZone ?? 'America/Chicago';
  const change = async (timeZone: string) => {
    setSaving(true);
    try {
      await organizationsApi.update(currentOrganization.id, { timeZone });
      await refreshOrganizations();
      showToast('success', 'Time zone saved');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Couldn't save the time zone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="border-b border-rule px-6 py-4">
        <h3 className="card-title flex items-center gap-2">
          <Globe className="h-5 w-5" aria-hidden="true" />
          Time zone
        </h3>
      </div>
      <div className="space-y-2 p-6">
        {isAdmin ? (
          <>
            <label htmlFor={selectId} className="label">
              Meetings are held in
            </label>
            <select
              id={selectId}
              className="select"
              value={current}
              disabled={saving}
              onChange={(e) => void change(e.target.value)}
            >
              {timeZoneNames(current).map((zone) => (
                <option key={zone} value={zone}>
                  {readable(zone)}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="font-medium text-ink">{readable(current)}</p>
        )}
        <p className="text-xs text-ink-muted">
          The minutes give the times of meetings in this time zone.
        </p>
      </div>
    </div>
  );
}
```

In `frontend-unified/src/modules/documents/pages/SettingsPage.tsx`, replace:

```tsx
import { AttendanceSettingsCard } from '../components/AttendanceSettingsCard';
```

with:

```tsx
import { AttendanceSettingsCard } from '../components/AttendanceSettingsCard';
import { TimeZoneCard } from '../components/TimeZoneCard';
```

and replace:

```tsx
<AttendanceSettingsCard key={`attendance-${currentOrganization.id}`} />
```

with:

```tsx
<AttendanceSettingsCard key={`attendance-${currentOrganization.id}`} />;

{
  /* The time zone the minutes give times in, beside the attendance settings */
}
<TimeZoneCard key={`time-zone-${currentOrganization.id}`} />;
```

- [ ] **Step 6: The place on the schedule**

In `frontend-unified/src/modules/meetings/components/scheduling/types.ts`, in `interface MeetingPacket`, replace:

```ts
  title?: string;
  description?: string;
  scheduledFor?: string;
```

with:

```ts
  title?: string;
  description?: string;
  /** Where the meeting is held */
  location?: string | null;
  scheduledFor?: string;
```

In `frontend-unified/src/modules/meetings/components/scheduling/api.ts`, in `createPacket`'s `data` type, replace:

```ts
    robbieCode: string;
    title?: string;
    description?: string;
    scheduledFor?: string;
```

with:

```ts
    robbieCode: string;
    title?: string;
    description?: string;
    location?: string;
    scheduledFor?: string;
```

and in `updatePacket`'s, replace:

```ts
  data: {
    title?: string;
    description?: string;
    scheduledFor?: string;
    chairUserId?: number | null;
  },
```

with:

```ts
  data: {
    title?: string;
    description?: string;
    location?: string;
    scheduledFor?: string;
    chairUserId?: number | null;
  },
```

In `frontend-unified/src/modules/meetings/components/scheduling/MeetingScheduler.tsx`, replace:

```tsx
const [description, setDescription] = useState('');
```

with:

```tsx
const [description, setDescription] = useState('');
const [location, setLocation] = useState('');
```

replace:

```tsx
    description: description || undefined,
    scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
```

with:

```tsx
    description: description || undefined,
    location: location.trim() || undefined,
    scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
```

and replace:

```tsx
              <div>
                <label htmlFor="meetingDescription" className="label">
```

with:

```tsx
              <div>
                <label htmlFor="meetingLocation" className="label">
                  Place
                </label>
                <input
                  id="meetingLocation"
                  type="text"
                  className="input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Maple Grove Clubhouse"
                />
              </div>

              <div>
                <label htmlFor="meetingDescription" className="label">
```

and change that description field's placeholder from `"Where it is, and anything members should know"` to `"Anything members should know"`.

- [ ] **Step 7: Run the tests, the type-check and lint**

Run: `cd frontend-unified && TZ=America/Chicago npx vitest run src/utils src/components src/modules/documents src/modules/meetings/components/scheduling && npx tsc --noEmit -p . && cd .. && npm run lint`
Expected: all pass (`timeZones.test.ts` 2, `TimeZoneCard.test.tsx` 2, the scheduler's new case, and the changed assertions); type-check clean; lint clean apart from its usual warnings.

- [ ] **Step 8: Commit**

```bash
npx prettier --write frontend-unified/src/utils frontend-unified/src/components frontend-unified/src/modules/documents frontend-unified/src/modules/meetings/components/scheduling
git add frontend-unified/src/utils/timeZones.ts frontend-unified/src/utils/__tests__/timeZones.test.ts frontend-unified/src/modules/documents/components/TimeZoneCard.tsx frontend-unified/src/modules/documents/components/__tests__/TimeZoneCard.test.tsx frontend-unified/src/components/organizations/NewOrganizationModal.tsx frontend-unified/src/components/organizations/__tests__/NewOrganizationModal.test.tsx frontend-unified/src/modules/documents/pages/SettingsPage.tsx frontend-unified/src/modules/documents/pages/__tests__/SettingsPage.test.tsx frontend-unified/src/modules/meetings/components/scheduling/types.ts frontend-unified/src/modules/meetings/components/scheduling/api.ts frontend-unified/src/modules/meetings/components/scheduling/MeetingScheduler.tsx frontend-unified/src/modules/meetings/components/scheduling/__tests__/MeetingScheduler.test.tsx
git commit -m "feat(web): the organization's time zone, and the meeting's place

A new organization takes its creator's time zone, and admins change it in
Settings beside the attendance settings: the minutes give their times in
it. The scheduler asks where the meeting is held, which the minutes print
under their title."
```

---

### Task 10: The Playwright scenarios: the minutes after the meeting, and importing the bylaws

**Files:**

- Create: `e2e/fixtures/maple-grove-bylaws.txt`, `e2e/tests/import.spec.ts`
- Modify: `e2e/tests/meeting.spec.ts`

Two scenarios on the harness (its backend on port 3101 with test sign-in, the web build on 4173, the Maple Grove demo reseeded before every run):

- **The meeting scenario** goes on after the adjournment it already ends with: Pat, the secretary, opens Minutes, finds the draft of the "Special meeting on the pool" (written by the server as the meeting adjourned), sees the pool motion with both parts of its vote and the lifeguard motion adopted by unanimous consent from the floor, and publishes it.
- **An import scenario**: Pat creates a document, pastes the Maple Grove bylaws (a fixture written from the demo seed's sections: six articles with their titles in capitals on the next line, and 23 sections), sees "6 articles, 23 sections", corrects one title, saves, and finds the sections on the document page.

- [ ] **Step 1: Create `e2e/fixtures/maple-grove-bylaws.txt`**

```text
ARTICLE I
NAME AND PURPOSE

Section 1.1 Name. The name of this corporation is Maple Grove Homeowners Association, Inc., referred to in these Bylaws as the "Association".

Section 1.2 Purpose. The Association maintains the common areas of the Maple Grove subdivision, enforces the Declaration of Covenants, Conditions and Restrictions, and promotes the welfare of its residents.

Section 1.3 Principal Office. The principal office of the Association is the Maple Grove Clubhouse, 400 Maple Grove Drive, or another place the Board designates.

ARTICLE II
MEMBERSHIP AND VOTING RIGHTS

Section 2.1 Membership. Every owner of a lot in Maple Grove is a member of the Association. Membership belongs to the lot and cannot be separated from it.

Section 2.2 Voting Rights. Each lot has one vote. When a lot has more than one owner, the owners decide among themselves how its vote is cast; the vote cannot be split.

Section 2.3 Good Standing. A member whose assessments are more than sixty days past due may not vote until the account is brought current.

Section 2.4 Proxies. A member may vote by written proxy, dated and signed, and filed with the Secretary before the meeting. A proxy expires eleven months after its date.

ARTICLE III
BOARD OF DIRECTORS

Section 3.1 Number. The affairs of the Association are managed by a Board of five directors, each of whom must be a member in good standing.

Section 3.2 Election and Term. Directors are elected at the annual meeting for staggered two-year terms. Two directors are elected in even-numbered years and three in odd-numbered years.

Section 3.3 Vacancies. A vacancy on the Board is filled by a majority of the remaining directors. The person chosen serves the rest of the term.

Section 3.4 Officers. Each year the Board elects a President, a Secretary and a Treasurer from among its directors.

ARTICLE IV
MEETINGS OF MEMBERS

Section 4.1 Annual Meeting. The annual meeting of the members is held each year at a date, time and place set by the Board.

Section 4.2 Quorum. The presence, in person or by proxy, of members holding twenty percent (20%) of the votes of the Association constitutes a quorum at any meeting of the members.

Section 4.3 Notice. Written notice of each meeting of the members, stating its place, date and hour, is mailed or emailed to every member at least ten and no more than sixty days before the meeting.

Section 4.4 Special Meetings. The President, a majority of the Board, or members holding ten percent of the votes may call a special meeting of the members.

Section 4.5 Rules of Order. Robert's Rules of Order Newly Revised governs meetings of the members in all cases where it is consistent with these Bylaws and the Declaration.

ARTICLE V
ASSESSMENTS

Section 5.1 Annual Assessment. Each lot is subject to an annual assessment set by the Board in the budget it adopts before the start of each fiscal year.

Section 5.2 Due Date. The annual assessment is due on January 31. An assessment not paid within thirty days of its due date incurs a late fee of twenty-five dollars.

Section 5.3 Special Assessments. A special assessment for a capital improvement requires a majority of the votes cast at a meeting of the members at which a quorum is present.

Section 5.4 Reserve Fund. The Association keeps a reserve fund for the repair and replacement of the common areas, funded with at least ten percent of the annual assessments.

ARTICLE VI
AMENDMENTS

Section 6.1 Proposal. An amendment to these Bylaws may be proposed by the Board or by a petition signed by members holding ten percent of the votes.

Section 6.2 Adoption. These Bylaws may be amended at a meeting of the members by two thirds of the votes cast, if the text of the amendment was included in the notice of the meeting.

Section 6.3 Effective Date. An amendment takes effect when it is adopted, unless it states a later date.
```

(The file is the content of the code block above, with a newline at its end. Its text is the demo seed's `BYLAWS` in `backend-node/src/demo/demoSeed.ts`, laid out as a secretary would paste it.)

- [ ] **Step 2: Create `e2e/tests/import.spec.ts`**

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { PEOPLE, signIn } from '../helpers';

/** The Maple Grove bylaws as a secretary would paste them (the demo seed's text) */
const BYLAWS = readFileSync(path.join(__dirname, '../fixtures/maple-grove-bylaws.txt'), 'utf8');

test('pasted bylaws become articles and sections, checked and saved as a version', async ({
  page,
}) => {
  await signIn(page, PEOPLE.pat);
  await page.setViewportSize({ width: 1280, height: 900 });

  // A new document, so the demo's own bylaws stay as they are (a retry makes another)
  const title = `Imported bylaws ${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'New Document' }).click();
  await page.getByLabel('Document Title').fill(title);
  await page.getByRole('button', { name: 'Create Document' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Pat pastes the bylaws in: the articles and sections are found from the headings
  await page.getByRole('button', { name: 'Import the bylaws' }).click();
  await page.getByLabel('Bylaws text').fill(BYLAWS);
  await page.getByRole('button', { name: 'Read the bylaws' }).click();
  await expect(page.getByText('6 articles, 23 sections')).toBeVisible();
  await expect(page.getByLabel('Title of Article IV Meetings of Members')).toBeVisible();

  // Pat corrects one title and saves: version 1
  await page.getByLabel('Title of Section 4.2 Quorum').fill('Quorum of the Members');
  await page.getByRole('button', { name: 'Save as a new version' }).click();

  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Quorum of the Members')).toBeVisible();
  await expect(page.getByText('Name and Purpose')).toBeVisible();
});
```

- [ ] **Step 3: The minutes after the meeting, in `e2e/tests/meeting.spec.ts`**

Replace:

```ts
await expect(dana.getByText(/^Adjourned at /)).toBeVisible();
await expect(alice.getByText(/^The meeting was adjourned at /)).toBeVisible();
await expect(pat.getByText(/^Adjourned at /)).toBeVisible();
```

with:

```ts
await expect(dana.getByText(/^Adjourned at /)).toBeVisible();
await expect(alice.getByText(/^The meeting was adjourned at /)).toBeVisible();
await expect(pat.getByText(/^Adjourned at /)).toBeVisible();

// After the meeting, Pat opens the minutes the server drafted as it adjourned: the pool
// motion with both parts of its vote, and Carmen's motion adopted without objection.
// (The latest meeting is listed first, so a retry's draft is the one opened.)
await pat.setViewportSize({ width: 1280, height: 900 });
const draft = pat.getByRole('link', { name: /Special meeting on the pool/ }).first();
await expect(async () => {
  await pat.goto('/minutes');
  await expect(draft).toBeVisible({ timeout: 2_000 });
}).toPass({ timeout: 20_000 });
await expect(draft).toContainText('Draft');
await draft.click();

const minutes = pat.getByRole('region', { name: 'Preview' });
await expect(
  minutes.getByText(
    /Alice Brennan moved: "I move that we resurface the pool this spring\." Seconded by Ben Whitaker\. Carried, on devices 2 to 0 and in the room 9 to 2: 11 to 2\./,
  ),
).toBeVisible();
await expect(
  minutes.getByText(
    /Carmen Diaz moved: "I move that we add a lifeguard on weekends\." Seconded by a member in the room\. Adopted by unanimous consent\./,
  ),
).toBeVisible();

// Pat publishes them: the members can read them, and the next meeting is asked to approve
await pat.getByRole('button', { name: 'Publish' }).click();
await expect(pat.getByText('Published', { exact: true })).toBeVisible();
await expect(pat.getByRole('link', { name: 'Print or save as PDF' })).toBeVisible();
await capture(pat, testInfo, 'minutes');
```

and change the scenario's title from `'a scheduled meeting runs a vote from the phones to the display'` to `'a scheduled meeting runs from the phones to the display, and its minutes are published'`.

- [ ] **Step 4: Run them**

Check that nothing listens on 3101 or 4173: `ss -ltn | grep -E ':(3101|4173) '` prints nothing. Start the throwaway Postgres if `docker ps --filter name=robbie-ci-pg` doesn't list it.

Run: `npx tsc --noEmit -p e2e/tsconfig.json && npm run e2e`
Expected: a clean type-check, then every test passes: the earlier ones, the longer meeting scenario and `import.spec.ts`. The meeting scenario's screenshots now include `minutes.png`; open it and check by eye: the status line and the Publish result, the Markdown on the left, the preview on the right in the document typeface.

If the minutes step times out, the server drafted nothing: check the backend's log (the harness's `webServer` output) for "Failed to draft the minutes". The trace (`npx playwright show-trace e2e/test-results/*meeting*/trace.zip`) shows what Pat's page showed.

- [ ] **Step 5: Commit**

```bash
npx prettier --write e2e
npm run lint
git add e2e/fixtures/maple-grove-bylaws.txt e2e/tests/import.spec.ts e2e/tests/meeting.spec.ts
git commit -m "test(e2e): the minutes after the meeting, and importing the bylaws

After the meeting adjourns, Pat opens the minutes the server drafted, finds
the pool motion with both parts of its vote and the motion adopted by
unanimous consent, and publishes them. A second scenario pastes the Maple
Grove bylaws into a new document, finds 6 articles and 23 sections,
corrects a title and saves the version."
```

---

### Task 11: A live check, the docs and the final check

**Files:** `spec.md`, `CLAUDE.md`, `docs/mvp-roadmap.md`

- [ ] **Step 1: Start the app on the seeded database**

- Check that nothing listens on 3001 or 5173: `ss -ltn | grep -E ':(3001|5173) '` prints nothing.
- Reseed: `cd backend-node && DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie DIRECT_URL=postgresql://postgres:postgres@localhost:55432/robbie npx tsx src/scripts/seedDemo.ts --reset`, and clear the live meetings: `psql postgresql://postgres:postgres@localhost:55432/robbie -c 'DELETE FROM meetings'`.
- Backend: from `backend-node`, run `npx tsx src/index.ts` in the background with `PORT=3001`, `DATABASE_URL` and `DIRECT_URL` set to `postgresql://postgres:postgres@localhost:55432/robbie`, `ENABLE_TEST_AUTH=true`, `NODE_ENV=test` and `RESEND_API_KEY=` (empty); record its PID.
- Web: from `frontend-unified`, run `npx vite --port 5173` in the background; record its PID.

- [ ] **Step 2: Walk through it with the Playwright MCP browser**

1. At 1280 by 800, sign in at `http://localhost:5173/sign-in` as `pat@maplegrove.example` with `000000`. The sidebar has Minutes. Open it: "2025 Annual Meeting", Published. Open it: the heading, "Thu, Mar 20, 7:00 PM, Maple Grove Clubhouse, 400 Maple Grove Drive", the Markdown and its preview, Print or save as PDF and Download Markdown.
2. Print or save as PDF: a new tab at `/minutes/<id>/print?print=1` with the print dialog; cancel it. The page has no sidebar or header; in the dialog's preview the running header "Maple Grove HOA | Minutes of the 2025 Annual Meeting" is at the top of each page.
3. Open the bylaws. Export: "Print or save as PDF" and "Markdown" only. Print: the title, "Version 1, effective March 15, 2024", the articles in Fraunces; in the print preview Article IV starts a page. Back in the app, search "quorum" in the header: Section 4.2 and Section 5.3, each "in Bylaws of Maple Grove Homeowners Association". Choose Section 4.2: the document scrolls to it, selected.
4. Amendments, "Lower the quorum to 15%": Changes and Preview. Preview: Section 4.2 Changed with the new text; Show the old text shows the 20% text.
5. Settings: the Time zone card, America/Chicago, beside Attendance.
6. Live Meetings: join the 2026 Annual Meeting as Pat (an admin runs the meeting when the presiding officer isn't there). Call to order, adopt the agenda, then call "Approval of the minutes of the 2025 annual meeting": the console shows the 2025 minutes, Approve as read and Approve with corrections. Open the display (`/meetings/MAPLE1/display`) in another tab: "Minutes of the 2025 Annual Meeting" and "Any corrections?". Approve with corrections ("Twenty-two members were present, not 21"): the console and the display say so.
7. Minutes again: the 2025 minutes are Approved, "Approved at the 2026 Annual Meeting with corrections: Twenty-two members were present, not 21".
8. Settings, Appearance, Dark: the minutes editor, the import screen (open it from a new document) and the amendment preview in the evening palette; badges and the Changed and Added marks still readable. Back to Light.
9. At 390 by 844: the minutes editor stacks the Markdown above the preview; the import screen's review stacks the found sections above the text.

Note anything that differs from the above or from the brief in the report, with a screenshot. Stop both servers by PID, and remove any `.playwright-mcp/` folder the browser tool created.

- [ ] **Step 3: `spec.md`**

Under `### M8. Minutes`, after the bullet that starts `- **Done 2026-10-07 (server, the secretary's desk):**`, add:

```markdown
- **Done 2026-10-07 (web, the secretary's desk):** a Minutes page lists the organization's minutes; the editor puts the Markdown beside its preview, saves two seconds after typing stops (naming who saved last), writes a draft again from the meeting after a confirmation, publishes, and prints (the browser saves the PDF) and downloads Markdown. Approved minutes say where and with what corrections. In the meeting, while the minutes are the business (their stage, or an agenda item about them), the chair console shows them with Approve as read and Approve with corrections, and the phones and the display show their title and "Any corrections?". `MinutesApprovalPanel` is gone.
```

Under `### M9. Web client completion`, in "API mismatches", replace:

```markdown
- HTML and PDF export call routes that don't exist (only Markdown exists).
```

with:

```markdown
- **Fixed 2026-10-07:** the Export menu offers "Print or save as PDF" (print pages for members, `/documents/:id/print`, and the public, `/share/:token/print`, which the browser saves as a PDF) and Markdown; the HTML and PDF items and their client functions are gone. The header search uses the organization search and opens the document at the section.
```

and in "Other work", replace:

```markdown
- Draft amendment editor: create, move, renumber, delete sections, with a rendered preview of the resulting version. Expose `amendments/:id/preview` (backend exists, no UI; since 2026-10-07 it gives each modified section its text from before, as `previous`).
```

with:

```markdown
- Draft amendment editor: create, move, renumber, delete sections. **Done 2026-10-07:** the Preview tab shows the resulting document (added, removed and changed sections, with the old text on request), and an applied amendment links to the version it produced.
- **Done 2026-10-07:** the bylaws can be imported from pasted text, a `.txt`, `.md` or `.docx` file (`/documents/:id/import`): parsed into articles and sections, checked and corrected, and saved as a version.
```

- [ ] **Step 4: `CLAUDE.md`**

Under "**Routing Structure:**", replace:

```markdown
- `/settings` - App settings
```

with:

```markdown
- `/documents/:id/import` - Import the bylaws from text or a file into a new version (secretary)
- `/minutes`, `/minutes/:id` - The organization's minutes; the editor for secretaries
- `/documents/:id/print`, `/minutes/:id/print` (signed in) and `/share/:token/print` (public) - Print pages outside the app's chrome; `?print=1` opens the print dialog, which saves a PDF
- `/settings` - App settings
```

Under "### Bylawyer (Document Version Control)", add before "**API Endpoints (all on port 3001):**":

```markdown
**Import and minutes (web):** the import screen parses with `parseBylaws` from shared (the same rules for pasted text, `.txt`, `.md` and the server's text of a `.docx`) and saves through `POST /api/documents/:id/versions/import`. Minutes are Markdown (`/minutes/:id`), drafted by the server at adjournment; the approval at the next meeting is `MinutesApprovalCard` in the chair console, while `minutesItemUnderWay(state)` (`modules/meetings/utils/minutesApproval.ts`).
```

- [ ] **Step 5: `docs/mvp-roadmap.md`**

In the phases table, set the State cell of row C (The secretary's desk) to `done` followed by the output of `date +%F`, formatted as row A's cell is (`done 2026-10-06`), and the State cell of row D to `next`. Prettier re-pads the table in the next step.

- [ ] **Step 6: Format, then the full check**

Run: `npx prettier --write spec.md CLAUDE.md docs/mvp-roadmap.md`

Run (from the repository root):

```bash
npm run build:shared && npm run format:check && npm run lint && npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p backend-node/tsconfig.json && npx tsc --noEmit -p frontend-unified/tsconfig.json && npx tsc --noEmit -p mobile/tsconfig.json && npx tsc --noEmit -p e2e/tsconfig.json && npm run test:run -w shared && npm run test:run -w backend-node && npm run test:run -w frontend-unified && npm run test:run -w mobile && INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/robbie npm run test:integration -w backend-node && npm run e2e
```

Expected: all pass. Lint warnings no more than before this plan, and the palette check passes. No commit of this plan touches `mobile/` or `backend-node/`: `git log --name-only --format= $(git log --format=%H --grep='the API client for the secretary' -1)^..HEAD | grep -E '^(mobile|backend-node)/'` prints nothing (the search names this plan's first commit).

- [ ] **Step 7: Commit**

```bash
git add spec.md CLAUDE.md docs/mvp-roadmap.md
git commit -m "docs: record the secretary's desk screens and finish phase C"
```

---

## Self-review notes

- **Coverage (the design's client sections, and the brief):**
  1. Bylaws import, sources and flow (Task 3): paste, `.txt` and `.md` read in the browser, `.docx` through the server (with the 5 MB limit checked first), the review with the parsed tree and its count beside the text, renaming a label or title, merging into the section above, "Parse again", the effective date and notes, saving through `POST /api/documents/:id/versions/import`; on a document with no versions ("Import the bylaws") and with versions ("Import a new version").
  2. Export and print (Task 2): the members' and the public print pages in the document typeface with print CSS, page margins, the running header with the organization and the document, "Version 2, effective March 15, 2026", long articles on a new page, no app chrome, `window.print()` with `?print=1`; Markdown as before; the HTML and PDF items and `exportHtml`/`exportPdf` removed.
  3. Amendment preview (Task 4): the Preview tab beside the changes for drafts and proposed amendments, added sections in carried, removed ones struck through in muted ink, changed ones with the new text, a "Changed" badge and a toggle for the old text; a passed and applied amendment links to its version.
  4. Search (Task 5): the header uses `GET /api/organizations/:orgId/search` for the current organization and opens `/documents/:id#section-<sectionId>`; the document page scrolls to the section and selects it (the brief's gavel bar). The share page's search is untouched.
  5. Minutes (Tasks 6 and 7): `/minutes` in the sidebar with status badges; `/minutes/:id` with the Markdown editor and live preview side by side (stacked on phones), autosave after two seconds of idle typing, "Regenerate from the meeting" with a confirmation, Publish, and once published Print or save as PDF and Download Markdown; members read published and approved minutes; "Approved at the <meeting> with corrections: ..." under the heading; the editor names who saved last.
  6. Approval at the next meeting (Task 8): the chair console's card while the minutes-approval stage or the minutes item is the business, Approve as read (`APPROVE_MINUTES`) and Approve with corrections (`APPROVE_MINUTES { corrections }`); the phone view and the display show the minutes' heading and "Any corrections?".
  7. The time zone on creation and in Settings beside the quorum settings, and the place on the schedule (Task 9).
  8. Testing, web: the import screen (paste, parse, edit, save), the print page, the preview tab, header search, the minutes list and editor (autosave, publish, read-only for members), all in Tasks 2 to 9; e2e: the meeting scenario's minutes (the pool motion with both parts, published) and the import scenario with the article and section counts (Task 10).
  - The brief: every new screen is on the tokens and utilities (`card`, `card-title`, `page-title`, `label-caps`, `btn-*`, `badge-*`, `document-content`), lucide icons only, labels as nouns and buttons as verbs, empty states as one line and one action, and both palettes are checked in the live check.
- **Where the code, the design or the server plan didn't agree, and what this plan does:**
  - **The count.** The design's example says "6 articles, 29 sections"; the Maple Grove bylaws have 6 articles and 23 sections under them (29 rows in all). `describeParsedBylaws` counts the sections beneath the articles, so the review and the e2e say "6 articles, 23 sections".
  - **The approval's trigger.** The design says "the minutes-approval stage or the agenda item the chair calls"; a meeting run from its agenda never enters that stage, and the agenda item has no type, so an item is about the minutes when its title has the word "minutes" (the demo's "Approval of the minutes of the 2025 annual meeting"). The card waits while a motion is pending.
  - **`MinutesApprovalPanel`** showed only at the stage, in "More", with approval as read; it is replaced by the card in the Now column and deleted.
  - **The share page's Markdown item** called a route that needs sign-in, so it never worked for the public; the share page's Export menu becomes "Print or save as PDF" (the design keeps Markdown "as today", which on the share page was broken).
  - **"The document's menu"** for "Import a new version": the document page has no menu but Export; the action sits beside "New Version" in the content card, where versions are made.
  - **Merging "into the one above"** merges into the section before it at its level (its subsections follow), or into its parent when it is the first; the very first section can't be merged.
  - **The link to an applied amendment's version** needed the document page to open a version from the link; `useDocumentData` takes `?version=`.
  - **The time zone's place in Settings**: its own card right after the Attendance card (the design: "next to the quorum settings").
  - **The import's "Save"** names the version it made in a toast and opens the document; the effective date and notes are optional, as on the New Version form.
- **Placeholder scan:** no "TBD" and no "similar to"; every new file is given whole; changes to existing files are shown before and after, anchored to their exact lines; the only file named but not shown line by line is `PublicDocumentPage.tsx`'s export menu, whose start and end lines are given and whose replacement is whole. The roadmap's date is `date +%F` on the day Task 11 runs.
- **Names this plan uses from the server plan, spelled as it defines them:** `parseBylaws`, `describeParsedBylaws`, `ParsedSection`; `POST /api/documents/:docId/import/docx`, `POST /api/documents/:docId/versions/import` and `sectionCount`; `GET /api/organizations/:orgId/search`, `SearchHit` (`documentId`, `documentTitle`, `versionId`, `sectionId`, `numberLabel`, `title`, `snippet`); the preview's `previous`; `GET /api/organizations/:orgId/minutes`, `GET/PUT /api/minutes/:id`, `POST /api/minutes/:id/publish`, `POST /api/minutes/:id/regenerate`, the minutes' `status` values and the `MinutesRecord` fields (`packet`, `organization`, `updatedBy`, `publishedBy`, `approvedAtPacket`, `corrections`); `Organization.timeZone`, `MeetingPacket.location`; the state's `minutesFromPreviousMeeting`, `previousMinutesId`, `minutesApproved`, `minutesApproval`, `disposition`; `APPROVE_MINUTES { corrections }`, `MAX_CORRECTIONS_LENGTH` (2,000); the demo's `MAPLE25` minutes.
- **Names this plan adds:** `bylawsImport` (`docxText`, `saveVersion`), `ImportVersion`, `ImportedVersion`, `amendments.preview`, `PreviewSection`, `AmendmentPreview` (the type and the component), `minutes` (`list`, `get`, `save`, `publish`, `regenerate`), `MinutesStatus`, `MinutesSummary`, `MinutesRecord`, `search.query(orgId, q)`, `SearchResult`, `SearchHit`; `formatLongDate`, `downloadText`, `fileName`, `browserTimeZone`, `timeZoneNames`; `PrintShell`, `PrintableDocument`, `PrintSection`, `PrintDocumentPage`, `PublicPrintPage`, `MinutesPrintPage`; `TreePath`, `renameSection`, `mergeIntoPrevious`, `canMerge`, `ImportBylawsPage`; `AmendmentTabs`; `findSection`, `useSectionFromHash`; `MinutesStatusBadge`, `meetingName`, `MinutesListPage`, `MinutesPage`, `AUTOSAVE_MS`; `minutesItemUnderWay`, `minutesHeading`, `MinutesApprovalCard`, `MinutesNotice`, `MinutesOnDisplay`; `TimeZoneCard`; e2e `maple-grove-bylaws.txt`, `import.spec.ts`.
