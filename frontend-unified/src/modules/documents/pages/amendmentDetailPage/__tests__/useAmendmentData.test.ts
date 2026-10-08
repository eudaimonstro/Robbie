import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getAmendment: vi.fn(async () => ({ id: 'am-1', documentId: 'doc-1', changes: [] })),
  getDocument: vi.fn(async () => ({ id: 'doc-1', currentVersionId: 'v1' })),
  getTree: vi.fn(async () => []),
  addChange: vi.fn(async () => ({})),
}));
vi.mock('../../../../../api/client', () => ({
  amendments: { get: api.getAmendment, addChange: api.addChange },
  documents: { get: api.getDocument },
  versions: { getTree: api.getTree },
}));
const toast = vi.hoisted(() => ({ showToast: () => {} }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { getSectionLabel, useAmendmentData } = await import('../useAmendmentData');

describe('useAmendmentData', () => {
  it('refreshes after an action without going back to the loading state', async () => {
    const { result } = renderHook(() => useAmendmentData('am-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Hold the refresh open so the state during it can be seen
    let finish: (value: unknown) => void = () => {};
    api.getAmendment.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)) as never,
    );
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.addChange({ changeType: 'add' });
    });
    await waitFor(() => expect(api.getAmendment).toHaveBeenCalledTimes(2));

    // Loading swaps the whole page for a spinner, unmounting it and losing the scroll position
    expect(result.current.loading).toBe(false);
    await act(async () => {
      finish({ id: 'am-1', documentId: 'doc-1', changes: [] });
      await pending;
    });
  });

  it("tells a failed first load from an amendment that isn't there, without a toast", async () => {
    const showToast = vi.spyOn(toast, 'showToast');
    api.getAmendment.mockRejectedValueOnce(Object.assign(new Error('HTTP 500'), { status: 500 }));
    const failed = renderHook(() => useAmendmentData('am-1'));
    await waitFor(() => expect(failed.result.current.loading).toBe(false));
    expect(failed.result.current.loadError).toBe('failed');

    api.getAmendment.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
    const missing = renderHook(() => useAmendmentData('am-2'));
    await waitFor(() => expect(missing.result.current.loading).toBe(false));
    expect(missing.result.current.loadError).toBe('missing');
    expect(showToast).not.toHaveBeenCalled();

    // Try again
    await act(() => failed.result.current.fetchAmendment());
    expect(failed.result.current.loadError).toBeNull();
    expect(failed.result.current.amendment?.id).toBe('am-1');
  });
});

describe('getSectionLabel', () => {
  const tree = [
    { id: 's1', numberLabel: '1', title: 'Name', content: null, children: [] },
  ] as unknown as Parameters<typeof getSectionLabel>[0];

  it('names the section as the current version has it', () => {
    expect(getSectionLabel(tree, 's1', 'Section 1 "Old name"')).toBe('1 Name');
  });

  it('names a section the current version no longer has as it was named when adopted', () => {
    expect(getSectionLabel(tree, 'gone', 'Section 4.2 "Quorum"')).toBe('Section 4.2 "Quorum"');
    expect(getSectionLabel(tree, 'gone')).toBe('Unknown section');
  });
});
