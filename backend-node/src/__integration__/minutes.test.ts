import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initialState } from '@robbie-bylawyer/shared/reducer';
import type { OrgRole } from '../generated/prisma/client.js';
import { getStorage, initializeStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import {
  MAX_REVISIONS,
  MINUTES_APPROVED,
  MINUTES_BEFORE_MEETING,
  NO_MEETING_RECORD,
  ONLY_DRAFTS_REGENERATE,
} from '../bylawyer/routes/minutes.js';
import { resetDatabase, resetLiveMeetings } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

// Writing minutes again reads the meeting's live record, in the live meetings table; no test
// starts with one left over from another file
beforeAll(initializeStorage);
beforeEach(resetLiveMeetings);

describeRules('minutes rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/minutes',
    path: (f) => `/api/organizations/${f.orgA.id}/minutes`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/minutes/:id',
    path: (f) => `/api/minutes/${f.minutes}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/minutes/:id',
    path: (f) => `/api/minutes/${f.draftMinutes}`,
    body: () => ({ body: '# Edited' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/minutes/:id/publish',
    path: (f) => `/api/minutes/${f.draftMinutes}/publish`,
    min: 'secretary',
    ok: 200,
  },
  {
    // The fixture's meeting never met: the rule lets a secretary through to the answer that
    // there is nothing to write from
    method: 'post',
    route: '/minutes/:id/regenerate',
    path: (f) => `/api/minutes/${f.draftMinutes}/regenerate`,
    min: 'secretary',
    ok: 409,
  },
  {
    method: 'get',
    route: '/minutes/:id/revisions',
    path: (f) => `/api/minutes/${f.minutes}/revisions`,
    min: 'secretary',
    ok: 200,
  },
  {
    // No such revision: the rule lets a secretary through to the 404
    method: 'get',
    route: '/minutes/:id/revisions/:revisionId',
    path: (f) => `/api/minutes/${f.minutes}/revisions/00000000-0000-4000-8000-000000000000`,
    min: 'secretary',
    ok: 404,
  },
]);

describe('minutes', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const as = (role: OrgRole) => f.users[role].cookie;

  it('are listed by meeting date, the drafts only for secretaries and above', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.emptyPacket.id },
      data: { scheduledFor: new Date('2026-09-01T00:00:00Z') },
    });
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { scheduledFor: new Date('2026-10-20T19:00:00Z') },
    });
    const path = `/api/organizations/${f.orgA.id}/minutes`;

    const secretary = await call('get', path, { cookie: as('secretary') });
    expect(secretary.body.map((m: { id: string }) => m.id)).toEqual([f.draftMinutes, f.minutes]);
    expect(secretary.body[1]).toEqual({
      id: f.minutes,
      status: 'published',
      generatedAt: expect.any(String),
      updatedAt: expect.any(String),
      publishedAt: '2026-09-10T12:00:00.000Z',
      approvedAt: null,
      packet: {
        id: f.emptyPacket.id,
        robbieCode: 'ORGA02',
        title: null,
        scheduledFor: '2026-09-01T00:00:00.000Z',
      },
    });

    const member = await call('get', path, { cookie: as('member') });
    expect(member.body.map((m: { id: string }) => m.id)).toEqual([f.minutes]);
  });

  it('put a meeting without a date where it was held, the newest first', async () => {
    await prisma.meetingPacket.update({
      where: { id: f.emptyPacket.id },
      data: { scheduledFor: new Date('2026-09-01T00:00:00Z') },
    });
    // No date, but called to order after the dated meeting: it comes first
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { scheduledFor: null, startedAt: new Date('2026-10-20T19:00:00Z') },
    });
    const path = `/api/organizations/${f.orgA.id}/minutes`;
    const ids = async () =>
      (await call('get', path, { cookie: as('secretary') })).body.map((m: { id: string }) => m.id);
    expect(await ids()).toEqual([f.draftMinutes, f.minutes]);

    // Never called to order: when its minutes were written stands in for the date
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { startedAt: null },
    });
    await prisma.minutes.update({
      where: { id: f.draftMinutes },
      data: { generatedAt: new Date('2026-08-01T00:00:00Z') },
    });
    expect(await ids()).toEqual([f.minutes, f.draftMinutes]);
    await prisma.minutes.update({
      where: { id: f.draftMinutes },
      data: { generatedAt: new Date('2026-09-02T00:00:00Z') },
    });
    expect(await ids()).toEqual([f.draftMinutes, f.minutes]);
  });

  it('are read by members once published; a draft is not there for them', async () => {
    const published = await call('get', `/api/minutes/${f.minutes}`, { cookie: as('viewer') });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      id: f.minutes,
      packetId: f.emptyPacket.id,
      status: 'published',
      body: expect.stringContaining('September meeting'),
      corrections: null,
      packet: {
        id: f.emptyPacket.id,
        robbieCode: 'ORGA02',
        title: null,
        scheduledFor: null,
        location: null,
      },
      organization: { id: f.orgA.id, name: 'Org A', timeZone: 'America/Chicago' },
      publishedBy: { id: f.users.secretary.id, name: 'A secretary' },
      updatedBy: null,
      approvedAtPacket: null,
    });

    for (const role of ['viewer', 'member'] as const) {
      const draft = await call('get', `/api/minutes/${f.draftMinutes}`, { cookie: as(role) });
      expect(draft.status, role).toBe(404);
      expect(draft.body).toEqual({ error: 'Not found' });
    }
    const secretary = await call('get', `/api/minutes/${f.draftMinutes}`, {
      cookie: as('secretary'),
    });
    expect(secretary.body.status).toBe('draft');
  });

  it('are edited by a secretary, who is named as the last to save', async () => {
    const res = await call('put', `/api/minutes/${f.draftMinutes}`, {
      cookie: as('secretary'),
      body: { body: '# Minutes\n\nFixed a name.' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      body: '# Minutes\n\nFixed a name.',
      status: 'draft',
      updatedBy: { id: f.users.secretary.id, name: 'A secretary' },
    });
  });

  it('take a long text, but not one over 200,000 characters', async () => {
    const put = (body: string) =>
      call('put', `/api/minutes/${f.draftMinutes}`, { cookie: as('secretary'), body: { body } });
    // 128,000 characters: more than the usual 100 KB of JSON
    expect((await put('The meeting discussed the pool. '.repeat(4000))).status).toBe(200);
    expect((await put('x'.repeat(200_001))).status).toBe(400);
  });

  it('take a large body only where the text is saved, after the role check', async () => {
    // Over the usual 100 KB: refused by every other minutes route, as it is everywhere else
    const large = { body: 'x'.repeat(200_000) };
    for (const path of [
      `/api/minutes/${f.draftMinutes}/publish`,
      `/api/minutes/${f.draftMinutes}/regenerate`,
    ]) {
      const res = await call('post', path, { cookie: as('secretary'), body: large });
      expect(res.status, path).toBe(413);
    }
    // Read only for a secretary: a viewer's is refused for the role, without reading it
    const viewer = await call('put', `/api/minutes/${f.draftMinutes}`, {
      cookie: as('viewer'),
      body: { body: 'x'.repeat(1024 * 1024 + 1) },
    });
    expect(viewer.status).toBe(403);
    expect((await prisma.minutes.findUniqueOrThrow({ where: { id: f.draftMinutes } })).status).toBe(
      'draft',
    );
  });

  it('are published once, and approved minutes are not changed', async () => {
    const path = `/api/minutes/${f.draftMinutes}/publish`;
    const published = await call('post', path, { cookie: as('secretary') });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      status: 'published',
      publishedBy: { id: f.users.secretary.id },
    });
    expect(published.body.publishedAt).not.toBeNull();

    // Publishing again changes nothing: the first publisher stays
    const again = await call('post', path, { cookie: as('admin') });
    expect(again.status).toBe(200);
    expect(again.body.publishedBy.id).toBe(f.users.secretary.id);

    await prisma.minutes.update({
      where: { id: f.minutes },
      data: { status: 'approved', approvedAt: new Date() },
    });
    const edit = await call('put', `/api/minutes/${f.minutes}`, {
      cookie: as('secretary'),
      body: { body: 'Changed' },
    });
    expect(edit.status).toBe(409);
    expect(edit.body).toEqual({ error: MINUTES_APPROVED });
    const republish = await call('post', `/api/minutes/${f.minutes}/publish`, {
      cookie: as('secretary'),
    });
    expect(republish.status).toBe(409);
    const stored = await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } });
    expect(stored).toMatchObject({ status: 'approved' });
    expect(stored.body).not.toBe('Changed');
  });

  it('are not changed once they are before a meeting that has not adjourned', async () => {
    const edit = (body: string) =>
      call('put', `/api/minutes/${f.minutes}`, { cookie: as('secretary'), body: { body } });
    // Whether they are before a meeting, as the page reads it (the editor opens read-only)
    const beforeMeeting = async (id = f.minutes, role: OrgRole = 'secretary') =>
      (await call('get', `/api/minutes/${id}`, { cookie: as(role) })).body.beforeMeeting;
    // Published, and not yet before any meeting: the secretary can still fix them
    expect(await beforeMeeting()).toBe(false);
    const fixed = await edit('Fixed before the meeting');
    expect(fixed.status).toBe(200);
    expect(fixed.body.beforeMeeting).toBe(false);

    // ORGA01 opens and puts them before it to approve
    await getStorage().getOrCreateMeeting('ORGA01', {
      ...initialState,
      meetingCode: 'ORGA01',
      organizationId: f.orgA.id,
      minutesFromPreviousMeeting: 'Fixed before the meeting',
      previousMinutesId: f.minutes,
    });
    const locked = await edit('Changed while the meeting has them');
    expect(locked.status).toBe(409);
    expect(locked.body).toEqual({ error: MINUTES_BEFORE_MEETING });
    // The page learns it before a save is refused, whoever reads them
    expect(await beforeMeeting()).toBe(true);
    expect(await beforeMeeting(f.minutes, 'viewer')).toBe(true);
    // Called to order: still before it
    const meeting = (await getStorage().getMeeting('ORGA01'))!;
    await getStorage().updateMeetingState(
      'ORGA01',
      { ...meeting.state, meetingActive: true, meetingStage: 'call-to-order' },
      meeting.stateVersion,
      meeting.stateVersion + 1,
    );
    expect((await edit('Changed in the meeting')).status).toBe(409);
    const stored = await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } });
    expect(stored.body).toBe('Fixed before the meeting');

    // A draft of the same meeting is the secretary's to edit as ever
    expect(
      (
        await call('put', `/api/minutes/${f.draftMinutes}`, {
          cookie: as('secretary'),
          body: { body: 'Draft' },
        })
      ).status,
    ).toBe(200);
    expect(await beforeMeeting(f.draftMinutes)).toBe(false);

    // Adjourned (the packet ended) without approving them: they can be fixed again
    await prisma.meetingPacket.update({
      where: { id: f.packet.id },
      data: { endedAt: new Date() },
    });
    expect(await beforeMeeting()).toBe(false);
    expect((await edit('Fixed after the meeting')).status).toBe(200);
  });

  it('are written again from the meeting, for a draft only', async () => {
    // ORGA01's live record: adjourned after a vote that carried in both parts
    await getStorage().getOrCreateMeeting('ORGA01', {
      ...initialState,
      meetingCode: 'ORGA01',
      organizationId: f.orgA.id,
      title: 'October meeting',
      meetingStage: 'adjourned',
      members: [{ id: f.users.member.id, name: 'A member', role: 'member', present: true }],
      completedMotions: [
        {
          id: 1,
          type: 'mainMotion',
          name: 'Main Motion',
          text: 'Resurface the pool',
          mover: 'A member',
          moverId: f.users.member.id,
          passed: true,
          voterChoices: {},
          timestamp: '',
          reconsidered: false,
          deviceVotes: { yea: 2, nay: 0, abstain: 0 },
          floorVotes: { yea: 9, nay: 2, abstain: 0 },
          method: 'standard',
          disposition: 'carried',
        },
      ],
    });

    const res = await call('post', `/api/minutes/${f.draftMinutes}/regenerate`, {
      cookie: as('secretary'),
    });
    expect(res.status).toBe(200);
    expect(res.body.body).toContain('## Minutes of the October meeting');
    expect(res.body.body).toContain(
      '**Main motion.** A member moved: "Resurface the pool." Carried, on devices 2 to 0 and in the room 9 to 2: 11 to 2.',
    );
    expect(res.body.updatedBy).toMatchObject({ id: f.users.secretary.id });

    const published = await call('post', `/api/minutes/${f.minutes}/regenerate`, {
      cookie: as('secretary'),
    });
    expect(published.status).toBe(409);
    expect(published.body).toEqual({ error: ONLY_DRAFTS_REGENERATE });
  });

  it('say when the meeting has no record to write them from', async () => {
    const res = await call('post', `/api/minutes/${f.draftMinutes}/regenerate`, {
      cookie: as('secretary'),
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: NO_MEETING_RECORD });
  });

  it('keep the text members had read before each change to published minutes', async () => {
    const before = (await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } })).body;
    const edit = (body: string, role: OrgRole = 'secretary') =>
      call('put', `/api/minutes/${f.minutes}`, { cookie: as(role), body: { body } });
    expect((await edit('# Corrected once')).status).toBe(200);
    // The same text again is no change
    expect((await edit('# Corrected once', 'admin')).status).toBe(200);
    expect((await edit('# Corrected twice', 'admin')).status).toBe(200);

    const res = await call('get', `/api/minutes/${f.minutes}/revisions`, {
      cookie: as('secretary'),
    });
    expect(res.status).toBe(200);
    // The latest change first: who made it and when, without the text
    expect(res.body).toMatchObject([
      { editedBy: { id: f.users.admin.id, name: 'A admin' } },
      { editedBy: { id: f.users.secretary.id, name: 'A secretary' } },
    ]);
    expect(res.body[0]).not.toHaveProperty('body');
    expect(res.body[0].editedAt).toBeTruthy();

    // Each one's text, by its id: the minutes as they were before that change
    const texts = await Promise.all(
      res.body.map((r: { id: string }) =>
        call('get', `/api/minutes/${f.minutes}/revisions/${r.id}`, { cookie: as('secretary') }),
      ),
    );
    expect(texts.map((t) => t.body.body)).toEqual(['# Corrected once', before]);
    // Not through another meeting's minutes
    const elsewhere = await call(
      'get',
      `/api/minutes/${f.draftMinutes}/revisions/${res.body[0].id}`,
      { cookie: as('secretary') },
    );
    expect(elsewhere.status).toBe(404);
  });

  it("make one revision of a secretary's run of saves, for ten minutes", async () => {
    const before = (await prisma.minutes.findUniqueOrThrow({ where: { id: f.minutes } })).body;
    const edit = (body: string) =>
      call('put', `/api/minutes/${f.minutes}`, { cookie: as('secretary'), body: { body } });
    for (const text of ['# A', '# Ab', '# Abc']) expect((await edit(text)).status).toBe(200);
    expect(await prisma.minutesRevision.findMany({ select: { body: true } })).toEqual([
      { body: before },
    ]);

    // Ten minutes on, the next save starts a new one
    await prisma.minutesRevision.updateMany({
      data: { editedAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    expect((await edit('# Abcd')).status).toBe(200);
    expect(
      (await prisma.minutesRevision.findMany({ orderBy: { editedAt: 'asc' } })).map((r) => r.body),
    ).toEqual([before, '# Abc']);
  });

  it(`keep the latest ${MAX_REVISIONS} revisions`, async () => {
    const old = Date.now() - 24 * 60 * 60 * 1000;
    await prisma.minutesRevision.createMany({
      data: Array.from({ length: MAX_REVISIONS }, (_, i) => ({
        minutesId: f.minutes,
        body: `Revision ${i}`,
        editedById: f.users.admin.id,
        editedAt: new Date(old + i * 60_000),
      })),
    });
    const res = await call('put', `/api/minutes/${f.minutes}`, {
      cookie: as('secretary'),
      body: { body: '# Newest' },
    });
    expect(res.status).toBe(200);
    const kept = await prisma.minutesRevision.findMany({ orderBy: { editedAt: 'asc' } });
    expect(kept).toHaveLength(MAX_REVISIONS);
    expect(kept[0].body).toBe('Revision 1');
  });

  it('keep no revisions of a draft', async () => {
    const put = await call('put', `/api/minutes/${f.draftMinutes}`, {
      cookie: as('secretary'),
      body: { body: '# Draft, edited' },
    });
    expect(put.status).toBe(200);
    expect(await prisma.minutesRevision.count()).toBe(0);
  });
});
