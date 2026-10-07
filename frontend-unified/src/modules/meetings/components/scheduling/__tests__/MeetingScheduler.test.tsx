import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpError } from '../../../../../api/client';

const api = vi.hoisted(() => ({ createPacket: vi.fn(), updatePacket: vi.fn() }));
vi.mock('../api', () => api);
vi.mock('../PacketBuilder', () => ({ PacketBuilder: () => <p>Agenda builder</p> }));
const bridge = vi.hoisted(() => ({
  currentOrganization: null as null | { id: string; name: string; slug: string; role: string },
}));
vi.mock('../../../context/OrganizationBridge', () => ({ useMeetingOrganization: () => bridge }));

const { MeetingScheduler } = await import('../MeetingScheduler');

const packet = (robbieCode: string) => ({
  id: 'p1',
  organizationId: 'org-1',
  robbieCode,
  createdAt: '',
  attachments: [],
  agendaItems: [],
});

function schedule(title = 'Annual Meeting') {
  render(<MeetingScheduler onBack={vi.fn()} onJoinMeeting={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Meeting Title'), { target: { value: title } });
  fireEvent.click(screen.getByRole('button', { name: /Next: Build Agenda/ }));
}

describe('MeetingScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.currentOrganization = {
      id: 'org-1',
      name: 'Maple Grove HOA',
      slug: 'maple-grove-hoa',
      role: 'secretary',
    };
  });

  it('creates the meeting packet in the current organization', async () => {
    api.createPacket.mockImplementation(async (_org: string, data: { robbieCode: string }) =>
      packet(data.robbieCode),
    );
    schedule();
    expect(await screen.findByText('Agenda builder')).toBeTruthy();
    expect(api.createPacket).toHaveBeenCalledWith('org-1', {
      robbieCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
      title: 'Annual Meeting',
      description: undefined,
      scheduledFor: undefined,
    });
  });

  it('tries a fresh code when the generated one is taken', async () => {
    api.createPacket
      .mockRejectedValueOnce(new HttpError('That meeting code is already in use', 409))
      .mockImplementation(async (_org: string, data: { robbieCode: string }) =>
        packet(data.robbieCode),
      );
    schedule();
    expect(await screen.findByText('Agenda builder')).toBeTruthy();
    expect(api.createPacket).toHaveBeenCalledTimes(2);
    const [first, second] = api.createPacket.mock.calls.map(([, data]) => data.robbieCode);
    expect(second).not.toBe(first);
  });

  it("shows the server's message when the packet can't be created", async () => {
    api.createPacket.mockRejectedValueOnce(
      new HttpError('You need the secretary role for this', 403),
    );
    schedule();
    expect(await screen.findByText('You need the secretary role for this')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Agenda builder')).toBeNull());
  });

  it('explains who schedules meetings to a role below secretary', () => {
    bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'member' };
    render(<MeetingScheduler onBack={vi.fn()} onJoinMeeting={vi.fn()} />);
    expect(screen.getByText(/by its secretaries and admins/)).toBeTruthy();
    expect(screen.queryByLabelText('Meeting Title')).toBeNull();
  });
});
