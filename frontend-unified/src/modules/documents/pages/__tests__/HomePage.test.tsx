import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  listDocuments: vi.fn(async () => []),
  listSchedule: vi.fn(async (): Promise<unknown[]> => []),
  listAmendments: vi.fn(async () => []),
}));
vi.mock('../../../../api/client', () => ({
  documents: { list: api.listDocuments },
  schedule: { list: api.listSchedule },
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

  it('lists the upcoming meetings from the schedule, linked to their live meeting', async () => {
    api.listSchedule.mockResolvedValueOnce([
      {
        id: 'p1',
        robbieCode: 'MAPLE1',
        title: '2026 Annual Meeting',
        description: null,
        scheduledFor: '2026-10-21T00:00:00.000Z',
        chairUserId: 2,
        startedAt: null,
        endedAt: null,
        chair: { name: 'Dana Okafor' },
      },
      {
        id: 'p0',
        robbieCode: 'MAPLE0',
        title: '2025 Annual Meeting',
        description: null,
        scheduledFor: '2025-03-21T00:00:00.000Z',
        chairUserId: 2,
        startedAt: '2025-03-21T00:05:00.000Z',
        endedAt: '2025-03-21T01:30:00.000Z',
        chair: { name: 'Dana Okafor' },
      },
    ]);
    renderHome();

    const link = await screen.findByRole('link', { name: /2026 Annual Meeting/ });
    expect(link.getAttribute('href')).toBe('/meetings/MAPLE1');
    expect(screen.queryByText('2025 Annual Meeting')).toBeNull();
    expect(api.listSchedule).toHaveBeenCalledWith('o1');
  });
});
