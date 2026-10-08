import { describe, it, expect } from 'vitest';
import { initialState } from '../../reducer/index.js';
import { NO_VOTES, formatMinutesAsMarkdown, generateMeetingMinutes } from '../../utils/index.js';
import { md } from '../../utils/minutesGenerator.js';
import type { CompletedMotion, MeetingState, MinutesContext } from '../../types/index.js';

/** The server's clock on the night, in UTC (7:00 PM in Chicago is midnight UTC) */
const at = (time: string) => `2026-10-21T${time}:00.000Z`;

function record(
  overrides: Partial<CompletedMotion> & Pick<CompletedMotion, 'id' | 'text'>,
): CompletedMotion {
  return {
    type: 'mainMotion',
    name: 'Main Motion',
    passed: true,
    voterChoices: {},
    timestamp: '',
    reconsidered: false,
    ...overrides,
  };
}

/** Maple Grove's annual meeting, adjourned: every kind of thing the minutes record */
const scenario: MeetingState = {
  ...initialState,
  meetingCode: 'MAPLE1',
  title: '2026 Annual Meeting',
  meetingStage: 'adjourned',
  quorum: 29,
  quorumAtCallToOrder: true,
  members: [
    { id: 1, name: 'Dana Okafor', role: 'chair', present: true, presentBy: 'device' },
    { id: 2, name: 'Alice Brennan', role: 'member', present: true, presentBy: 'device' },
    { id: 3, name: 'Ben Whitaker', role: 'member', present: true, presentBy: 'device' },
    { id: 4, name: 'Carmen Diaz', role: 'member', present: true, presentBy: 'chair' },
    // Left before the adjournment
    { id: 5, name: 'Grace Kim', role: 'member', present: false },
    { id: 6, name: 'Sam Ortiz', role: 'guest', present: true, presentBy: 'device' },
    { id: 7, name: 'Pat Lindqvist', role: 'admin', present: true, presentBy: 'device' },
  ],
  attendedIds: [1, 2, 3, 4, 5, 6, 7],
  headcount: 3,
  headcountNames: ['Dee Fox', 'Eli Grant'],
  agenda: [
    { id: 1, title: 'Call to order', status: 'completed' },
    { id: 2, title: 'Approval of the minutes of the 2025 annual meeting', status: 'completed' },
    { id: 3, title: 'Old business: pool resurfacing contract', status: 'completed' },
    {
      id: 4,
      title: 'New business: amend Section 4.2 to lower the quorum to 15%',
      status: 'completed',
    },
    { id: 5, title: 'Election of two directors', status: 'completed' },
    { id: 6, title: "Treasurer's report", status: 'pending' },
    { id: 7, title: 'Adjournment', status: 'completed' },
  ],
  minutesApproval: {
    corrections: 'The 2025 meeting adjourned at 8:15 PM, not 8:50 PM',
    timestamp: '7:05:00 PM',
    decidedAt: at('00:05'),
    agendaItemId: 2,
  },
  completedMotions: [
    record({
      id: 10,
      text: 'I move that we resurface the pool this spring',
      mover: 'Alice Brennan',
      moverId: 2,
      seconder: 'Ben Whitaker',
      deviceVotes: { yea: 12, nay: 3, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 0 },
      method: 'standard',
      disposition: 'carried',
      quorumPresent: true,
      agendaItemId: 3,
      decidedAt: at('00:20'),
    }),
    // Recorded after the vote above but decided before it: the clock orders them
    record({
      id: 11,
      type: 'amend',
      name: 'Amend',
      text: 'Strike spring and insert summer',
      mover: 'Ben Whitaker',
      moverId: 3,
      passed: false,
      disposition: 'withdrawn',
      agendaItemId: 3,
      decidedAt: at('00:15'),
    }),
    record({
      id: 12,
      text: 'Paint the clubhouse red',
      mover: 'Grace Kim',
      moverId: 5,
      passed: false,
      disposition: 'no-second',
      agendaItemId: 3,
      decidedAt: at('00:25'),
    }),
    record({
      id: 13,
      type: 'appeal',
      name: "Appeal the Chair's Decision",
      text: 'Appeal the ruling on the point of order',
      mover: 'Ben Whitaker',
      moverId: 3,
      seconder: 'Alice Brennan',
      deviceVotes: { yea: 15, nay: 5, abstain: 0 },
      floorVotes: NO_VOTES,
      method: 'standard',
      disposition: 'carried',
      quorumPresent: true,
      agendaItemId: 3,
      decidedAt: at('00:23'),
    }),
    record({
      id: 14,
      type: 'bylawAmendment',
      name: 'Bylaw Amendment',
      text: 'Amend Section 4.2 to lower the quorum to 15%',
      mover: 'Pat Lindqvist',
      moverId: 7,
      seconder: 'Alice Brennan',
      bylawAmendment: {
        documentId: 'doc',
        changeType: 'modify',
        targetSectionId: 's42',
        targetSectionLabel: 'Section 4.2 "Quorum"',
        currentTitle: 'Quorum',
        currentContent: 'Twenty percent (20%) of the votes is a quorum.',
        newContent:
          'Fifteen percent (15%) of the votes is a quorum.\n\nProxies count toward it. *Not* the [board].',
      },
      // A secret ballot: its record keeps no choices
      deviceVotes: { yea: 14, nay: 4, abstain: 1 },
      floorVotes: { yea: 8, nay: 2, abstain: 0 },
      method: 'ballot',
      disposition: 'carried',
      quorumPresent: true,
      agendaItemId: 4,
      decidedAt: at('00:40'),
    }),
    record({
      id: 15,
      text: 'Thank the outgoing directors',
      mover: 'Carmen Diaz',
      moverId: 4,
      seconder: 'a member in the room',
      disposition: 'unanimous',
      quorumPresent: true,
      agendaItemId: 4,
      decidedAt: at('00:45'),
    }),
    record({
      id: 16,
      text: 'Adopt the 2027 budget',
      mover: 'Put by the chair',
      moverId: 0,
      seconder: 'Carmen Diaz',
      deviceVotes: { yea: 20, nay: 1, abstain: 0 },
      floorVotes: NO_VOTES,
      method: 'standard',
      disposition: 'carried',
      quorumPresent: true,
      agendaItemId: 4,
      decidedAt: at('00:50'),
    }),
    // Decided outside any agenda item
    record({
      id: 17,
      text: 'Hold the next meeting online',
      mover: 'Ben Whitaker',
      moverId: 3,
      seconder: 'Alice Brennan',
      passed: false,
      deviceVotes: NO_VOTES,
      floorVotes: { yea: 4, nay: 20, abstain: 0 },
      method: 'voice',
      disposition: 'failed',
      quorumPresent: false,
      decidedAt: at('01:30'),
    }),
  ],
  chairRulings: [
    {
      ruling: 'The point is well taken.',
      explanation: 'Debate must be on the motion',
      motionText: 'Point of order: the speaker is off the subject',
      timestamp: '',
      decidedAt: at('00:22'),
      agendaItemId: 3,
    },
  ],
  electedOfficers: [
    {
      position: 'Director',
      name: 'Carmen Diaz',
      memberId: 4,
      electedAt: '',
      ballots: [{ 'Carmen Diaz': 18, 'Ray Castillo': 9 }],
      requiredVotes: 'majority',
      agendaItemId: 5,
      decidedAt: at('01:05'),
    },
    {
      position: 'Director',
      name: 'Frank Osei',
      memberId: 0,
      electedAt: '',
      ballots: [
        { 'Frank Osei': 12, 'Hector Ramos': 12 },
        { 'Frank Osei': 15, 'Hector Ramos': 11 },
      ],
      requiredVotes: 'plurality',
      agendaItemId: 5,
      decidedAt: at('01:15'),
    },
  ],
  electionsSetAside: [
    {
      position: 'Treasurer',
      ballots: [{ 'Ann Lee': 10, 'Bo Chen': 10 }],
      timestamp: '',
      decidedAt: at('01:20'),
      agendaItemId: 5,
    },
  ],
  // Left unfinished by the adjournment: the election under way, a motion pending and one
  // awaiting a second
  unfinishedAtAdjournment: [
    {
      kind: 'election',
      position: 'Secretary',
      ballots: [
        { 'Ivy Moss': 7, 'June Park': 7 },
        { 'June Park': 8, 'Ivy Moss': 6 },
      ],
    },
    {
      kind: 'motion',
      id: 18,
      name: 'Main Motion',
      text: 'Repave the parking lot',
      mover: 'Pat Lindqvist',
      seconder: 'Carmen Diaz',
    },
    {
      kind: 'motion',
      id: 19,
      name: 'Refer to a Committee',
      text: 'Refer the question to the grounds committee',
      mover: 'Ben Whitaker',
      awaitingSecond: true,
    },
  ],
};

