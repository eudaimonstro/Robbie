import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpError } from '../../../../../api/client';

const api = vi.hoisted(() => ({ createPacket: vi.fn(), updatePacket: vi.fn() }));
vi.mock('../api', () => api);
vi.mock('../PacketBuilder', () => ({ PacketBuilder: () => <p>Agenda builder</p> }));
vi.mock('../../QrCode', () => ({ QrCode: ({ label }: { label: string }) => <img alt={label} /> }));
const membersApi = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../api/client')>()),
  members: membersApi,
}));
vi.mock('../../../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 7, name: 'Pat Lindqvist', email: 'pat@maplegrove.example' } }),
}));
const bridge = vi.hoisted(() => {
  const maple = {
    id: 'org-1',
    name: 'Maple Grove HOA',
    slug: 'maple-grove-hoa',
    role: 'secretary',
  };
  const chess = { id: 'org-2', name: 'Chess Club', slug: 'chess-club', role: 'admin' };
  return {
    maple,
    chess,
    currentOrganization: null as null | typeof maple,
    availableOrganizations: [maple, chess],
  };
});
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

const people = {
  members: [
    { userId: 7, name: 'Pat Lindqvist', email: 'pat@maplegrove.example', role: 'owner' },
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', role: 'admin' },
    { userId: 9, name: 'Morgan Lee', email: 'morgan@maplegrove.example', role: 'viewer' },
  ],
};

/** Fill in the details once the presiding officers have loaded, and go on to the agenda */
async function schedule(
  props: { onBack?: () => void; onJoinMeeting?: (code: string) => void } = {},
) {
  const view = render(
    <MeetingScheduler
      onBack={props.onBack ?? vi.fn()}
      onJoinMeeting={props.onJoinMeeting ?? vi.fn()}
    />,
  );
  await screen.findByRole('option', { name: 'Dana Okafor' });
  fireEvent.change(screen.getByLabelText('Meeting title'), { target: { value: 'Annual Meeting' } });
  return view;
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next: build the agenda' }));

describe('MeetingScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.currentOrganization = bridge.maple;
    membersApi.list.mockResolvedValue(people);
    api.createPacket.mockImplementation(async (_org: string, data: { robbieCode: string }) =>
      packet(data.robbieCode),
    );
    api.updatePacket.mockResolvedValue(packet('ABC234'));
  });

  it('creates the meeting in the current organization, presided over by its scheduler', async () => {
    await schedule();
    next();
    expect(await screen.findByText('Agenda builder')).toBeTruthy();
    expect(api.createPacket).toHaveBeenCalledWith('org-1', {
      robbieCode: expect.stringMatching(/^[A-Z0-9]{6}$/),
      title: 'Annual Meeting',
      description: undefined,
      scheduledFor: undefined,
      chairUserId: 7,
    });
  });

  it('records where the meeting is held', async () => {
    await schedule();
    fireEvent.change(screen.getByLabelText('Place'), {
      target: { value: 'Maple Grove Clubhouse' },
    });
    next();
    await screen.findByText('Agenda builder');
    expect(api.createPacket).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ location: 'Maple Grove Clubhouse' }),
    );
  });

  it('clears a place or description emptied after Edit the details', async () => {
    await schedule();
    fireEvent.change(screen.getByLabelText('Place'), {
      target: { value: 'Maple Grove Clubhouse' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'The pool and the budget' },
    });
    next();
    await screen.findByText('Agenda builder');

    fireEvent.click(screen.getByRole('button', { name: /Edit the details/ }));
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: '  ' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } });
    next();
    await waitFor(() => expect(api.updatePacket).toHaveBeenCalled());
    expect(api.updatePacket).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ location: null, description: null }),
    );
  });

  it('leaves an empty place and description out of a new meeting', async () => {
    await schedule();
    next();
    await screen.findByText('Agenda builder');
    const [, data] = api.createPacket.mock.calls[0];
    expect(data.location).toBeUndefined();
    expect(data.description).toBeUndefined();
  });

  it('offers members and above to preside, and names who does', async () => {
    await schedule();
    expect(screen.queryByRole('option', { name: 'Morgan Lee' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Presiding officer'), { target: { value: '2' } });
    next();
    await screen.findByText('Agenda builder');
    expect(api.createPacket).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ chairUserId: 2 }),
    );
  });

  it('shows the join card, and lets the presiding officer start the meeting', async () => {
    const onJoinMeeting = vi.fn();
    await schedule({ onJoinMeeting });
    next();
    const code = (await screen.findByTestId('meeting-code')).textContent;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Start meeting' }));
    await waitFor(() => expect(onJoinMeeting).toHaveBeenCalledWith(code));
  });

  it('finishes with Done for someone who does not preside', async () => {
    const onBack = vi.fn();
    await schedule({ onBack });
    fireEvent.change(screen.getByLabelText('Presiding officer'), { target: { value: '2' } });
    next();
    await screen.findByText('Agenda builder');
    expect(screen.queryByRole('button', { name: 'Start meeting' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it('tries a fresh code when the generated one is taken', async () => {
    api.createPacket.mockRejectedValueOnce(
      new HttpError('That meeting code is already in use', 409),
    );
    await schedule();
    next();
    expect(await screen.findByText('Agenda builder')).toBeTruthy();
    expect(api.createPacket).toHaveBeenCalledTimes(2);
    const [first, second] = api.createPacket.mock.calls.map(([, data]) => data.robbieCode);
    expect(second).not.toBe(first);
  });

  it("stays in the packet's organization after a switch in the header", async () => {
    const { rerender } = await schedule();
    next();
    expect(await screen.findByText('Maple Grove HOA: step 2 of 2, the agenda')).toBeTruthy();

    bridge.currentOrganization = bridge.chess;
    rerender(<MeetingScheduler onBack={vi.fn()} onJoinMeeting={vi.fn()} />);

    expect(screen.getByText('Maple Grove HOA: step 2 of 2, the agenda')).toBeTruthy();
    expect(screen.getByText('Agenda builder')).toBeTruthy();
  });

  it("shows the server's message when the packet can't be created", async () => {
    api.createPacket.mockReset();
    api.createPacket.mockRejectedValueOnce(
      new HttpError('You need the secretary role for this', 403),
    );
    await schedule();
    next();
    expect(await screen.findByText('You need the secretary role for this')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Agenda builder')).toBeNull());
  });

  it('explains who schedules meetings to a role below secretary', () => {
    bridge.currentOrganization = { ...bridge.currentOrganization!, role: 'member' };
    render(<MeetingScheduler onBack={vi.fn()} onJoinMeeting={vi.fn()} />);
    expect(screen.getByText(/by its secretaries and admins/)).toBeTruthy();
    expect(screen.queryByLabelText('Meeting title')).toBeNull();
  });
});
