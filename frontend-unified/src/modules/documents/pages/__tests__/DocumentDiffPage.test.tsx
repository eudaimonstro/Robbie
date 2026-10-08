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

  function renderPage() {
    render(
      <MemoryRouter initialEntries={['/documents/doc-1/diff']}>
        <Routes>
          <Route path="/documents/:documentId/diff" element={<DocumentDiffPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('marks the words that changed in one paragraph, and counts the changes in words', async () => {
    api.diff.mockResolvedValueOnce({
      changes: [
        {
          type: 'modify',
          sectionId: 's42',
          oldNumberLabel: 'Section 4.2',
          newNumberLabel: 'Section 4.2',
          oldTitle: 'Quorum',
          newTitle: 'Quorum',
          oldContent: 'A quorum is twenty percent (20%) of the members.',
          newContent: 'A quorum is fifteen percent (15%) of the members.',
        },
      ],
    } as never);
    renderPage();

    expect(await screen.findByText(/^1 change from Version 2 to Version 3/)).toBeTruthy();
    const removed = document.querySelectorAll('del');
    const added = document.querySelectorAll('ins');
    expect([...removed].map((el) => el.textContent)).toEqual(['Removed: twenty', 'Removed: (20%)']);
    expect([...added].map((el) => el.textContent)).toEqual(['Added: fifteen', 'Added: (15%)']);
    expect(screen.getByLabelText('From')).toBeTruthy();
    expect(screen.getByLabelText('To')).toBeTruthy();
  });

  it("says when the versions couldn't load, rather than that the document isn't there", async () => {
    api.getDocument.mockRejectedValueOnce(Object.assign(new Error('HTTP 500'), { status: 500 }));
    renderPage();
    expect(await screen.findByText("Couldn't load the versions.")).toBeTruthy();
    expect(screen.queryByText('Document not found')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Version comparison' })).toBeTruthy();
  });
});
