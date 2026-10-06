import { describe, it, expect, vi, afterEach } from 'vitest';
import { setSignedOutHandler } from '../../../../../api/client';
import { getAttachmentDownloadUrl, getOrCreatePacket, uploadAttachment } from '../api';

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('scheduling API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setSignedOutHandler(null);
  });

  it('calls the API on the page origin, where the session cookie is sent', async () => {
    const fetchMock = mockFetch(200, { id: 'p1' });
    await getOrCreatePacket('DEMO');
    expect(fetchMock).toHaveBeenCalledWith('/api/packets/DEMO', undefined);
    expect(getAttachmentDownloadUrl('a1')).toBe('/api/attachments/a1/download');
  });

  it('keeps its own error message', async () => {
    mockFetch(500, { error: 'boom' });
    await expect(getOrCreatePacket('DEMO')).rejects.toThrow('Failed to get meeting packet');
  });

  it('reports a lost session on a 401', async () => {
    mockFetch(401, { error: 'Not signed in' });
    const onSignedOut = vi.fn();
    setSignedOutHandler(onSignedOut);
    await expect(getOrCreatePacket('DEMO')).rejects.toThrow();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('uploads the file as the body with its own content type', async () => {
    const fetchMock = mockFetch(200, { id: 'a1' });
    const file = new File(['%PDF'], 'agenda.pdf', { type: 'application/pdf' });
    await uploadAttachment('DEMO', file, { packetId: 'p1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/attachments/upload?packetId=p1');
    expect(init.body).toBe(file);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/pdf');
  });
});
