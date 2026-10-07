import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { checkAndSyncBylawAmendment } from '../bylawyer/bylawSyncService.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';

const closeVoting = { type: 'CLOSE_VOTING' } as unknown as MeetingAction;

/** The meeting states before and after a passing vote on a bylaw amendment to a document */
function votedStates(documentId: string, targetSectionId: string) {
  const motion = {
    id: 41,
    type: 'bylawAmendment',
    text: 'Rename the organization',
    vote: 'majority',
    bylawAmendment: {
      documentId,
      changeType: 'modify',
      targetSectionId,
      newContent: 'The name is A Prime.',
    },
  };
  const before = {
    ...initialState,
    currentMotion: motion,
    votes: { yea: 5, nay: 1, abstain: 0 },
  } as unknown as MeetingState;
  const after = {
    ...initialState,
    completedMotions: [{ id: 41, passed: true, voterChoices: {} }],
  } as unknown as MeetingState;
  return { before, after };
}

describe('bylaw sync', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("applies a passed motion to a document of the meeting's organization", async () => {
    const { before, after } = votedStates(f.doc, f.section);
    const result = await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after);
    expect(result).toMatchObject({ success: true, applied: true });
    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
    });
    expect(amendment).toMatchObject({ documentId: f.doc, status: 'passed' });
  });

  it('reads the latest record of a motion voted on again after reconsideration', async () => {
    const { before } = votedStates(f.doc, f.section);
    const after = {
      ...initialState,
      completedMotions: [
        { id: 41, passed: false, voterChoices: {} },
        { id: 41, passed: true, voterChoices: {} },
      ],
    } as unknown as MeetingState;
    const result = await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after);
    expect(result).toMatchObject({ success: true, applied: true });
  });

  it('applies a motion adopted by unanimous consent, with no votes', async () => {
    const { before } = votedStates(f.doc, f.section);
    const after = {
      ...initialState,
      completedMotions: [{ id: 41, passed: true, voterChoices: {}, disposition: 'unanimous' }],
    } as unknown as MeetingState;
    const consent = { type: 'UNANIMOUS_CONSENT_PASSED' } as unknown as MeetingAction;
    const result = await checkAndSyncBylawAmendment(
      f.packet.code,
      consent,
      { ...before, votes: { yea: 0, nay: 0, abstain: 0 } },
      after,
    );
    expect(result).toMatchObject({ success: true, applied: true });
    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
    });
    expect(amendment).toMatchObject({ status: 'passed' });
    expect(amendment.robbieVoteData).toMatchObject({
      yeaCount: 0,
      nayCount: 0,
      disposition: 'unanimous',
    });
  });

  it('records the device votes, the floor tally and their total', async () => {
    const { before } = votedStates(f.doc, f.section);
    const after = {
      ...initialState,
      completedMotions: [
        {
          id: 41,
          passed: true,
          voterChoices: {},
          deviceVotes: { yea: 5, nay: 1, abstain: 0 },
          floorVotes: { yea: 9, nay: 2, abstain: 1 },
          method: 'ballot',
        },
      ],
    } as unknown as MeetingState;
    await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after);
    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
    });
    expect(amendment.robbieVoteData).toMatchObject({
      yeaCount: 14,
      nayCount: 3,
      abstainCount: 1,
      deviceVotes: { yea: 5, nay: 1, abstain: 0 },
      floorVotes: { yea: 9, nay: 2, abstain: 1 },
      method: 'ballot',
    });
  });

  it('skips a motion whose document is in another organization', async () => {
    const { before, after } = votedStates(f.docB, f.sectionB);
    expect(await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after)).toBeNull();
    expect(await prisma.amendment.count({ where: { robbieMeetingCode: f.packet.code } })).toBe(0);
    const sectionB = await prisma.section.findUniqueOrThrow({ where: { id: f.sectionB } });
    expect(sectionB.content).toBe('The name is B.');
  });

  it("skips a motion whose section is not in the document's current version", async () => {
    for (const targetSectionId of [f.sectionB, f.oldSection]) {
      const { before, after } = votedStates(f.doc, targetSectionId);
      expect(
        await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
      ).toBeNull();
    }
    expect(await prisma.amendment.count({ where: { robbieMeetingCode: f.packet.code } })).toBe(0);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: f.doc } });
    expect(doc.currentVersionId).toBe(f.v2);
  });

  it('skips a meeting without a packet', async () => {
    const { before, after } = votedStates(f.doc, f.section);
    expect(await checkAndSyncBylawAmendment('NOPACK', closeVoting, before, after)).toBeNull();
    expect(await prisma.amendment.count({ where: { robbieMeetingCode: 'NOPACK' } })).toBe(0);
  });
});

describe('bylaw sync in a live meeting', () => {
  const live = liveSockets();
  let f: Fixture;
  // The live meetings table and its storage, as the server starts them
  beforeAll(initializeStorage);
  beforeEach(async () => {
    await resetDatabase();
    await resetLiveMeetings();
    f = await seedFixture();
  });
  afterEach(live.disconnectAll);

  async function act(socket: FakeSocket, action: Record<string, unknown>) {
    const res = await live.dispatch(socket, { timestamp: '', ...action });
    expect(res, JSON.stringify(action)).toMatchObject({ success: true });
  }

  it('applies a bylaw amendment adopted by unanimous consent', async () => {
    // A's October meeting, run by the secretary as an admin
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    const owner = live.connect(f.users.owner);
    for (const socket of [secretary, member, owner]) {
      expect((await live.join(socket, f.packet.code)).success).toBe(true);
    }
    await act(secretary, { type: 'START_MEETING' });
    await act(secretary, { type: 'ADOPT_AGENDA' });
    await act(member, {
      type: 'MAKE_MOTION',
      motionType: 'bylawAmendment',
      text: 'Rename the organization',
      mover: '',
      moverId: 0,
      motionId: 0,
      bylawAmendment: {
        documentId: f.doc,
        changeType: 'modify',
        targetSectionId: f.section,
        newContent: 'The name is A Prime.',
      },
    });
    await act(owner, { type: 'SECOND_MOTION', seconder: '' });
    await act(secretary, { type: 'REQUEST_UNANIMOUS_CONSENT' });
    await act(secretary, { type: 'UNANIMOUS_CONSENT_PASSED' });

    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
    });
    expect(amendment).toMatchObject({ documentId: f.doc, status: 'passed' });
    expect(amendment.resultingVersionId).not.toBeNull();
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: f.doc } });
    expect(doc.currentVersionId).toBe(amendment.resultingVersionId);
    expect(doc.currentVersionId).not.toBe(f.v2);
  });
});
