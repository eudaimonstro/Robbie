import type { OrganizationInvite, OrgRole, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { sendAddedToOrganization } from '../auth/emailService.js';
import { logger } from '../middleware/logger.js';
import { isEmailAddress } from '@robbie-bylawyer/shared/utils';
import { OrgError } from './orgError.js';
import { atLeast, roleNeeded } from './roles.js';

/** An organization may add (and email) this many people one at a time in 24 hours */
export const MAX_ADDS_PER_DAY = 20;
/** At most this many people in one bulk addition */
export const MAX_BULK_PEOPLE = 500;
/**
 * An organization may add this many people in bulk in 24 hours. A bulk addition emails nobody,
 * so it isn't the abuse an emailed addition can be (each costs only a row), but it is bounded.
 */
export const MAX_BULK_ADDS_PER_DAY = 1000;
/** A pending addition lapses if the email doesn't sign in within this long */
export const INVITE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const LAST_OWNER = 'An organization needs at least one owner';

export interface MemberView {
  userId: number;
  name: string | null;
  /** Left out of a list for someone below admin, but for their own */
  email?: string;
  role: OrgRole;
}

export interface InviteView {
  id: string;
  email: string;
  /** The name whoever added them gave, if any */
  name: string | null;
  role: OrgRole;
  createdAt: Date;
}

/**
 * Who is acting: the signed-in user, with their role in the organization as requireRole read
 * it. Changes read the role again under the organization's lock (see lockAsActor).
 */
export interface Actor {
  id: number;
  name: string | null;
  email: string;
  role: OrgRole;
}

export type AddResult =
  | { status: 'added'; member: MemberView; emailSent: boolean }
  | { status: 'invited'; invite: InviteView; emailSent: boolean }
  | { status: 'updated'; invite: InviteView; emailSent: false };

type Outcome =
  | { status: 'added'; member: MemberView }
  | { status: 'invited'; invite: InviteView }
  | { status: 'updated'; invite: InviteView };

type Tx = Prisma.TransactionClient;

const inviteView = (invite: OrganizationInvite): InviteView => ({
  id: invite.id,
  email: invite.email,
  name: invite.name,
  role: invite.role,
  createdAt: invite.createdAt,
});

/** Additions that can still become memberships: not accepted, not canceled, not lapsed */
export function pending(now: Date): Prisma.OrganizationInviteWhereInput {
  return {
    acceptedAt: null,
    canceledAt: null,
    createdAt: { gt: new Date(now.getTime() - INVITE_LIFETIME_MS) },
  };
}

/**
 * Hold the organization's row until the transaction ends, so checks and changes to one
 * organization's members run one at a time
 */
async function lockOrganization(tx: Tx, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
}

/**
 * Lock the organization, then read the actor's role again: requireRole read it before the lock,
 * and a change that took the lock first may have lowered it. Answers as requireRole does when
 * the actor is no longer a member or their role is now below `min`.
 */
async function lockAsActor(
  tx: Tx,
  organizationId: string,
  actor: Actor,
  min: OrgRole,
): Promise<Actor> {
  await lockOrganization(tx, organizationId);
  const membership = await tx.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: actor.id } },
    select: { role: true },
  });
  if (!membership) throw new OrgError(404, 'Not found');
  if (!atLeast(membership.role, min)) throw new OrgError(403, roleNeeded(min));
  return { ...actor, role: membership.role };
}

/** Only an owner may give the owner role, or change or remove an owner */
function checkOwnerRule(actor: Actor, ...roles: OrgRole[]): void {
  if (roles.includes('owner') && actor.role !== 'owner') {
    throw new OrgError(403, roleNeeded('owner'));
  }
}

/** Refuse to take away the organization's last owner */
async function checkAnotherOwner(tx: Tx, organizationId: string): Promise<void> {
  const owners = await tx.organizationMember.count({ where: { organizationId, role: 'owner' } });
  if (owners <= 1) throw new OrgError(409, LAST_OWNER);
}

/**
 * The members by name and role. Admins (`forAdmin`) also get their emails and the pending
 * additions; anyone else gets only their own email: members' addresses are for those who add
 * and remove them.
 */
