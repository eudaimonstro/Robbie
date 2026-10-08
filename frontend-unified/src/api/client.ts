import type { OrgRole } from '../utils/roles';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import type { ParsedSection } from '@robbie-bylawyer/shared/utils';

const API_BASE = '/api';

// Simple in-memory cache for GET requests
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

function getCacheKey(endpoint: string): string {
  return endpoint;
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// A write can change data behind many endpoints (applying an amendment changes the document,
// its versions and its amendments), so any successful write clears the whole cache
function invalidateCache(): void {
  cache.clear();
}

// Called when a request answers 401 (the session has ended), so the app can show sign-in.
// Calls under /auth/ are excluded: a 401 there is an answer (a wrong code, or "not signed in"
// from /auth/me), not a lost session.
let signedOutHandler: (() => void) | null = null;

export function setSignedOutHandler(handler: (() => void) | null): void {
  signedOutHandler = handler;
}

function noteUnauthorized(endpoint: string, status: number): void {
  if (status === 401 && !endpoint.startsWith('/auth/')) {
    cache.clear();
    signedOutHandler?.();
  }
}

/** The code of a refusal because the user hasn't accepted the current terms */
export const TERMS_NOT_ACCEPTED = 'TERMS_NOT_ACCEPTED';

// Called when a request is refused until the user accepts the current terms, so the app can
// show the terms step. It is told when the request started, so a refusal of a request made
// before the user accepted the terms can be ignored.
let termsHandler: ((startedAt: number) => void) | null = null;

export function setTermsHandler(handler: ((startedAt: number) => void) | null): void {
  termsHandler = handler;
}

function noteTermsRefusal(status: number, code: string | undefined, startedAt: number): void {
  if (status === 403 && code === TERMS_NOT_ACCEPTED) termsHandler?.(startedAt);
}

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

/**
 * A plain same-origin fetch of `/api${endpoint}`, for callers that read the response
 * themselves. A 401 is reported as a lost session and a terms refusal as one, the same as for
 * the rest of the client.
 */
export async function apiFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const startedAt = Date.now();
  const response = await fetch(`${API_BASE}${endpoint}`, init);
  noteUnauthorized(endpoint, response.status);
  if (response.status === 403) {
    // Read a copy, so the caller can still read the body
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    noteTermsRefusal(response.status, body?.code, startedAt);
  }
  return response;
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 10000; // 10 seconds

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function downloadFile(endpoint: string): Promise<void> {
  const response = await fetch(`${API_BASE}${endpoint}`);

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  // Get filename from Content-Disposition header
  const disposition = response.headers.get('Content-Disposition');
  let filename = 'download';
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) {
      filename = match[1];
    }
  }

  // Download the file
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

function shouldRetry(status: number, attempt: number, isGet: boolean): boolean {
  // Retry on network errors and 5xx server errors. A 429 is retried only for reads: on a write
  // it is a limit (organizations owned, people added in a day) that a retry can't get past, and
  // retrying would hold back the server's message for several seconds.
  return attempt < MAX_RETRIES && (status >= 500 || status === 0 || (status === 429 && isGet));
}

function getRetryDelay(attempt: number): number {
  // Exponential backoff with jitter
  const delay = Math.min(INITIAL_DELAY * Math.pow(2, attempt), MAX_DELAY);
  const jitter = delay * 0.1 * Math.random();
  return delay + jitter;
}

/**
 * A request's options: fetch's, and whether a failure (a 5xx, or no answer) is tried again.
 * A write the server may have applied before the failure, and that would do something twice if
 * sent again, turns retries off.
 */
type RequestOptions = RequestInit & { retry?: boolean };

