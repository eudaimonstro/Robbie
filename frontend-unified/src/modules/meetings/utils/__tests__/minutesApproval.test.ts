import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import { minutesHeading, minutesItemUnderWay } from '../minutesApproval';

const item = (title: string) => ({ id: 2, title, status: 'active' as const });
const inSession: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
};
const motion = { ...MOTIONS.mainMotion, id: 1, type: 'mainMotion', status: 'active' } as Motion;

describe('minutesItemUnderWay', () => {
  it('is the minutes stage, or an agenda item about the minutes, with nothing pending', () => {
    expect(minutesItemUnderWay({ ...inSession, meetingStage: 'minutes-approval' })).toBe(true);
    expect(
      minutesItemUnderWay({
        ...inSession,
        currentAgendaItem: item('Approval of the minutes of the 2025 annual meeting'),
      }),
    ).toBe(true);
    expect(
      minutesItemUnderWay({ ...inSession, currentAgendaItem: item("Treasurer's report") }),
    ).toBe(false);
  });

  it('gives way to a motion, and is never before the call to order', () => {
    const minutesItem = { ...inSession, currentAgendaItem: item('Minutes') };
    expect(minutesItemUnderWay({ ...minutesItem, currentMotion: motion })).toBe(false);
    expect(minutesItemUnderWay({ ...minutesItem, pendingSecond: motion })).toBe(false);
    expect(minutesItemUnderWay({ ...minutesItem, meetingActive: false })).toBe(false);
  });
});

describe('minutesHeading', () => {
  it('takes the first heading that names the minutes', () => {
    expect(
      minutesHeading('# Maple Grove HOA\n\n## Minutes of the 2025 Annual Meeting\n\nText.'),
    ).toBe('Minutes of the 2025 Annual Meeting');
  });

  it('says what they are without one', () => {
    expect(minutesHeading('The board met.')).toBe('The minutes of the previous meeting');
    expect(minutesHeading('')).toBe('The minutes of the previous meeting');
  });
});