const context: MinutesContext = {
  organizationName: 'Maple Grove HOA',
  timeZone: 'America/Chicago',
  title: '2026 Annual Meeting',
  location: 'Maple Grove Clubhouse',
  scheduledFor: '2026-10-21T00:00:00.000Z',
  calledToOrderAt: '2026-10-21T00:02:00.000Z',
  adjournedAt: '2026-10-21T01:42:00.000Z',
  voters: [
    { id: 1, name: 'Dana Okafor' },
    { id: 2, name: 'Alice Brennan' },
    { id: 3, name: 'Ben Whitaker' },
    { id: 4, name: 'Carmen Diaz' },
    { id: 5, name: 'Grace Kim' },
    { id: 7, name: 'Pat Lindqvist' },
    { id: 8, name: 'Elena Petrova' },
    { id: 9, name: 'David Nguyen' },
  ],
};

const nothingKnown: MinutesContext = {
  organizationName: 'Garden Club',
  timeZone: 'America/Chicago',
  title: '',
  location: null,
  scheduledFor: null,
  calledToOrderAt: null,
  adjournedAt: null,
  voters: [],
};

describe('the minutes', () => {
  it('record the meeting, each decision under its agenda item in the order it happened', () => {
    const markdown = formatMinutesAsMarkdown(generateMeetingMinutes(scenario), context);
    expect(markdown).toBe(
      [
        '# Maple Grove HOA',
        '',
        '## Minutes of the 2026 Annual Meeting',
        '',
        'Tuesday, October 20, 2026, at Maple Grove Clubhouse.',
        '',
        'Dana Okafor presided. The meeting was called to order at 7:02 PM.',
        '',
        '## Attendance',
        '',
        '**Members present (6):** Alice Brennan, Ben Whitaker, Carmen Diaz (marked present), Dana Okafor, Grace Kim, Pat Lindqvist.',
        '',
        '**Also present without an account (3):** Dee Fox, Eli Grant and 1 other.',
        '',
        '**Guests:** Sam Ortiz.',
        '',
        '**Absent (2):** David Nguyen, Elena Petrova.',
        '',
        'A quorum of 29 was present at the call to order.',
        '',
        '## Proceedings',
        '',
        '### 2. Approval of the minutes of the 2025 annual meeting',
        '',
        'The minutes of the previous meeting were approved with corrections: The 2025 meeting adjourned at 8:15 PM, not 8:50 PM.',
        '',
        '### 3. Old business: pool resurfacing contract',
        '',
        '**Amend.** Ben Whitaker moved: "Strike spring and insert summer." Withdrawn by the mover.',
        '',
        '**Main motion.** Alice Brennan moved: "I move that we resurface the pool this spring." Seconded by Ben Whitaker. Carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5. A quorum was present.',
        '',
        '**Ruling of the chair.** On "Point of order: the speaker is off the subject." the chair ruled: The point is well taken. Debate must be on the motion.',
        '',
        '**Appeal the chair\'s ruling.** Ben Whitaker moved: "Appeal the ruling on the point of order." Seconded by Alice Brennan. The chair\'s decision was sustained, 15 to 5. A quorum was present.',
        '',
        '**Main motion.** Grace Kim moved: "Paint the clubhouse red." Died for lack of a second.',
        '',
        '### 4. New business: amend Section 4.2 to lower the quorum to 15%',
        '',
        '**Amend the bylaws.** Pat Lindqvist moved: "Amend Section 4.2 to lower the quorum to 15%." Seconded by Alice Brennan. Carried by ballot, two thirds required, on devices 14 to 4 and in the room 8 to 2: 22 to 6, 1 abstaining. A quorum was present.',
        '',
        'As adopted, Section 4.2 "Quorum" reads:',
        '',
        '> **Quorum**',
        '>',
        '> Fifteen percent \\(15%\\) of the votes is a quorum.',
        '>',
        '> Proxies count toward it. \\*Not\\* the \\[board\\].',
        '',
        '**Main motion.** Carmen Diaz moved: "Thank the outgoing directors." Seconded by a member in the room. Adopted by unanimous consent. A quorum was present.',
        '',
        '**Main motion.** The chair put the question: "Adopt the 2027 budget." Seconded by Carmen Diaz. Carried, 20 to 1. A quorum was present.',
        '',
        '### 5. Election of two directors',
        '',
        '**Election for Director.** Ballot 1: Carmen Diaz 18, Ray Castillo 9. Carmen Diaz was elected.',
        '',
        '**Election for Director.** Ballot 1: Frank Osei 12, Hector Ramos 12. Ballot 2: Frank Osei 15, Hector Ramos 11. Frank Osei was elected by a plurality.',
        '',
        'The election for Treasurer was set aside. Ballot 1: Ann Lee 10, Bo Chen 10.',
        '',
        "### 6. Treasurer's report",
        '',
        'Not taken up.',
        '',
        '### Other business',
        '',
        '**Main motion.** Ben Whitaker moved: "Hold the next meeting online." Seconded by Alice Brennan. Failed on a voice vote, 4 to 20. No quorum was present.',
        '',
        '## Adjournment',
        '',
        'The meeting adjourned at 8:42 PM with the following unfinished: the election for Secretary (Ballot 1: Ivy Moss 7, June Park 7; Ballot 2: June Park 8, Ivy Moss 6), the motion "Repave the parking lot" (Main motion, moved by Pat Lindqvist and seconded by Carmen Diaz) and the motion "Refer the question to the grounds committee" (Refer to a committee, moved by Ben Whitaker and awaiting a second).',
        '',
      ].join('\n'),
    );
  });

  it('mark an item taken up with nothing recorded, so the secretary sees where to add to it', () => {
    const minutes = generateMeetingMinutes({
      ...initialState,
      title: 'Board meeting',
      agenda: [
        { id: 1, title: 'Call to order', status: 'completed' },
        { id: 2, title: "Treasurer's report", status: 'completed' },
        { id: 3, title: 'Landscaping', status: 'active' },
        { id: 4, title: 'Adjournment', status: 'completed' },
      ],
    });
    const markdown = formatMinutesAsMarkdown(minutes, context);
    expect(markdown).toContain(
      "## Proceedings\n\n### 2. Treasurer's report\n\nNo action was taken.\n\n### 3. Landscaping\n\nNo action was taken.\n\n## Adjournment\n",
    );
  });

  it('keep the call to order and the adjournment as items when something is recorded there, or they are elsewhere on the agenda', () => {
    const minutes = generateMeetingMinutes({
      ...initialState,
      title: 'Board meeting',
      agenda: [
        { id: 1, title: 'Call to order', status: 'completed' },
        { id: 2, title: 'Adjournment of the March meeting: report', status: 'completed' },
        { id: 3, title: 'Call to order of the budget hearing', status: 'completed' },
        { id: 4, title: 'Adjourn', status: 'completed' },
      ],
      chairRulings: [
        {
          ruling: 'The meeting is properly called.',
          motionText: 'Point of order: the notice was late',
          timestamp: '',
          agendaItemId: 1,
        },
      ],
    } as MeetingState);
    const markdown = formatMinutesAsMarkdown(minutes, context);
    expect(markdown).toContain('### 1. Call to order\n\n**Ruling of the chair.**');
    expect(markdown).toContain(
      '### 2. Adjournment of the March meeting: report\n\nNo action was taken.\n',
    );
    expect(markdown).toContain(
      '### 3. Call to order of the budget hearing\n\nNo action was taken.\n',
    );
    expect(markdown).not.toContain('### 4. Adjourn');
  });

  it('keep an empty call to order or adjournment when nothing else says it happened', () => {
    const minutes = generateMeetingMinutes({
      ...initialState,
      title: 'Board meeting',
      agenda: [
        { id: 1, title: 'Call to order', status: 'completed' },
        { id: 2, title: 'Adjournment', status: 'pending' },
      ],
    });
    const markdown = formatMinutesAsMarkdown(minutes, nothingKnown);
    expect(markdown).toContain('### 1. Call to order\n\nNo action was taken.\n');
    expect(markdown).toContain('### 2. Adjournment\n\nNot taken up.\n');
  });

  it('leave out what they do not know', () => {
    const minutes = generateMeetingMinutes({ ...initialState, title: 'Board meeting' });
    expect(formatMinutesAsMarkdown(minutes, nothingKnown)).toBe(
      [
        '# Garden Club',
        '',
        '## Minutes of the Board meeting',
        '',
        '## Attendance',
        '',
        '**Members present:** none.',
        '',
        '## Proceedings',
        '',
        'No business was recorded.',
        '',
      ].join('\n'),
    );
  });

  it('record an election set aside before a ballot, and what adjourning left unfinished', () => {
    const minutes = generateMeetingMinutes({
      ...initialState,
      electionsSetAside: [{ position: null, timestamp: '' }],
      unfinishedAtAdjournment: [
        { kind: 'election', position: 'Treasurer' },
        {
          kind: 'motion',
          id: 1,
          name: 'Main Motion',
          text: 'Adopt the budget',
          mover: 'Put by the chair',
        },
      ],
    });
    expect(minutes.otherEntries).toEqual([
      { kind: 'setAside', setAside: { position: null, timestamp: '' } },
    ]);
    const markdown = formatMinutesAsMarkdown(minutes, nothingKnown);
    expect(markdown).toContain('\nThe election was set aside.\n');
    expect(markdown).toContain(
      '## Adjournment\n\nThe meeting adjourned with the following unfinished: the election for Treasurer and the motion "Adopt the budget" (Main motion, put by the chair).\n',
    );
  });

  it('count a vote recorded before its parts were kept from its choices, and name nobody', () => {
    const minutes = generateMeetingMinutes({
      ...initialState,
      completedMotions: [
        record({
          id: 1,
          text: 'Approve the budget',
          mover: 'Alice',
          voterChoices: { 1: 'yea', 2: 'yea', 3: 'nay' },
        }),
      ],
    });
    expect(minutes.otherEntries).toHaveLength(1);
    expect(formatMinutesAsMarkdown(minutes, nothingKnown)).toContain(
      '**Main motion.** Alice moved: "Approve the budget." Carried, 2 to 1.\n',
    );
  });

  it('say when a vote needed more than a majority', () => {
    const minutes = generateMeetingMinutes({
      ...initialState,
      completedMotions: [
        record({
          id: 1,
          type: 'previousQuestion',
          name: 'Previous Question (Close Debate)',
          text: 'Close debate',
          mover: 'Alice',
          passed: false,
          deviceVotes: NO_VOTES,
          floorVotes: { yea: 12, nay: 8, abstain: 0 },
          method: 'voice',
          disposition: 'failed',
        }),
        record({
          id: 2,
          type: 'suspendRules',
          name: 'Suspend the Rules',
          text: 'Suspend the rules to hear the guest',
          mover: 'Ben',
          deviceVotes: { yea: 9, nay: 1, abstain: 0 },
          floorVotes: NO_VOTES,
          method: 'standard',
          disposition: 'carried',
        }),
      ],
      electedOfficers: [
        {
          position: 'Treasurer',
          name: 'Ann Lee',
          memberId: 0,
          electedAt: '',
          ballots: [{ 'Ann Lee': 14, 'Bo Chen': 6 }],
          requiredVotes: '2/3',
        },
      ],
    });
    const markdown = formatMinutesAsMarkdown(minutes, nothingKnown);
    expect(markdown).toContain(
      '**Close debate.** Alice moved: "Close debate." Failed on a voice vote, two thirds required, 12 to 8.\n',
    );
    expect(markdown).toContain(
      '**Suspend the rules.** Ben moved: "Suspend the rules to hear the guest." Carried, two thirds required, 9 to 1.\n',
    );
    expect(markdown).toContain(
      '**Election for Treasurer.** Ballot 1: Ann Lee 14, Bo Chen 6. Ann Lee was elected, two thirds required.\n',
    );
  });

  it('record the text of each bylaw amendment, adopted or not', () => {
    const bylaw = (
      id: number,
      passed: boolean,
      bylawAmendment: CompletedMotion['bylawAmendment'],
    ): CompletedMotion =>
      record({
        id,
        type: 'bylawAmendment',
        name: 'Bylaw Amendment',
        text: `Motion ${id}`,
        mover: 'Alice',
        passed,
        deviceVotes: passed ? { yea: 9, nay: 1, abstain: 0 } : { yea: 2, nay: 8, abstain: 0 },
        floorVotes: NO_VOTES,
        method: 'standard',
        disposition: passed ? 'carried' : 'failed',
        bylawAmendment,
      });
    const quorum = {
      documentId: 'doc',
      targetSectionId: 's42',
      targetSectionLabel: 'Section 4.2 "Quorum"',
      currentTitle: 'Quorum',
      currentContent: 'Twenty percent is a quorum.',
    };
    const markdown = formatMinutesAsMarkdown(
      generateMeetingMinutes({
        ...initialState,
        completedMotions: [
          bylaw(1, false, { ...quorum, changeType: 'modify', newContent: 'Ten percent.' }),
          bylaw(2, true, {
            documentId: 'doc',
            changeType: 'add',
            parentSectionLabel: 'Article IV "Meetings"',
            newNumberLabel: 'Section 4.7',
            newTitle: 'Remote attendance',
            newContent: 'Members may attend by video.',
          }),
          bylaw(3, true, { ...quorum, changeType: 'delete' }),
          bylaw(4, false, { ...quorum, changeType: 'renumber', newNumberLabel: 'Section 4.3' }),
          bylaw(5, true, { ...quorum, changeType: 'modify', newTitle: 'Quorum of members' }),
        ],
      }),
      nothingKnown,
    );
    expect(markdown).toContain(
      'Failed, two thirds required, 2 to 8.\n\nAs proposed, Section 4.2 "Quorum" would have read:\n\n> **Quorum**\n>\n> Ten percent.\n',
    );
    expect(markdown).toContain(
      'Carried, two thirds required, 9 to 1.\n\nAs adopted, a new section under Article IV "Meetings" reads:\n\n> **Section 4.7 Remote attendance**\n>\n> Members may attend by video.\n',
    );
    expect(markdown).toContain(
      'Carried, two thirds required, 9 to 1.\n\nSection 4.2 "Quorum" was struck out.\n',
    );
    expect(markdown).toContain(
      'Failed, two thirds required, 2 to 8.\n\nThe motion proposed renumbering Section 4.2 "Quorum" as Section 4.3.\n',
    );
    expect(markdown).toContain(
      'Carried, two thirds required, 9 to 1.\n\nSection 4.2 "Quorum" was retitled "Quorum of members".\n',
    );
  });

  it('list who attended, not someone who arrived after the adjournment', () => {
    const minutes = generateMeetingMinutes({
      ...scenario,
      members: [
        ...scenario.members,
        { id: 8, name: 'Late Larry', role: 'member', present: true, presentBy: 'device' },
        { id: 9, name: 'Late Guest', role: 'guest', present: true, presentBy: 'device' },
      ],
    });
    expect(minutes.present.map((p) => p.name)).not.toContain('Late Larry');
    expect(minutes.guests).toEqual(['Sam Ortiz']);
  });

  it('give times in UTC when the time zone is unknown', () => {
    const markdown = formatMinutesAsMarkdown(generateMeetingMinutes(initialState), {
      ...nothingKnown,
      timeZone: 'Nowhere/Land',
      calledToOrderAt: '2026-10-21T00:02:00.000Z',
    });
    expect(markdown).toContain('The meeting was called to order at 12:02 AM.');
  });
});

