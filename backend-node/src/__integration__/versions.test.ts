import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';
import {
  ADOPTED_VERSION,
  CURRENT_VERSION,
  EARLIER_VERSION,
} from '../bylawyer/services/versionRules.js';

describeRules('version rules', [
  {
    method: 'get',
    route: '/documents/:docId/versions',
    path: (f) => `/api/documents/${f.doc}/versions`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:docId/versions',
    path: (f) => `/api/documents/${f.doc}/versions`,
    body: () => ({ notes: 'Annual review' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v2}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/tree',
    path: (f) => `/api/versions/${f.v2}/tree`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/text',
    path: (f) => `/api/versions/${f.v2}/text`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/versions/:id/diff/:otherId',
    path: (f) => `/api/versions/${f.v1}/diff/${f.v2}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v2}`,
    body: () => ({ notes: 'Checked' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/versions/:id',
    path: (f) => `/api/versions/${f.v1}`,
    min: 'admin',
    ok: 204,
  },
  {
    method: 'get',
    route: '/versions/:id/export/markdown',
    path: (f) => `/api/versions/${f.v2}/export/markdown`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('version diffs', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it("refuse another organization's version", async () => {
    const res = await call('get', `/api/versions/${f.v2}/diff/${f.versionB}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Version not found' });
  });

  it('refuse a version of another document in the same organization', async () => {
    const other = await prisma.document.create({
      data: { organizationId: f.orgA.id, title: 'Policies' },
    });
    const otherVersion = await prisma.version.create({
      data: { documentId: other.id, versionNumber: 1 },
    });
    const res = await call('get', `/api/versions/${f.v2}/diff/${otherVersion.id}`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(404);
  });
});

describe('earlier versions', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const as = (role: 'secretary' | 'admin' | 'owner') => f.users[role].cookie;

  it('are the record: their details and sections do not change', async () => {
    const attempts = [
      call('put', `/api/versions/${f.v1}`, { cookie: as('secretary'), body: { notes: 'Fixed' } }),
      call('post', `/api/versions/${f.v1}/sections`, {
        cookie: as('secretary'),
        body: { title: 'Added later' },
      }),
      call('put', `/api/versions/${f.v1}/sections/reorder`, {
        cookie: as('secretary'),
        body: [{ id: f.oldSection, position: 3 }],
      }),
      call('put', `/api/sections/${f.oldSection}`, {
        cookie: as('secretary'),
        body: { content: 'Rewritten' },
      }),
      call('post', `/api/sections/${f.oldSection}/children`, {
        cookie: as('secretary'),
        body: { content: 'Added later' },
      }),
      call('delete', `/api/sections/${f.oldSection}`, { cookie: as('secretary') }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: EARLIER_VERSION });
    }
    const version = await prisma.version.findUniqueOrThrow({
      where: { id: f.v1 },
      include: { sections: true },
    });
    expect(version.notes).toBeNull();
    expect(version.sections).toMatchObject([
      { id: f.oldSection, content: 'The name is Old A.', position: 0 },
    ]);
  });

  it('are deleted only when no amendment adopted them, and never the current one', async () => {
    const current = await call('delete', `/api/versions/${f.v2}`, { cookie: as('admin') });
    expect(current.status).toBe(409);
    expect(current.body).toEqual({ error: CURRENT_VERSION });

    await prisma.amendment.update({
      where: { id: f.passed },
      data: { resultingVersionId: f.v1 },
    });
    const adopted = await call('delete', `/api/versions/${f.v1}`, { cookie: as('admin') });
    expect(adopted.status).toBe(409);
    expect(adopted.body).toEqual({ error: ADOPTED_VERSION });
    expect(await prisma.version.count({ where: { documentId: f.doc } })).toBe(2);
  });

  it('leave a record of who deleted one, and what it was', async () => {
    const res = await call('delete', `/api/versions/${f.v1}`, { cookie: as('admin') });
    expect(res.status).toBe(204);
    const entries = await prisma.auditEntry.findMany();
    expect(entries).toMatchObject([
      {
        organizationId: f.orgA.id,
        actorId: f.users.admin.id,
        action: 'version.delete',
        targetId: f.v1,
        details: { documentId: f.doc, title: 'Bylaws', versionNumber: 1, sections: 1 },
      },
    ]);
  });
});

describe('new versions', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('get numbers of their own when made at once, with the current sections', async () => {
    const create = () =>
      call('post', `/api/documents/${f.doc}/versions`, {
        cookie: f.users.secretary.cookie,
        body: { notes: 'Review' },
      });
    const results = await Promise.all([create(), create(), create()]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(results.map((r) => r.body.versionNumber).sort()).toEqual([3, 4, 5]);

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: f.doc } });
    const latest = await prisma.version.findFirstOrThrow({
      where: { documentId: f.doc },
      orderBy: { versionNumber: 'desc' },
      include: { sections: true },
    });
    expect(doc.currentVersionId).toBe(latest.id);
    // The root and its child, copied with the child under the copy of the root
    expect(latest.sections).toHaveLength(2);
    const root = latest.sections.find((s) => s.parentId === null);
    expect(latest.sections.find((s) => s.parentId !== null)?.parentId).toBe(root?.id);
    expect(root?.annotation).toBe('Internal note');
  });

  it("point the document's open amendments at the new version's sections", async () => {
    const proposedChange = await prisma.amendmentChange.create({
      data: {
        amendmentId: f.proposed,
        changeType: 'modify',
        targetSectionId: f.child,
        newContent: 'The short name is B.',
      },
    });
    // A decided amendment names the sections it was decided on
    const passedChange = await prisma.amendmentChange.create({
      data: { amendmentId: f.passed, changeType: 'modify', targetSectionId: f.section },
    });

    const res = await call('post', `/api/documents/${f.doc}/versions`, {
      cookie: f.users.secretary.cookie,
      body: {},
    });
    expect(res.status).toBe(201);
    const sections = await prisma.section.findMany({ where: { versionId: res.body.id } });
    const copyOf = (label: string) => sections.find((s) => s.numberLabel === label)!.id;

    const changeTarget = async (id: string) =>
      (await prisma.amendmentChange.findUniqueOrThrow({ where: { id } })).targetSectionId;
    expect(await changeTarget(f.change)).toBe(copyOf('1'));
    expect(await changeTarget(proposedChange.id)).toBe(copyOf('1.1'));
    expect(await changeTarget(passedChange.id)).toBe(f.section);

    // The draft's preview shows its change again
    const preview = await call('get', `/api/amendments/${f.draft}/preview`, {
      cookie: f.users.member.cookie,
    });
    expect(preview.status).toBe(200);
    expect(preview.body.sections[0]).toMatchObject({ content: 'The name is A2.', modified: true });
  });

  it('can not repeat a number', async () => {
    await expect(
      prisma.version.create({ data: { documentId: f.doc, versionNumber: 2 } }),
    ).rejects.toThrow();
  });
});

describe('the Markdown export', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('names the file after any title', async () => {
    await prisma.document.update({
      where: { id: f.doc },
      data: { title: 'Owners’ "Bylaws"' },
    });
    const res = await call('get', `/api/versions/${f.v2}/export/markdown`, {
      cookie: f.users.viewer.cookie,
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/markdown/);
    expect(res.headers['content-disposition']).toContain(
      `filename*=UTF-8''Owners%E2%80%99_%22Bylaws%22_v2.md`,
    );
    expect(res.text).toContain('# Owners’ "Bylaws"');
  });
});
