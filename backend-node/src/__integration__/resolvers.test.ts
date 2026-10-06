import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  orgOfAgendaItem,
  orgOfAmendment,
  orgOfAmendmentChange,
  orgOfAttachment,
  orgOfDocument,
  orgOfMeeting,
  orgOfOrganization,
  orgOfPacket,
  orgOfPacketCode,
  orgOfSection,
  orgOfSlug,
  orgOfVersion,
  orgOfVote,
} from '../orgs/resolvers.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';

const MISSING = '00000000-0000-4000-8000-000000000000';

describe('resolvers', () => {
  let f: Fixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
  });

  it('find the organization of each kind of resource', async () => {
    const a = f.orgA.id;
    expect(await orgOfOrganization(a)).toBe(a);
    expect(await orgOfSlug('org-a')).toBe(a);
    expect(await orgOfDocument(f.doc)).toBe(a);
    expect(await orgOfVersion(f.v2)).toBe(a);
    expect(await orgOfSection(f.child)).toBe(a);
    expect(await orgOfAmendment(f.draft)).toBe(a);
    expect(await orgOfAmendmentChange(f.change)).toBe(a);
    expect(await orgOfMeeting(f.meeting)).toBe(a);
    expect(await orgOfVote(f.vote)).toBe(a);
    expect(await orgOfPacket(f.packet.id)).toBe(a);
    expect(await orgOfPacketCode('ORGA01')).toBe(a);
    expect(await orgOfAgendaItem(f.item)).toBe(a);
    expect(await orgOfAttachment(f.upload)).toBe(a);
    expect(await orgOfDocument(f.docB)).toBe(f.orgB.id);
    expect(await orgOfPacketCode('ORGB01')).toBe(f.orgB.id);
  });

  it("finds an agenda item attachment's organization through the item's packet", async () => {
    const onItem = await prisma.attachment.create({
      data: {
        type: 'bylawyer_document',
        documentId: f.doc,
        displayName: 'x',
        agendaItemId: f.item,
      },
    });
    expect(await orgOfAttachment(onItem.id)).toBe(f.orgA.id);
  });

  it('return null for a resource that does not exist', async () => {
    const byId = [
      orgOfOrganization,
      orgOfDocument,
      orgOfVersion,
      orgOfSection,
      orgOfAmendment,
      orgOfAmendmentChange,
      orgOfMeeting,
      orgOfVote,
      orgOfPacket,
      orgOfAgendaItem,
      orgOfAttachment,
    ];
    for (const find of byId) expect(await find(MISSING)).toBeNull();
    expect(await orgOfSlug('no-such-org')).toBeNull();
    expect(await orgOfPacketCode('NOPE01')).toBeNull();
    // Ids are text columns, so a malformed one is simply not found
    expect(await orgOfDocument('not-a-uuid')).toBeNull();
  });
});