describe('what members typed, in the minutes', () => {
  it('is escaped, so Markdown reads it as text', () => {
    expect(md('![x](http://e)')).toBe('\\!\\[x\\]\\(http://e\\)');
    expect(md('<img onerror=x>')).toBe('\\<img onerror=x\\>');
    expect(md('[link](javascript:x)')).toBe('\\[link\\]\\(javascript:x\\)');
    expect(md('Ann *Star* Lee_')).toBe('Ann \\*Star\\* Lee\\_');
    expect(md('a | b ` c ~ d \\ e # f')).toBe('a \\| b \\` c \\~ d \\\\ e \\# f');
  });

  it('is one line, and never starts a list, a quote or a heading', () => {
    expect(md('Repave the lot\n\n# Fake heading')).toBe('Repave the lot \\# Fake heading');
    expect(md('  - item')).toBe('\\- item');
    expect(md('+ item')).toBe('\\+ item');
    expect(md('> quote')).toBe('\\> quote');
    expect(md('# heading')).toBe('\\# heading');
    expect(md('2026. A year')).toBe('2026\\. A year');
    expect(md('Plain words, 4.2 and 15%')).toBe('Plain words, 4.2 and 15%');
  });

  it('prints in the minutes as the member typed it, never as markup', () => {
    const minutes = generateMeetingMinutes({
      ...initialState,
      members: [{ id: 1, name: 'Dana *the Chair*', role: 'chair', present: true }],
      attendedIds: [1],
      headcount: 1,
      headcountNames: ['<img onerror=x>'],
      agenda: [{ id: 1, title: '[link](javascript:x)', status: 'completed' }],
      completedMotions: [
        record({
          id: 1,
          text: 'Buy a sign ![x](http://e)\n# Fake heading',
          mover: 'Ann *Star* Lee',
          seconder: '[Bo](javascript:x)',
          disposition: 'unanimous',
          agendaItemId: 1,
        }),
      ],
    } as MeetingState);
    const markdown = formatMinutesAsMarkdown(minutes, {
      ...nothingKnown,
      organizationName: 'Garden <b>Club</b>',
      location: '# The hall',
    });
    expect(markdown).toContain('# Garden \\<b\\>Club\\</b\\>\n');
    expect(markdown).toContain('At \\# The hall.\n');
    expect(markdown).toContain('**Members present (1):** Dana \\*the Chair\\*.\n');
    expect(markdown).toContain('**Also present without an account (1):** \\<img onerror=x\\>.\n');
    expect(markdown).toContain('### 1. \\[link\\]\\(javascript:x\\)\n');
    expect(markdown).toContain(
      '**Main motion.** Ann \\*Star\\* Lee moved: "Buy a sign \\!\\[x\\]\\(http://e\\) \\# Fake heading." Seconded by \\[Bo\\]\\(javascript:x\\). Adopted by unanimous consent.\n',
    );
    // No line of the minutes is the member's heading
    expect(markdown.split('\n')).not.toContain('# Fake heading');
  });
});
