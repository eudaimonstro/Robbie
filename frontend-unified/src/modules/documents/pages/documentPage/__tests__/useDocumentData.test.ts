import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Document, Version } from '../../../../../api/client';

const api = vi.hoisted(() => ({
  getDocument: vi.fn(),
  listVersions: vi.fn(),
  listAmendments: vi.fn(),
  getTree: vi.fn(),
  createVersion: vi.fn(),
}));

vi.mock('../../../../../api/client', () => ({
  documents: { get: api.getDocument },
  versions: { list: api.listVersions, getTree: api.getTree, create: api.createVersion },
  amendments: { list: api.listAmendments },
  sections: {},
}));
// The same function each render, as the provider's is: a new one would reload the document
const toast = vi.hoisted(() => ({ showToast: () => {} }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => toast }));

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

  it('follows the version asked for without reloading the document, and a reload keeps it', async () => {
    const versions = [version('q2', 2), version('q1', 1)];
    api.getDocument.mockResolvedValue(doc('Q', 'q2'));
    api.listVersions.mockResolvedValue(versions);
    api.getTree.mockResolvedValue([]);

    const { result, rerender } = renderHook(({ asked }) => useDocumentData('Q', asked), {
      initialProps: { asked: 'q1' as string | null },
    });
    await waitFor(() => expect(result.current.selectedVersion?.id).toBe('q1'));

    // The picker chose the current version: the link no longer names one
    rerender({ asked: null });
    await waitFor(() => expect(result.current.selectedVersion?.id).toBe('q2'));
    expect(api.getDocument).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);

    // A reload (after a new version) reads the link as it is now, not as it was
    api.createVersion.mockResolvedValue(version('q3', 3));
    api.getDocument.mockResolvedValue(doc('Q', 'q3'));
    api.listVersions.mockResolvedValue([version('q3', 3), ...versions]);
    await act(() => result.current.handleCreateVersion({} as never));
    expect(result.current.selectedVersion?.id).toBe('q3');
    expect(api.getTree.mock.calls.map(([id]) => id)).toEqual(['q1', 'q2', 'q3', 'q3']);
  });
});
