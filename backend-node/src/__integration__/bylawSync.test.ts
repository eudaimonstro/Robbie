import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { CompletedMotion, MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { checkAndSyncBylawAmendment } from '../bylawyer/bylawSyncService.js';
import { AmendmentService } from '../bylawyer/services/amendmentService.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { liveSockets, type FakeSocket } from './liveSockets.js';

const closeVoting = { type: 'CLOSE_VOTING' } as unknown as MeetingAction;

type Change = NonNullable<CompletedMotion['bylawAmendment']>;

/** A decided bylaw amendment's record, with its change */
function decided(change: Change, overrides: Partial<CompletedMotion> = {}): CompletedMotion {
  return {
    id: 41,
    type: 'bylawAmendment',
    name: 'Bylaw Amendment',
    text: 'Rename the organization',
    passed: true,
    voterChoices: {},
    timestamp: '',
    reconsidered: false,
    bylawAmendment: change,
    ...overrides,
  };
}

/** The states before and after a vote on a bylaw amendment that adds these records */
function states(...records: CompletedMotion[]) {
  const before = {
    ...initialState,
    currentMotion: { id: 41, type: 'bylawAmendment', vote: '2/3' },
    votes: { yea: 5, nay: 1, abstain: 0 },
  } as unknown as MeetingState;
  const after = { ...initialState, completedMotions: records } as MeetingState;
  return { before, after };
}

const rename = (documentId: string, targetSectionId: string): Change => ({
  documentId,
  changeType: 'modify',
  targetSectionId,
  newContent: 'The name is A Prime.',
});

/** The states before and after a passing vote on a bylaw amendment to a document */
function votedStates(documentId: string, targetSectionId: string) {
  return states(decided(rename(documentId, targetSectionId)));
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
    expect(amendment).toMatchObject({
      documentId: f.doc,
      status: 'passed',
      title: 'Rename the organization',
    });
  });

  it('applies a bylaw amendment that failed and carries on reconsideration', async () => {
    const change = rename(f.doc, f.section);
    const failed = decided(change, { passed: false, disposition: 'failed' });
    const first = states(failed);
    expect(
      await checkAndSyncBylawAmendment(f.packet.code, closeVoting, first.before, first.after),
    ).toMatchObject({ success: true, applied: false });
    // Reconsidered and carried, under the reconsider motion's id
    const before = { ...states().before, completedMotions: [{ ...failed, reconsidered: true }] };
    const after = {
      ...initialState,
      completedMotions: [{ ...failed, reconsidered: true }, decided(change, { id: 50 })],
    } as MeetingState;
    const result = await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after);
    expect(result).toMatchObject({ success: true, applied: true });
    const section = await prisma.section.findFirstOrThrow({
      where: { version: { document: { id: f.doc } }, content: 'The name is A Prime.' },
    });
    expect(section).toBeTruthy();
  });

  it("doesn't record a reversal it can't apply: one applied, then failed on reconsideration", async () => {
    const change = rename(f.doc, f.section);
    const carried = decided(change);
    const first = states(carried);
    await checkAndSyncBylawAmendment(f.packet.code, closeVoting, first.before, first.after);
    const before = { ...states().before, completedMotions: [{ ...carried, reconsidered: true }] };
    const after = {
      ...initialState,
      completedMotions: [
        { ...carried, reconsidered: true },
        decided(change, { id: 50, passed: false, disposition: 'failed' }),
      ],
    } as MeetingState;
    expect(
      await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
    ).toMatchObject({
      success: false,
    });
    expect(await prisma.amendment.count({ where: { robbieMeetingCode: f.packet.code } })).toBe(1);
  });

  it('adds a section under the section the motion names', async () => {
    const { before, after } = states(
      decided({
        documentId: f.doc,
        changeType: 'add',
        parentSectionId: f.section,
        newNumberLabel: '1.2',
        newTitle: 'Seal',
        newContent: 'The seal is round.',
      }),
    );
    expect(
      await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
    ).toMatchObject({
      applied: true,
    });
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: f.doc } });
    const added = await prisma.section.findFirstOrThrow({
      where: { versionId: doc.currentVersionId!, title: 'Seal' },
      include: { parent: true },
    });
    expect(added.parent).toMatchObject({ numberLabel: '1', title: 'Name' });
  });

  it('records an added section whose parent left the current version as passed, not applied', async () => {
    const { before, after } = states(
      decided({
        documentId: f.doc,
        changeType: 'add',
        parentSectionId: f.oldSection,
        newTitle: 'X',
      }),
    );
    expect(
      await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
    ).toMatchObject({ success: true, applied: false });
    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
    });
    expect(amendment).toMatchObject({ status: 'passed', resultingVersionId: null });
    expect(amendment.description).toContain('not applied');
  });

  /** Another amendment to the name, applied: the document's current version moves on */
  async function applyAnother() {
    const other = await prisma.amendment.create({
      data: {
        documentId: f.doc,
        title: 'Another',
        status: 'passed',
        changes: {
          create: {
            changeType: 'modify',
            targetSectionId: f.section,
            newContent: 'The name is B.',
          },
        },
      },
      include: { changes: true },
    });
    await new AmendmentService().applyAmendment(other);
  }

  it('records a motion decided after the bylaws changed under it: passed, not applied, and why', async () => {
    // Moved against version 2, then another amendment made version 3, then it carried
    await applyAnother();
    const { before, after } = votedStates(f.doc, f.section);
    expect(
      await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
    ).toMatchObject({ success: true, applied: false });
    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
      include: { changes: true },
    });
    expect(amendment).toMatchObject({ status: 'passed', resultingVersionId: null });
    expect(amendment.description).toBe(
      'Adopted at the meeting but not applied: the bylaws changed after it was moved, and its section is no longer in the current version. A secretary applies the change to the current version.',
    );
    expect(amendment.changes[0]).toMatchObject({ newContent: 'The name is A Prime.' });
  });

  it('applies a proposed amendment decided after another was applied, at its section now', async () => {
    await prisma.amendmentChange.create({
      data: {
        amendmentId: f.proposed,
        changeType: 'modify',
        targetSectionId: f.section,
        newContent: 'The name is A Prime.',
      },
    });
    // Moved against version 2 (the motion names version 2's section), then version 3 was made
    await applyAnother();
    const { before, after } = states(
      decided({ ...rename(f.doc, f.section), amendmentId: f.proposed }),
    );
    expect(
      await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
    ).toMatchObject({ success: true, amendmentId: f.proposed, applied: true });
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: f.doc } });
    const name = await prisma.section.findFirstOrThrow({
      where: { versionId: doc.currentVersionId!, numberLabel: '1' },
    });
    expect(name.content).toBe('The name is A Prime.');
  });

  it('marks the proposed amendment it moved passed, with the text adopted, and applies it', async () => {
    await prisma.amendmentChange.create({
      data: {
        amendmentId: f.proposed,
        changeType: 'modify',
        targetSectionId: f.section,
        newContent: 'The name is A Prime.',
      },
    });
    const amendments = await prisma.amendment.count();
    const { before, after } = states(
      decided({
        ...rename(f.doc, f.section),
        targetSectionLabel: '1 "Name"',
        amendmentId: f.proposed,
        amendmentTitle: 'Rename',
      }),
    );
    const result = await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after);
    expect(result).toMatchObject({ success: true, amendmentId: f.proposed, applied: true });
    // No second amendment
    expect(await prisma.amendment.count()).toBe(amendments);
    const amendment = await prisma.amendment.findUniqueOrThrow({
      where: { id: f.proposed },
      include: { changes: true },
    });
    expect(amendment).toMatchObject({
      status: 'passed',
      robbieMeetingCode: f.packet.code,
      robbieMotionId: 41n,
    });
    expect(amendment.resultingVersionId).not.toBeNull();
    expect(amendment.changes).toEqual([
      expect.objectContaining({
        changeType: 'modify',
        newContent: 'The name is A Prime.',
        targetLabel: '1 "Name"',
      }),
    ]);
    // Run again, nothing changes
    expect(
      await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
    ).toMatchObject({
      amendmentId: f.proposed,
      applied: true,
    });
  });

  it('marks the proposed amendment it moved failed', async () => {
    const { before, after } = states(
      decided(
        { ...rename(f.doc, f.section), amendmentId: f.proposed },
        { passed: false, disposition: 'failed' },
      ),
    );
    await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after);
    const amendment = await prisma.amendment.findUniqueOrThrow({ where: { id: f.proposed } });
    expect(amendment).toMatchObject({ status: 'failed', resultingVersionId: null });
  });

  it('leaves alone an amendment that is no longer proposed', async () => {
    const { before, after } = states(
      decided({ ...rename(f.doc, f.section), amendmentId: f.tabled }),
    );
    expect(
      await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
    ).toMatchObject({
      success: false,
    });
    expect(await prisma.amendment.findUniqueOrThrow({ where: { id: f.tabled } })).toMatchObject({
      status: 'tabled',
    });
  });

  it('applies a motion adopted by unanimous consent, with no votes', async () => {
    const { before } = votedStates(f.doc, f.section);
    const { after } = states(decided(rename(f.doc, f.section), { disposition: 'unanimous' }));
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

  it('counts no votes for unanimous consent, whatever an earlier vote left', async () => {
    // The votes of the last question taken, still in the state, and a record without its parts
    const { before } = votedStates(f.doc, f.section);
    const { after } = states(decided(rename(f.doc, f.section), { disposition: 'unanimous' }));
    const consent = { type: 'UNANIMOUS_CONSENT_PASSED' } as unknown as MeetingAction;
    const result = await checkAndSyncBylawAmendment(f.packet.code, consent, before, after);
    expect(result).toMatchObject({ success: true, applied: true });
    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { robbieMeetingCode: f.packet.code },
    });
    expect(amendment.robbieVoteData).toMatchObject({
      yeaCount: 0,
      nayCount: 0,
      abstainCount: 0,
      deviceVotes: { yea: 0, nay: 0, abstain: 0 },
      disposition: 'unanimous',
    });
  });

  it('records the device votes, the floor tally and their total', async () => {
    const { before } = votedStates(f.doc, f.section);
    const { after } = states(
      decided(rename(f.doc, f.section), {
        deviceVotes: { yea: 5, nay: 1, abstain: 0 },
        floorVotes: { yea: 9, nay: 2, abstain: 1 },
        method: 'ballot',
      }),
    );
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

  it("doesn't apply a motion whose section isn't in the document's current version", async () => {
    for (const [index, targetSectionId] of [f.sectionB, f.oldSection].entries()) {
      const { before, after } = states(decided(rename(f.doc, targetSectionId), { id: 41 + index }));
      expect(
        await checkAndSyncBylawAmendment(f.packet.code, closeVoting, before, after),
      ).toMatchObject({ applied: false });
    }
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

  /** A's meeting under way, run by the secretary, with the member and the owner present */
  async function meetingUnderWay() {
    const secretary = live.connect(f.users.secretary);
    const member = live.connect(f.users.member);
    const owner = live.connect(f.users.owner);
    for (const socket of [secretary, member, owner]) {
      expect((await live.join(socket, f.packet.code)).success).toBe(true);
    }
    await act(secretary, { type: 'START_MEETING' });
    await act(secretary, { type: 'ADOPT_AGENDA' });
    return { secretary, member, owner };
  }

  const pendingSecond = async () =>
    (await getStorage().getMeeting(f.packet.code))!.state.pendingSecond;

  it('puts the section and its text, from the bylaws, in the motion the room sees', async () => {
    const { member } = await meetingUnderWay();
    await act(member, {
      type: 'MAKE_MOTION',
      motionType: 'bylawAmendment',
      // What the device says is replaced with the words the change makes
      text: 'Fix a typo',
      motionId: 0,
      bylawAmendment: {
        documentId: f.doc,
        documentTitle: 'Forged title',
        changeType: 'modify',
        targetSectionId: f.section,
        targetSectionLabel: 'Section 99',
        currentContent: 'Forged text',
        newContent: 'The name is A Prime.',
      },
    });
    const motion = await pendingSecond();
    expect(motion?.text).toBe('I move to amend the bylaws by modifying 1 "Name"');
    expect(motion?.bylawAmendment).toEqual({
      documentId: f.doc,
      documentTitle: 'Bylaws',
      changeType: 'modify',
      targetSectionId: f.section,
      targetSectionLabel: '1 "Name"',
      currentTitle: 'Name',
      currentContent: 'The name is A.',
      newContent: 'The name is A Prime.',
    });
  });

  it('moves a proposed amendment with its own text, and marks it passed when adopted', async () => {
    await prisma.amendmentChange.create({
      data: {
        amendmentId: f.proposed,
        changeType: 'add',
        targetSectionId: f.section,
        newNumberLabel: '1.2',
        newTitle: 'Seal',
        newContent: 'The seal is round.',
      },
    });
    const amendments = await prisma.amendment.count();
    const { secretary, member, owner } = await meetingUnderWay();
    await act(member, {
      type: 'MAKE_MOTION',
      motionType: 'bylawAmendment',
      text: '',
      motionId: 0,
      // Text sent with it is ignored: the amendment's own is moved
      bylawAmendment: {
        documentId: f.doc,
        amendmentId: f.proposed,
        changeType: 'modify',
        targetSectionId: f.section,
        newContent: 'Something else',
      },
    });
    const motion = await pendingSecond();
    expect(motion?.text).toBe(
      'I move to amend the bylaws by adding a new section under 1 "Name": "Seal", as proposed in "A proposed amendment"',
    );
    expect(motion?.bylawAmendment).toMatchObject({
      amendmentId: f.proposed,
      changeType: 'add',
      parentSectionId: f.section,
      parentSectionLabel: '1 "Name"',
      newContent: 'The seal is round.',
    });
    expect(motion?.bylawAmendment).not.toHaveProperty('targetSectionId');

    await act(owner, { type: 'SECOND_MOTION' });
    await act(secretary, { type: 'REQUEST_UNANIMOUS_CONSENT' });
    await act(secretary, { type: 'UNANIMOUS_CONSENT_PASSED' });

    expect(await prisma.amendment.count()).toBe(amendments);
    const amendment = await prisma.amendment.findUniqueOrThrow({ where: { id: f.proposed } });
    expect(amendment.status).toBe('passed');
    expect(amendment.resultingVersionId).not.toBeNull();
    const seal = await prisma.section.findFirstOrThrow({
      where: { versionId: amendment.resultingVersionId!, title: 'Seal' },
      include: { parent: true },
    });
    expect(seal.parent?.title).toBe('Name');
  });

  it('moves a second proposed amendment after the first is applied', async () => {
    await prisma.amendmentChange.create({
      data: {
        amendmentId: f.proposed,
        changeType: 'modify',
        targetSectionId: f.section,
        newContent: 'The name is A Prime.',
      },
    });
    const second = await prisma.amendment.create({
      data: {
        documentId: f.doc,
        title: 'Shorten the short name',
        status: 'proposed',
        changes: {
          create: { changeType: 'modify', targetSectionId: f.child, newContent: 'A for short.' },
        },
      },
    });
    const { secretary, member, owner } = await meetingUnderWay();
    const adopt = async (amendmentId: string) => {
      await act(member, {
        type: 'MAKE_MOTION',
        motionType: 'bylawAmendment',
        text: '',
        motionId: 0,
        bylawAmendment: { documentId: f.doc, amendmentId, changeType: 'modify' },
      });
      await act(owner, { type: 'SECOND_MOTION' });
      await act(secretary, { type: 'REQUEST_UNANIMOUS_CONSENT' });
      await act(secretary, { type: 'UNANIMOUS_CONSENT_PASSED' });
    };
    await adopt(f.proposed);
    // The first made version 3: the second's change now names the short name's new id
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: f.doc } });
    const child = await prisma.section.findFirstOrThrow({
      where: { versionId: doc.currentVersionId!, numberLabel: '1.1' },
    });
    expect(
      await prisma.amendmentChange.findFirstOrThrow({ where: { amendmentId: second.id } }),
    ).toMatchObject({ targetSectionId: child.id });

    await adopt(second.id);
    const decided = await prisma.amendment.findUniqueOrThrow({ where: { id: second.id } });
    expect(decided.status).toBe('passed');
    expect(decided.resultingVersionId).not.toBeNull();
    const latest = await prisma.section.findFirstOrThrow({
      where: { versionId: decided.resultingVersionId!, numberLabel: '1.1' },
    });
    expect(latest.content).toBe('A for short.');
  });

  it.each([
    [
      'a section not in the current version',
      (fx: Fixture) => ({
        documentId: fx.doc,
        changeType: 'modify',
        targetSectionId: fx.oldSection,
        newContent: 'x',
      }),
    ],
    [
      "another organization's document",
      (fx: Fixture) => ({
        documentId: fx.docB,
        changeType: 'modify',
        targetSectionId: fx.sectionB,
        newContent: 'x',
      }),
    ],
    [
      'a parent not in the current version',
      (fx: Fixture) => ({
        documentId: fx.doc,
        changeType: 'add',
        parentSectionId: fx.oldSection,
        newTitle: 'x',
      }),
    ],
    [
      'an amendment still in draft',
      (fx: Fixture) => ({
        documentId: fx.doc,
        changeType: 'modify',
        amendmentId: fx.draft,
      }),
    ],
    [
      'a change with no new text',
      (fx: Fixture) => ({
        documentId: fx.doc,
        changeType: 'modify',
        targetSectionId: fx.section,
      }),
    ],
  ])('refuses a bylaw amendment to %s', async (_label, change) => {
    const { member } = await meetingUnderWay();
    const response = await live.dispatch(member, {
      type: 'MAKE_MOTION',
      motionType: 'bylawAmendment',
      text: 'x',
      motionId: 0,
      timestamp: '',
      bylawAmendment: change(f),
    });
    expect(response).toMatchObject({ success: false, errorCode: 'INVALID_ACTION' });
    expect(await pendingSecond()).toBeNull();
  });
});
