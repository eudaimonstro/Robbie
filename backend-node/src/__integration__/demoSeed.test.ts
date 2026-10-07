import { describe, it, expect, beforeEach } from 'vitest';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { prisma } from '../db/prisma.js';
import { DEMO_MEETING_CODE, DEMO_SLUG, DemoSeedError, seedDemo } from '../demo/demoSeed.js';
import { resetDatabase } from './db.js';

describe('demo seed', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('creates Maple Grove HOA with its people, bylaws, amendment, meeting and packet', async () => {
    const summary = await seedDemo();
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: DEMO_SLUG } });
    expect(summary.organizationId).toBe(org.id);

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: org.id },
      include: { user: true },
    });
    const byRole: Record<string, number> = {};
    for (const member of members) byRole[member.role] = (byRole[member.role] ?? 0) + 1;
    expect(byRole).toEqual({ owner: 1, admin: 1, secretary: 1, member: 12, viewer: 2 });
    expect(members.every((m) => m.user.name && m.user.termsVersion === TERMS_VERSION)).toBe(true);
    expect(members.find((m) => m.role === 'admin')?.user.name).toBe('Dana Okafor');

    const document = await prisma.document.findFirstOrThrow({
      where: { organizationId: org.id },
      include: { versions: true },
    });
    expect(document.versions).toHaveLength(1);
    expect(document.currentVersionId).toBe(document.versions[0].id);
    expect(document.versions[0].effectiveDate?.toISOString().slice(0, 10)).toBe('2024-03-15');

    const sections = await prisma.section.findMany({
      where: { versionId: document.versions[0].id },
    });
    expect(sections).toHaveLength(29);
    expect(summary.sections).toBe(29);
    expect(sections.filter((s) => s.parentId === null)).toHaveLength(6);
    const quorum = sections.find((s) => s.numberLabel === 'Section 4.2');
    expect(quorum?.content).toContain('twenty percent (20%)');

    const amendment = await prisma.amendment.findFirstOrThrow({
      where: { documentId: document.id },
      include: { changes: true },
    });
    expect(amendment).toMatchObject({ title: 'Lower the quorum to 15%', status: 'draft' });
    expect(amendment.changes).toMatchObject([
      { changeType: 'modify', targetSectionId: quorum?.id },
    ]);

    expect(await prisma.meeting.count({ where: { organizationId: org.id } })).toBe(1);
    const packet = await prisma.meetingPacket.findUniqueOrThrow({
      where: { robbieCode: DEMO_MEETING_CODE },
      include: { agendaItems: true },
    });
    expect(packet).toMatchObject({ organizationId: org.id, title: '2026 Annual Meeting' });
    expect(packet.agendaItems).toHaveLength(7);
  });

  it('refuses to run again without reset', async () => {
    await seedDemo();
    await expect(seedDemo()).rejects.toBeInstanceOf(DemoSeedError);
    expect(await prisma.organization.count()).toBe(1);
  });

  it('replaces the organization on reset and keeps the people', async () => {
    const first = await seedDemo();
    const pat = await prisma.user.findUniqueOrThrow({ where: { email: 'pat@maplegrove.example' } });

    const second = await seedDemo({ reset: true });

    expect(second.organizationId).not.toBe(first.organizationId);
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.user.count()).toBe(17);
    const patAgain = await prisma.user.findUniqueOrThrow({
      where: { email: 'pat@maplegrove.example' },
    });
    expect(patAgain.id).toBe(pat.id);
  });
});
