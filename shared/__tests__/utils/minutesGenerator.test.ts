import { describe, it, expect } from 'vitest';
import { generateMeetingMinutes, formatMinutesAsMarkdown } from '../../utils/index.js';
import type { MeetingState } from '../../types/index.js';

// Helper to create a minimal meeting state for testing
const createMockState = (overrides: Partial<MeetingState> = {}): MeetingState => ({
  meetingActive: false,
  meetingCode: 'TEST01',
  meetingStage: 'adjourned',
  agenda: [
    { id: 1, title: 'Budget Review', status: 'completed' },
    { id: 2, title: 'New Projects', status: 'pending' },
  ],
  currentAgendaItem: null,
  agendaAdopted: true,
  agendaObjection: false,
  currentMotion: null,
  pendingSecond: null,
  motionStack: [],
  votes: { yea: 0, nay: 0, abstain: 0 },
  voters: [],
  voterChoices: {},
  votingOpen: false,
  votingMethod: 'standard',
  speakerQueue: [],
  recognizedSpeaker: null,
  speakerTimerEnd: null,
  voteTimerEnd: null,
  speakerTimeLimit: 120,
  voteTimeLimit: 60,
  lastSpeakerStance: null,
  members: [
    { id: 1, name: 'Alice', role: 'chair', present: true },
    { id: 2, name: 'Bob', role: 'member', present: true },
    { id: 3, name: 'Charlie', role: 'member', present: false },
  ],
  quorum: 2,
  meetingLog: [
    { time: '10:00:00', message: 'Meeting called to order.' },
    { time: '10:30:00', message: 'Meeting adjourned.' },
  ],
  unanimousConsentPending: false,
  suspendedRules: [],
  tabledMotions: [],
  defeatedMotions: [],
  completedMotions: [
    {
      id: 1,
      type: 'mainMotion',
      name: 'Main Motion',
      text: 'Approve the budget',
      passed: true,
      voterChoices: { 1: 'yea', 2: 'yea' },
      timestamp: '10:15:00',
      reconsidered: false,
    },
  ],
  lastChairRuling: null,
  minutesApproved: true,
  minutesFromPreviousMeeting: '',
  committeeReports: [],
  nominationsOpen: false,
  currentNominationPosition: null,
  nominations: [],
  currentElection: null,
  electedOfficers: [{ position: 'Secretary', name: 'Bob', memberId: 2, electedAt: '10:20:00' }],
  inquiries: [],
  debatePositions: {},
  dividedQuestionParts: [],
  ...overrides,
});

