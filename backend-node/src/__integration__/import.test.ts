import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { parseBylaws } from '@robbie-bylawyer/shared/utils';
import { app } from '../app.js';
import { prisma } from '../db/prisma.js';
import { NOT_A_DOCX, NO_FILE } from '../bylawyer/services/docxText.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';
import { DOCX_HEADERS, makeDocx } from './docx.js';

const BYLAWS = [
  { text: 'Article I. Name and Purpose', heading: 1 as const },
  { text: 'Section 1.1 Name. The name is Maple Grove.' },
  { text: 'Article II. Members', heading: 2 as const },
  { text: 'Each lot has one vote & one voice.' },
];

let docx: Buffer;
beforeAll(async () => {
  docx = await makeDocx(BYLAWS);
});

const imported = {
  effectiveDate: '2026-03-15',
  notes: 'Pasted from the 2024 bylaws',
  sections: [
    {
      numberLabel: 'Article I',
      title: 'Name and Purpose',
      content: '',
      children: [
        { numberLabel: 'Section 1.1', title: 'Name', content: 'The name is A.', children: [] },
        {
          numberLabel: 'Section 1.2',
          title: 'Purpose',
          content: 'Gardens.\n\nAnd paths.',
          children: [{ numberLabel: '1.2.1', title: 'Paths', content: '', children: [] }],
        },
      ],
    },
    { numberLabel: 'Article II', title: 'Members', content: '', children: [] },
  ],
};

describeRules('import rules', [
  {
    method: 'post',
    route: '/documents/:docId/import/docx',
    path: (f) => `/api/documents/${f.doc}/import/docx`,
    body: () => docx,
    headers: () => DOCX_HEADERS,
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'post',
    route: '/documents/:docId/versions/import',
    path: (f) => `/api/documents/${f.doc}/versions/import`,
    body: () => imported,
    min: 'secretary',
    ok: 201,
  },
]);

