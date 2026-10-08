import type { OrganizationInvite, OrgRole, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { sendAddedToOrganization } from '../auth/emailService.js';
import { logger } from '../middleware/logger.js';
import { OrgError } from './orgError.js';
import { atLeast, roleNeeded } from './roles.js';

/** An organization may add this many people by email in 24 hours */
export const MAX_ADDS_PER_DAY = 20;
/** A pending addition lapses if the email doesn't sign in within this long */
export const INVITE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const LAST_OWNER = 'An organization needs at least one owner';

export interface MemberView {
  userId: number;
  name: string | null;
  email: string;
  role: OrgRole;
}

export interface InviteView {
  id: string;
  email: string;
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
  role: invite.role,
  createdAt: invite.createdAt,
});

/** Additions that can still become memberships: not accepted, not canceled, not lapsed */
function pending(now: Date): Prisma.OrganizationInviteWhereInput {
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

/** The members, and for admins the pending additions */
export async function listMembers(
  organizationId: string,
  withInvites: boolean,
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
    email: row.user.email,
    role: row.role,
  }));
  if (!withInvites) return { members };

  const invites = await prisma.organizationInvite.findMany({
    where: { organizationId, ...pending(now) },
    orderBy: { createdAt: 'asc' },
  });
  return { members, invites: invites.map(inviteView) };
}

/**
 * Add someone to an organization by email. An email with an account becomes a member at once;
 * one without waits until it first signs in. Adding a pending email again changes its role.
 * The person is emailed, except when only the role of a pending addition changes; a failed
 * email doesn't undo the addition.
 */
export async function addMemberByEmail(
  organizationId: string,
  actor: Actor,
  rawEmail: string,
  role: OrgRole,
  now: Date = new Date(),
): Promise<AddResult> {
  const email = rawEmail.trim().toLowerCase();

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
          data: { role },
        });
        return { status: 'updated', invite: inviteView(invite) };
      }
    }

    const today = await tx.organizationInvite.count({
      where: { organizationId, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
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
