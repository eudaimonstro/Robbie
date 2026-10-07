import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  listDocuments: vi.fn(async () => []),
  listMeetings: vi.fn(async () => []),
  listAmendments: vi.fn(async () => []),
}));
vi.mock('../../../../api/client', () => ({
  documents: { list: api.listDocuments },
  meetings: { list: api.listMeetings },
  amendments: { list: api.listAmendments },
}));
const orgState = vi.hoisted(() => ({
  rank: ['viewer', 'member', 'secretary', 'admin', 'owner'],
  currentOrganization: { id: 'o1', name: 'Maple Grove HOA', role: 'viewer' },
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

describe('HomePage', () => {
  beforeEach(() => {
    orgState.currentOrganization = { id: 'o1', name: 'Maple Grove HOA', role: 'viewer' };
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
});
