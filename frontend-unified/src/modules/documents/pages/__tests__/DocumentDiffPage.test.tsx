import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getDocument: vi.fn(async () => ({ id: 'doc-1', title: 'Bylaws', currentVersionId: 'v3' })),
  // The API lists versions newest first
  listVersions: vi.fn(async () => [
    { id: 'v3', versionNumber: 3 },
    { id: 'v2', versionNumber: 2 },
    { id: 'v1', versionNumber: 1 },
  ]),
  diff: vi.fn(async () => ({ changes: [] })),
}));

vi.mock('../../../../api/client', () => ({
  documents: { get: api.getDocument },
  versions: { list: api.listVersions, diff: api.diff },
}));
// Stable across renders, as the real context's showToast is
const toast = vi.hoisted(() => ({ showToast: () => {} }));
vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => toast,
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({ currentOrganization: null }),
}));

const { default: DocumentDiffPage } = await import('../DocumentDiffPage');

describe('DocumentDiffPage', () => {
  it('compares the two newest versions by default, older on the left', async () => {
    render(
      <MemoryRouter initialEntries={['/documents/doc-1/diff']}>
        <Routes>
          <Route path="/documents/:documentId/diff" element={<DocumentDiffPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(api.diff).toHaveBeenCalled());
    expect(api.diff).toHaveBeenCalledWith('v2', 'v3');
  });

  it('changes the comparison without reloading the page', async () => {
    api.getDocument.mockClear();
    api.diff.mockClear();
    render(
      <MemoryRouter initialEntries={['/documents/doc-1/diff']}>
        <Routes>
          <Route path="/documents/:documentId/diff" element={<DocumentDiffPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.diff).toHaveBeenCalledWith('v2', 'v3'));

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'v1' } });

    await waitFor(() => expect(api.diff).toHaveBeenLastCalledWith('v1', 'v3'));
    // Choosing a version used to reload the document behind a full-page spinner
    expect(api.getDocument).toHaveBeenCalledTimes(1);
  });
});