export async function listMembers(
  organizationId: string,
  forAdmin: boolean,
  viewerId: number | null = null,
  now: Date = new Date(),
): Promise<{ members: MemberView[]; invites?: InviteView[] }> {
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
  });
  const members = rows.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    ...((forAdmin || row.userId === viewerId) && { email: row.user.email }),
    role: row.role,
  }));
  if (!forAdmin) return { members };

  const invites = await prisma.organizationInvite.findMany({
    where: { organizationId, ...pending(now) },
    orderBy: { createdAt: 'asc' },
  });
  return { members, invites: invites.map(inviteView) };
}

/**
 * Add someone to an organization by email. An email with an account becomes a member at once;
 * one without waits until it first signs in. Adding a pending email again changes its role (and
 * its name, when one is given). The person is emailed, except when only a pending addition
 * changes; a failed email doesn't undo the addition. The name, for someone without an account,
 * is what the roster shows before they sign in and where their name step starts.
 */
export async function addMemberByEmail(
  organizationId: string,
  actor: Actor,
  rawEmail: string,
  role: OrgRole,
  now: Date = new Date(),
  rawName?: string,
): Promise<AddResult> {
  const email = rawEmail.trim().toLowerCase();
  const name = rawName?.trim() || null;

  const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
    const acting = await lockAsActor(tx, organizationId, actor, 'admin');
    checkOwnerRule(acting, role);

    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (user) {
      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: user.id } },
      });
      if (existing) throw new OrgError(409, 'That person is already a member');
    } else {
      const waiting = await tx.organizationInvite.findFirst({
        where: { organizationId, email, ...pending(now) },
        orderBy: { createdAt: 'desc' },
      });
      if (waiting) {
        checkOwnerRule(acting, waiting.role);
        const invite = await tx.organizationInvite.update({
          where: { id: waiting.id },
          data: { role, ...(name && { name }) },
        });
        return { status: 'updated', invite: inviteView(invite) };
      }
    }

    // Only additions that emailed someone: a bulk addition emails nobody (see addMembersInBulk)
    const today = await tx.organizationInvite.count({
      where: { organizationId, emailed: true, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
    });
    if (today >= MAX_ADDS_PER_DAY) {
      throw new OrgError(
        429,
        `This organization has added ${MAX_ADDS_PER_DAY} people today. Try again tomorrow.`,
      );
    }

    const invite = await tx.organizationInvite.create({
      data: {
        organizationId,
        email,
        name,
        role,
        invitedById: actor.id,
        createdAt: now,
        acceptedAt: user ? now : null,
      },
    });
    if (!user) return { status: 'invited', invite: inviteView(invite) };

    await tx.organizationMember.create({
      data: { organizationId, userId: user.id, role, createdAt: now },
    });
    return {
      status: 'added',
      member: { userId: user.id, name: user.name, email: user.email, role },
    };
  });

  if (outcome.status === 'updated') return { ...outcome, emailSent: false };

  let emailSent = true;
  try {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    await sendAddedToOrganization({
      to: email,
      organization: organization.name,
      addedBy: actor.name,
      addedByEmail: actor.email,
    });
  } catch (error) {
    logger.warn({ err: error, organizationId }, 'Failed to send the added-to-organization email');
    emailSent = false;
  }
  return { ...outcome, emailSent };
}

/** One person in a bulk addition: an email, and the name to show until they sign in */
export interface BulkPerson {
  email: string;
  name?: string;
}

/**
 * What a bulk addition did with each line, in the order given: invited (waiting to sign in, with
 * or without an account: the answer doesn't say which), updated (already waiting: the role and
 * name changed), member (already a member), or refused on its own: invalid (not an email
 * address), duplicate (listed earlier), owner-only (waiting to join as an owner, which only an
 * owner changes)
 */
export type BulkStatus = 'invited' | 'updated' | 'member' | 'invalid' | 'duplicate' | 'owner-only';

/**
 * Add many people at once with one role, in one transaction, emailing nobody. Everyone not yet a
 * member becomes a pending addition, those with an account too: nobody is made a member behind
 * their back, and the answer doesn't tell who has an account. A pending addition becomes a
 * membership when its email signs in, lists its organizations, or joins one of the
 * organization's meetings (acceptPendingInvites). A pending addition already there gets the role
 * and the name. Each bad line is answered on its own; the rest are added. A list that would pass
 * the bulk limit for the day adds nobody.
 */