describe('importing a Word document', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const send = (body: Buffer, headers: Record<string, string> = DOCX_HEADERS) =>
    call('post', `/api/documents/${f.doc}/import/docx`, {
      cookie: f.users.secretary.cookie,
      body,
      headers,
    });

  it('turns it into text with its headings as # lines, which the parser reads', async () => {
    const res = await send(docx);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      text:
        '# Article I. Name and Purpose\n\nSection 1.1 Name. The name is Maple Grove.\n\n' +
        '## Article II. Members\n\nEach lot has one vote & one voice.',
    });
    expect(parseBylaws(res.body.text).map((s) => [s.numberLabel, s.title])).toEqual([
      ['Article I', 'Name and Purpose'],
      ['Article II', 'Members'],
    ]);
  });

  it('takes a file sent as plain bytes, as some browsers send a .docx', async () => {
    const res = await send(docx, { 'Content-Type': 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  it('refuses no file, and a file that is not a Word document', async () => {
    expect((await send(Buffer.alloc(0))).body).toEqual({ error: NO_FILE });
    const notWord = await send(Buffer.from('This is plain text, not a zip file.'));
    expect(notWord.status).toBe(400);
    expect(notWord.body).toEqual({ error: NOT_A_DOCX });
    // A type the route doesn't read leaves no body at all
    const text = await send(Buffer.from('Article I'), { 'Content-Type': 'text/plain' });
    expect(text.body).toEqual({ error: NO_FILE });
  });

  it('refuses a file over 5 MB', async () => {
    const res = await send(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it("doesn't read the file of someone who isn't signed in", async () => {
    const res = await call('post', `/api/documents/${f.doc}/import/docx`, {
      body: Buffer.alloc(5 * 1024 * 1024 + 1),
      headers: DOCX_HEADERS,
    });
    expect(res.status).toBe(401);
  });

  it("doesn't read the file of a member who isn't a secretary", async () => {
    // Refused for the role before the body is read: a 403, not the 413 that reading it gives
    const res = await call('post', `/api/documents/${f.doc}/import/docx`, {
      cookie: f.users.viewer.cookie,
      body: Buffer.alloc(5 * 1024 * 1024 + 1),
      headers: DOCX_HEADERS,
    });
    expect(res.status).toBe(403);
  });
});

describe('importing parsed sections', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const importSections = (body: object) =>
    call('post', `/api/documents/${f.doc}/versions/import`, {
      cookie: f.users.secretary.cookie,
      body,
    });

  it('makes them a new current version, in order and nested as given', async () => {
    const res = await importSections(imported);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      documentId: f.doc,
      versionNumber: 3,
      notes: 'Pasted from the 2024 bylaws',
      effectiveDate: '2026-03-15T00:00:00.000Z',
      sectionCount: 5,
    });

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: f.doc } });
    expect(doc.currentVersionId).toBe(res.body.id);

    const tree = await call('get', `/api/versions/${res.body.id}/tree`, {
      cookie: f.users.viewer.cookie,
    });
    const shape = (nodes: Array<Record<string, unknown>>): unknown[] =>
      nodes.map((n) => [
        n.position,
        n.numberLabel,
        n.title,
        n.content,
        shape(n.children as Array<Record<string, unknown>>),
      ]);
    expect(shape(tree.body)).toEqual([
      [
        0,
        'Article I',
        'Name and Purpose',
        null,
        [
          [0, 'Section 1.1', 'Name', 'The name is A.', []],
          [
            1,
            'Section 1.2',
            'Purpose',
            'Gardens.\n\nAnd paths.',
            [[0, '1.2.1', 'Paths', null, []]],
          ],
        ],
      ],
      [1, 'Article II', 'Members', null, []],
    ]);
  });

  it('leaves the old versions as they were', async () => {
    await importSections(imported);
    expect(await prisma.section.count({ where: { versionId: f.v2 } })).toBe(2);
    expect(await prisma.section.count({ where: { versionId: f.v1 } })).toBe(1);
  });

  it('saves nothing when a section is refused', async () => {
    const res = await importSections({
      sections: [{ numberLabel: 'x'.repeat(101), title: null, content: '', children: [] }],
    });
    expect(res.status).toBe(400);
    expect(await prisma.version.count({ where: { documentId: f.doc } })).toBe(2);
  });

  it('refuses no sections, too many, or too deep', async () => {
    expect((await importSections({ sections: [] })).status).toBe(400);
    const many = Array.from({ length: 2001 }, () => ({
      numberLabel: null,
      title: 'Rule',
      content: '',
      children: [],
    }));
    expect((await importSections({ sections: many })).status).toBe(400);
    let deep: Record<string, unknown> = {
      numberLabel: null,
      title: 'Leaf',
      content: '',
      children: [],
    };
    for (let level = 0; level < 6; level++) {
      deep = { numberLabel: null, title: `Level ${level}`, content: '', children: [deep] };
    }
    expect((await importSections({ sections: [deep] })).status).toBe(400);
    expect(await prisma.version.count({ where: { documentId: f.doc } })).toBe(2);
  });

  it('refuses a tree nested thousands of levels deep with a 400', async () => {
    // Under 2 MB of JSON, but deep enough to overflow a recursive walk. Sent as text, since
    // the test client's own serializer recurses too.
    const levels = 20_000;
    const open = '{"numberLabel":null,"title":null,"content":"","children":[';
    const json = `{"sections":[${open.repeat(levels)}${']}'.repeat(levels)}]}`;
    expect(json.length).toBeLessThan(2 * 1024 * 1024);
    const res = await request(app)
      .post(`/api/documents/${f.doc}/versions/import`)
      .set('Cookie', f.users.secretary.cookie)
      .set('Content-Type', 'application/json')
      .send(json);
    expect(res.status).toBe(400);
    expect(await prisma.version.count({ where: { documentId: f.doc } })).toBe(2);
  });

  it('takes bylaws larger than the usual 100 KB limit', async () => {
    // Three articles of 38,000 characters: about 114 KB of JSON
    const long = 'Every member shall act in good faith. '.repeat(1000);
    const res = await importSections({
      sections: [1, 2, 3].map((n) => ({
        numberLabel: `Article ${n}`,
        title: 'Conduct',
        content: long,
        children: [],
      })),
    });
    expect(res.status).toBe(201);
    expect(res.body.sectionCount).toBe(3);
  });
});
