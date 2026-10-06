import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Document, Version } from '../../../../../api/client';

const api = vi.hoisted(() => ({
  getDocument: vi.fn(),
  listVersions: vi.fn(),
  listAmendments: vi.fn(),
  getTree: vi.fn(),
}));

vi.mock('../../../../../api/client', () => ({
  documents: { get: api.getDocument },
  versions: { list: api.listVersions, getTree: api.getTree },
  amendments: { list: api.listAmendments },
  sections: {},
}));
vi.mock('../../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: () => {} }),
}));

const { useDocumentData } = await import('../useDocumentData');

const doc = (id: string, currentVersionId: string | null = null) =>
  ({ id, title: `Document ${id}`, currentVersionId }) as Document;
const version = (id: string, versionNumber: number) => ({ id, versionNumber }) as Version;

// Each document's data, as the API returns it (versions newest first)
const data: Record<string, { doc: Document; versions: Version[] }> = {
  A: { doc: doc('A', 'a1'), versions: [version('a1', 1)] },
  B: { doc: doc('B'), versions: [] },
  C: { doc: doc('C'), versions: [version('c3', 3), version('c2', 2), version('c1', 1)] },
};

describe('useDocumentData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDocument.mockImplementation(async (id: string) => data[id].doc);
    api.listVersions.mockImplementation(async (id: string) => data[id].versions);
    api.listAmendments.mockResolvedValue([]);
    api.getTree.mockImplementation(async (versionId: string) => [{ id: `${versionId}-section` }]);
  });

  it('drops the previous document when moving to one with no versions', async () => {
    const { result, rerender } = renderHook(({ id }) => useDocumentData(id), {
      initialProps: { id: 'A' },
    });
    await waitFor(() => expect(result.current.selectedVersion?.id).toBe('a1'));

    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.doc?.id).toBe('B'));

    // Otherwise Add Section would write into document A's version
    expect(result.current.selectedVersion).toBeNull();
    expect(result.current.sectionTree).toEqual([]);
  });

  it('ignores a response for a document that is no longer shown', async () => {
    let finishA: (value: Document) => void = () => {};
    api.getDocument.mockImplementation((id: string) =>
      id === 'A' ? new Promise<Document>((resolve) => (finishA = resolve)) : data[id].doc,
    );
    const { result, rerender } = renderHook(({ id }) => useDocumentData(id), {
      initialProps: { id: 'A' },
    });

    rerender({ id: 'C' });
    await waitFor(() => expect(result.current.doc?.id).toBe('C'));
    finishA(data.A.doc);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.doc?.id).toBe('C');
  });

  it('selects the newest version when none is marked current', async () => {
    const { result } = renderHook(() => useDocumentData('C'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedVersion?.id).toBe('c3');
  });
});
