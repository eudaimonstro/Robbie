import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpError, setSignedOutHandler } from '../../../../../api/client';
import { createPacket, getAttachmentDownloadUrl, getPacket, uploadAttachment } from '../api';

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
    await getPacket('DEMO');
    expect(fetchMock).toHaveBeenCalledWith('/api/packets/DEMO', undefined);
    expect(getAttachmentDownloadUrl('a1')).toBe('/api/attachments/a1/download');
  });

  it('keeps its own error message', async () => {
    mockFetch(500, { error: 'boom' });
    await expect(getPacket('DEMO')).rejects.toThrow('Failed to get meeting packet');
  });

  it('reports a lost session on a 401', async () => {
    mockFetch(401, { error: 'Not signed in' });
    const onSignedOut = vi.fn();
    setSignedOutHandler(onSignedOut);
    await expect(getPacket('DEMO')).rejects.toThrow();
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

  it('reads a meeting without a packet as having none', async () => {
    mockFetch(404, { error: 'Not found' });
    expect(await getPacket('DEMO')).toBeNull();
  });

  it("creates a packet in an organization, with the server's message for a taken code", async () => {
    const fetchMock = mockFetch(409, { error: 'That meeting code is already in use' });
    const error = await createPacket('org-1', { robbieCode: 'MAPLE1', title: 'Annual' }).catch(
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(409);
    expect((error as HttpError).message).toBe('That meeting code is already in use');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/organizations/org-1/packets');
    expect(JSON.parse(init.body as string)).toEqual({ robbieCode: 'MAPLE1', title: 'Annual' });
  });
});
