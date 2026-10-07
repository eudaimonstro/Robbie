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

function mockResponse(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe('API client errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the message from a { error: string } response', async () => {
    mockResponse(404, { error: 'Organization not found' });
    await expect(organizations.get('missing-org')).rejects.toThrow('Organization not found');
  });

  it('uses the message from a { error: { code, message } } response', async () => {
    mockResponse(409, { error: { code: 'CONFLICT', message: 'Resource already exists' } });
    await expect(documents.get('conflicting-doc')).rejects.toThrow('Resource already exists');
  });

  it('includes the first validation detail', async () => {
    mockResponse(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: [{ path: 'id', message: 'Invalid UUID' }],
      },
    });
    await expect(versions.get('not-a-uuid')).rejects.toThrow(
      'Invalid request data (id: Invalid UUID)',
    );
  });

  it('carries the HTTP status, so a server answer can be told from a network failure', async () => {
    mockResponse(500, { error: 'Failed to sign out' });
    const error = await auth.signOut().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(500);
  });

  it('falls back to the HTTP status when the body has no message', async () => {
    mockResponse(403, {});
    await expect(organizations.get('forbidden-org')).rejects.toThrow('HTTP 403');
  });
});

describe('API client cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refetches a document after applying an amendment changes it', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: 'doc-1', currentVersionId: 'v1' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await documents.get('doc-1');
    await amendments.apply('amend-1');
    await documents.get('doc-1');

    // The apply makes a new current version, so the cached document is out of date
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('sign-in calls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setSignedOutHandler(null);
  });

  it('returns the signed-in user, or null when signed out', async () => {
    mockResponse(200, { user: { id: 1, email: 'ann@example.org', name: 'Ann' } });
    expect(await auth.me()).toEqual({ id: 1, email: 'ann@example.org', name: 'Ann' });
    mockResponse(401, { error: 'Not signed in' });
    expect(await auth.me()).toBeNull();
  });

  it('verifies a code for the web client', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ user: { id: 1, email: 'a@b.c', name: null } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await auth.verify('a@b.c', '123456');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.c', code: '123456' });
  });

  it('reports a 401 from any other call as signed out', async () => {
    const onSignedOut = vi.fn();
    setSignedOutHandler(onSignedOut);
    mockResponse(401, { error: 'Not signed in' });
    await expect(organizations.list()).rejects.toThrow('Not signed in');
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it('never retries a sign-in call', async () => {
    // A retried code request would send another email and count against the limit
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Too many codes' }), { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(auth.requestCode('a@b.c')).rejects.toThrow('Too many codes');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not report a wrong sign-in code as signed out', async () => {
    const onSignedOut = vi.fn();
    setSignedOutHandler(onSignedOut);
    mockResponse(401, { error: 'That code is wrong or has expired' });
    await expect(auth.verify('a@b.c', '000001')).rejects.toThrow('That code is wrong');
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});

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
