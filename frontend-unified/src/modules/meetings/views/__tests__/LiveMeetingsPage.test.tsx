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
  currentOrganization: null as null | {
    id: string;
    name: string;
    slug: string;
    role: string;
    timeZone?: string;
    eligibleVoters?: number | null;
    quorumPercent?: number | null;
    quorumCount?: number | null;
  },
}));
vi.mock('../../context/OrganizationBridge', () => ({ useMeetingOrganization: () => bridge }));
vi.mock('../../components/scheduling/SendNoticeDialog', () => ({
  SendNoticeDialog: ({ code, onSent }: { code: string; onSent: (message: string) => void }) => (
    <div>
      <p>{`Notice of ${code}`}</p>
      <button onClick={() => onSent('The notice was sent to 142 people.')}>Send it</button>
    </div>
  ),
}));
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
      eligibleVoters: 142,
      quorumPercent: 20,
      quorumCount: null,
    };
  });

  it('has no way into a meeting until the voting members and quorum are set, and says so', async () => {
    // The old default: 3 people, and no voting members
    bridge.currentOrganization = {
      ...bridge.currentOrganization!,
      role: 'admin',
      eligibleVoters: null,
      quorumPercent: null,
      quorumCount: 3,
    };
    schedule.list.mockResolvedValueOnce([
      meeting(),
      // Opened on the console, not yet called to order: it has its live state, so it opens
      meeting({ id: 'p3', robbieCode: 'OPEN01', title: 'Special meeting', open: true }),
      // Called to order before: it has its live state, so it opens
      meeting({
        id: 'p2',
        robbieCode: 'BOARD1',
        title: 'Board meeting',
        startedAt: '2026-10-21T00:05:00.000Z',
      }),
    ]);
    renderPage();
    expect(
      await screen.findByText(
        /This meeting can.t open until the voting members and quorum are set/,
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Start 2026 Annual Meeting' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Set them in Settings' }).getAttribute('href')).toBe(
      '/settings#attendance',
    );
    expect(screen.getByRole('link', { name: 'Join Board meeting' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start Special meeting' })).toBeTruthy();
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

  it("says so when the schedule can't be loaded, in words, and tries again", async () => {
    schedule.list.mockRejectedValueOnce(new Error('Failed to list meeting packets'));
    renderPage();
    expect(await screen.findByText("Couldn't load the schedule.")).toBeTruthy();
    expect(screen.queryByText('Failed to list meeting packets')).toBeNull();

    schedule.list.mockResolvedValueOnce([meeting({ chairUserId: 9 })]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Join 2026 Annual Meeting' })).toBeTruthy();
  });

  it("gives each meeting's time in the organization's time zone", async () => {
    bridge.currentOrganization = { ...bridge.currentOrganization!, timeZone: 'Europe/Paris' };
    schedule.list.mockResolvedValueOnce([meeting()]);
    renderPage();
    // 7 PM in Chicago, where the tests run, is 2 AM the next day in Paris
    expect(await screen.findByText(/^Wed, Oct 21, 2:00\sAM$/)).toBeTruthy();
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
      const status = await screen.findByRole('status');
      expect(status.textContent).toBe('2026 Annual Meeting is changed.');
      // The focus goes to what happened, not to the top of the page
      expect(document.activeElement).toBe(status);
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
      const change = await screen.findByRole('button', { name: 'Change 2026 Annual Meeting' });
      // Back where it was opened from
      expect(document.activeElement).toBe(change);
      // The status is always there for a screen reader, with nothing in it
      expect(screen.getByRole('status').textContent).toBe('');
    });

    it('goes back to Schedule a meeting when the scheduler closes without a meeting', async () => {
      bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
      schedule.list.mockResolvedValue([]);
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Schedule a meeting' }));
      fireEvent.click(screen.getByRole('button', { name: 'Done scheduling' }));
      expect(document.activeElement).toBe(
        await screen.findByRole('button', { name: 'Schedule a meeting' }),
      );
    });
  });

  it('marks a board meeting, and lets a secretary send the notice of one not yet held', async () => {
    bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'secretary' };
    schedule.list.mockResolvedValue([
      meeting({
        id: 'p9',
        robbieCode: 'MAPLEB',
        title: 'November board meeting',
        kind: 'board',
        noticeSentAt: '2026-10-08T15:00:00.000Z',
      }),
      meeting({ startedAt: '2026-10-21T00:05:00.000Z' }),
    ]);
    renderPage();
    expect(await screen.findByText('Board meeting')).toBeTruthy();
    expect(screen.getByText(/^Notice sent Oct 8, 2026/)).toBeTruthy();
    // Called to order: its notice has gone by
    expect(
      screen.queryByRole('button', { name: 'Send the notice of 2026 Annual Meeting' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Send the notice of November board meeting' }),
    );
    expect(screen.getByText('Notice of MAPLEB')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send it' }));
    expect(await screen.findByText('The notice was sent to 142 people.')).toBeTruthy();
    expect(screen.queryByText('Notice of MAPLEB')).toBeNull();
  });

  it('offers no notice to members', async () => {
    schedule.list.mockResolvedValue([meeting()]);
    renderPage();
    await screen.findByText('2026 Annual Meeting');
    expect(screen.queryByRole('button', { name: /Send the notice/ })).toBeNull();
  });
});
