import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  listDocuments: vi.fn(async (): Promise<unknown[]> => []),
  listSchedule: vi.fn(async (): Promise<unknown[]> => []),
  listForOrganization: vi.fn(async (): Promise<unknown[]> => []),
  listMembers: vi.fn(async (): Promise<unknown> => ({ members: [] })),
  createDocument: vi.fn(),
  updateOrganization: vi.fn(async () => ({})),
}));
vi.mock('../../../../api/client', () => ({
  documents: { list: api.listDocuments, create: api.createDocument },
  schedule: { list: api.listSchedule },
  amendments: { listForOrganization: api.listForOrganization },
  members: { list: api.listMembers },
  organizations: { update: api.updateOrganization },
}));
const orgState = vi.hoisted(() => ({
  rank: ['viewer', 'member', 'secretary', 'admin', 'owner'],
  currentOrganization: {
    id: 'o1',
    name: 'Maple Grove HOA',
    role: 'viewer',
    timeZone: 'America/Chicago' as string | undefined,
    eligibleVoters: 142 as number | null,
    quorumPercent: 20 as number | null,
    quorumCount: null as number | null,
  },
  refreshOrganizations: vi.fn(async () => {}),
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({
    currentOrganization: orgState.currentOrganization,
    organizations: [orgState.currentOrganization],
    loading: false,
    refreshOrganizations: orgState.refreshOrganizations,
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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/documents/:id/import" element={<p>Import page</p>} />
      </Routes>
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
      eligibleVoters: 142,
      quorumPercent: 20,
      quorumCount: null,
    };
    api.listMembers.mockReset().mockResolvedValue({ members: [] });
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

  it('has no way into the next meeting until the voting members and quorum are set', async () => {
    orgState.currentOrganization = {
      ...orgState.currentOrganization,
      role: 'admin',
      eligibleVoters: null,
      quorumPercent: null,
      quorumCount: 3,
    };
    api.listSchedule.mockResolvedValueOnce([annual]);
    renderHome();
    const next = await screen.findByRole('region', { name: 'Next meeting' });
    await within(next).findByText(/can.t open until the voting members and quorum are set/);
    expect(within(next).queryByRole('link', { name: 'Join 2026 Annual Meeting' })).toBeNull();
    expect(within(next).getByRole('link', { name: 'Set them in Settings' })).toBeTruthy();
  });

  it('gives a new organization four setup steps that tick themselves off', async () => {
    orgState.currentOrganization = {
      ...orgState.currentOrganization,
      role: 'owner',
      eligibleVoters: null,
      quorumPercent: null,
      quorumCount: null,
    };
    api.listMembers.mockResolvedValue({ members: [{ userId: 7 }], invites: [] });
    api.listDocuments.mockResolvedValue([
      // A bylaws document with no version yet: its import is the next step
      { id: 'd1', title: 'Bylaws', docType: 'bylaws', currentVersionId: null, createdAt: '' },
    ]);
    renderHome();
    const setup = await screen.findByRole('region', { name: 'Set up Maple Grove HOA' });
    const step = (name: string) => within(setup).getByText(name, { exact: false }).closest('li')!;
    expect(
      within(step('1. Voting members and quorum')).getByLabelText('Voting members'),
    ).toBeTruthy();
    expect(
      within(step('3. Members')).getByRole('link', { name: 'Add people' }).getAttribute('href'),
    ).toBe('/settings#members');
    expect(
      within(step('4. The first meeting')).getByRole('link', { name: 'Schedule a meeting' }),
    ).toBeTruthy();

    // The quorum, set right here
    fireEvent.change(within(setup).getByLabelText('Voting members'), { target: { value: '60' } });
    fireEvent.change(within(setup).getByLabelText('Quorum percentage'), {
      target: { value: '25' },
    });
    fireEvent.click(within(setup).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.updateOrganization).toHaveBeenCalledWith('o1', {
        eligibleVoters: 60,
        quorumPercent: 25,
      }),
    );
    expect(orgState.refreshOrganizations).toHaveBeenCalled();

    // The bylaws document waiting for its text: Import
    fireEvent.click(within(setup).getByRole('button', { name: 'Add the bylaws' }));
    expect(await screen.findByText('Import page')).toBeTruthy();
    expect(api.createDocument).not.toHaveBeenCalled();
  });

  it('creates the bylaws document for the bylaws step when there is none', async () => {
    orgState.currentOrganization = { ...orgState.currentOrganization, role: 'secretary' };
    api.createDocument.mockResolvedValueOnce({ id: 'd9' });
    renderHome();
    const setup = await screen.findByRole('region', { name: 'Set up Maple Grove HOA' });
    // Set up already: done, and a secretary isn't asked to do an admin's steps
    expect(within(setup).getAllByText('Done')).toHaveLength(1);
    expect(within(setup).getByText('An admin adds the owners in Settings.')).toBeTruthy();
    fireEvent.click(within(setup).getByRole('button', { name: 'Add the bylaws' }));
    expect(await screen.findByText('Import page')).toBeTruthy();
    expect(api.createDocument).toHaveBeenCalledWith('o1', { title: 'Bylaws', docType: 'bylaws' });
  });

  it('shows no setup steps once all four are done, nor to a member', async () => {
    orgState.currentOrganization = { ...orgState.currentOrganization, role: 'admin' };
    api.listMembers.mockResolvedValue({ members: [{ userId: 7 }, { userId: 8 }] });
    api.listDocuments.mockResolvedValue([
      { id: 'd1', title: 'Bylaws', docType: 'bylaws', currentVersionId: 'v1', createdAt: '' },
    ]);
    api.listSchedule.mockResolvedValue([annual]);
    renderHome();
    await screen.findByRole('link', { name: 'Join 2026 Annual Meeting' });
    await waitFor(() => expect(api.listMembers).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: /Set up/ })).toBeNull();
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
