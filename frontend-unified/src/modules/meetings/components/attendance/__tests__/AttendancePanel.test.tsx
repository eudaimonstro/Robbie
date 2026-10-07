import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { attendanceSummary } from '@robbie-bylawyer/shared/utils';
import type { MeetingState } from '@robbie-bylawyer/shared/types';
import type { MeetingRoster } from '../../../../../api/client';

const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { AttendancePanel } = await import('../AttendancePanel');

const roster: MeetingRoster = {
  members: [
    { userId: 2, name: 'Dana Okafor', email: 'dana@maplegrove.example', orgRole: 'admin' },
    { userId: 3, name: 'Alice Brennan', email: 'alice@maplegrove.example', orgRole: 'member' },
    { userId: 4, name: 'Ben Whitaker', email: 'ben@maplegrove.example', orgRole: 'member' },
    { userId: 5, name: 'Carmen Diaz', email: 'carmen@maplegrove.example', orgRole: 'member' },
    { userId: 9, name: 'Morgan Lee', email: 'morgan@maplegrove.example', orgRole: 'viewer' },
  ],
  invites: [],
};

const state: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  quorum: 29,
  headcount: 0,
  headcountNames: [],
  members: [
    { id: 2, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
    { id: 3, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'chair' },
    { id: 4, name: 'Ben Whitaker', role: 'member', present: false },
    { id: 11, name: 'Sam Ortiz', role: 'guest', present: true, presentBy: 'device' },
  ],
};

const dispatch = vi.fn();

function renderPanel(overrides: Partial<MeetingState> = {}, readOnly = false) {
  const current = { ...state, ...overrides };
  render(
    <AttendancePanel
      state={current}
      dispatch={dispatch}
      summary={attendanceSummary(current)}
      roster={roster}
      rosterError={null}
      eligible={142}
      readOnly={readOnly}
    />,
  );
}

describe('AttendancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the three numbers and the quorum line', () => {
    renderPanel();
    // Each number follows its label in the markup (the label is shown beneath it)
    const figure = (label: string) =>
      screen.getAllByRole('term').find((term) => term.textContent === label)?.nextElementSibling
        ?.textContent;
    // Dana on a device and Alice marked present; Ben is absent and Sam is a guest
    expect(figure('Present')).toBe('2');
    expect(figure('Quorum')).toBe('29');
    expect(figure('Eligible')).toBe('142');
    expect(screen.getByText('Need 27 more')).toBeTruthy();
  });

  it('lists each voting member with how they are here, and no viewers', () => {
    renderPanel();
    const roll = screen.getByRole('list', { name: 'Voting members' });
    const row = (name: string) => within(roll).getByText(name).closest('li')!;
    expect(within(row('Dana Okafor')).getByText('Present')).toBeTruthy();
    expect(within(row('Alice Brennan')).getByText('Marked present')).toBeTruthy();
    expect(within(row('Ben Whitaker')).getByText('Absent')).toBeTruthy();
    expect(within(row('Carmen Diaz')).getByText('Not joined')).toBeTruthy();
    expect(screen.queryByText('Morgan Lee')).toBeNull();
  });

  it('marks someone without a phone present from the roster', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Carmen Diaz present' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MARK_PRESENT', userId: 5 }),
    );
  });

  it('marks absent someone the chair marked, but not someone whose device is here', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Alice Brennan absent' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MARK_ABSENT', memberId: 3, excused: false }),
    );
    expect(
      (screen.getByRole('button', { name: 'Mark Dana Okafor absent' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('counts the people without an account, with the names given', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Headcount'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Names for the minutes/), {
      target: { value: 'Dee Park\n\nEli Ross' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the headcount' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_HEADCOUNT', count: 3, names: ['Dee Park', 'Eli Ross'] }),
    );
    expect(toast.showToast).toHaveBeenCalledWith('success', 'Headcount saved');
  });

  it('changes nothing once the meeting is adjourned', () => {
    renderPanel({ meetingStage: 'adjourned' }, true);
    expect(screen.queryByLabelText('Headcount')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mark / })).toBeNull();
    expect(screen.getByRole('list', { name: 'Voting members' })).toBeTruthy();
  });

  it('refuses more names than people counted', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Headcount'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Names for the minutes/), {
      target: { value: 'Dee Park\nEli Ross' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save the headcount' }));
    expect(screen.getByText('Give at most one name for each person counted')).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps the names closed until there are some', () => {
    renderPanel();
    const names = () =>
      screen.getByText('Add names for the minutes').closest('details') as HTMLDetailsElement;
    expect(names().open).toBe(false);
    fireEvent.click(screen.getByText('Add names for the minutes'));
    expect(names().open).toBe(true);
  });

  it('opens the names when the headcount already has some', () => {
    renderPanel({ headcount: 2, headcountNames: ['Dee Park'] });
    const names = screen.getByText('Add names for the minutes').closest('details');
    expect(names?.open).toBe(true);
    expect((screen.getByLabelText(/Names for the minutes/) as HTMLTextAreaElement).value).toBe(
      'Dee Park',
    );
  });

  it('lists the guests apart', () => {
    renderPanel();
    const guests = screen.getByRole('list', { name: 'Guests' });
    expect(within(guests).getByText('Sam Ortiz')).toBeTruthy();
  });

  it('finds a member by name', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Find a member'), { target: { value: 'car' } });
    const roll = screen.getByRole('list', { name: 'Voting members' });
    expect(within(roll).getAllByRole('listitem')).toHaveLength(1);
    expect(within(roll).getByText('Carmen Diaz')).toBeTruthy();
  });
});
