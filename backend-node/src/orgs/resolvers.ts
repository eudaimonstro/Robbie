/**
 * Resource resolvers: each finds the organization a resource belongs to, or null when the
 * resource doesn't exist. requireRole uses them to check the user's role there.
 */

import { prisma } from '../db/prisma.js';

export async function orgOfOrganization(id: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  return org?.id ?? null;
}

export async function orgOfSlug(slug: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  return org?.id ?? null;
}

export async function orgOfDocument(id: string): Promise<string | null> {
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return doc?.organizationId ?? null;
}

export async function orgOfVersion(id: string): Promise<string | null> {
  const version = await prisma.version.findUnique({
    where: { id },
    select: { document: { select: { organizationId: true } } },
  });
  return version?.document.organizationId ?? null;
}

export async function orgOfSection(id: string): Promise<string | null> {
  const section = await prisma.section.findUnique({
    where: { id },
    select: { version: { select: { document: { select: { organizationId: true } } } } },
  });
  return section?.version.document.organizationId ?? null;
}

export async function orgOfAmendment(id: string): Promise<string | null> {
  const amendment = await prisma.amendment.findUnique({
    where: { id },
    select: { document: { select: { organizationId: true } } },
  });
  return amendment?.document.organizationId ?? null;
}

export async function orgOfAmendmentChange(id: string): Promise<string | null> {
  const change = await prisma.amendmentChange.findUnique({
    where: { id },
    select: { amendment: { select: { document: { select: { organizationId: true } } } } },
  });
  return change?.amendment.document.organizationId ?? null;
}

export async function orgOfPacket(id: string): Promise<string | null> {
  const packet = await prisma.meetingPacket.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return packet?.organizationId ?? null;
}

/** A live meeting's organization: its packet's */
export async function orgOfPacketCode(robbieCode: string): Promise<string | null> {
  const packet = await prisma.meetingPacket.findUnique({
    where: { robbieCode },
    select: { organizationId: true },
  });
  return packet?.organizationId ?? null;
}

export async function orgOfAgendaItem(id: string): Promise<string | null> {
  const item = await prisma.meetingAgendaItem.findUnique({
    where: { id },
    select: { packet: { select: { organizationId: true } } },
  });
  return item?.packet.organizationId ?? null;
}

/** An attachment is on a packet or on an agenda item (and so its packet) */
export async function orgOfAttachment(id: string): Promise<string | null> {
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: {
      meetingPacket: { select: { organizationId: true } },
      agendaItem: { select: { packet: { select: { organizationId: true } } } },
    },
  });
  return (
    attachment?.meetingPacket?.organizationId ??
    attachment?.agendaItem?.packet.organizationId ??
    null
  );
}

export async function orgOfMinutes(id: string): Promise<string | null> {
  const minutes = await prisma.minutes.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return minutes?.organizationId ?? null;
}
