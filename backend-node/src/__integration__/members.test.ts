import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  captureEmailsForTests,
  captureMemberEmailsForTests,
  type AddedToOrganizationEmail,
} from '../auth/emailService.js';
import { requestSignInCode, verifySignInCode } from '../auth/signInService.js';
import { MAX_ADDS_PER_DAY, addMemberBySlug } from '../orgs/membershipService.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, signIn } from './helpers.js';
import { describeRules } from './rules.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describeRules('member rules', [
  {
    method: 'get',
    route: '/organizations/:id/members',
    path: (f) => `/api/organizations/${f.orgA.id}/members`,
    min: 'viewer',
    ok: 200,
  },
  {
    method: 'post',
    route: '/organizations/:id/members',
    path: (f) => `/api/organizations/${f.orgA.id}/members`,
    body: () => ({ email: 'new@example.org', role: 'member' }),
    min: 'admin',
    ok: 201,
  },
  {
    method: 'put',
    route: '/organizations/:id/members/:userId',
    path: (f) => `/api/organizations/${f.orgA.id}/members/${f.users.member.id}`,
    body: () => ({ role: 'secretary' }),
    min: 'admin',
    ok: 200,
  },
  {
    method: 'delete',
    route: '/organizations/:id/members/:userId',
    path: (f) => `/api/organizations/${f.orgA.id}/members/${f.users.viewer.id}`,
    min: 'admin',
    ok: 204,
  },
  {
    method: 'delete',
    route: '/organizations/:id/invites/:inviteId',
    path: (f) => `/api/organizations/${f.orgA.id}/invites/${f.invite}`,
    min: 'admin',
    ok: 204,
  },
]);

