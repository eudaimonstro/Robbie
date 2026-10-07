import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('amendment rules', [
  {
    method: 'get',
    route: '/documents/:docId/amendments',
    path: (f) => `/api/documents/${f.doc}/amendments`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:docId/amendments',
    path: (f) => `/api/documents/${f.doc}/amendments`,
    body: () => ({ title: 'Raise dues' }),
    min: 'member',
    ok: 201,
  },
  {
    method: 'get',
    route: '/amendments/:id',
    path: (f) => `/api/amendments/${f.draft}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/amendments/:id',
    path: (f) => `/api/amendments/${f.draft}`,
    body: () => ({ title: 'Lower dues' }),
    min: 'member',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/amendments/:id',
    path: (f) => `/api/amendments/${f.draft}`,
    min: 'member',
    ok: 204,
  },
  {
    method: 'post',
    route: '/amendments/:id/propose',
    path: (f) => `/api/amendments/${f.draft}/propose`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/withdraw',
    path: (f) => `/api/amendments/${f.proposed}/withdraw`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/pass',
    path: (f) => `/api/amendments/${f.proposed}/pass`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/fail',
    path: (f) => `/api/amendments/${f.proposed}/fail`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/table',
    path: (f) => `/api/amendments/${f.proposed}/table`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/untable',
    path: (f) => `/api/amendments/${f.tabled}/untable`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'get',
    route: '/amendments/:id/changes',
    path: (f) => `/api/amendments/${f.draft}/changes`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/amendments/:id/changes',
    path: (f) => `/api/amendments/${f.draft}/changes`,
    body: (f) => ({
      changeType: 'modify',
      targetSectionId: f.child,
      newContent: 'The short name is A2.',
    }),
    min: 'member',
    ok: 201,
  },
  {
    method: 'delete',
    route: '/changes/:id',
    path: (f) => `/api/changes/${f.change}`,
    min: 'member',
    ok: 204,
  },
  {
    method: 'delete',
    route: '/amendment-changes/:id',
    path: (f) => `/api/amendment-changes/${f.change}`,
    min: 'member',
    ok: 204,
  },
  {
    method: 'post',
    route: '/amendments/:id/apply',
    path: (f) => `/api/amendments/${f.passed}/apply`,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'get',
    route: '/amendments/:id/preview',
    path: (f) => `/api/amendments/${f.draft}/preview`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('amendment drafts', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const draftBy = (createdById: number | null) =>
    prisma.amendment.create({
      data: { documentId: f.doc, title: 'Another draft', createdById },
    });

  it('record who created them', async () => {
    const res = await call('post', `/api/documents/${f.doc}/amendments`, {
      cookie: f.users.member.cookie,
      body: { title: 'Raise dues' },
    });
    expect(res.status).toBe(201);
    expect(res.body.createdById).toBe(f.users.member.id);
  });

  it("can't be changed by a member who didn't create them", async () => {
    const other = await draftBy(f.users.secretary.id);
    const change = await prisma.amendmentChange.create({
      data: { amendmentId: other.id, changeType: 'delete', targetSectionId: f.child },
    });
    const cookie = f.users.member.cookie;
    const refusals = [
      await call('put', `/api/amendments/${other.id}`, { cookie, body: { title: 'Mine now' } }),
      await call('delete', `/api/amendments/${other.id}`, { cookie }),
      await call('post', `/api/amendments/${other.id}/changes`, {
        cookie,
        body: { changeType: 'delete', targetSectionId: f.section },
      }),
      await call('delete', `/api/changes/${change.id}`, { cookie }),
      await call('delete', `/api/amendment-changes/${change.id}`, { cookie }),
    ];
    for (const res of refusals) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'You need the secretary role for this' });
    }
    expect(await prisma.amendment.count({ where: { id: other.id } })).toBe(1);
  });

  it("can't be changed by their creator once proposed", async () => {
    await prisma.amendment.update({ where: { id: f.draft }, data: { status: 'proposed' } });
    const res = await call('put', `/api/amendments/${f.draft}`, {
      cookie: f.users.member.cookie,
      body: { title: 'Too late' },
    });
    expect(res.status).toBe(403);
  });

  it('without a recorded creator can be changed only by a secretary', async () => {
    const old = await draftBy(null);
    const member = await call('put', `/api/amendments/${old.id}`, {
      cookie: f.users.member.cookie,
      body: { title: 'x' },
    });
    expect(member.status).toBe(403);
    const secretary = await call('put', `/api/amendments/${old.id}`, {
      cookie: f.users.secretary.cookie,
      body: { title: 'x' },
    });
    expect(secretary.status).toBe(200);
  });

  it('are no longer changed once they leave draft, even by a secretary', async () => {
    const change = await prisma.amendmentChange.create({
      data: { amendmentId: f.proposed, changeType: 'delete', targetSectionId: f.child },
    });
    const cookie = f.users.secretary.cookie;
    const refusals = [
      await call('put', `/api/amendments/${f.proposed}`, { cookie, body: { title: 'Late' } }),
      await call('post', `/api/amendments/${f.proposed}/changes`, {
        cookie,
        body: { changeType: 'delete', targetSectionId: f.section },
      }),
      await call('delete', `/api/changes/${change.id}`, { cookie }),
      await call('delete', `/api/amendment-changes/${change.id}`, { cookie }),
      await call('delete', `/api/amendments/${f.proposed}`, { cookie }),
    ];
    for (const res of refusals) {
      expect(res.status).toBe(400);
    }
    const proposed = await prisma.amendment.findUniqueOrThrow({
      where: { id: f.proposed },
      include: { changes: true },
    });
    expect(proposed.title).toBe('A proposed amendment');
    expect(proposed.changes.map((c) => c.id)).toEqual([change.id]);
  });

  it('accept an edit that changes nothing only while a draft', async () => {
    const draft = await call('put', `/api/amendments/${f.draft}`, {
      cookie: f.users.member.cookie,
      body: {},
    });
    expect(draft.status).toBe(200);
    expect(draft.body).toMatchObject({ id: f.draft, title: 'A draft amendment' });
    const proposed = await call('put', `/api/amendments/${f.proposed}`, {
      cookie: f.users.secretary.cookie,
      body: {},
    });
    expect(proposed.status).toBe(400);
    expect(proposed.body).toEqual({ error: 'Can only update draft amendments' });
  });

  it('can be edited by a secretary, whoever created them', async () => {
    const res = await call('put', `/api/amendments/${f.draft}`, {
      cookie: f.users.secretary.cookie,
      body: { title: 'Edited by the secretary' },
    });
    expect(res.status).toBe(200);
  });
});

describe('amendment changes', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const addChange = (body: object) =>
    call('post', `/api/amendments/${f.draft}/changes`, {
      cookie: f.users.member.cookie,
      body: { changeType: 'add', newContent: 'New text', ...body },
    });

  it("must name sections of the document's current version", async () => {
    for (const body of [
      { targetSectionId: f.sectionB },
      { targetSectionId: f.oldSection },
      { parentSectionId: f.sectionB },
    ]) {
      const res = await addChange(body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Section not found' });
    }
    expect(await prisma.amendmentChange.count({ where: { amendmentId: f.draft } })).toBe(1);
  });

  it('may name no section, or sections of the current version', async () => {
    expect((await addChange({})).status).toBe(201);
    expect(
      (await addChange({ targetSectionId: f.section, parentSectionId: f.section })).status,
    ).toBe(201);
  });
});

describe('amendment status changes', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const post = (id: string, action: string) =>
    call('post', `/api/amendments/${id}/${action}`, { cookie: f.users.secretary.cookie });

  it('are refused from the wrong status', async () => {
    await prisma.amendment.update({ where: { id: f.draft }, data: { status: 'withdrawn' } });
    const refusals: Array<[string, string]> = [
      ['propose', 'Can only propose draft amendments'],
      ['withdraw', 'Cannot withdraw this amendment'],
      ['pass', 'Can only pass proposed amendments'],
      ['fail', 'Can only fail proposed amendments'],
      ['table', 'Can only table proposed amendments'],
      ['untable', 'Can only untable tabled amendments'],
    ];
    for (const [action, error] of refusals) {
      const res = await post(f.draft, action);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error });
    }
    const amendment = await prisma.amendment.findUniqueOrThrow({ where: { id: f.draft } });
    expect(amendment.status).toBe('withdrawn');
  });

  it("don't bring back an amendment withdrawn at the same time", async () => {
    const [propose, withdraw] = await Promise.all([
      post(f.draft, 'propose'),
      post(f.draft, 'withdraw'),
    ]);
    // Withdrawing works from draft and from proposed, so in either order it wins; a propose
    // that comes second is refused
    expect(withdraw.status).toBe(200);
    expect([200, 400]).toContain(propose.status);
    const amendment = await prisma.amendment.findUniqueOrThrow({ where: { id: f.draft } });
    expect(amendment.status).toBe('withdrawn');
  });

  it('apply a passed amendment once, also when applies arrive together', async () => {
    const before = await prisma.version.count({ where: { documentId: f.doc } });
    const results = await Promise.all([post(f.passed, 'apply'), post(f.passed, 'apply')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.status === 400)!.body).toEqual({
      error: 'Amendment has already been applied',
    });
    expect(await prisma.version.count({ where: { documentId: f.doc } })).toBe(before + 1);
  });
});

describe('amendment previews', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const preview = () =>
    call('get', `/api/amendments/${f.draft}/preview`, { cookie: f.users.viewer.cookie });

  it('show a modified section with its text from before', async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    const [name] = res.body.sections;
    expect(name).toMatchObject({
      id: f.section,
      content: 'The name is A2.',
      modified: true,
      previous: { numberLabel: '1', title: 'Name', content: 'The name is A.' },
    });
    expect(name.children[0]).toMatchObject({ id: f.child, modified: false, previous: null });
  });

  it('show added and deleted sections without text from before', async () => {
    await prisma.amendmentChange.createMany({
      data: [
        {
          amendmentId: f.draft,
          changeType: 'add',
          newNumberLabel: '2',
          newTitle: 'Purpose',
          newContent: 'Gardens.',
          position: 1,
        },
        { amendmentId: f.draft, changeType: 'delete', targetSectionId: f.child, position: 2 },
      ],
    });
    const res = await preview();
    const added = res.body.sections.find((s: { added: boolean }) => s.added);
    expect(added).toMatchObject({
      numberLabel: '2',
      title: 'Purpose',
      content: 'Gardens.',
      previous: null,
    });
    expect(res.body.sections[0].children[0]).toMatchObject({
      id: f.child,
      deleted: true,
      previous: null,
    });
  });
});
