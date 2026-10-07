import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';

const api = vi.hoisted(() => ({ meetingPackets: { reloadAgenda: vi.fn() } }));
vi.mock('../../../../../api/client', () => api);
vi.mock('../../chair', () => ({
  ProxyManagementPanel: () => <p>Proxies</p>,
  OrderOfBusinessPanel: () => <p>Order of business</p>,
  MinutesApprovalPanel: () => null,
  CommitteeReportsPanel: () => null,
  MeetingDocumentsPanel: () => <p>Documents</p>,
}));
vi.mock('../../BylawyerLinkPanel', () => ({ BylawyerLinkPanel: () => <p>Bylaws link</p> }));

const { MoreArea } = await import('../MoreArea');

const dana: Member = { id: 2, name: 'Dana Okafor', role: 'chair', present: true };
const pat: Member = { id: 1, name: 'Pat Lindqvist', role: 'admin', present: true };
const alice: Member = {
  id: 3,
  name: 'Alice Brennan',
  role: 'member',
  present: true,
  presentBy: 'device',
};
const carmen: Member = {
  id: 5,
  name: 'Carmen Diaz',
  role: 'member',
  present: true,
  presentBy: 'chair',
};
const sam: Member = { id: 11, name: 'Sam Ortiz', role: 'guest', present: true };
const state: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  quorum: 29,
  members: [pat, dana, alice, carmen, sam],
};

const dispatch = vi.fn();

function renderMore(me: Member, overrides: Partial<MeetingState> = {}) {
  render(
    <MoreArea
      state={{ ...state, ...overrides }}
      dispatch={dispatch}
      me={me}
      meetingCode="MAPLE1"
      organizationId="org-1"
    />,
  );
}

describe('MoreArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hands the chair to a member present on a device, after a confirmation', () => {
    renderMore(dana);
    expect(screen.queryByRole('button', { name: 'Hand the chair to Sam Ortiz' })).toBeNull();
    // Marked present by the chair, with no screen to run the meeting from
    expect(screen.queryByRole('button', { name: 'Hand the chair to Carmen Diaz' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hand the chair to Alice Brennan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: Alice Brennan takes the chair' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_MEMBER_ROLE', targetMemberId: 3, newRole: 'chair' }),
    );
  });

  it.each([
    ['the chair', dana],
    ['an admin', pat],
  ])('lets %s set the quorum for this meeting', (_who, me) => {
    renderMore(me);
    fireEvent.change(screen.getByLabelText('Quorum for this meeting'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the quorum' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_QUORUM', quorum: 25 }),
    );
  });

  it('keeps the quorum from a plain member', () => {
    renderMore(alice);
    expect(screen.queryByLabelText('Quorum for this meeting')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set the quorum' })).toBeNull();
  });

  it('shows the time limits and the bylaws link to admins only', () => {
    renderMore(pat);
    expect(screen.getByLabelText('Speaking time (seconds)')).toBeTruthy();
    expect(screen.getByText('Bylaws link')).toBeTruthy();
  });

  it('keeps the time limits from a chair who is not an admin', () => {
    renderMore(dana);
    expect(screen.queryByLabelText('Speaking time (seconds)')).toBeNull();
    expect(screen.queryByText('Bylaws link')).toBeNull();
  });

  it('reloads the agenda from the schedule before the call to order', async () => {
    api.meetingPackets.reloadAgenda.mockResolvedValueOnce({ live: true });
    renderMore(dana);
    fireEvent.click(screen.getByRole('button', { name: 'Reload the agenda' }));
    expect(await screen.findByText('The agenda now matches the schedule.')).toBeTruthy();
    expect(api.meetingPackets.reloadAgenda).toHaveBeenCalledWith('MAPLE1');
  });

  it('shows the log with times of day, newest first', () => {
    renderMore(dana, {
      meetingLog: [
        { time: '2026-10-07T14:16:10.646Z', message: 'Meeting called to order' },
        { time: '7:41:00 PM', message: 'Alice Brennan has joined the meeting.' },
      ],
    });
    const entries = within(screen.getByRole('region', { name: 'Log' })).getAllByRole('listitem');
    expect(entries.map((li) => li.textContent)).toEqual([
      '7:41 PM Alice Brennan has joined the meeting.',
      expect.stringMatching(/^9:16\sAM Meeting called to order$/),
    ]);
  });

  it('keeps only the record once the meeting is adjourned', () => {
    renderMore(dana, { meetingStage: 'adjourned' });
    expect(screen.queryByText('Proxies')).toBeNull();
    expect(screen.queryByText('Order of business')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set the quorum' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hand the chair/ })).toBeNull();
    expect(screen.getByText('Alice Brennan')).toBeTruthy();
    expect(screen.getByText('Documents')).toBeTruthy();
  });
});
