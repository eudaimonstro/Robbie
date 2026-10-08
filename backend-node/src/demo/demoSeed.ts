/**
 * The Maple Grove HOA demo from docs/mvp-roadmap.md: an organization with its people, bylaws, a
 * proposed amendment, last year's meeting (adjourned) with its published minutes, and the packet for this
 * year's annual meeting
 */

import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import type { OrgRole, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { deleteFiles } from '../bylawyer/services/fileStorage.js';

export const DEMO_SLUG = 'maple-grove-hoa';
export const DEMO_MEETING_CODE = 'MAPLE1';
/** Last year's annual meeting, whose minutes this year's approves */
export const DEMO_PAST_MEETING_CODE = 'MAPLE25';

const CLUBHOUSE = 'Maple Grove Clubhouse, 400 Maple Grove Drive';

/**
 * The 2025 annual meeting's minutes, as Pat published them. Without a quorum the meeting could
 * only recess and adjourn, and it did both.
 */
const MINUTES_2025 = [
  '# Maple Grove HOA',
  '',
  '## Minutes of the 2025 Annual Meeting',
  '',
  `Thursday, March 20, 2025, at ${CLUBHOUSE}.`,
  '',
  'Dana Okafor presided. The meeting was called to order at 7:04 PM.',
  '',
  '## Attendance',
  '',
  '**Members present:** 21, and 6 more by proxy.',
  '',
  'A quorum of 29 was not present at the call to order.',
  '',
  '## Proceedings',
  '',
  '### 1. Reports',
  '',
  'The treasurer reported $48,200 in the operating account and $112,000 in the reserve fund. The pool committee reported that the pool needs resurfacing within two years.',
  '',
  '### 2. Business',
  '',
  'Without a quorum, no business was taken up.',
  '',
  '**Recess.** Carmen Diaz moved: "That the meeting recess for fifteen minutes while the directors call members who have not arrived." Seconded by Ben Whitaker. Carried on a voice vote. No quorum was present.',
  '',
  'After the recess, a quorum was still not present.',
  '',
  '**Adjourn.** Hector Ramos moved: "That the meeting adjourn." Seconded by Grace Kim. Carried on a voice vote. No quorum was present.',
  '',
  '## Adjournment',
  '',
  'The meeting adjourned at 8:15 PM.',
  '',
].join('\n');

type Tx = Prisma.TransactionClient;

/** Why the seed didn't run: the demo, or its meeting code, is already there */
export class DemoSeedError extends Error {}

export interface DemoPerson {
  email: string;
  name: string;
  role: OrgRole;
}

/** Pat keeps the records (owner), Dana chairs (admin), Ray is the treasurer (secretary) */
export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { email: 'pat@maplegrove.example', name: 'Pat Lindqvist', role: 'owner' },
  { email: 'dana@maplegrove.example', name: 'Dana Okafor', role: 'admin' },
  { email: 'ray@maplegrove.example', name: 'Ray Castillo', role: 'secretary' },
  { email: 'alice@maplegrove.example', name: 'Alice Brennan', role: 'member' },
  { email: 'ben@maplegrove.example', name: 'Ben Whitaker', role: 'member' },
  { email: 'carmen@maplegrove.example', name: 'Carmen Diaz', role: 'member' },
  { email: 'david@maplegrove.example', name: 'David Nguyen', role: 'member' },
  { email: 'elena@maplegrove.example', name: 'Elena Petrova', role: 'member' },
  { email: 'frank@maplegrove.example', name: 'Frank Osei', role: 'member' },
  { email: 'grace@maplegrove.example', name: 'Grace Kim', role: 'member' },
  { email: 'hector@maplegrove.example', name: 'Hector Ramos', role: 'member' },
  { email: 'irene@maplegrove.example', name: 'Irene Walsh', role: 'member' },
  { email: 'james@maplegrove.example', name: 'James Holloway', role: 'member' },
  { email: 'keiko@maplegrove.example', name: 'Keiko Tanaka', role: 'member' },
  { email: 'luis@maplegrove.example', name: 'Luis Moreno', role: 'member' },
  { email: 'morgan@maplegrove.example', name: 'Morgan Lee', role: 'viewer' },
  { email: 'sam@maplegrove.example', name: 'Sam Ortiz', role: 'viewer' },
];

/** Homeowners Pat added by email who haven't signed in: members once they do */
export const DEMO_NOT_SIGNED_IN: ReadonlyArray<{ email: string; name: string }> = [
  { email: 'harold@maplegrove.example', name: 'Harold Becker' },
  { email: 'rosa@maplegrove.example', name: 'Rosa Alvarez' },
];

