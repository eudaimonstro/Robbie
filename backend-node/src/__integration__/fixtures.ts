import type { AmendmentStatus, OrgRole } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { storeFile } from '../bylawyer/services/fileStorage.js';
import { ROLES } from '../orgs/roles.js';
import { signIn, type TestUser } from './helpers.js';

/** Everything the authorization tests act on */
export interface Fixture {
  /** Members of organization A, one per role, named "A <role>" */
  users: Record<OrgRole, TestUser>;
  /** The owner of organization B, and a member of nothing else */
  outsider: TestUser;
  orgA: { id: string; slug: string };
  orgB: { id: string; slug: string };
  /** A's document: shared, with an older version v1 (effective 2020-01-01) and current v2 */
  doc: string;
  shareToken: string;
  v1: string;
  v2: string;
  /** A section of v1 */
  oldSection: string;
  /** In v2: a root section with an annotation, and its child */
  section: string;
  child: string;
  /** Amendments to doc: a draft the member created, with one change, and one per status */
  draft: string;
  change: string;
  proposed: string;
  passed: string;
  tabled: string;
  /** A's packet (code ORGA01) with two agenda items, an uploaded file and a linked document */
  packet: { id: string; code: string };
  item: string;
  item2: string;
  /** An uploaded file on the packet, stored on disk */
  upload: string;
  /** doc, linked on the packet */
  linked: string;
  /** A's packet with nothing in it (code ORGA02) */
  emptyPacket: { id: string; code: string };
  /** Published minutes of emptyPacket (published by A's secretary), and draft minutes of packet */
  minutes: string;
  draftMinutes: string;
  /** A pending addition by email to A */
  invite: string;
  /** B's resources, for the routes that take two */
  docB: string;
  versionB: string;
  sectionB: string;
  proposedB: string;
  packetB: { id: string; code: string };
  itemB: string;
}

