import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ getDocument: vi.fn(), listVersions: vi.fn(), getTree: vi.fn() }));
vi.mock('../../../../api/client', () => ({
  documents: { get: api.getDocument },
  versions: { list: api.listVersions, getTree: api.getTree },
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({ organizations: [{ id: 'org-1', name: 'Maple Grove HOA' }] }),
}));

const { default: PrintDocumentPage } = await import('../PrintDocumentPage');

const v1 = { id: 'v1', versionNumber: 1, effectiveDate: '2024-03-15T00:00:00.000Z' };
const v2 = { id: 'v2', versionNumber: 2, effectiveDate: '2026-03-15T00:00:00.000Z' };
const tree = [
  {
    id: 's1',
    numberLabel: 'Article I',
    title: 'Name and Purpose',
    content: null,
    children: [
      {
        id: 's2',
        numberLabel: 'Section 1.1',
        title: 'Name',
        content: 'The name is Maple Grove.',
        children: [],
      },
    ],
  },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/documents/:documentId/print" element={<PrintDocumentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrintDocumentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDocument.mockResolvedValue({
      id: 'd1',
      organizationId: 'org-1',
      title: 'Bylaws of Maple Grove',
      currentVersionId: 'v2',
    });
    api.listVersions.mockResolvedValue([v2, v1]);
    api.getTree.mockResolvedValue(tree);
    vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  it('shows the current version ready to print, without opening the dialog', async () => {
    renderAt('/documents/d1/print');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bylaws of Maple Grove' }),
    ).toBeTruthy();
    expect(screen.getByText('Version 2, effective March 15, 2026')).toBeTruthy();
    expect(screen.getByText('The name is Maple Grove.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the document' }).getAttribute('href')).toBe(
      '/documents/d1',
    );
    expect(api.getTree).toHaveBeenCalledWith('v2');
    // A saved PDF takes the page's title as its name
    expect(document.title).toBe('Bylaws of Maple Grove, version 2');
    expect(window.print).not.toHaveBeenCalled();
  });

  it('shows the version asked for, and opens the print dialog with print=1', async () => {
    renderAt('/documents/d1/print?version=v1&print=1');
    expect(await screen.findByText('Version 1, effective March 15, 2024')).toBeTruthy();
    expect(api.getTree).toHaveBeenCalledWith('v1');
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('says when there is nothing to print', async () => {
    api.listVersions.mockResolvedValue([]);
    renderAt('/documents/d1/print');
    expect(await screen.findByText('This document has no version to print yet.')).toBeTruthy();
  });
});
