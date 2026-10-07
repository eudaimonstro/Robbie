import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('search rules', [
  {
    method: 'get',
    route: '/organizations/:orgId/search',
    path: (f) => `/api/organizations/${f.orgA.id}/search?q=name`,
    min: 'viewer',
    ok: 200,
  },
]);

describe('searching the bylaws', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const search = (q: string) =>
    call('get', `/api/organizations/${f.orgA.id}/search?q=${encodeURIComponent(q)}`, {
      cookie: f.users.viewer.cookie,
    });

  it("finds the current version's sections by label, title or content, in any case", async () => {
    const res = await search('NAME');
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('NAME');
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results).toEqual(
      expect.arrayContaining([
        {
          documentId: f.doc,
          documentTitle: 'Bylaws',
          versionId: f.v2,
          sectionId: f.section,
          numberLabel: '1',
          title: 'Name',
          snippet: 'The name is A.',
        },
        {
          documentId: f.doc,
          documentTitle: 'Bylaws',
          versionId: f.v2,
          sectionId: f.child,
          numberLabel: '1.1',
          title: null,
          snippet: 'The short name is A.',
        },
      ]),
    );

    const byLabel = await search('1.1');
    expect(byLabel.body.results.map((r: { sectionId: string }) => r.sectionId)).toEqual([f.child]);
  });

  it('never searches an older version or another organization', async () => {
    // v1's section says "Old A"; Org B's says "The name is B."
    expect((await search('Old A')).body.results).toEqual([]);
    expect((await search('is B')).body.results).toEqual([]);
  });

  it('cuts a long section around the first match', async () => {
    await prisma.section.create({
      data: {
        versionId: f.v2,
        numberLabel: '2',
        title: 'Quorum',
        content: `${'Members meet. '.repeat(20)}A quorum is twenty percent. ${'Votes count. '.repeat(20)}`,
      },
    });
    const res = await search('twenty');
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].snippet).toMatch(/^\.\.\..*A quorum is twenty percent\..*\.\.\.$/);
  });

  it('answers at most 20 results', async () => {
    await prisma.section.createMany({
      data: Array.from({ length: 25 }, (_, position) => ({
        versionId: f.v2,
        position: position + 1,
        content: `The gate code is ${position}.`,
      })),
    });
    expect((await search('gate')).body.results).toHaveLength(20);
  });

  it('needs at least 2 characters', async () => {
    expect((await search('a')).status).toBe(400);
    expect((await search(' a ')).status).toBe(400);
  });

  it('reads % and _ as the characters they are, not as wildcards', async () => {
    const percent = await prisma.section.create({
      data: { versionId: f.v2, numberLabel: '2', content: 'Dues rise 5%% a year.' },
    });
    const underscore = await prisma.section.create({
      data: { versionId: f.v2, numberLabel: '3', content: 'Write to board__secretary.' },
    });
    const backslash = await prisma.section.create({
      data: { versionId: f.v2, numberLabel: '4', content: 'The path is C:\\\\minutes.' },
    });
    const ids = async (q: string) =>
      (await search(q)).body.results.map((r: { sectionId: string }) => r.sectionId);
    expect(await ids('%%')).toEqual([percent.id]);
    expect(await ids('__')).toEqual([underscore.id]);
    expect(await ids('\\\\')).toEqual([backslash.id]);
  });
});
