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

const { useAmendmentData } = await import('../useAmendmentData');

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
});