interface DemoSection {
  label: string;
  title: string;
  content: string;
}

interface DemoArticle {
  label: string;
  title: string;
  sections: DemoSection[];
}

const QUORUM_LABEL = 'Section 4.2';

const BYLAWS: readonly DemoArticle[] = [
  {
    label: 'Article I',
    title: 'Name and Purpose',
    sections: [
      {
        label: 'Section 1.1',
        title: 'Name',
        content:
          'The name of this corporation is Maple Grove Homeowners Association, Inc., referred to in these Bylaws as the "Association".',
      },
      {
        label: 'Section 1.2',
        title: 'Purpose',
        content:
          'The Association maintains the common areas of the Maple Grove subdivision, enforces the Declaration of Covenants, Conditions and Restrictions, and promotes the welfare of its residents.',
      },
      {
        label: 'Section 1.3',
        title: 'Principal Office',
        content:
          'The principal office of the Association is the Maple Grove Clubhouse, 400 Maple Grove Drive, or another place the Board designates.',
      },
    ],
  },
  {
    label: 'Article II',
    title: 'Membership and Voting Rights',
    sections: [
      {
        label: 'Section 2.1',
        title: 'Membership',
        content:
          'Every owner of a lot in Maple Grove is a member of the Association. Membership belongs to the lot and cannot be separated from it.',
      },
      {
        label: 'Section 2.2',
        title: 'Voting Rights',
        content:
          'Each lot has one vote. When a lot has more than one owner, the owners decide among themselves how its vote is cast; the vote cannot be split.',
      },
      {
        label: 'Section 2.3',
        title: 'Good Standing',
        content:
          'A member whose assessments are more than sixty days past due may not vote until the account is brought current.',
      },
      {
        label: 'Section 2.4',
        title: 'Proxies',
        content:
          'A member may vote by written proxy, dated and signed, and filed with the Secretary before the meeting. A proxy expires eleven months after its date.',
      },
    ],
  },
  {
    label: 'Article III',
    title: 'Board of Directors',
    sections: [
      {
        label: 'Section 3.1',
        title: 'Number',
        content:
          'The affairs of the Association are managed by a Board of five directors, each of whom must be a member in good standing.',
      },
      {
        label: 'Section 3.2',
        title: 'Election and Term',
        content:
          'Directors are elected at the annual meeting for staggered two-year terms. Two directors are elected in even-numbered years and three in odd-numbered years.',
      },
      {
        label: 'Section 3.3',
        title: 'Vacancies',
        content:
          'A vacancy on the Board is filled by a majority of the remaining directors. The person chosen serves the rest of the term.',
      },
      {
        label: 'Section 3.4',
        title: 'Officers',
        content:
          'Each year the Board elects a President, a Secretary and a Treasurer from among its directors.',
      },
    ],
  },
  {
    label: 'Article IV',
    title: 'Meetings of Members',
    sections: [
      {
        label: 'Section 4.1',
        title: 'Annual Meeting',
        content:
          'The annual meeting of the members is held each year at a date, time and place set by the Board.',
      },
      {
        label: QUORUM_LABEL,
        title: 'Quorum',
        content:
          'The presence, in person or by proxy, of members holding twenty percent (20%) of the votes of the Association constitutes a quorum at any meeting of the members.',
      },
      {
        label: 'Section 4.3',
        title: 'Notice',
        content:
          'Written notice of each meeting of the members, stating its place, date and hour, is mailed or emailed to every member at least ten and no more than sixty days before the meeting.',
      },
      {
        label: 'Section 4.4',
        title: 'Special Meetings',
        content:
          'The President, a majority of the Board, or members holding ten percent of the votes may call a special meeting of the members.',
      },
      {
        label: 'Section 4.5',
        title: 'Rules of Order',
        content:
          "Robert's Rules of Order Newly Revised governs meetings of the members in all cases where it is consistent with these Bylaws and the Declaration.",
      },
    ],
  },
  {
    label: 'Article V',
    title: 'Assessments',
    sections: [
      {
        label: 'Section 5.1',
        title: 'Annual Assessment',
        content:
          'Each lot is subject to an annual assessment set by the Board in the budget it adopts before the start of each fiscal year.',
      },
      {
        label: 'Section 5.2',
        title: 'Due Date',
        content:
          'The annual assessment is due on January 31. An assessment not paid within thirty days of its due date incurs a late fee of twenty-five dollars.',
      },
      {
        label: 'Section 5.3',
        title: 'Special Assessments',
        content:
          'A special assessment for a capital improvement requires a majority of the votes cast at a meeting of the members at which a quorum is present.',
      },
      {
        label: 'Section 5.4',
        title: 'Reserve Fund',
        content:
          'The Association keeps a reserve fund for the repair and replacement of the common areas, funded with at least ten percent of the annual assessments.',
      },
    ],
  },
  {
    label: 'Article VI',
    title: 'Amendments',
    sections: [
      {
        label: 'Section 6.1',
        title: 'Proposal',
        content:
          'An amendment to these Bylaws may be proposed by the Board or by a petition signed by members holding ten percent of the votes.',
      },
      {
        label: 'Section 6.2',
        title: 'Adoption',
        content:
          'These Bylaws may be amended at a meeting of the members by two thirds of the votes cast, if the text of the amendment was included in the notice of the meeting.',
      },
      {
        label: 'Section 6.3',
        title: 'Effective Date',
        content: 'An amendment takes effect when it is adopted, unless it states a later date.',
      },
    ],
  },
];

