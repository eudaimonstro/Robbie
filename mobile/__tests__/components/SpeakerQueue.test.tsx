import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SpeakerQueueSection } from '../../components/SpeakerQueue';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type {
  DebateStance,
  MeetingState,
  Member,
  Motion,
  SpeakerQueueEntry,
} from '@robbie-bylawyer/shared/types';

const member = (id: number, name: string): Member => ({
  id,
  name,
  role: 'member',
  present: true,
  presentBy: 'device',
});

const alice = member(1, 'Alice');
const ben = member(2, 'Ben');
const carol = member(3, 'Carol');
const dana = member(4, 'Dana');

const entry = (m: Member, stance: DebateStance): SpeakerQueueEntry => ({ member: m, stance });

const motion = { id: 1, moverId: dana.id, moverHasSpoken: false } as Motion;

// Hands went up in this order: Alice (for), Ben (for), Carol (against), Dana (the mover, for).
// The last speaker spoke for the motion.
const stateWith = (overrides: Partial<MeetingState> = {}): MeetingState => ({
  ...initialState,
  meetingActive: true,
  members: [alice, ben, carol, dana],
  currentMotion: motion,
  lastSpeakerStance: 'pro',
  speakerQueue: [entry(alice, 'pro'), entry(ben, 'pro'), entry(carol, 'con'), entry(dana, 'pro')],
  ...overrides,
});

const listedNames = () =>
  screen
    .getAllByLabelText(/^Position \d+: /)
    .map((item) => item.props.accessibilityLabel.replace(/^Position \d+: ([^,]+),.*$/, '$1'));

describe('SpeakerQueueSection', () => {
  it('lists the queue in the order the chair will call it: the mover, then against, then for', async () => {
    await render(
      <SpeakerQueueSection
        state={stateWith()}
        currentUser={alice}
        dispatch={jest.fn()}
        isHandRaised={true}
      />,
    );

    expect(listedNames()).toEqual(['Dana', 'Carol', 'Alice']);
    expect(screen.getByText('+1 more')).toBeTruthy();
  });

  it("gives the member's place in that order, not the order hands went up", async () => {
    await render(
      <SpeakerQueueSection
        state={stateWith()}
        currentUser={carol}
        dispatch={jest.fn()}
        isHandRaised={true}
      />,
    );

    expect(screen.getByText('2')).toBeTruthy();
  });

  it('keeps the order hands went up when alternation is suspended and the mover has spoken', async () => {
    await render(
      <SpeakerQueueSection
        state={stateWith({
          currentMotion: { ...motion, moverHasSpoken: true },
          suspendedRules: [
            {
              id: 1,
              rule: 'pro-con-alternation',
              purpose: 'Hear everyone in turn',
              specificAction: 'Debate on the motion',
              scope: 'meeting-remainder',
              suspendedAt: '2026-10-07T19:00:00.000Z',
              motionId: 1,
            },
          ],
        })}
        currentUser={alice}
        dispatch={jest.fn()}
        isHandRaised={true}
      />,
    );

    expect(listedNames()).toEqual(['Alice', 'Ben', 'Carol']);
  });
});
