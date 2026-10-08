import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';

// The user is an admin of Alpha, the organization selected in the header, and a viewer of Beta,
// which the opened records belong to (a bookmark, or a link from a meeting)
const alpha = { id: 'a', name: 'Alpha', slug: 'alpha', role: 'admin' };
const beta = { id: 'b', name: 'Beta', slug: 'beta', role: 'viewer' };
const api = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  listVersions: vi.fn(),
  getTree: vi.fn(async () => []),
  getAmendment: vi.fn(),
  listAmendments: vi.fn(async () => []),
}));
vi.mock('../../../../api/client', () => ({
  organizations: { list: api.listOrganizations },
  documents: { get: api.getDocument, list: api.listDocuments },
  versions: { list: api.listVersions, getTree: api.getTree },
  amendments: { get: api.getAmendment, list: api.listAmendments },
  sections: {},
}));
vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 1, email: 'ann@example.org', name: 'Ann' } }),
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { OrganizationProvider, useOrganization } =
  await import('../../../../context/OrganizationContext');
const { default: DocumentPage } = await import('../DocumentPage');
const { default: AmendmentDetailPage } = await import('../AmendmentDetailPage');

const document = {
  id: 'd1',
  organizationId: 'b',
  title: 'Beta Bylaws',
  docType: 'bylaws',
  currentVersionId: 'v1',
  createdAt: '2026-10-01T00:00:00Z',
};

/** The organization the header shows */
function Header() {
  const { currentOrganization } = useOrganization();
  return <p>Header: {currentOrganization?.name}</p>;
}

function renderAt(path: string, routePath: string, page: ReactNode) {
  render(
    <OrganizationProvider>
      <MemoryRouter initialEntries={[path]}>
        <Header />
        <Routes>
          <Route path={routePath} element={page} />
        </Routes>
      </MemoryRouter>
    </OrganizationProvider>,
  );
}

describe('a record of another organization than the header shows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.listOrganizations.mockResolvedValue([alpha, beta]);
    api.getDocument.mockResolvedValue(document);
    api.listDocuments.mockResolvedValue([document]);
    api.listVersions.mockResolvedValue([{ id: 'v1', versionNumber: 1, effectiveDate: null }]);
  });

  it("switches the document page to the document's organization and role", async () => {
    renderAt('/documents/d1', '/documents/:documentId', <DocumentPage />);
    expect(await screen.findByText('Header: Alpha')).toBeTruthy();

    expect(await screen.findByText('Header: Beta')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Beta' })).toBeTruthy();
    // A viewer of Beta, whatever they are in Alpha
    expect(screen.queryByRole('button', { name: /Propose Amendment/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Section/ })).toBeNull();
  });

  it("switches the amendment page to its document's organization and role", async () => {
    api.getAmendment.mockResolvedValue({
      id: 'am1',
      documentId: 'd1',
      title: 'Quorum change',
      description: null,
      status: 'proposed',
      proposedAt: '2026-10-02T00:00:00Z',
      decidedAt: null,
      resultingVersionId: null,
      createdById: 1,
      createdAt: '2026-10-01T00:00:00Z',
      changes: [],
    });
    renderAt('/amendments/am1', '/amendments/:amendmentId', <AmendmentDetailPage />);

    expect(await screen.findByText('Header: Beta')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Beta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mark Passed/ })).toBeNull();
  });

  it('leaves the selection alone when the user is not in the organization', async () => {
    api.listOrganizations.mockResolvedValue([alpha]);
    api.getDocument.mockRejectedValue(new Error('Document not found'));
    renderAt('/documents/d1', '/documents/:documentId', <DocumentPage />);

    expect(await screen.findByText('Document not found')).toBeTruthy();
    expect(screen.getByText('Header: Alpha')).toBeTruthy();
  });
});
