import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { NominationsPanel } from '../NominationsPanel';

const dana: Member = {
  id: 2,
  name: 'Dana Okafor',
  role: 'chair',
  present: true,
  presentBy: 'device',
};
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
const sam: Member = {
  id: 11,
  name: 'Sam Ortiz',
  role: 'guest',
  present: true,
  presentBy: 'device',
};

const base: MeetingState = {
  ...initialState,
  meetingActive: true,
  agendaAdopted: true,
  members: [dana, alice, carmen, sam],
};
const open: MeetingState = {
  ...base,
  nominationsOpen: true,
  currentNominationPosition: 'Director',
};

const dispatch = vi.fn();

describe('NominationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets the chair open nominations for any position, at any time', () => {
    render(<NominationsPanel state={base} dispatch={dispatch} currentUser={dana} isChair />);
    fireEvent.change(screen.getByLabelText('Open nominations for'), {
      target: { value: 'Director' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open nominations' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_NOMINATIONS', position: 'Director' }),
    );
  });

  it('nominates someone present, members marked present included, and never a guest', () => {
    render(<NominationsPanel state={open} dispatch={dispatch} currentUser={alice} />);
    expect(screen.queryByRole('option', { name: 'Sam Ortiz' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Nominee'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nominate' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NOMINATE',
        position: 'Director',
        nomineeName: 'Carmen Diaz',
        nomineeId: 5,
        nominatorId: 3,
      }),
    );
  });

  it('nominates someone not in the meeting by name', () => {
    render(<NominationsPanel state={open} dispatch={dispatch} currentUser={alice} />);
    fireEvent.change(screen.getByLabelText('Nominee'), { target: { value: 'someone-else' } });
    fireEvent.change(screen.getByLabelText("Nominee's name"), {
      target: { value: 'Grace Kim' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nominate' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'NOMINATE', nomineeName: 'Grace Kim', nomineeId: 0 }),
    );
  });

  it('lets only the nominee decline, as the signed-in user', () => {
    const state: MeetingState = {
      ...open,
      nominations: [
        {
          id: 5,
          position: 'Director',
          nomineeName: 'Alice Brennan',
          nomineeId: 3,
          nominatedBy: 'Dana Okafor',
          nominatorId: 2,
          timestamp: '',
          declined: false,
        },
      ],
    };
    const { unmount } = render(
      <NominationsPanel state={state} dispatch={dispatch} currentUser={dana} isChair />,
    );
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
    unmount();

    render(<NominationsPanel state={state} dispatch={dispatch} currentUser={alice} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DECLINE_NOMINATION', nominationId: 5 }),
    );
  });

  it('gives a guest no nomination form', () => {
    render(<NominationsPanel state={open} dispatch={dispatch} currentUser={sam} />);
    expect(screen.queryByLabelText('Nominee')).toBeNull();
  });
});