export async function addMembersInBulk(
  organizationId: string,
  actor: Actor,
  people: BulkPerson[],
  role: OrgRole,
  now: Date = new Date(),
): Promise<Array<{ email: string; status: BulkStatus }>> {
  const wanted = people.map((person) => ({
    email: person.email.trim().toLowerCase(),
    name: person.name?.trim() || null,
  }));
  const valid = wanted.filter((person) => isEmailAddress(person.email));
  const emails = [...new Set(valid.map((person) => person.email))];

  return prisma.$transaction(async (tx) => {
    const acting = await lockAsActor(tx, organizationId, actor, 'admin');
    checkOwnerRule(acting, role);

    const memberEmails = new Set(
      (
        await tx.organizationMember.findMany({
          where: { organizationId, user: { email: { in: emails } } },
          select: { user: { select: { email: true } } },
        })
      ).map((membership) => membership.user.email),
    );
    const waiting = await tx.organizationInvite.findMany({
      where: { organizationId, email: { in: emails }, ...pending(now) },
      orderBy: { createdAt: 'desc' },
    });
    const waitingOf = new Map<string, OrganizationInvite>();
    for (const invite of waiting) {
      if (!waitingOf.has(invite.email)) waitingOf.set(invite.email, invite);
    }
    // Only an owner changes a pending addition as owner (or makes one)
    const ownerOnly = (invite: OrganizationInvite | undefined) =>
      !!invite && invite.role === 'owner' && acting.role !== 'owner';

    const seen = new Set<string>();
    const statuses = wanted.map(({ email }): BulkStatus => {
      if (!isEmailAddress(email)) return 'invalid';
      if (seen.has(email)) return 'duplicate';
      seen.add(email);
      if (memberEmails.has(email)) return 'member';
      const invite = waitingOf.get(email);
      if (ownerOnly(invite)) return 'owner-only';
      return invite ? 'updated' : 'invited';
    });

    const creating = statuses.filter((status) => status === 'invited');
    const today = await tx.organizationInvite.count({
      where: {
        organizationId,
        emailed: false,
        createdAt: { gt: new Date(now.getTime() - DAY_MS) },
      },
    });
    if (today + creating.length > MAX_BULK_ADDS_PER_DAY) {
      const left = Math.max(0, MAX_BULK_ADDS_PER_DAY - today);
      throw new OrgError(
        429,
        `This organization can add ${MAX_BULK_ADDS_PER_DAY} people a day this way. ${left} more can be added today.`,
      );
    }

    const additions: Prisma.OrganizationInviteCreateManyInput[] = [];
    for (const [index, { email, name }] of wanted.entries()) {
      const status = statuses[index];
      if (status === 'updated') {
        await tx.organizationInvite.update({
          where: { id: waitingOf.get(email)!.id },
          data: { role, ...(name && { name }) },
        });
      } else if (status === 'invited') {
        additions.push({
          organizationId,
          email,
          name,
          role,
          invitedById: actor.id,
          emailed: false,
          createdAt: now,
        });
      }
    }
    await tx.organizationInvite.createMany({ data: additions });
    return wanted.map(({ email }, index) => ({ email, status: statuses[index] }));
  });
}

/**
 * Turn a signed-in user's pending additions into memberships: when they list their
 * organizations or join a meeting, as at sign-in (someone with an account, added in bulk)
 */
export async function acceptPendingInvitesFor(
  userId: number,
  now: Date = new Date(),
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return 0;
  const waiting = await prisma.organizationInvite.count({
    where: { email: user.email, ...pending(now) },
  });
  if (waiting === 0) return 0;
  return prisma.$transaction((tx) => acceptPendingInvites(tx, user, now));
}

/**
 * The name given for a user's email when they were added by email, the latest first: where a
 * new user's name step starts. Only additions that were live (pending, or accepted): never one
 * canceled, nor one that lapsed unaccepted. Null when they have a name already or none was given.
 */
