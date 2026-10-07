import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  listDocuments: vi.fn(async () => [
    { id: 'd1', title: 'Bylaws' },
    { id: 'd2', title: 'Standing Rules' },
  ]),
  listAmendments: vi.fn(async (docId: string) => [
    {
      id: `a-${docId}`,
      documentId: docId,
      title: `Change to ${docId}`,
      status: 'draft',
      createdAt: '2026-10-01T00:00:00Z',
    },
  ]),
}));
vi.mock('../../../../api/client', () => ({
  documents: { list: api.listDocuments },
  amendments: { list: api.listAmendments },
}));
const org = vi.hoisted(() => ({
  currentOrganization: { id: 'org-1', name: 'Org' } as { id: string; name: string } | null,
  organizations: [{ id: 'org-1', name: 'Org' }],
}));
vi.mock('../../../../context/OrganizationContext', () => ({ useOrganization: () => org }));
vi.mock('../../../../components/organizations/NoOrganizations', () => ({
  NoOrganizations: () => <p>No organizations yet</p>,
}));

const { default: AmendmentsPage } = await import('../AmendmentsPage');

describe('AmendmentsPage', () => {
  it('offers a way in to a user with no organization', async () => {
    org.currentOrganization = null;
    org.organizations = [];
    render(
      <MemoryRouter initialEntries={['/amendments']}>
        <Routes>
          <Route path="/amendments" element={<AmendmentsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('No organizations yet')).toBeTruthy();
    expect(screen.queryByText('No organization selected')).toBeNull();
    org.currentOrganization = { id: 'org-1', name: 'Org' };
    org.organizations = [org.currentOrganization];
  });

  it("drops one document's filter when moving to all amendments", async () => {
    render(
      <MemoryRouter initialEntries={['/documents/d1/amendments']}>
        <Link to="/amendments">all amendments</Link>
        <Routes>
          <Route path="/documents/:documentId/amendments" element={<AmendmentsPage />} />
          <Route path="/amendments" element={<AmendmentsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText('Amendments for Bylaws')).not.toBeNull());

    fireEvent.click(screen.getByText('all amendments'));

    await waitFor(() => expect(screen.queryByText('Change to d2')).not.toBeNull());
    expect(screen.queryByText('Amendments for Bylaws')).toBeNull();
  });
});