async function request<T>(
  endpoint: string,
  requestOptions: RequestOptions = {},
  useCache = true,
): Promise<T> {
  const { retry = true, ...options } = requestOptions;
  const retries = retry && !endpoint.startsWith('/auth/');
  const isGet = !options.method || options.method === 'GET';
  const cacheKey = getCacheKey(endpoint);
  const startedAt = Date.now();

  // Check cache for GET requests
  if (isGet && useCache) {
    const cached = getFromCache<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        noteUnauthorized(endpoint, response.status);

        if (retries && shouldRetry(response.status, attempt, isGet)) {
          const delay = getRetryDelay(attempt);
          console.warn(
            `Request failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(delay);
          continue;
        }

        const { message, code } = await readError(response);
        noteTermsRefusal(response.status, code, startedAt);
        throw new HttpError(message, response.status, code);
      }

      if (response.status === 204) {
        // Invalidate cache on successful mutations
        if (!isGet) {
          invalidateCache();
        }
        return undefined as T;
      }

      const data = await response.json();

      // Cache successful GET responses
      if (isGet && useCache) {
        setCache(cacheKey, data);
      }

      // Invalidate cache on successful mutations
      if (!isGet) {
        invalidateCache();
      }

      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');

      // Retry on network errors
      if (
        retries &&
        attempt < MAX_RETRIES &&
        (err instanceof TypeError || (err as Error).message === 'Failed to fetch')
      ) {
        const delay = getRetryDelay(attempt);
        console.warn(
          `Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('Request failed after retries');
}

// Organizations
export const organizations = {
  list: () => request<OrganizationWithRole[]>('/organizations'),
  get: (id: string) => request<Organization>(`/organizations/${id}`),
  create: (data: OrganizationCreate) =>
    request<OrganizationWithRole>('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: OrganizationUpdate) =>
    request<Organization>(`/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/organizations/${id}`, { method: 'DELETE' }),
};

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

// The organization's schedule: its meetings (packets), not yet adjourned first. Not cached: a
// meeting starts and ends while the page is open.
export const schedule = {
  list: (orgId: string) =>
    request<ScheduledMeeting[]>(`/organizations/${orgId}/packets`, {}, false),
};

// A live meeting's organization and its agenda on the schedule, by meeting code
export const meetingPackets = {
  /**
   * The meeting's organization's members and pending additions, for marking people present
   * (viewer and above). Not cached: people join the organization while a meeting runs.
   */
  roster: (code: string) => request<MeetingRoster>(`/packets/${code}/roster`, {}, false),
  /** Replace the live agenda with the schedule's, before the meeting is called to order */
  reloadAgenda: (code: string) =>
    request<{ live: boolean }>(`/packets/${code}/reload-agenda`, { method: 'POST' }),
};

// Documents
export const documents = {
  list: (orgId: string) => request<Document[]>(`/organizations/${orgId}/documents`),
  get: (id: string) => request<Document>(`/documents/${id}`),
  create: (orgId: string, data: DocumentCreate) =>
    request<Document>(`/organizations/${orgId}/documents`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: DocumentUpdate) =>
    request<Document>(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  getAtDate: (id: string, date: string) =>
    request<{ versionId: string; versionNumber: number }>(`/documents/${id}/at-date?date=${date}`),
  // Sharing
  getShareStatus: (id: string) => request<ShareStatus | null>(`/documents/${id}/share`),
  enableSharing: (id: string) => request<ShareStatus>(`/documents/${id}/share`, { method: 'POST' }),
  disableSharing: (id: string) => request<void>(`/documents/${id}/share`, { method: 'DELETE' }),
  regenerateShareToken: (id: string) =>
    request<ShareStatus>(`/documents/${id}/share/regenerate`, { method: 'POST' }),
};

// Public (readonly) document access
export const publicDocuments = {
  // Document, all versions, and the current version with its section tree
  get: (shareToken: string) => request<SharedDocument>(`/share/${shareToken}`),
  getVersion: (shareToken: string, versionId: string) =>
    request<SharedVersion>(`/share/${shareToken}/versions/${versionId}`),
};

// Versions
export const versions = {
  list: (docId: string) => request<Version[]>(`/documents/${docId}/versions`),
  get: (id: string) => request<Version>(`/versions/${id}`),
  create: (docId: string, data: VersionCreate) =>
    request<Version>(`/documents/${docId}/versions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getTree: (id: string, fresh = false) =>
    request<SectionTree[]>(`/versions/${id}/tree`, {}, !fresh),
  getText: (id: string) => request<{ text: string }>(`/versions/${id}/text`),
  diff: (id: string, otherId: string) => request<DiffResult>(`/versions/${id}/diff/${otherId}`),
  exportMarkdown: (id: string) => downloadFile(`/versions/${id}/export/markdown`),
};

// Sections
export const sections = {
  list: (versionId: string) => request<Section[]>(`/versions/${versionId}/sections`),
  get: (id: string) => request<Section>(`/sections/${id}`),
  create: (versionId: string, data: SectionCreate) =>
    request<Section>(`/versions/${versionId}/sections`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: SectionUpdate) =>
    request<Section>(`/sections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/sections/${id}`, { method: 'DELETE' }),
  addChild: (id: string, data: SectionCreate) =>
    request<Section>(`/sections/${id}/children`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getPath: (id: string) =>
    request<{ path: { id: string; numberLabel: string; title: string }[] }>(`/sections/${id}/path`),
  reorder: (versionId: string, updates: Array<{ id: string; position: number }>) =>
    request<{ status: string; updated: number }>(`/versions/${versionId}/sections/reorder`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
};

// Amendments
export const amendments = {
  list: (docId: string) => request<Amendment[]>(`/documents/${docId}/amendments`),
  get: (id: string) => request<Amendment>(`/amendments/${id}`),
  create: (docId: string, data: AmendmentCreate) =>
    request<Amendment>(`/documents/${docId}/amendments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: AmendmentUpdate) =>
    request<Amendment>(`/amendments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/amendments/${id}`, { method: 'DELETE' }),
  propose: (id: string) => request<Amendment>(`/amendments/${id}/propose`, { method: 'POST' }),
  withdraw: (id: string) => request<Amendment>(`/amendments/${id}/withdraw`, { method: 'POST' }),
  table: (id: string) => request<Amendment>(`/amendments/${id}/table`, { method: 'POST' }),
  pass: (id: string) => request<Amendment>(`/amendments/${id}/pass`, { method: 'POST' }),
  fail: (id: string) => request<Amendment>(`/amendments/${id}/fail`, { method: 'POST' }),
  apply: (id: string) =>
    request<{ version: Version }>(`/amendments/${id}/apply`, { method: 'POST' }),
  getChanges: (id: string) => request<AmendmentChange[]>(`/amendments/${id}/changes`),
  addChange: (id: string, data: AmendmentChangeCreate) =>
    request<AmendmentChange>(`/amendments/${id}/changes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateChange: (changeId: string, data: Partial<AmendmentChangeCreate>) =>
    request<AmendmentChange>(`/amendment-changes/${changeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
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
  /**
   * Parsed and reviewed sections as a new current version. Sent once: when the answer is lost,
   * the version may be saved, and sending it again would save a second.
   */
  saveVersion: (docId: string, data: ImportVersion) =>
    request<ImportedVersion>(`/documents/${docId}/versions/import`, {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
};

// Meeting minutes. Not cached: a secretary saves them while others read.
export const minutes = {
  list: (orgId: string) => request<MinutesSummary[]>(`/organizations/${orgId}/minutes`, {}, false),
  get: (id: string) => request<MinutesRecord>(`/minutes/${id}`, {}, false),
  // Sent once: the editor saves again after the next change, and a retry landing after a newer
  // save would put older text back
  save: (id: string, body: string) =>
    request<MinutesRecord>(`/minutes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ body }),
      retry: false,
    }),
  publish: (id: string) => request<MinutesRecord>(`/minutes/${id}/publish`, { method: 'POST' }),
  regenerate: (id: string) =>
    request<MinutesRecord>(`/minutes/${id}/regenerate`, { method: 'POST' }),
  // Secretaries: the changes to published minutes, and each one's text (what it replaced)
  revisions: (id: string) => request<MinutesRevision[]>(`/minutes/${id}/revisions`, {}, false),
  revision: (id: string, revisionId: string) =>
    request<MinutesRevisionText>(`/minutes/${id}/revisions/${revisionId}`, {}, false),
};

// Search the current version of each of an organization's documents, from 2 characters. Not
// cached: the results follow edits.
export const search = {
  query: (orgId: string, q: string) =>
    request<SearchResult>(`/organizations/${orgId}/search?q=${encodeURIComponent(q)}`, {}, false),
};

// Types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** How many voting members it has (the quorum's base); null counts the roster's members */
  eligibleVoters?: number | null;
  /** The quorum: a percentage of the voting members, or a number of people; one is set */
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

export interface OrganizationUpdate {
  name?: string;
  description?: string;
  isActive?: boolean;
  /** null counts the roster's voting members */
  eligibleVoters?: number | null;
  /** Setting one of these clears the other */
  quorumPercent?: number;
  quorumCount?: number;
  timeZone?: string;
}

/** One of the signed-in user's organizations, with their role in it */
export interface OrganizationWithRole extends Organization {
  role: OrgRole;
}

export interface OrgMember {
  userId: number;
  name: string | null;
  /** For admins, and for the member themselves */
  email?: string;
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

/** A scheduled meeting, as the organization's schedule lists it (its packet) */
export interface ScheduledMeeting {
  id: string;
  /** The meeting code: the live meeting is /meetings/<robbieCode> */
  robbieCode: string;
  title: string | null;
  description: string | null;
  /** Where the meeting is held */
  location: string | null;
  scheduledFor: string | null;
  /** The presiding officer, who chairs the live meeting; null when the admins run it */
  chairUserId: number | null;
  /** When the meeting was called to order and adjourned */
  startedAt: string | null;
  endedAt: string | null;
  chair: { name: string | null } | null;
}

/** A member of a live meeting's organization, as the roster lists them */
export interface RosterMember {
  userId: number;
  name: string | null;
  /** Sent to admins only */
  email?: string;
  orgRole: OrgRole;
}

/** A live meeting's organization: its members, and additions waiting for a first sign-in */
export interface MeetingRoster {
  members: RosterMember[];
  invites: Array<{ email: string; role: OrgRole }>;
}

export type AddMemberResult =
  | { status: 'added'; member: OrgMember; emailSent: boolean }
  | { status: 'invited'; invite: PendingInvite; emailSent: boolean }
  | { status: 'updated'; invite: PendingInvite; emailSent: false };

export interface Document {
  id: string;
  organizationId: string;
  title: string;
  docType: 'bylaws' | 'standing_rules' | 'policy';
  currentVersionId: string | null;
  createdAt: string;
}

export interface DocumentCreate {
  title: string;
  docType: 'bylaws' | 'standing_rules' | 'policy';
}

export interface DocumentUpdate {
  title?: string;
}

export interface Version {
  id: string;
  documentId: string;
  versionNumber: number;
  effectiveDate: string | null;
  adoptedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface VersionCreate {
  notes?: string;
  effectiveDate?: string;
}

export interface Section {
  id: string;
  versionId: string;
  parentId: string | null;
  position: number;
  numberLabel: string | null;
  title: string | null;
  content: string | null;
  annotation: string | null;
}

export interface SectionTree extends Section {
  children: SectionTree[];
}

export interface SectionCreate {
  parentId?: string;
  position?: number;
  numberLabel: string; // Required for new sections
  title: string; // Required for new sections
  content?: string;
  annotation?: string;
}

export interface SectionUpdate {
  // null clears the field; leaving it out keeps the current value
  numberLabel?: string | null;
  title?: string | null;
  content?: string | null;
  annotation?: string | null;
  position?: number;
}

export interface Amendment {
  id: string;
  documentId: string;
  title: string;
  description: string | null;
  status: 'draft' | 'proposed' | 'passed' | 'failed' | 'tabled' | 'withdrawn';
  proposedAt: string | null;
  decidedAt: string | null;
  resultingVersionId: string | null;
  /** Who created it; null for amendments synced from a live meeting or made before this was kept */
  createdById: number | null;
  createdAt: string;
  changes: AmendmentChange[];
}

export interface AmendmentCreate {
  title: string;
  description?: string;
}

export interface AmendmentUpdate {
  title?: string;
  description?: string;
}

export interface AmendmentChange {
  id: string;
  amendmentId: string;
  changeType: 'add' | 'modify' | 'delete' | 'renumber';
  targetSectionId: string | null;
  newContent: string | null;
  newNumberLabel: string | null;
  newTitle: string | null;
  position: number;
}

export interface AmendmentChangeCreate {
  changeType: 'add' | 'modify' | 'delete' | 'renumber';
  targetSectionId?: string;
  newContent?: string;
  newNumberLabel?: string;
  newTitle?: string;
  position?: number;
}

/** A section of an amendment's preview: as it would read, and what the amendment does to it */
export interface PreviewSection {
  /** An added section's id is `new-<changeId>` */
  id: string;
  parentId: string | null;
  position: number;
  numberLabel: string | null;
  title: string | null;
  content: string | null;
  annotation: string | null;
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
/** A change to published minutes: who made it, and when */
export interface MinutesRevision {
  id: string;
  editedAt: string;
  editedBy: { id: number; name: string | null } | null;
}

/** A change with the text it replaced (Markdown) */
export interface MinutesRevisionText extends MinutesRevision {
  body: string;
}

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
  /**
   * Published and before a meeting that hasn't adjourned: the meeting makes any corrections,
   * so a save is refused (409)
   */
  beforeMeeting: boolean;
}

export interface DiffResult {
  oldVersionId: string;
  newVersionId: string;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'add' | 'delete' | 'modify';
  sectionId: string;
  oldNumberLabel: string | null;
  newNumberLabel: string | null;
  oldTitle: string | null;
  newTitle: string | null;
  oldContent: string | null;
  newContent: string | null;
}

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

// Sharing types
export interface ShareStatus {
  shareToken: string;
  shareEnabled: boolean;
  shareUrl: string;
}

// Public document types (for readonly view)
export interface PublicDocument {
  id: string;
  title: string;
  docType: string;
  currentVersionId: string | null;
}

export interface PublicVersion {
  id: string;
  versionNumber: number;
  effectiveDate: string | null;
  adoptedAt: string | null;
  notes: string | null;
}

export interface SharedVersion extends PublicVersion {
  sections: SectionTree[];
}

export interface SharedDocument {
  document: {
    id: string;
    title: string;
    docType: string;
    organization: { id: string; name: string; slug: string };
  };
  versions: PublicVersion[];
  currentVersion: SharedVersion | null;
}

// Live meetings and the bylaws they amend (bylaw sync)
export interface LinkedOrganization {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface MeetingOrganizationResponse {
  linked: boolean;
  organization: LinkedOrganization | null;
  warning?: string;
}

// What a bylaw amendment motion in a live meeting is made from
export const bylawSync = {
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

  // Get documents for a linked organization
  getOrganizationDocuments: (orgId: string) =>
    request<Document[]>(`/bylawyer/organizations/${orgId}/documents`),

  // Get section tree for a document
  getDocumentSections: (docId: string) =>
    request<SectionTree[]>(`/bylawyer/documents/${docId}/sections`),
};

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
}

/** The signed-in user, and whether they accepted the current Terms of Service and Privacy Policy */
export interface Me {
  user: SessionUser;
  termsAccepted: boolean;
}

export const auth = {
  /** The signed-in user and their terms acceptance, or null when there is no session */
  me: async (): Promise<Me | null> => {
    const response = await fetch(`${API_BASE}/auth/me`, { credentials: 'same-origin' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(await errorMessage(response));
    return (await response.json()) as Me;
  },
  // The answer's challenge goes back with the code (and with "send a new code"): only this
  // browser can use the code it asked for
  requestCode: (email: string, challenge?: string) =>
    request<{ success: boolean; challenge: string }>(
      '/auth/request-code',
      { method: 'POST', body: JSON.stringify({ email, challenge }) },
      false,
    ),
  verify: async (email: string, code: string, challenge?: string) =>
    (
      await request<{ user: SessionUser }>(
        '/auth/verify',
        { method: 'POST', body: JSON.stringify({ email, code, challenge }) },
        false,
      )
    ).user,
  updateName: async (name: string) =>
    (
      await request<{ user: SessionUser }>(
        '/auth/me',
        { method: 'PATCH', body: JSON.stringify({ name }) },
        false,
      )
    ).user,
  /** Accept the current terms: the version this app shows, so a stale page can't accept others */
  acceptTerms: () =>
    request<{ termsAccepted: boolean }>(
      '/auth/accept-terms',
      { method: 'POST', body: JSON.stringify({ version: TERMS_VERSION }) },
      false,
    ),
  signOut: () => request<{ success: boolean }>('/auth/sign-out', { method: 'POST' }, false),
  signOutEverywhere: () =>
    request<{ success: boolean }>('/auth/sign-out-everywhere', { method: 'POST' }, false),
};