describe('generateMeetingMinutes', () => {
  it('should generate minutes with basic meeting info', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);

    expect(minutes.meetingCode).toBe('TEST01');
    expect(minutes.startTime).toBe('10:00:00');
    expect(minutes.endTime).toBe('10:30:00');
    expect(minutes.chairName).toBe('Alice');
  });

  it('should include attendance records', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);

    expect(minutes.attendance).toHaveLength(3);
    expect(minutes.attendance.find((a) => a.name === 'Alice')?.status).toBe('present');
    expect(minutes.attendance.find((a) => a.name === 'Charlie')?.status).toBe('absent');
  });

  it('should record the headcount and members marked present', () => {
    const state = createMockState({
      headcount: 2,
      headcountNames: ['Dee'],
      members: [
        { id: 1, name: 'Alice', role: 'chair', present: true },
        { id: 2, name: 'Bob', role: 'member', present: true, presentBy: 'chair' },
        { id: 4, name: 'Gus', role: 'guest', present: true },
      ],
      meetingLog: [
        { time: '10:00:00', message: 'Meeting called to order.' },
        { time: '10:05:00', message: 'Bob marked present.' },
        { time: '10:30:00', message: 'Meeting adjourned.' },
      ],
    });
    const minutes = generateMeetingMinutes(state);

    expect(minutes.headcount).toBe(2);
    expect(minutes.headcountNames).toEqual(['Dee']);
    expect(minutes.attendance.find((a) => a.name === 'Bob')).toMatchObject({
      status: 'late',
      arrivedAt: '10:05:00',
    });

    const markdown = formatMinutesAsMarkdown(minutes);
    expect(markdown).toContain('**Also present without an account:** 2: Dee');
    expect(markdown).toContain('**Guests:**\n- Gus');
    expect(markdown).not.toContain('- Gus (');
  });

  it('should count the headcount toward quorum', () => {
    const state = createMockState({ quorum: 4, headcount: 2 });
    expect(generateMeetingMinutes(state).quorumPresent).toBe(true); // 2 members and 2 more
  });

  it('should calculate quorum status', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);

    expect(minutes.quorumPresent).toBe(true); // 2 present, quorum is 2
  });

  it('should include agenda items', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);

    expect(minutes.agendaItems).toHaveLength(2);
    expect(minutes.agendaItems[0].title).toBe('Budget Review');
    expect(minutes.agendaItems[0].status).toBe('completed');
  });

  it('should include completed motions', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);

    expect(minutes.motions).toHaveLength(1);
    expect(minutes.motions[0].text).toBe('Approve the budget');
    expect(minutes.motions[0].outcome).toBe('passed');
    expect(minutes.motions[0].voteCount?.yea).toBe(2);
  });

  it('should include tabled motions', () => {
    const state = createMockState({
      tabledMotions: [
        {
          id: 2,
          type: 'mainMotion',
          name: 'Main Motion',
          text: 'Postponed discussion',
          mover: 'Bob',
          moverId: 2,
          secondedBy: 'Alice',
          status: 'active',
          precedence: 1,
          category: 'main',
          interrupt: false,
          needsSecond: true,
          debatable: true,
          amendable: true,
          reconsidered: false,
          vote: 'majority',
          phrase: 'I move...',
          help: '',
          whenToUse: '',
        },
      ],
    });
    const minutes = generateMeetingMinutes(state);

    const tabledMotion = minutes.motions.find((m) => m.text === 'Postponed discussion');
    expect(tabledMotion).toBeDefined();
    expect(tabledMotion?.outcome).toBe('tabled');
  });

  it('should include elected officers', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);

    expect(minutes.electedOfficers).toHaveLength(1);
    expect(minutes.electedOfficers[0].position).toBe('Secretary');
    expect(minutes.electedOfficers[0].name).toBe('Bob');
  });

  it('should set generatedAt timestamp', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);

    expect(minutes.generatedAt).toBeDefined();
    expect(new Date(minutes.generatedAt).getTime()).not.toBeNaN();
  });
});

describe('formatMinutesAsMarkdown', () => {
  it('should format minutes as markdown', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);
    const markdown = formatMinutesAsMarkdown(minutes);

    expect(markdown).toContain('# Meeting Minutes');
    expect(markdown).toContain('**Meeting Code:** TEST01');
    expect(markdown).toContain('**Chair:** Alice');
  });

  it('should include attendance section', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);
    const markdown = formatMinutesAsMarkdown(minutes);

    expect(markdown).toContain('## Attendance');
    expect(markdown).toContain('**Present:**');
    expect(markdown).toContain('- Alice (Chair)');
    expect(markdown).toContain('**Absent:**');
    expect(markdown).toContain('- Charlie');
  });

  it('should include motions section', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);
    const markdown = formatMinutesAsMarkdown(minutes);

    expect(markdown).toContain('## Motions');
    expect(markdown).toContain('Approve the budget');
    expect(markdown).toContain('**Outcome:** PASSED');
  });

  it('should include elected officers section', () => {
    const state = createMockState();
    const minutes = generateMeetingMinutes(state);
    const markdown = formatMinutesAsMarkdown(minutes);

    expect(markdown).toContain('## Officers Elected');
    expect(markdown).toContain('**Secretary:** Bob');
  });
});
