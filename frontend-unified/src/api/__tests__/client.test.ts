import { describe, it, expect, vi, afterEach } from 'vitest';
import { organizations, documents, versions, amendments } from '../client';

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
