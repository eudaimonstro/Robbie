import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpError } from '../../../../../api/client';

const api = vi.hoisted(() => ({
  createPacket: vi.fn(),
  updatePacket: vi.fn(),
  getPacket: vi.fn(),
  deletePacket: vi.fn(),
}));
vi.mock('../api', () => api);
vi.mock('../PacketBuilder', () => {
  type Packet = { agendaItems: Array<{ title: string }>; attachments: object[] };
  return {
    PacketBuilder: ({
      packet,
      onPacketUpdate,
    }: {
      packet: Packet;
      onPacketUpdate: (update: (prev: Packet) => Packet) => void;
    }) => (
      <>
        <p data-items={packet.agendaItems.map((item) => item.title).join('|')}>Agenda builder</p>
        <button
          type="button"
          onClick={() =>
            onPacketUpdate((prev) => ({ ...prev, agendaItems: [...prev.agendaItems].reverse() }))
          }
        >
          Reverse the agenda
        </button>
        <button
          type="button"
          onClick={() =>
            onPacketUpdate((prev) => ({
              ...prev,
              attachments: [...prev.attachments, { id: 'a9' }],
            }))
          }
        >
          Attach a file
        </button>
      </>
    ),
  };
});
vi.mock('../../QrCode', () => ({ QrCode: ({ label }: { label: string }) => <img alt={label} /> }));
const membersApi = vi.hoisted(() => ({ list: vi.fn() }));
const meetingPackets = vi.hoisted(() => ({ reloadAgenda: vi.fn() }));
vi.mock('../../../../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../api/client')>()),
  members: membersApi,
  meetingPackets,
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
    // The server answers with what it saved
    api.createPacket.mockImplementation(async (_org: string, data: { robbieCode: string }) => ({
      ...packet(data.robbieCode),
      ...data,
    }));
    api.updatePacket.mockImplementation(async (_id: string, data: object) => ({
      ...packet('ABC234'),
      ...data,
    }));
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

  it('clears a date emptied after Edit the details, and trims the description', async () => {
    await schedule();
    fireEvent.change(screen.getByLabelText('Date and time'), {
      target: { value: '2026-11-03T19:00' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: '  The pool and the budget  ' },
    });
    next();
    await screen.findByText('Agenda builder');
    expect(api.createPacket).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        description: 'The pool and the budget',
        scheduledFor: new Date('2026-11-03T19:00').toISOString(),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit the details/ }));
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '   ' } });
    next();
    await waitFor(() => expect(api.updatePacket).toHaveBeenCalled());
    expect(api.updatePacket).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ scheduledFor: null, description: null }),
    );
  });

  it('asks for a title, and keeps the one saved when it is emptied', async () => {
    await schedule();
    fireEvent.change(screen.getByLabelText('Meeting title'), { target: { value: '  ' } });
    next();
    expect(screen.getByRole('alert').textContent).toBe('Give the meeting a title.');
    expect(screen.getByLabelText('Meeting title').getAttribute('aria-invalid')).toBe('true');
    expect(api.createPacket).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Meeting title'), {
      target: { value: 'Annual Meeting' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    next();
    await screen.findByText('Agenda builder');

    fireEvent.click(screen.getByRole('button', { name: /Edit the details/ }));
    fireEvent.change(screen.getByLabelText('Meeting title'), { target: { value: '' } });
    next();
    expect(screen.getByRole('alert').textContent).toBe('Give the meeting a title.');
    expect(api.updatePacket).not.toHaveBeenCalled();
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
    // The details were saved when the meeting was created: nothing is saved again
    expect(api.updatePacket).not.toHaveBeenCalled();
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

describe('MeetingScheduler, changing a scheduled meeting', () => {
  const scheduled = {
    id: 'p1',
    organizationId: 'org-1',
    robbieCode: 'MAPLE1',
    title: '2026 Annual Meeting',
    description: 'The pool and the budget',
    location: 'Maple Grove Clubhouse',
    scheduledFor: new Date('2026-10-20T19:00').toISOString(),
    chairUserId: 2,
    startedAt: null,
    endedAt: null,
    createdAt: '',
    attachments: [],
    agendaItems: [
      { id: 'i1', title: 'Call to order', position: 0, attachments: [] },
      { id: 'i2', title: "Treasurer's report", position: 1, attachments: [] },
    ],
  };

  function change(onBack = vi.fn()) {
    render(<MeetingScheduler meetingCode="MAPLE1" onBack={onBack} onJoinMeeting={vi.fn()} />);
    return onBack;
  }

  /** The details, loaded and with the presiding officers listed */
  async function loaded() {
    await screen.findByRole('option', { name: 'Dana Okafor' });
    await screen.findByDisplayValue('2026 Annual Meeting');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    bridge.currentOrganization = bridge.maple;
    membersApi.list.mockResolvedValue(people);
    api.getPacket.mockResolvedValue(scheduled);
    // The server's answer to a PUT leaves out the linked documents' titles
    api.updatePacket.mockImplementation(async (_id: string, data: object) => ({
      ...scheduled,
      ...data,
      agendaItems: [],
    }));
    meetingPackets.reloadAgenda.mockResolvedValue({ live: false });
  });

  it('opens with the details of the meeting filled in, its heading focused', async () => {
    change();
    await loaded();
    expect(api.getPacket).toHaveBeenCalledWith('MAPLE1');
    const heading = screen.getByRole('heading', { name: 'Change the meeting' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('MAPLE1')).toBeTruthy();
    expect((screen.getByLabelText('Date and time') as HTMLInputElement).value).toBe(
      '2026-10-20T19:00',
    );
    expect((screen.getByLabelText('Place') as HTMLInputElement).value).toBe(
      'Maple Grove Clubhouse',
    );
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
      'The pool and the budget',
    );
    expect((screen.getByLabelText('Presiding officer') as HTMLSelectElement).value).toBe('2');
    expect(api.createPacket).not.toHaveBeenCalled();
  });

  it('saves the changes, clears what was emptied, and keeps the agenda', async () => {
    change();
    await loaded();
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Pool house' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));

    expect((await screen.findByRole('status')).textContent).toBe('The details are saved.');
    // Only what changed: a chair handed over in the open meeting meanwhile stays
    expect(api.updatePacket).toHaveBeenCalledWith('p1', {
      description: null,
      location: 'Pool house',
      scheduledFor: null,
    });
    expect(screen.getByText('Agenda builder').dataset.items).toBe(
      "Call to order|Treasurer's report",
    );
    expect(screen.getByText('Pool house')).toBeTruthy();
  });

  it('keeps a meeting without a presiding officer without one', async () => {
    api.getPacket.mockResolvedValue({ ...scheduled, chairUserId: null });
    change();
    await loaded();
    expect((screen.getByLabelText('Presiding officer') as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Pool house' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    expect(api.updatePacket).toHaveBeenCalledWith('p1', { location: 'Pool house' });
  });

  it('saves nothing when the details are unchanged', async () => {
    change();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    expect(api.updatePacket).not.toHaveBeenCalled();
    expect(screen.queryByText('The details are saved.')).toBeNull();
  });

  it('sends the presiding officer only when it is changed', async () => {
    change();
    await loaded();
    fireEvent.change(screen.getByLabelText('Presiding officer'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    expect(api.updatePacket).toHaveBeenCalledWith('p1', { chairUserId: 7 });
  });

  it('keeps a presiding officer who can no longer preside, and says so', async () => {
    api.getPacket.mockResolvedValue({ ...scheduled, chairUserId: 9 });
    change();
    await loaded();
    const select = screen.getByLabelText('Presiding officer') as HTMLSelectElement;
    expect(await screen.findByRole('option', { name: 'Morgan Lee (can no longer preside)' })).toBe(
      select.selectedOptions[0],
    );
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Pool house' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    expect(api.updatePacket).toHaveBeenCalledWith('p1', { location: 'Pool house' });
  });

  it("shows the server's refusal and stays on the details", async () => {
    api.updatePacket.mockRejectedValueOnce(
      new HttpError(
        'The presiding officer must be a member of the organization with the member role or above',
        400,
      ),
    );
    change();
    await loaded();
    fireEvent.change(screen.getByLabelText('Presiding officer'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^The presiding officer must be a member/,
    );
    expect(screen.queryByText('Agenda builder')).toBeNull();
  });

  it("closes with Done, bringing an open meeting's agenda up to date", async () => {
    meetingPackets.reloadAgenda.mockResolvedValue({ live: true });
    const onBack = change();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    fireEvent.click(screen.getByRole('button', { name: 'Reverse the agenda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(onBack).toHaveBeenCalledWith(
        "2026 Annual Meeting is changed. The open meeting's agenda now matches.",
      ),
    );
    expect(meetingPackets.reloadAgenda).toHaveBeenCalledWith('MAPLE1');
  });

  it('says only that the meeting is changed when nobody has opened it', async () => {
    const onBack = change();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    fireEvent.click(screen.getByRole('button', { name: 'Reverse the agenda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onBack).toHaveBeenCalledWith('2026 Annual Meeting is changed.'));
    expect(meetingPackets.reloadAgenda).toHaveBeenCalledWith('MAPLE1');
  });

  it("leaves an open meeting's agenda alone when only the details changed", async () => {
    const onBack = change();
    await loaded();
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Pool house' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    fireEvent.click(screen.getByRole('button', { name: 'Attach a file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onBack).toHaveBeenCalledWith('2026 Annual Meeting is changed.'));
    expect(meetingPackets.reloadAgenda).not.toHaveBeenCalled();
  });

  it('leaves it alone when the agenda was changed and changed back', async () => {
    const onBack = change();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    fireEvent.click(screen.getByRole('button', { name: 'Reverse the agenda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reverse the agenda' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]);
    await waitFor(() => expect(onBack).toHaveBeenCalledWith('2026 Annual Meeting is changed.'));
    expect(meetingPackets.reloadAgenda).not.toHaveBeenCalled();
  });

  it("passes on the server's answer when the meeting was called to order meanwhile", async () => {
    meetingPackets.reloadAgenda.mockRejectedValue(
      new HttpError('The meeting has started; change the agenda in the meeting', 409),
    );
    const onBack = change();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    fireEvent.click(screen.getByRole('button', { name: 'Reverse the agenda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(onBack).toHaveBeenCalledWith(
        '2026 Annual Meeting is changed. The meeting has started; change the agenda in the meeting',
      ),
    );
  });

  it('does not start the meeting for its presiding officer', async () => {
    api.getPacket.mockResolvedValue({ ...scheduled, chairUserId: 7 });
    const onJoinMeeting = vi.fn();
    render(
      <MeetingScheduler meetingCode="MAPLE1" onBack={vi.fn()} onJoinMeeting={onJoinMeeting} />,
    );
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Next: the agenda' }));
    await screen.findByText('Agenda builder');
    expect(screen.queryByRole('button', { name: 'Start meeting' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('closes with Back and nothing to say when nothing was changed', async () => {
    const onBack = change();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledWith(undefined);
    expect(meetingPackets.reloadAgenda).not.toHaveBeenCalled();
  });

  it('cancels the meeting after asking', async () => {
    api.deletePacket.mockResolvedValue(undefined);
    const onBack = change();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the meeting' }));
    expect(
      screen.getByText('Cancel 2026 Annual Meeting? Its agenda and attached files are deleted.'),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('button', { name: 'Yes, cancel it' })).toBeNull();
    expect(api.deletePacket).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel the meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    await waitFor(() => expect(onBack).toHaveBeenCalledWith('2026 Annual Meeting is canceled.'));
    expect(api.deletePacket).toHaveBeenCalledWith('p1');
  });

  it("shows the server's message when the meeting can't be canceled", async () => {
    api.deletePacket.mockRejectedValue(
      new HttpError("A meeting that has been called to order can't be canceled", 409),
    );
    const onBack = change();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      "A meeting that has been called to order can't be canceled",
    );
    expect(onBack).not.toHaveBeenCalled();
  });

  it('offers no changes to a meeting already called to order', async () => {
    api.getPacket.mockResolvedValue({ ...scheduled, startedAt: '2026-10-21T00:05:00.000Z' });
    change();
    expect(
      await screen.findByText(
        '2026 Annual Meeting has been called to order. Its agenda is changed in the meeting.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Meeting title')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel the meeting' })).toBeNull();
  });

  it('says so when the meeting is no longer on the schedule', async () => {
    api.getPacket.mockResolvedValue(null);
    change();
    expect(await screen.findByText('This meeting is no longer on the schedule.')).toBeTruthy();
    expect(screen.queryByLabelText('Meeting title')).toBeNull();
  });
});
