import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ScheduledMeeting } from '../../../../api/client';

const schedule = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../api/client', () => ({ schedule }));
vi.mock('../../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example' } }),
}));
const bridge = vi.hoisted(() => ({
  currentOrganization: null as null | { id: string; name: string; slug: string; role: string },
}));
vi.mock('../../context/OrganizationBridge', () => ({ useMeetingOrganization: () => bridge }));
vi.mock('../../components/scheduling', () => ({
  MeetingScheduler: ({
    onBack,
    meetingCode,
  }: {
    onBack: (status?: string) => void;
    meetingCode?: string;
  }) => (
    <div>
      <p>{meetingCode ? `Changing ${meetingCode}` : 'Scheduler'}</p>
      <button onClick={() => onBack()}>Done scheduling</button>
      <button onClick={() => onBack('2026 Annual Meeting is changed.')}>Done changing</button>
    </div>
  ),
}));

const { LiveMeetingsPage } = await import('../LiveMeetingsPage');

const meeting = (overrides: Partial<ScheduledMeeting> = {}): ScheduledMeeting => ({
  id: 'p1',
  robbieCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  description: null,
  location: null,
  scheduledFor: '2026-10-21T00:00:00.000Z',
  chairUserId: 2,
  startedAt: null,
  endedAt: null,
  chair: { name: 'Dana Okafor' },
  ...overrides,
});

function renderPage() {
  render(
    <MemoryRouter>
      <LiveMeetingsPage />
    </MemoryRouter>,
  );
}

describe('LiveMeetingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.currentOrganization = {
      id: 'org-1',
      name: 'Maple Grove HOA',
      slug: 'maple-grove-hoa',
      role: 'member',
    };
  });

  it("lists the organization's schedule: Start for the presiding officer, Join for others", async () => {
    schedule.list.mockResolvedValueOnce([
      meeting(),
      meeting({
        id: 'p2',
        robbieCode: 'BOARD1',
        title: 'Board meeting',
        scheduledFor: null,
        chairUserId: 9,
        chair: { name: 'Pat Lindqvist' },
      }),
    ]);
    renderPage();

    const start = await screen.findByRole('link', { name: 'Start 2026 Annual Meeting' });
    expect(start.getAttribute('href')).toBe('/meetings/MAPLE1');
    expect(screen.getByRole('link', { name: 'Join Board meeting' }).getAttribute('href')).toBe(
      '/meetings/BOARD1',
    );
    expect(screen.getByText(/^Tue, Oct 20, 7:00\sPM$/)).toBeTruthy();
    expect(screen.getByText('No date set')).toBeTruthy();
    expect(screen.getByText(', Pat Lindqvist presiding')).toBeTruthy();
    expect(schedule.list).toHaveBeenCalledWith('org-1');
  });

  it('lets the presiding officer join a meeting in session, and lists held meetings apart', async () => {
    schedule.list.mockResolvedValueOnce([
      meeting({ startedAt: '2026-10-21T00:05:00.000Z' }),
      meeting({
        id: 'p0',
        robbieCode: 'MAPLE0',
        title: '2025 Annual Meeting',
        startedAt: '2025-03-21T00:05:00.000Z',
        endedAt: '2025-03-21T01:30:00.000Z',
      }),
    ]);
    renderPage();

    expect(await screen.findByRole('link', { name: 'Join 2026 Annual Meeting' })).toBeTruthy();
    expect(screen.getByText('In session')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Held' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open 2025 Annual Meeting' })).toBeTruthy();
  });

  it('offers scheduling to a secretary, and not to a member', async () => {
    schedule.list.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No meetings scheduled.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Schedule a meeting' })).toBeNull();

    bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule a meeting' }));
    expect(screen.getByText('Scheduler')).toBeTruthy();
  });

  it('shows only the code box without an organization', () => {
    bridge.currentOrganization = null;
    renderPage();
    expect(screen.getByLabelText('Meeting code')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Schedule' })).toBeNull();
    expect(schedule.list).not.toHaveBeenCalled();
  });

  it("says so when the schedule can't be loaded", async () => {
    schedule.list.mockRejectedValueOnce(new Error('Failed to list meeting packets'));
    renderPage();
    expect(await screen.findByText('Failed to list meeting packets')).toBeTruthy();
  });

  it('lists a meeting just scheduled when the scheduler closes', async () => {
    bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
    schedule.list.mockResolvedValueOnce([]).mockResolvedValueOnce([meeting()]);
    renderPage();
    expect(await screen.findByText('No meetings scheduled.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Schedule a meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done scheduling' }));
    expect(await screen.findByRole('link', { name: 'Start 2026 Annual Meeting' })).toBeTruthy();
    expect(schedule.list).toHaveBeenCalledTimes(2);
  });

  describe('Change', () => {
    const schedule3 = () => [
      meeting(),
      meeting({
        id: 'p2',
        robbieCode: 'BOARD1',
        title: 'Board meeting',
        startedAt: '2026-10-07T00:05:00.000Z',
      }),
      meeting({
        id: 'p0',
        robbieCode: 'MAPLE0',
        title: '2025 Annual Meeting',
        startedAt: '2025-03-21T00:05:00.000Z',
        endedAt: '2025-03-21T01:30:00.000Z',
      }),
    ];

    it('is offered to a secretary for meetings not yet called to order only', async () => {
      bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
      schedule.list.mockResolvedValueOnce(schedule3());
      renderPage();
      expect(
        await screen.findByRole('button', { name: 'Change 2026 Annual Meeting' }),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Change Board meeting' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Change 2025 Annual Meeting' })).toBeNull();
    });

    it('is offered to admins and owners, and not to members or viewers', async () => {
      for (const [role, offered] of [
        ['viewer', false],
        ['member', false],
        ['admin', true],
        ['owner', true],
      ] as const) {
        bridge.currentOrganization = { ...bridge.currentOrganization!, role };
        schedule.list.mockResolvedValueOnce([meeting()]);
        const { unmount } = render(
          <MemoryRouter>
            <LiveMeetingsPage />
          </MemoryRouter>,
        );
        await screen.findByText('2026 Annual Meeting');
        expect(
          screen.queryByRole('button', { name: 'Change 2026 Annual Meeting' }) !== null,
          role,
        ).toBe(offered);
        unmount();
      }
    });

    it('opens the scheduler for the meeting, and says what changed when it closes', async () => {
      bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
      schedule.list
        .mockResolvedValueOnce([meeting()])
        .mockResolvedValueOnce([meeting({ location: 'Pool house' })]);
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Change 2026 Annual Meeting' }));
      expect(screen.getByText('Changing MAPLE1')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Done changing' }));
      expect((await screen.findByRole('status')).textContent).toBe(
        '2026 Annual Meeting is changed.',
      );
      expect(
        await screen.findByRole('button', { name: 'Change 2026 Annual Meeting' }),
      ).toBeTruthy();
      expect(schedule.list).toHaveBeenCalledTimes(2);
    });

    it('says nothing when the scheduler closes without a change', async () => {
      bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
      schedule.list.mockResolvedValue([meeting()]);
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Change 2026 Annual Meeting' }));
      fireEvent.click(screen.getByRole('button', { name: 'Done scheduling' }));
      expect(
        await screen.findByRole('button', { name: 'Change 2026 Annual Meeting' }),
      ).toBeTruthy();
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
