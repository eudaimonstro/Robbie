import { describe, it, expect } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import type { MeetingState, Motion } from '@robbie-bylawyer/shared/types';
import {
  LOG_MINUTES_APPROVED,
  getStageLogMessage,
  logAgendaItemCalled,
} from '@robbie-bylawyer/shared/constants';
import {
  agendaNamesTheApproval,
  minutesBody,
  minutesHeading,
  minutesItemUnderWay,
  minutesLatestLine,
  titleIsTheMinutes,
} from '../minutesApproval';

const item = (title: string) => ({ id: 2, title, status: 'active' as const });
const inSession: MeetingState = {
  ...initialState,
  meetingActive: true,
  meetingStage: 'new-business',
};
// The previous minutes before the meeting: members have their text, guests and the display only
// their id
const withMinutes: MeetingState = {
  ...inSession,
  minutesFromPreviousMeeting: '## Minutes of the 2025 Annual Meeting',
  previousMinutesId: 'm1',
};
const asGuest: MeetingState = { ...withMinutes, minutesFromPreviousMeeting: '' };
const motion = { ...MOTIONS.mainMotion, id: 1, type: 'mainMotion', status: 'active' } as Motion;

describe('minutesItemUnderWay', () => {
  it('is the minutes stage, or an agenda item about the minutes, with nothing pending', () => {
    expect(minutesItemUnderWay({ ...inSession, meetingStage: 'minutes-approval' })).toBe(true);
    expect(
      minutesItemUnderWay({
        ...withMinutes,
        currentAgendaItem: item('Approval of the minutes of the 2025 annual meeting'),
      }),
    ).toBe(true);
    expect(
      minutesItemUnderWay({
        ...asGuest,
        currentAgendaItem: item('Approval of the minutes of the 2025 annual meeting'),
      }),
    ).toBe(true);
    expect(
      minutesItemUnderWay({ ...withMinutes, currentAgendaItem: item("Treasurer's report") }),
    ).toBe(false);
  });

  it('is not an item that gives itself a length of time', () => {
    for (const title of [
      'Homeowner forum (3 minutes per speaker)',
      "Treasurer's report (5 minutes)",
      'Open forum, three minutes each',
      'Approval of the agenda (2 minutes)',
    ]) {
      expect(minutesItemUnderWay({ ...withMinutes, currentAgendaItem: item(title) })).toBe(false);
    }
    // The minutes with a length of time of their own are still the minutes
    expect(
      minutesItemUnderWay({
        ...withMinutes,
        currentAgendaItem: item('Approval of the minutes (10 minutes)'),
      }),
    ).toBe(true);
  });

  it('is not an agenda item about the minutes when there are no minutes to approve', () => {
    expect(
      minutesItemUnderWay({
        ...inSession,
        currentAgendaItem: item('Approval of the minutes of the 2025 annual meeting'),
      }),
    ).toBe(false);
  });

  it('gives way to a motion, and is never before the call to order', () => {
    const minutesItem = { ...withMinutes, currentAgendaItem: item('Minutes') };
    expect(minutesItemUnderWay(minutesItem)).toBe(true);
    expect(minutesItemUnderWay({ ...minutesItem, currentMotion: motion })).toBe(false);
    expect(minutesItemUnderWay({ ...minutesItem, pendingSecond: motion })).toBe(false);
    expect(minutesItemUnderWay({ ...minutesItem, meetingActive: false })).toBe(false);
  });
});

describe('titleIsTheMinutes', () => {
  it('is a title about approving, correcting or reading the minutes, or the minutes alone', () => {
    expect(titleIsTheMinutes('Approval of the minutes of the 2025 annual meeting')).toBe(true);
    expect(titleIsTheMinutes('Reading and approval of minutes')).toBe(true);
    expect(titleIsTheMinutes('Corrections to the minutes')).toBe(true);
    expect(titleIsTheMinutes('Minutes')).toBe(true);
    expect(titleIsTheMinutes('Minutes of the March board meeting')).toBe(true);
  });

  it('is not a title that only mentions minutes as time', () => {
    expect(titleIsTheMinutes('Homeowner forum (3 minutes per speaker)')).toBe(false);
    expect(titleIsTheMinutes("Treasurer's report (5 minutes)")).toBe(false);
    expect(titleIsTheMinutes('Approve the budget, 10 minutes')).toBe(false);
    expect(titleIsTheMinutes('A few minutes for announcements')).toBe(false);
    expect(titleIsTheMinutes('Adjournment')).toBe(false);
  });
});

describe('agendaNamesTheApproval', () => {
  it('is an agenda item that says it approves the minutes', () => {
    expect(
      agendaNamesTheApproval({
        ...inSession,
        currentAgendaItem: item('Approval of the minutes of the 2025 annual meeting'),
      }),
    ).toBe(true);
    expect(
      agendaNamesTheApproval({
        ...inSession,
        currentAgendaItem: item('Reading and approval of minutes'),
      }),
    ).toBe(true);
  });

  it('is not an item that only names the minutes, or the minutes stage without an item', () => {
    expect(agendaNamesTheApproval({ ...inSession, currentAgendaItem: item('Minutes') })).toBe(
      false,
    );
    expect(agendaNamesTheApproval({ ...inSession, meetingStage: 'minutes-approval' })).toBe(false);
  });

  it('is not an item that approves something else in so many minutes', () => {
    expect(
      agendaNamesTheApproval({
        ...inSession,
        currentAgendaItem: item('Approval of the agenda (2 minutes)'),
      }),
    ).toBe(false);
  });
});

describe('minutesLatestLine', () => {
  const entry = (message: string) => ({ time: '', message });
  const title = 'Approval of the minutes of the 2025 annual meeting';

  it('is the line that called their item, or approved them, whichever is later', () => {
    const called = { ...withMinutes, currentAgendaItem: item(title) };
    const log = [
      entry('Meeting called to order'),
      entry(logAgendaItemCalled(title)),
      entry('Vote: Yea 21, Nay 5. CARRIED.'),
    ];
    expect(minutesLatestLine({ ...called, meetingLog: log })).toBe(1);
    expect(
      minutesLatestLine({ ...called, meetingLog: [...log, entry(LOG_MINUTES_APPROVED)] }),
    ).toBe(3);
  });

  it('is the line that began their stage, and -1 without one', () => {
    const stage = { ...inSession, meetingStage: 'minutes-approval' as const };
    expect(
      minutesLatestLine({
        ...stage,
        meetingLog: [
          entry('Meeting called to order'),
          entry(getStageLogMessage('minutes-approval')),
        ],
      }),
    ).toBe(1);
    expect(minutesLatestLine(stage)).toBe(-1);
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

describe('minutesBody', () => {
  it('starts after the heading that names the minutes, which their title already gives', () => {
    expect(minutesBody('# Maple Grove HOA\n\n## Minutes of the 2025 Annual Meeting\n\nText.')).toBe(
      'Text.',
    );
  });

  it('keeps minutes without one as they are', () => {
    expect(minutesBody('The board met.\n\n## Attendance')).toBe('The board met.\n\n## Attendance');
  });
});
