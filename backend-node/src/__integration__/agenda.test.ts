import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call } from './helpers.js';
import { describeRules } from './rules.js';

describeRules('agenda item rules', [
  {
    method: 'get',
    route: '/packets/:packetId/agenda',
    path: (f) => `/api/packets/${f.packet.id}/agenda`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/packets/:packetId/agenda',
    path: (f) => `/api/packets/${f.packet.id}/agenda`,
    body: () => ({ title: 'Budget' }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/agenda-items/:id',
    path: (f) => `/api/agenda-items/${f.item}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/agenda-items/reorder',
    path: () => '/api/agenda-items/reorder',
    body: (f) => ({ itemIds: [f.item2, f.item] }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'put',
    route: '/agenda-items/:id',
    path: (f) => `/api/agenda-items/${f.item}`,
    body: () => ({ title: 'Reports and budget' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/agenda-items/:id',
    path: (f) => `/api/agenda-items/${f.item}`,
    min: 'secretary',
    ok: 204,
  },
  {
    method: 'post',
    route: '/agenda-items/bulk',
    path: () => '/api/agenda-items/bulk',
    body: (f) => ({ packetId: f.packet.id, items: [{ title: 'Elections' }] }),
    min: 'secretary',
    ok: 201,
  },
]);

describeRules('attachment rules', [
  {
    method: 'post',
    route: '/attachments/upload',
    path: (f) => `/api/attachments/upload?packetId=${f.packet.id}`,
    headers: (f) => ({
      'Content-Type': 'text/plain',
      'X-Filename': 'notes.txt',
      'X-Robbie-Code': f.packet.code,
    }),
    body: () => Buffer.from('Notes'),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'post',
    route: '/attachments/link-document',
    path: () => '/api/attachments/link-document',
    body: (f) => ({ documentId: f.doc, packetId: f.packet.id }),
    min: 'secretary',
    ok: 201,
  },
  {
    method: 'get',
    route: '/attachments/:id',
    path: (f) => `/api/attachments/${f.upload}`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'get',
    route: '/attachments/:id/download',
    path: (f) => `/api/attachments/${f.upload}/download`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'put',
    route: '/attachments/reorder',
    path: () => '/api/attachments/reorder',
    body: (f) => ({ attachmentIds: [f.linked, f.upload] }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'put',
    route: '/attachments/:id',
    path: (f) => `/api/attachments/${f.upload}`,
    body: () => ({ displayName: 'Approved minutes' }),
    min: 'secretary',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/attachments/:id',
    path: (f) => `/api/attachments/${f.upload}`,
    min: 'secretary',
    ok: 204,
  },
]);

describe('agenda items and attachments across packets', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  const reorderItems = (itemIds: string[]) =>
    call('put', '/api/agenda-items/reorder', {
      cookie: f.users.secretary.cookie,
      body: { itemIds },
    });

  it('reorder agenda items only within one packet', async () => {
    const elsewhere = await prisma.meetingAgendaItem.create({
      data: { packetId: f.emptyPacket.id, title: 'Elsewhere', position: 4 },
    });
    expect((await reorderItems([f.item, elsewhere.id])).status).toBe(400);

    const crossOrg = await reorderItems([f.item, f.itemB]);
    expect(crossOrg.status).toBe(400);
    expect(crossOrg.body).toEqual({ error: 'Every item must be in the same packet' });
    const itemB = await prisma.meetingAgendaItem.findUniqueOrThrow({ where: { id: f.itemB } });
    expect(itemB.position).toBe(0);

    // Led by another organization's item, the rule refuses it outright
    expect((await reorderItems([f.itemB, f.item])).status).toBe(404);
  });

  it("don't add items to another organization's packet", async () => {
    const res = await call('post', '/api/agenda-items/bulk', {
      cookie: f.users.secretary.cookie,
      body: { packetId: f.packetB.id, items: [{ title: 'Sneaky' }] },
    });
    expect(res.status).toBe(404);
    expect(await prisma.meetingAgendaItem.count({ where: { packetId: f.packetB.id } })).toBe(1);
  });

  it("don't link another organization's document", async () => {
    const res = await call('post', '/api/attachments/link-document', {
      cookie: f.users.secretary.cookie,
      body: { documentId: f.docB, packetId: f.packet.id },
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Document not found' });
    expect(await prisma.attachment.count({ where: { documentId: f.docB } })).toBe(0);
  });

  it('upload to an agenda item when packetId is given empty', async () => {
    const res = await call('post', `/api/attachments/upload?packetId=&agendaItemId=${f.item}`, {
      cookie: f.users.secretary.cookie,
      headers: {
        'Content-Type': 'text/plain',
        'X-Filename': 'agenda.txt',
        'X-Robbie-Code': f.packet.code,
      },
      body: Buffer.from('Agenda'),
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ agendaItemId: f.item, meetingPacketId: null });
  });

  it('upload with the meeting code in any case, and only that code', async () => {
    const upload = (code: string) =>
      call('post', `/api/attachments/upload?packetId=${f.packet.id}`, {
        cookie: f.users.secretary.cookie,
        headers: { 'Content-Type': 'text/plain', 'X-Filename': 'n.txt', 'X-Robbie-Code': code },
        body: Buffer.from('n'),
      });
    expect((await upload(` ${f.packet.code.toLowerCase()} `)).status).toBe(201);
    for (const code of [f.packetB.code, '../ORGA01', 'x']) {
      const res = await upload(code);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'X-Robbie-Code does not match the meeting' });
    }
  });

  it("don't upload to another organization's agenda item", async () => {
    const res = await call('post', `/api/attachments/upload?agendaItemId=${f.itemB}`, {
      cookie: f.users.secretary.cookie,
      headers: {
        'Content-Type': 'text/plain',
        'X-Filename': 'x.txt',
        'X-Robbie-Code': f.packetB.code,
      },
      body: Buffer.from('x'),
    });
    expect(res.status).toBe(404);
  });

  it('reorder attachments only within one packet or agenda item', async () => {
    const onItem = await prisma.attachment.create({
      data: {
        type: 'bylawyer_document',
        documentId: f.doc,
        displayName: 'On the item',
        agendaItemId: f.item,
      },
    });
    const res = await call('put', '/api/attachments/reorder', {
      cookie: f.users.secretary.cookie,
      body: { attachmentIds: [f.upload, onItem.id] },
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Every attachment must be in the same packet or agenda item',
    });
  });

  it('refuse an upload that names both a packet and an agenda item', async () => {
    const before = await prisma.attachment.count();
    const res = await call(
      'post',
      `/api/attachments/upload?packetId=${f.packet.id}&agendaItemId=${f.itemB}`,
      {
        cookie: f.users.secretary.cookie,
        headers: {
          'Content-Type': 'text/plain',
          'X-Filename': 'x.txt',
          'X-Robbie-Code': f.packet.code,
        },
        body: Buffer.from('x'),
      },
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Give a packetId or an agendaItemId, not both' });
    expect(await prisma.attachment.count()).toBe(before);
  });

  it('refuse a link that names both a packet and an agenda item', async () => {
    const before = await prisma.attachment.count();
    const res = await call('post', '/api/attachments/link-document', {
      cookie: f.users.secretary.cookie,
      body: { documentId: f.doc, packetId: f.packet.id, agendaItemId: f.itemB },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual({
      path: 'agendaItemId',
      message: 'Give a packetId or an agendaItemId, not both',
    });
    expect(await prisma.attachment.count()).toBe(before);
  });
});
