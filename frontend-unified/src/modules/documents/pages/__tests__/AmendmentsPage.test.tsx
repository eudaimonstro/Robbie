import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

const amendment = (docId: string, changes = 1) => ({
  id: `a-${docId}`,
  documentId: docId,
  title: `Change to ${docId}`,
  status: 'draft',
  description: null,
  proposedAt: null,
  // 03:30 UTC on Oct 9: still Oct 8 in Chicago, already Oct 9 in Paris
  createdAt: '2026-10-09T03:30:00Z',
  changes: Array.from({ length: changes }, (_, i) => ({ id: `c${i}` })),
});

const api = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  listAmendments: vi.fn(),
  listForOrganization: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({
  documents: { list: api.listDocuments },
  amendments: { list: api.listAmendments, listForOrganization: api.listForOrganization },
}));
const org = vi.hoisted(() => ({
  currentOrganization: { id: 'org-1', name: 'Org', timeZone: 'Europe/Paris' } as {
    id: string;
    name: string;
    timeZone?: string;
  } | null,
  organizations: [{ id: 'org-1', name: 'Org' }],
}));
vi.mock('../../../../context/OrganizationContext', () => ({ useOrganization: () => org }));
vi.mock('../../../../components/organizations/NoOrganizations', () => ({
  NoOrganizations: () => <p>No organizations yet</p>,
}));

const { default: AmendmentsPage } = await import('../AmendmentsPage');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Link to="/amendments">all amendments</Link>
      <Routes>
        <Route path="/documents/:documentId/amendments" element={<AmendmentsPage />} />
        <Route path="/amendments" element={<AmendmentsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AmendmentsPage', () => {
  beforeEach(() => {
    api.listDocuments.mockReset().mockResolvedValue([
      { id: 'd1', title: 'Bylaws' },
      { id: 'd2', title: 'Standing Rules' },
    ]);
    api.listAmendments.mockReset().mockImplementation(async (docId: string) => [amendment(docId)]);
    api.listForOrganization.mockReset().mockResolvedValue([amendment('d1', 2), amendment('d2', 1)]);
  });

  it('offers a way in to a user with no organization', async () => {
    org.currentOrganization = null;
    org.organizations = [];
    renderAt('/amendments');
    expect(await screen.findByText('No organizations yet')).toBeTruthy();
    expect(screen.queryByText('No organization selected')).toBeNull();
    org.currentOrganization = { id: 'org-1', name: 'Org', timeZone: 'Europe/Paris' };
    org.organizations = [org.currentOrganization];
  });

  it("drops one document's filter when moving to all amendments", async () => {
    renderAt('/documents/d1/amendments');
    await waitFor(() => expect(screen.queryByText('Amendments for Bylaws')).not.toBeNull());

    fireEvent.click(screen.getByText('all amendments'));

    await waitFor(() => expect(screen.queryByText('Change to d2')).not.toBeNull());
    expect(screen.queryByText('Amendments for Bylaws')).toBeNull();
  });

  it("lists every document's amendments in one request, counted and dated in the organization", async () => {
    renderAt('/amendments');
    expect(await screen.findByText('Change to d2')).toBeTruthy();
    expect(api.listForOrganization).toHaveBeenCalledWith('org-1');
    expect(api.listAmendments).not.toHaveBeenCalled();
    expect(screen.getByText('2 changes')).toBeTruthy();
    expect(screen.getByText('1 change')).toBeTruthy();
    expect(screen.getAllByText('Created Oct 9, 2026')).toHaveLength(2);
  });

  it('names its filters', async () => {
    renderAt('/amendments');
    await screen.findByText('Change to d2');
    expect(screen.getByRole('combobox', { name: 'Document' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeTruthy();
  });

  it("says the amendments couldn't load, not that there are none, and tries again", async () => {
    api.listForOrganization.mockRejectedValueOnce(new Error('HTTP 500'));
    renderAt('/amendments');
    expect(await screen.findByText("Couldn't load the amendments.")).toBeTruthy();
    expect(screen.queryByText('No amendments yet.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Change to d2')).toBeTruthy();
  });
});