const LOWER_QUORUM =
  'The presence, in person or by proxy, of members holding fifteen percent (15%) of the votes of the Association constitutes a quorum at any meeting of the members.';

const AGENDA = [
  { title: 'Call to order', estimatedMinutes: 2, presenter: 'Dana Okafor' },
  {
    title: 'Approval of the minutes of the 2025 annual meeting',
    estimatedMinutes: 5,
    presenter: 'Pat Lindqvist',
  },
  {
    title: "Treasurer's report and the 2027 budget",
    estimatedMinutes: 15,
    presenter: 'Ray Castillo',
  },
  { title: 'Old business: pool resurfacing contract', estimatedMinutes: 20 },
  { title: 'New business: amend Section 4.2 to lower the quorum to 15%', estimatedMinutes: 20 },
  { title: 'Election of two directors', estimatedMinutes: 25 },
  { title: 'Adjournment', estimatedMinutes: 1 },
];

export interface DemoSeedSummary {
  organizationId: string;
  people: number;
  /** Articles and their sections */
  sections: number;
  agendaItems: number;
}

/**
 * Create the demo. Refuses when an organization has the demo's slug, unless reset, which
 * deletes that organization first; people are updated, never deleted.
 */
export async function seedDemo(options: { reset?: boolean } = {}): Promise<DemoSeedSummary> {
  const existing = await prisma.organization.findUnique({
    where: { slug: DEMO_SLUG },
    select: { id: true },
  });
  if (existing && !options.reset) {
    throw new DemoSeedError(
      `An organization with the slug "${DEMO_SLUG}" already exists. Run with --reset to replace it.`,
    );
  }
  if (existing) await deleteOrganization(existing.id);

  const codeTaken = await prisma.meetingPacket.findFirst({
    where: { robbieCode: { in: [DEMO_MEETING_CODE, DEMO_PAST_MEETING_CODE] } },
    select: { robbieCode: true },
  });
  if (codeTaken) {
    throw new DemoSeedError(
      `Another organization has the meeting code ${codeTaken.robbieCode}. Delete its packet first.`,
    );
  }

  return prisma.$transaction((tx) => create(tx), { timeout: 30_000 });
}

/** Delete an organization, and the uploaded files its cascade would leave on disk */
async function deleteOrganization(organizationId: string): Promise<void> {
  const uploads = await prisma.attachment.findMany({
    where: {
      type: 'uploaded_file',
      OR: [{ meetingPacket: { organizationId } }, { agendaItem: { packet: { organizationId } } }],
    },
    select: { storagePath: true },
  });
  await prisma.organization.delete({ where: { id: organizationId } });
  await deleteFiles(uploads.map((upload) => upload.storagePath));
}

