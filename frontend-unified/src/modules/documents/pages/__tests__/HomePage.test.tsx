import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  listDocuments: vi.fn(async (): Promise<unknown[]> => []),
  listSchedule: vi.fn(async (): Promise<unknown[]> => []),
  listForOrganization: vi.fn(async (): Promise<unknown[]> => []),
}));
vi.mock('../../../../api/client', () => ({
  documents: { list: api.listDocuments },
  schedule: { list: api.listSchedule },
  amendments: { listForOrganization: api.listForOrganization },
}));
const orgState = vi.hoisted(() => ({
  rank: ['viewer', 'member', 'secretary', 'admin', 'owner'],
  currentOrganization: {
    id: 'o1',
    name: 'Maple Grove HOA',
    role: 'viewer',
    timeZone: 'America/Chicago' as string | undefined,
  },
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({
    currentOrganization: orgState.currentOrganization,
    organizations: [orgState.currentOrganization],
    loading: false,
  }),
  useCan: (min: string) =>
    orgState.rank.indexOf(orgState.currentOrganization.role) >= orgState.rank.indexOf(min),
}));
vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 7, name: 'Alice Brennan' } }),
}));
vi.mock('../../../../components/organizations/NoOrganizations', () => ({
  NoOrganizations: () => <p>No organizations yet</p>,
}));

const { default: HomePage } = await import('../HomePage');

function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

const annual = {
  id: 'p1',
  robbieCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  description: null,
  location: 'the clubhouse',
  scheduledFor: '2026-10-21T00:00:00.000Z',
  chairUserId: 2,
  startedAt: null,
  endedAt: null,
  chair: { name: 'Dana Okafor' },
};

describe('HomePage', () => {
  beforeEach(() => {
    orgState.currentOrganization = {
      id: 'o1',
      name: 'Maple Grove HOA',
      role: 'viewer',
      timeZone: 'America/Chicago',
    };
    api.listDocuments.mockReset().mockResolvedValue([]);
    api.listSchedule.mockReset().mockResolvedValue([]);
    api.listForOrganization.mockReset().mockResolvedValue([]);
  });

  it('does not ask a viewer to create the first document', async () => {
    renderHome();
    expect(await screen.findByText('No documents yet.')).toBeTruthy();
    expect(screen.queryByText(/Create your first document/)).toBeNull();
  });

  it('asks a secretary to create the first document', async () => {
    orgState.currentOrganization = { ...orgState.currentOrganization, role: 'secretary' };
    renderHome();
    expect(await screen.findByText(/Create your first document/)).toBeTruthy();
  });

  it('puts the next meeting first: its time in the organization, its place and Join', async () => {
    api.listDocuments.mockResolvedValue([
      { id: 'd1', title: 'Bylaws', docType: 'bylaws', createdAt: '2026-03-01T00:00:00Z' },
    ]);
    api.listSchedule.mockResolvedValueOnce([
      annual,
      {
        ...annual,
        id: 'p0',
        robbieCode: 'MAPLE0',
        title: '2025 Annual Meeting',
        startedAt: '2025-03-21T00:05:00.000Z',
        endedAt: '2025-03-21T01:30:00.000Z',
      },
    ]);
    // Paris: the meeting is at 2 AM there, while the viewer's clock (Chicago) says 7 PM
    orgState.currentOrganization = { ...orgState.currentOrganization, timeZone: 'Europe/Paris' };
    renderHome();

    const join = await screen.findByRole('link', { name: 'Join 2026 Annual Meeting' });
    expect(join.getAttribute('href')).toBe('/meetings/MAPLE1');
    const next = screen.getByRole('region', { name: 'Next meeting' });
    expect(next.textContent).toMatch(/Wed, Oct 21, 2:00\sAM/);
    expect(next.textContent).toContain('the clubhouse');
    expect(screen.queryByText('2025 Annual Meeting')).toBeNull();
    expect(api.listSchedule).toHaveBeenCalledWith('o1');

    // Before the documents, in the page's order (a phone shows it first)
    const documents = await screen.findByRole('region', { name: 'Documents' });
    expect(next.compareDocumentPosition(documents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('asks the organization for its pending amendments in one request', async () => {
    api.listForOrganization.mockResolvedValueOnce([
      { id: 'a1', title: 'Lower the quorum', status: 'draft', description: null },
    ]);
    renderHome();
    expect(await screen.findByRole('link', { name: /Lower the quorum/ })).toBeTruthy();
    expect(api.listForOrganization).toHaveBeenCalledWith('o1', ['draft', 'proposed']);
  });

  it("says when something couldn't load, instead of showing it empty, and tries again", async () => {
    api.listDocuments.mockRejectedValueOnce(new Error('HTTP 500'));
    api.listForOrganization.mockRejectedValueOnce(new Error('HTTP 500'));
    api.listSchedule.mockRejectedValueOnce(new Error('HTTP 500'));
    renderHome();

    expect(await screen.findByText("Couldn't load the documents.")).toBeTruthy();
    expect(screen.getByText("Couldn't load the amendments.")).toBeTruthy();
    expect(screen.getByText("Couldn't load the schedule.")).toBeTruthy();
    expect(screen.queryByText('No documents yet.')).toBeNull();
    expect(screen.queryByText('No pending amendments.')).toBeNull();
    expect(screen.queryByText('No meeting is scheduled.')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);
    expect(await screen.findByText('No documents yet.')).toBeTruthy();
    expect(screen.getByText('No pending amendments.')).toBeTruthy();
    expect(screen.getByText('No meeting is scheduled.')).toBeTruthy();
  });
});
