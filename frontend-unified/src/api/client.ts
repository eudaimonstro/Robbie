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

// Invalidate cache for related endpoints on mutations
function invalidateCache(endpoint: string): void {
  // Invalidate exact match and related list endpoints
  const parts = endpoint.split('/');
  cache.delete(endpoint);

  // Invalidate parent list endpoints
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentPath = parts.slice(0, i).join('/');
    if (parentPath) {
      cache.delete(parentPath);
    }
  }

  // Invalidate all list endpoints that might be affected
  for (const key of cache.keys()) {
    if (key.includes(parts[1]) || endpoint.includes(key.split('/')[1])) {
      cache.delete(key);
    }
  }
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 10000; // 10 seconds

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The backend sends { error: string } from route handlers, or
// { error: { code, message, details? } } from validation and the error handler
async function errorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  const error = body?.error;
  if (typeof error === 'string') return error;
  if (error && typeof error.message === 'string') {
    const detail = Array.isArray(error.details) ? error.details[0] : null;
    return detail?.message
      ? `${error.message} (${detail.path ? `${detail.path}: ` : ''}${detail.message})`
      : error.message;
  }
  return `HTTP ${response.status}`;
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

function shouldRetry(status: number, attempt: number): boolean {
  // Retry on network errors, 5xx server errors, and 429 (rate limit)
  return attempt < MAX_RETRIES && (status >= 500 || status === 429 || status === 0);
}

function getRetryDelay(attempt: number): number {
  // Exponential backoff with jitter
  const delay = Math.min(INITIAL_DELAY * Math.pow(2, attempt), MAX_DELAY);
  const jitter = delay * 0.1 * Math.random();
  return delay + jitter;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  useCache = true,
): Promise<T> {
  const isGet = !options.method || options.method === 'GET';
  const cacheKey = getCacheKey(endpoint);

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
        if (shouldRetry(response.status, attempt)) {
          const delay = getRetryDelay(attempt);
          console.warn(
            `Request failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
          );
          await sleep(delay);
          continue;
        }

        throw new Error(await errorMessage(response));
      }

      if (response.status === 204) {
        // Invalidate cache on successful mutations
        if (!isGet) {
          invalidateCache(endpoint);
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
        invalidateCache(endpoint);
      }

      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');

      // Retry on network errors
      if (
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
  list: () => request<Organization[]>('/organizations'),
  get: (id: string) => request<Organization>(`/organizations/${id}`),
  create: (data: OrganizationCreate) =>
    request<Organization>('/organizations', {
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
  get: (shareToken: string) => request<PublicDocument>(`/public/documents/${shareToken}`),
  getVersions: (shareToken: string) =>
    request<PublicVersion[]>(`/public/documents/${shareToken}/versions`),
  getTree: (shareToken: string, versionId: string) =>
    request<SectionTree[]>(`/public/documents/${shareToken}/versions/${versionId}/tree`),
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
  exportHtml: (id: string) => downloadFile(`/versions/${id}/export/html`),
  exportPdf: (id: string) => downloadFile(`/versions/${id}/export/pdf`),
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
};

// Meetings
export const meetings = {
  list: (orgId: string) => request<Meeting[]>(`/organizations/${orgId}/meetings`),
  get: (id: string) => request<Meeting>(`/meetings/${id}`),
  create: (orgId: string, data: MeetingCreate) =>
    request<Meeting>(`/organizations/${orgId}/meetings`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: MeetingUpdate) =>
    request<Meeting>(`/meetings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/meetings/${id}`, { method: 'DELETE' }),
};

// Votes
export const votes = {
  list: (meetingId: string) => request<Vote[]>(`/meetings/${meetingId}/votes`),
  get: (id: string) => request<Vote>(`/votes/${id}`),
  create: (meetingId: string, data: VoteCreate) =>
    request<Vote>(`/meetings/${meetingId}/votes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<VoteCreate>) =>
    request<Vote>(`/votes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// Search
export const search = {
  query: (q: string, orgId?: string, docId?: string) => {
    let endpoint = `/search?q=${encodeURIComponent(q)}`;
    if (orgId) endpoint += `&org_id=${orgId}`;
    if (docId) endpoint += `&doc_id=${docId}`;
    return request<SearchResult>(endpoint, {}, false); // Don't cache search results
  },
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
}

export interface OrganizationCreate {
  name: string;
  description?: string;
  slug?: string;
}

export interface OrganizationUpdate {
  name?: string;
  description?: string;
  isActive?: boolean;
}

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
  numberLabel?: string;
  title?: string;
  content?: string;
  annotation?: string;
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

export interface Meeting {
  id: string;
  organizationId: string;
  title: string;
  meetingType: 'regular' | 'special' | 'annual' | 'emergency';
  scheduledDate: string;
  location: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  createdAt: string;
}

export interface MeetingCreate {
  title: string;
  meetingType: 'regular' | 'special' | 'annual' | 'emergency';
  scheduledDate: string;
  location?: string;
  notes?: string;
}

export interface MeetingUpdate {
  title?: string;
  meetingType?: 'regular' | 'special' | 'annual' | 'emergency';
  scheduledDate?: string;
  location?: string;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
}

export interface Vote {
  id: string;
  meetingId: string;
  amendmentId: string;
  yeaCount: number;
  nayCount: number;
  abstainCount: number;
  result: 'passed' | 'failed' | 'tabled';
  passed: boolean;
  recordedAt: string;
}

export interface VoteCreate {
  amendmentId: string;
  yeaCount: number;
  nayCount: number;
  abstainCount: number;
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

// Robbie-Bylawyer Integration (bylaw sync)
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

export interface LinkMeetingResponse {
  success: boolean;
  meetingCode: string;
  organization: LinkedOrganization;
}

export interface SyncStatusResponse {
  synced: boolean;
  amendmentId?: string;
  status?: string;
  applied?: boolean;
}

// Bylaw Sync API - for Robbie/Bylawyer integration
export const bylawSync = {
  // Get all organizations (for linking dropdown)
  getOrganizations: () => request<LinkedOrganization[]>('/bylawyer/organizations'),

  // Link a Robbie meeting to a Bylawyer organization
  linkMeeting: (meetingCode: string, organizationId: string) =>
    request<LinkMeetingResponse>('/bylawyer/link-meeting', {
      method: 'POST',
      body: JSON.stringify({ meetingCode, organizationId }),
    }),

  // Unlink a meeting from its organization
  unlinkMeeting: (meetingCode: string) =>
    request<{ success: boolean }>(`/bylawyer/link-meeting/${meetingCode}`, {
      method: 'DELETE',
    }),

  // Get the organization linked to a meeting
  getMeetingOrganization: (meetingCode: string) =>
    request<MeetingOrganizationResponse>(`/bylawyer/meeting/${meetingCode}/organization`),

  // Get documents for a linked organization
  getOrganizationDocuments: (orgId: string) =>
    request<Document[]>(`/bylawyer/organizations/${orgId}/documents`),

  // Get section tree for a document
  getDocumentSections: (docId: string) =>
    request<SectionTree[]>(`/bylawyer/documents/${docId}/sections`),

  // Check sync status for a motion
  getSyncStatus: (meetingCode: string, motionId: number) =>
    request<SyncStatusResponse>(`/robbie/sync-status/${meetingCode}/${motionId}`),
};