export async function suggestedNameFor(
  user: { email: string; name: string | null },
  now: Date = new Date(),
): Promise<string | null> {
  if (user.name) return null;
  const invite = await prisma.organizationInvite.findFirst({
    where: {
      email: user.email,
      name: { not: null },
      canceledAt: null,
      OR: [
        { acceptedAt: { not: null } },
        { createdAt: { gt: new Date(now.getTime() - INVITE_LIFETIME_MS) } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { name: true },
  });
  return invite?.name ?? null;
}

/** Change a member's role, keeping the owner rules */
export async function changeRole(
  organizationId: string,
  actor: Actor,
  userId: number,
  role: OrgRole,
): Promise<MemberView> {
  return prisma.$transaction(async (tx) => {
    const acting = await lockAsActor(tx, organizationId, actor, 'admin');
    const target = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!target) throw new OrgError(404, 'Not found');
    checkOwnerRule(acting, target.role, role);
    if (target.role === 'owner' && role !== 'owner') await checkAnotherOwner(tx, organizationId);

    await tx.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role },
    });
    return { userId, name: target.user.name, email: target.user.email, role };
  });
}

/**
 * Remove a member (needs admin), or leave (the actor removes themselves). Pending additions of
 * their email to this organization are canceled, so signing in again doesn't bring them back.
 */
export async function removeMember(
  organizationId: string,
  actor: Actor,
  userId: number,
  now: Date = new Date(),
): Promise<void> {
  const leaving = actor.id === userId;

  await prisma.$transaction(async (tx) => {
    const acting = await lockAsActor(tx, organizationId, actor, leaving ? 'viewer' : 'admin');
    const target = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { user: { select: { email: true } } },
    });
    if (!target) throw new OrgError(404, 'Not found');
    if (!leaving) checkOwnerRule(acting, target.role);
    if (target.role === 'owner') await checkAnotherOwner(tx, organizationId);

    await tx.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
    await tx.organizationInvite.updateMany({
      where: { organizationId, email: target.user.email, ...pending(now) },
      data: { canceledAt: now },
    });
  });
}

/** Cancel a pending addition of this organization. Only an owner may cancel one as owner. */
export async function cancelInvite(
  organizationId: string,
  actor: Actor,
  inviteId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const acting = await lockAsActor(tx, organizationId, actor, 'admin');
    const invite = await tx.organizationInvite.findFirst({
      where: { id: inviteId, organizationId, ...pending(now) },
    });
    if (!invite) throw new OrgError(404, 'Not found');
    checkOwnerRule(acting, invite.role);

    await tx.organizationInvite.update({
      where: { id: invite.id },
      data: { canceledAt: now },
    });
  });
}

/**
 * Make someone a member of an organization with a role (development data and support).
 * Creates the user if the email has no account, and sends no email. The last-owner rule
 * still holds.
 */
export async function addMemberBySlug(
  slug: string,
  rawEmail: string,
  role: OrgRole,
): Promise<{ organization: string; email: string; role: OrgRole }> {
  const email = rawEmail.trim().toLowerCase();
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!organization) throw new OrgError(404, `No organization has the slug "${slug}"`);

  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organization.id);
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email },
      select: { id: true },
    });
    const key = { organizationId: organization.id, userId: user.id };
    const current = await tx.organizationMember.findUnique({
      where: { organizationId_userId: key },
    });
    if (current?.role === 'owner' && role !== 'owner') {
      await checkAnotherOwner(tx, organization.id);
    }
    await tx.organizationMember.upsert({
      where: { organizationId_userId: key },
      update: { role },
      create: { ...key, role },
    });
  });
  return { organization: organization.name, email, role };
}

/**
 * Turn the pending additions for a user's email into memberships. Runs in the sign-in
 * transaction that finds or creates the user.
 */
export async function acceptPendingInvites(
  tx: Tx,
  user: { id: number; email: string },
  now: Date,
): Promise<number> {
  const invites = await tx.organizationInvite.findMany({
    where: { email: user.email, ...pending(now) },
  });
  if (invites.length === 0) return 0;

  await tx.organizationMember.createMany({
    data: invites.map((invite) => ({
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
      createdAt: now,
    })),
    skipDuplicates: true,
  });
  await tx.organizationInvite.updateMany({
    where: { id: { in: invites.map((invite) => invite.id) } },
    data: { acceptedAt: now },
  });
  return invites.length;
}