describe('members', () => {
  let f: Fixture;
  let mail: AddedToOrganizationEmail[];
  beforeEach(async () => {
    await resetDatabase();
    f = await seedFixture();
    mail = captureMemberEmailsForTests();
  });
  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  const members = () => `/api/organizations/${f.orgA.id}/members`;
  const member = (userId: number) => `${members()}/${userId}`;
  const add = (cookie: string, email: string, role: string) =>
    call('post', members(), { cookie, body: { email, role } });
  const roleOf = async (userId: number) =>
    (
      await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: f.orgA.id, userId } },
      })
    )?.role ?? null;

  describe('adding by email', () => {
    it('adds an existing account at once and emails them', async () => {
      const bo = await signIn('bo@example.org', { name: 'Bo' });
      const res = await add(f.users.admin.cookie, ' Bo@Example.org ', 'secretary');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        status: 'added',
        member: { userId: bo.id, name: 'Bo', email: 'bo@example.org', role: 'secretary' },
        emailSent: true,
      });
      expect(mail).toEqual([{ to: 'bo@example.org', organization: 'Org A', addedBy: 'A admin' }]);
      const invite = await prisma.organizationInvite.findFirstOrThrow({
        where: { email: 'bo@example.org' },
      });
      expect(invite.acceptedAt).toBeInstanceOf(Date);

      const list = await call('get', '/api/organizations', { cookie: bo.cookie });
      expect(list.body).toEqual([expect.objectContaining({ id: f.orgA.id, role: 'secretary' })]);
    });

    it('keeps an unknown email waiting until it signs in', async () => {
      const res = await add(f.users.admin.cookie, 'cy@example.org', 'member');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'invited',
        invite: { email: 'cy@example.org', role: 'member' },
        emailSent: true,
      });
      expect(mail).toHaveLength(1);

      const codes = captureEmailsForTests();
      await requestSignInCode('cy@example.org');
      const cy = await verifySignInCode('cy@example.org', codes[0].code);
      expect(await roleOf(cy.id)).toBe('member');
      const invite = await prisma.organizationInvite.findFirstOrThrow({
        where: { email: 'cy@example.org' },
      });
      expect(invite.acceptedAt).toBeInstanceOf(Date);
    });

    it('updates the role of a pending addition without a second email', async () => {
      await add(f.users.admin.cookie, 'cy@example.org', 'member');
      const again = await add(f.users.admin.cookie, 'cy@example.org', 'secretary');
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({
        status: 'updated',
        invite: { email: 'cy@example.org', role: 'secretary' },
        emailSent: false,
      });
      expect(mail).toHaveLength(1);
      expect(await prisma.organizationInvite.count({ where: { email: 'cy@example.org' } })).toBe(1);
    });

    it('refuses someone who is already a member', async () => {
      const res = await add(f.users.admin.cookie, 'member@example.org', 'viewer');
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'That person is already a member' });
    });

    it('allows 20 additions in 24 hours', async () => {
      // The fixture's pending addition counts as one
      await prisma.organizationInvite.createMany({
        data: Array.from({ length: MAX_ADDS_PER_DAY - 1 }, (_, i) => ({
          organizationId: f.orgA.id,
          email: `person${i}@example.org`,
          role: 'member' as const,
        })),
      });
      const refused = await add(f.users.admin.cookie, 'one-more@example.org', 'member');
      expect(refused.status).toBe(429);
      expect(refused.body).toEqual({
        error: 'This organization has added 20 people today. Try again tomorrow.',
      });

      await prisma.organizationInvite.updateMany({
        where: { organizationId: f.orgA.id },
        data: { createdAt: new Date(Date.now() - 25 * HOUR) },
      });
      expect((await add(f.users.admin.cookie, 'one-more@example.org', 'member')).status).toBe(201);
    });

    it('turns only pending additions into memberships at sign-in', async () => {
      await prisma.organizationInvite.createMany({
        data: [
          {
            organizationId: f.orgA.id,
            email: 'dee@example.org',
            role: 'member',
            createdAt: new Date(Date.now() - 31 * DAY),
          },
          {
            organizationId: f.orgB.id,
            email: 'dee@example.org',
            role: 'viewer',
            canceledAt: new Date(),
          },
        ],
      });
      const codes = captureEmailsForTests();
      await requestSignInCode('dee@example.org');
      const dee = await verifySignInCode('dee@example.org', codes[0].code);
      expect(await prisma.organizationMember.count({ where: { userId: dee.id } })).toBe(0);
    });

    it('keeps the addition when the email fails to send', async () => {
      // Production without an email provider can't send
      process.env.NODE_ENV = 'production';
      const res = await add(f.users.admin.cookie, 'cy@example.org', 'member');
      process.env.NODE_ENV = 'test';
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'invited', emailSent: false });
      expect(await prisma.organizationInvite.count({ where: { email: 'cy@example.org' } })).toBe(1);
    });
  });

  describe('owners', () => {
    it('are added only by an owner', async () => {
      const byAdmin = await add(f.users.admin.cookie, 'cy@example.org', 'owner');
      expect(byAdmin.status).toBe(403);
      expect(byAdmin.body).toEqual({ error: 'You need the owner role for this' });
      expect((await add(f.users.owner.cookie, 'cy@example.org', 'owner')).status).toBe(201);
    });

    it("can't be changed, made or removed by an admin", async () => {
      const cookie = f.users.admin.cookie;
      const demote = await call('put', member(f.users.owner.id), {
        cookie,
        body: { role: 'admin' },
      });
      expect(demote.status).toBe(403);
      const promote = await call('put', member(f.users.member.id), {
        cookie,
        body: { role: 'owner' },
      });
      expect(promote.status).toBe(403);
      const remove = await call('delete', member(f.users.owner.id), { cookie });
      expect(remove.status).toBe(403);
      expect(await roleOf(f.users.owner.id)).toBe('owner');
      expect(await roleOf(f.users.member.id)).toBe('member');
    });

    it('must leave one behind', async () => {
      const cookie = f.users.owner.cookie;
      const demote = await call('put', member(f.users.owner.id), {
        cookie,
        body: { role: 'admin' },
      });
      expect(demote.status).toBe(409);
      expect(demote.body).toEqual({ error: 'An organization needs at least one owner' });
      const leave = await call('delete', member(f.users.owner.id), { cookie });
      expect(leave.status).toBe(409);
      expect(await roleOf(f.users.owner.id)).toBe('owner');
    });

    it('can step down once there is another', async () => {
      const cookie = f.users.owner.cookie;
      const promote = await call('put', member(f.users.admin.id), {
        cookie,
        body: { role: 'owner' },
      });
      expect(promote.status).toBe(200);
      expect(promote.body).toEqual({
        member: {
          userId: f.users.admin.id,
          name: 'A admin',
          email: 'admin@example.org',
          role: 'owner',
        },
      });
      const stepDown = await call('put', member(f.users.owner.id), {
        cookie,
        body: { role: 'admin' },
      });
      expect(stepDown.status).toBe(200);
      expect(await roleOf(f.users.owner.id)).toBe('admin');
    });
  });

  describe('the member list', () => {
    it('shows members to everyone, and pending additions to admins', async () => {
      const asViewer = await call('get', members(), { cookie: f.users.viewer.cookie });
      expect(asViewer.status).toBe(200);
      expect(asViewer.body.members).toHaveLength(5);
      expect(asViewer.body.members[0]).toEqual({
        userId: f.users.viewer.id,
        name: 'A viewer',
        email: 'viewer@example.org',
        role: 'viewer',
      });
      expect(asViewer.body).not.toHaveProperty('invites');

      const asAdmin = await call('get', members(), { cookie: f.users.admin.cookie });
      expect(asAdmin.body.invites).toEqual([
        expect.objectContaining({ id: f.invite, email: 'pending@example.org', role: 'member' }),
      ]);
    });
  });

  describe('leaving and removing', () => {
    it('lets anyone leave', async () => {
      const res = await call('delete', member(f.users.viewer.id), {
        cookie: f.users.viewer.cookie,
      });
      expect(res.status).toBe(204);
      expect(await roleOf(f.users.viewer.id)).toBeNull();
    });

    it("answers 404 for someone who isn't a member", async () => {
      const res = await call('put', member(f.outsider.id), {
        cookie: f.users.owner.cookie,
        body: { role: 'viewer' },
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });
  });

  describe('canceling a pending addition', () => {
    it('works once, and only on this organization', async () => {
      const cookie = f.users.admin.cookie;
      const path = `/api/organizations/${f.orgA.id}/invites/${f.invite}`;
      expect((await call('delete', path, { cookie })).status).toBe(204);
      expect((await call('delete', path, { cookie })).status).toBe(404);

      const inviteB = await prisma.organizationInvite.create({
        data: { organizationId: f.orgB.id, email: 'x@example.org', role: 'member' },
      });
      const other = await call('delete', `/api/organizations/${f.orgA.id}/invites/${inviteB.id}`, {
        cookie,
      });
      expect(other.status).toBe(404);
    });
  });

  describe('adding a member for support', () => {
    it('creates the account if needed and sets the role', async () => {
      const result = await addMemberBySlug('org-a', ' Eve@Example.org ', 'owner');
      expect(result).toEqual({ organization: 'Org A', email: 'eve@example.org', role: 'owner' });
      const eve = await prisma.user.findUniqueOrThrow({ where: { email: 'eve@example.org' } });
      expect(await roleOf(eve.id)).toBe('owner');
      expect(mail).toEqual([]);

      // Running it again changes the role
      await addMemberBySlug('org-a', 'eve@example.org', 'admin');
      expect(await roleOf(eve.id)).toBe('admin');
    });

    it('keeps the last owner and needs a real organization', async () => {
      await expect(addMemberBySlug('org-a', 'owner@example.org', 'admin')).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        addMemberBySlug('no-such-org', 'eve@example.org', 'owner'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