/** Create the fixture in an empty database (see resetDatabase) */
export async function seedFixture(): Promise<Fixture> {
  const users = {} as Record<OrgRole, TestUser>;
  for (const role of ROLES) {
    users[role] = await signIn(`${role}@example.org`, { name: `A ${role}` });
  }
  const outsider = await signIn('outsider@example.org', { name: 'Outsider' });

  const orgA = await prisma.organization.create({
    data: {
      name: 'Org A',
      slug: 'org-a',
      createdById: users.owner.id,
      // Set up, so its meetings can open
      eligibleVoters: 20,
      quorumCount: 3,
      members: { create: ROLES.map((role) => ({ userId: users[role].id, role })) },
    },
  });
  const orgB = await prisma.organization.create({
    data: {
      name: 'Org B',
      slug: 'org-b',
      eligibleVoters: 20,
      quorumCount: 3,
      members: { create: { userId: outsider.id, role: 'owner' } },
    },
  });

  const doc = await prisma.document.create({
    data: {
      organizationId: orgA.id,
      title: 'Bylaws',
      shareToken: 'share-token-a',
      shareEnabled: true,
    },
  });
  const v1 = await prisma.version.create({
    data: { documentId: doc.id, versionNumber: 1, effectiveDate: new Date('2020-01-01') },
  });
  const oldSection = await prisma.section.create({
    data: { versionId: v1.id, numberLabel: '1', title: 'Name', content: 'The name is Old A.' },
  });
  const v2 = await prisma.version.create({ data: { documentId: doc.id, versionNumber: 2 } });
  const section = await prisma.section.create({
    data: {
      versionId: v2.id,
      numberLabel: '1',
      title: 'Name',
      content: 'The name is A.',
      annotation: 'Internal note',
    },
  });
  const child = await prisma.section.create({
    data: {
      versionId: v2.id,
      parentId: section.id,
      numberLabel: '1.1',
      content: 'The short name is A.',
      annotation: 'Another internal note',
    },
  });
  await prisma.document.update({ where: { id: doc.id }, data: { currentVersionId: v2.id } });

  const amendment = (status: AmendmentStatus, createdById: number | null = null) =>
    prisma.amendment.create({
      data: { documentId: doc.id, title: `A ${status} amendment`, status, createdById },
    });
  const draft = await amendment('draft', users.member.id);
  const change = await prisma.amendmentChange.create({
    data: {
      amendmentId: draft.id,
      changeType: 'modify',
      targetSectionId: section.id,
      newContent: 'The name is A2.',
    },
  });
  const proposed = await amendment('proposed');
  const passed = await amendment('passed');
  const tabled = await amendment('tabled');

  const packet = await prisma.meetingPacket.create({
    data: { organizationId: orgA.id, robbieCode: 'ORGA01', title: 'October meeting' },
  });
  const item = await prisma.meetingAgendaItem.create({
    data: { packetId: packet.id, title: 'Reports', position: 0 },
  });
  const item2 = await prisma.meetingAgendaItem.create({
    data: { packetId: packet.id, title: 'New business', position: 1 },
  });
  const stored = await storeFile(
    packet.robbieCode,
    'minutes.txt',
    'text/plain',
    Buffer.from('Minutes'),
  );
  if (!stored.success) throw new Error(stored.error);
  const upload = await prisma.attachment.create({
    data: {
      type: 'uploaded_file',
      filename: stored.file.filename,
      mimeType: stored.file.mimeType,
      sizeBytes: stored.file.sizeBytes,
      storagePath: stored.file.storagePath,
      displayName: 'Minutes',
      position: 0,
      meetingPacketId: packet.id,
    },
  });
  const linked = await prisma.attachment.create({
    data: {
      type: 'bylawyer_document',
      documentId: doc.id,
      displayName: 'Bylaws',
      position: 1,
      meetingPacketId: packet.id,
    },
  });
  const emptyPacket = await prisma.meetingPacket.create({
    data: { organizationId: orgA.id, robbieCode: 'ORGA02' },
  });
  const minutes = await prisma.minutes.create({
    data: {
      organizationId: orgA.id,
      packetId: emptyPacket.id,
      status: 'published',
      body: '# Org A\n\n## Minutes of the September meeting\n\nThe meeting adjourned at 8:00 PM.\n',
      publishedAt: new Date('2026-09-10T12:00:00Z'),
      publishedById: users.secretary.id,
    },
  });
  const draftMinutes = await prisma.minutes.create({
    data: {
      organizationId: orgA.id,
      packetId: packet.id,
      body: '# Org A\n\n## Minutes of the October meeting\n',
    },
  });
  const invite = await prisma.organizationInvite.create({
    data: {
      organizationId: orgA.id,
      email: 'pending@example.org',
      name: 'Pat Pending',
      role: 'member',
      invitedById: users.admin.id,
    },
  });

  const docB = await prisma.document.create({
    data: { organizationId: orgB.id, title: 'B bylaws' },
  });
  const versionB = await prisma.version.create({
    data: { documentId: docB.id, versionNumber: 1 },
  });
  const sectionB = await prisma.section.create({
    data: { versionId: versionB.id, numberLabel: '1', content: 'The name is B.' },
  });
  await prisma.document.update({
    where: { id: docB.id },
    data: { currentVersionId: versionB.id },
  });
  const proposedB = await prisma.amendment.create({
    data: { documentId: docB.id, title: 'A proposed amendment of B', status: 'proposed' },
  });
  const packetB = await prisma.meetingPacket.create({
    data: { organizationId: orgB.id, robbieCode: 'ORGB01' },
  });
  const itemB = await prisma.meetingAgendaItem.create({
    data: { packetId: packetB.id, title: 'B business' },
  });

  return {
    users,
    outsider,
    orgA: { id: orgA.id, slug: orgA.slug },
    orgB: { id: orgB.id, slug: orgB.slug },
    doc: doc.id,
    shareToken: 'share-token-a',
    v1: v1.id,
    v2: v2.id,
    oldSection: oldSection.id,
    section: section.id,
    child: child.id,
    draft: draft.id,
    change: change.id,
    proposed: proposed.id,
    passed: passed.id,
    tabled: tabled.id,
    packet: { id: packet.id, code: packet.robbieCode },
    item: item.id,
    item2: item2.id,
    upload: upload.id,
    linked: linked.id,
    emptyPacket: { id: emptyPacket.id, code: emptyPacket.robbieCode },
    minutes: minutes.id,
    draftMinutes: draftMinutes.id,
    invite: invite.id,
    docB: docB.id,
    versionB: versionB.id,
    sectionB: sectionB.id,
    proposedB: proposedB.id,
    packetB: { id: packetB.id, code: packetB.robbieCode },
    itemB: itemB.id,
  };
}
