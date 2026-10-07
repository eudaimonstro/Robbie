import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MinutesSummary } from '../../../../api/client';

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../api/client', () => ({ minutes: { list: api.list } }));
const org = vi.hoisted(() => ({
  currentOrganization: { id: 'org-1', name: 'Maple Grove HOA' } as {
    id: string;
    name: string;
    timeZone?: string;
  } | null,
  isSecretary: true,
}));
vi.mock('../../../../context/OrganizationContext', () => ({
  useOrganization: () => ({ currentOrganization: org.currentOrganization }),
  useCan: () => org.isSecretary,
}));

const { default: MinutesListPage } = await import('../MinutesListPage');

function summary(overrides: Partial<MinutesSummary> & Pick<MinutesSummary, 'id'>): MinutesSummary {
  return {
    status: 'draft',
    generatedAt: '2026-10-21T02:00:00.000Z',
    updatedAt: '2026-10-21T02:00:00.000Z',
    publishedAt: null,
    approvedAt: null,
    packet: { id: 'p1', robbieCode: 'MAPLE1', title: '2026 Annual Meeting', scheduledFor: null },
    ...overrides,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <MinutesListPage />
    </MemoryRouter>,
  );

describe('MinutesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.currentOrganization = { id: 'org-1', name: 'Maple Grove HOA' };
    org.isSecretary = true;
  });

  it("lists the organization's minutes with their meetings and status", async () => {
    api.list.mockResolvedValue([
      summary({
        id: 'm2',
        packet: {
          id: 'p2',
          robbieCode: 'MAPLE1',
          title: '2026 Annual Meeting',
          scheduledFor: '2026-10-21T00:00:00.000Z',
        },
      }),
      summary({
        id: 'm1',
        status: 'approved',
        packet: {
          id: 'p1',
          robbieCode: 'MAPLE25',
          title: '2025 Annual Meeting',
          scheduledFor: null,
        },
      }),
    ]);
    renderPage();

    const latest = await screen.findByRole('link', { name: /2026 Annual Meeting/ });
    expect(latest.getAttribute('href')).toBe('/minutes/m2');
    expect(latest.textContent).toContain('Draft');
    // ICU may put a narrow no-break space before PM
    expect(latest.textContent).toMatch(/Tue, Oct 20, 2026, 7:00\sPM/);
    const last = screen.getByRole('link', { name: /2025 Annual Meeting/ });
    expect(last.getAttribute('href')).toBe('/minutes/m1');
    expect(last.textContent).toContain('Approved');
    expect(last.textContent).toContain('No date');
    expect(api.list).toHaveBeenCalledWith('org-1');
  });

  it("gives each meeting's time in the organization's time zone, not the browser's", async () => {
    org.currentOrganization = {
      id: 'org-1',
      name: 'Maple Grove HOA',
      timeZone: 'America/New_York',
    };
    api.list.mockResolvedValue([
      summary({
        id: 'm2',
        packet: {
          id: 'p2',
          robbieCode: 'MAPLE1',
          title: '2026 Annual Meeting',
          scheduledFor: '2026-10-21T00:00:00.000Z',
        },
      }),
    ]);
    renderPage();
    const latest = await screen.findByRole('link', { name: /2026 Annual Meeting/ });
    expect(latest.textContent).toMatch(/Tue, Oct 20, 2026, 8:00\sPM/);
  });

  it('tries again for the next organization after a list fails to load', async () => {
    api.list.mockRejectedValueOnce(new Error('Failed to fetch'));
    api.list.mockResolvedValueOnce([summary({ id: 'm9' })]);
    const view = renderPage();
    expect(await screen.findByText("Couldn't load the minutes.")).toBeTruthy();

    org.currentOrganization = { id: 'org-2', name: 'Oak Hollow HOA' };
    await act(async () => {
      view.rerender(
        <MemoryRouter>
          <MinutesListPage />
        </MemoryRouter>,
      );
    });
    expect(await screen.findByRole('link', { name: /2026 Annual Meeting/ })).toBeTruthy();
    expect(screen.queryByText("Couldn't load the minutes.")).toBeNull();
    expect(api.list).toHaveBeenLastCalledWith('org-2');
  });

  it('says when there are none yet', async () => {
    api.list.mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByText('No minutes yet. Robbie drafts them when a meeting adjourns.'),
    ).toBeTruthy();
  });

  it('tells a member what they will find', async () => {
    org.isSecretary = false;
    api.list.mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByText('The minutes of your meetings, once the secretary publishes them.'),
    ).toBeTruthy();
  });

  it('asks for an organization first', () => {
    org.currentOrganization = null;
    renderPage();
    expect(screen.getByText('Choose an organization to see its minutes.')).toBeTruthy();
    expect(api.list).not.toHaveBeenCalled();
  });
});