async function create(tx: Tx): Promise<DemoSeedSummary> {
  const now = new Date();

  // The people, named and with the current terms accepted, so they sign in straight to the app
  const userIds = new Map<string, number>();
  for (const person of DEMO_PEOPLE) {
    const user = await tx.user.upsert({
      where: { email: person.email },
      update: { name: person.name, termsVersion: TERMS_VERSION, termsAcceptedAt: now },
      create: {
        email: person.email,
        name: person.name,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: now,
      },
      select: { id: true },
    });
    userIds.set(person.email, user.id);
  }
  const idOf = (email: string) => userIds.get(email)!;

  const organization = await tx.organization.create({
    data: {
      name: 'Maple Grove HOA',
      slug: DEMO_SLUG,
      description:
        'The homeowners association of the Maple Grove subdivision: 142 lots, the clubhouse, the pool and the common areas.',
      // 142 lots, one vote each; the bylaws' Section 4.2 sets the quorum at 20%
      eligibleVoters: 142,
      quorumPercent: 20,
      quorumCount: null,
      // The clubhouse is in Chicago's time zone; the minutes give their times there
      timeZone: 'America/Chicago',
      members: {
        create: DEMO_PEOPLE.map((person) => ({ userId: idOf(person.email), role: person.role })),
      },
    },
  });

  // Two homeowners Pat added by email who haven't signed in yet: the chair's roster lists them,
  // and the chair counts them in the room by name
  await tx.organizationInvite.createMany({
    data: DEMO_NOT_SIGNED_IN.map((person) => ({
      organizationId: organization.id,
      email: person.email,
      name: person.name,
      role: 'member' as const,
      invitedById: idOf('pat@maplegrove.example'),
      createdAt: now,
    })),
  });

  // The bylaws, version 1
  const document = await tx.document.create({
    data: {
      organizationId: organization.id,
      title: 'Bylaws of Maple Grove Homeowners Association',
      docType: 'bylaws',
    },
  });
  const adopted = new Date('2024-03-15');
  const version = await tx.version.create({
    data: {
      documentId: document.id,
      versionNumber: 1,
      effectiveDate: adopted,
      adoptedAt: adopted,
      notes: 'Adopted at the 2024 annual meeting',
    },
  });
  let sections = 0;
  let quorumSectionId: string | null = null;
  for (const [articleIndex, article] of BYLAWS.entries()) {
    const parent = await tx.section.create({
      data: {
        versionId: version.id,
        position: articleIndex,
        numberLabel: article.label,
        title: article.title,
      },
    });
    sections++;
    for (const [sectionIndex, section] of article.sections.entries()) {
      const child = await tx.section.create({
        data: {
          versionId: version.id,
          parentId: parent.id,
          position: sectionIndex,
          numberLabel: section.label,
          title: section.title,
          content: section.content,
        },
      });
      sections++;
      if (section.label === QUORUM_LABEL) quorumSectionId = child.id;
    }
  }
  await tx.document.update({
    where: { id: document.id },
    data: { currentVersionId: version.id },
  });

  // The amendment the annual meeting takes up as new business: proposed by the board ahead of
  // the meeting, so a member moves it as drafted from the phone
  await tx.amendment.create({
    data: {
      documentId: document.id,
      title: 'Lower the quorum to 15%',
      status: 'proposed',
      proposedAt: new Date('2026-02-20T18:00:00-06:00'),
      description:
        'The last three annual meetings fell short of the 20% quorum. Lowering it to 15% lets the annual meeting do its business.',
      createdById: idOf('pat@maplegrove.example'),
      changes: {
        create: {
          changeType: 'modify',
          targetSectionId: quorumSectionId,
          newContent: LOWER_QUORUM,
          position: 0,
        },
      },
    },
  });

  // Last year's annual meeting as a scheduled meeting, adjourned, with the minutes Pat
  // published: this year's meeting approves them
  const lastYear = await tx.meetingPacket.create({
    data: {
      organizationId: organization.id,
      robbieCode: DEMO_PAST_MEETING_CODE,
      title: '2025 Annual Meeting',
      location: CLUBHOUSE,
      scheduledFor: new Date('2025-03-20T19:00:00-05:00'),
      startedAt: new Date('2025-03-20T19:04:00-05:00'),
      endedAt: new Date('2025-03-20T20:15:00-05:00'),
      chairUserId: idOf('dana@maplegrove.example'),
    },
  });
  await tx.minutes.create({
    data: {
      organizationId: organization.id,
      packetId: lastYear.id,
      status: 'published',
      body: MINUTES_2025,
      generatedAt: new Date('2025-03-20T20:15:00-05:00'),
      updatedById: idOf('pat@maplegrove.example'),
      publishedAt: new Date('2025-04-02T15:00:00Z'),
      publishedById: idOf('pat@maplegrove.example'),
    },
  });

  // This year's annual meeting, scheduled with its agenda
  await tx.meetingPacket.create({
    data: {
      organizationId: organization.id,
      robbieCode: DEMO_MEETING_CODE,
      title: '2026 Annual Meeting',
      description:
        'The annual meeting of the members: reports, the pool contract, the quorum amendment and the election of two directors.',
      location: CLUBHOUSE,
      scheduledFor: new Date('2026-10-20T19:00:00-05:00'),
      // The president presides
      chairUserId: idOf('dana@maplegrove.example'),
      agendaItems: { create: AGENDA.map((item, position) => ({ ...item, position })) },
    },
  });

  return {
    organizationId: organization.id,
    people: DEMO_PEOPLE.length,
    sections,
    agendaItems: AGENDA.length,
  };
}
