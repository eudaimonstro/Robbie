import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../db/prisma.js';
import {
  captureEmailsForTests,
  captureMemberEmailsForTests,
  type AddedToOrganizationEmail,
} from '../auth/emailService.js';
import { requestSignInCode, verifySignInCode } from '../auth/signInService.js';
import type { OrgRole } from '../generated/prisma/client.js';
import {
  MAX_ADDS_PER_DAY,
  MAX_BULK_ADDS_PER_DAY,
  MAX_BULK_PEOPLE,
  addMemberBySlug,
} from '../orgs/membershipService.js';
import { membersRouter } from '../orgs/memberRoutes.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, runHandler, signIn, type TestUser } from './helpers.js';
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
    method: 'post',
    route: '/organizations/:id/members/bulk',
    path: (f) => `/api/organizations/${f.orgA.id}/members/bulk`,
    body: () => ({ people: [{ email: 'new@example.org' }], role: 'member' }),
    min: 'admin',
    ok: 200,
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
  const setRole = (userId: number, role: OrgRole) =>
    prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: f.orgA.id, userId } },
      data: { role },
    });
  const signInByCode = async (email: string) => {
    const codes = captureEmailsForTests();
    const { challenge } = await requestSignInCode(email);
    return verifySignInCode(email, codes[0].code, challenge);
  };

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
      expect(mail).toEqual([
        {
          to: 'bo@example.org',
          organization: 'Org A',
          addedBy: 'A admin',
          addedByEmail: 'admin@example.org',
        },
      ]);
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
      const { challenge } = await requestSignInCode('cy@example.org');
      const cy = await verifySignInCode('cy@example.org', codes[0].code, challenge);
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
      const { challenge } = await requestSignInCode('dee@example.org');
      const dee = await verifySignInCode('dee@example.org', codes[0].code, challenge);
      expect(await prisma.organizationMember.count({ where: { userId: dee.id } })).toBe(0);
    });

    it('keeps the name given for someone not yet signed in, and starts their name step from it', async () => {
      const res = await call('post', members(), {
        cookie: f.users.admin.cookie,
        body: { email: 'cy@example.org', role: 'member', name: '  Cy Young ' },
      });
      expect(res.body).toMatchObject({
        status: 'invited',
        invite: { email: 'cy@example.org', name: 'Cy Young' },
      });
      // Adding again changes the name too
      await call('post', members(), {
        cookie: f.users.admin.cookie,
        body: { email: 'cy@example.org', role: 'member', name: 'Cyrus Young' },
      });
      const list = await call('get', members(), { cookie: f.users.admin.cookie });
      expect(list.body.invites).toContainEqual(
        expect.objectContaining({ email: 'cy@example.org', name: 'Cyrus Young' }),
      );

      const codes = captureEmailsForTests();
      const asked = await call('post', '/api/auth/request-code', {
        body: { email: 'cy@example.org' },
      });
      const verified = await call('post', '/api/auth/verify', {
        body: { email: 'cy@example.org', code: codes[0].code, challenge: asked.body.challenge },
      });
      expect(verified.status).toBe(200);
      expect(verified.body).toMatchObject({
        user: { email: 'cy@example.org', name: null },
        suggestedName: 'Cyrus Young',
      });
      const cookie = String(verified.headers['set-cookie']).split(';')[0];
      const me = await call('get', '/api/auth/me', { cookie });
      expect(me.body).toMatchObject({ suggestedName: 'Cyrus Young' });

      // Once named, nothing is suggested
      await call('patch', '/api/auth/me', { cookie, body: { name: 'Cy' } });
      expect((await call('get', '/api/auth/me', { cookie })).body).not.toHaveProperty(
        'suggestedName',
      );
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

  describe('adding several people at once', () => {
    const bulk = (cookie: string, body: object) =>
      call('post', `${members()}/bulk`, { cookie, body });

    it('adds each person once, emails nobody, and says what happened to each', async () => {
      const bo = await signIn('bo@example.org', { name: 'Bo' });
      const res = await bulk(f.users.admin.cookie, {
        role: 'member',
        people: [
          { email: 'Carmen.Diaz@Example.org', name: 'Carmen Diaz' },
          { email: 'bo@example.org', name: 'Bo Brown' },
          { email: 'member@example.org' },
          { email: 'pending@example.org', name: 'Pat P.' },
          { email: 'eli@example.org' },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        results: [
          { email: 'carmen.diaz@example.org', status: 'invited' },
          { email: 'bo@example.org', status: 'added' },
          { email: 'member@example.org', status: 'member' },
          { email: 'pending@example.org', status: 'updated' },
          { email: 'eli@example.org', status: 'invited' },
        ],
      });
      expect(mail).toEqual([]);
      expect(await roleOf(bo.id)).toBe('member');
      // An account's own name stays theirs
      expect((await prisma.user.findUniqueOrThrow({ where: { id: bo.id } })).name).toBe('Bo');
      const carmen = await prisma.organizationInvite.findFirstOrThrow({
        where: { email: 'carmen.diaz@example.org' },
      });
      expect(carmen).toMatchObject({ name: 'Carmen Diaz', role: 'member', emailed: false });
      const pending = await prisma.organizationInvite.findUniqueOrThrow({ where: { id: f.invite } });
      expect(pending).toMatchObject({ name: 'Pat P.', role: 'member' });
      expect(await roleOf(f.users.member.id)).toBe('member');
    });

    it("doesn't count toward the emailed additions' daily limit", async () => {
      const people = Array.from({ length: 30 }, (_, i) => ({ email: `p${i}@example.org` }));
      expect((await bulk(f.users.admin.cookie, { role: 'member', people })).status).toBe(200);
      expect((await add(f.users.admin.cookie, 'single@example.org', 'member')).status).toBe(201);
    });

    it('refuses a list that is too long, repeats an email or has a bad line, and adds nothing', async () => {
      const many = Array.from({ length: MAX_BULK_PEOPLE + 1 }, (_, i) => ({
        email: `p${i}@example.org`,
      }));
      for (const people of [
        many,
        [],
        [{ email: 'a@example.org' }, { email: 'A@example.org' }],
        [{ email: 'not an email' }],
        [{ email: 'a@example.org', name: 'x'.repeat(101) }],
      ]) {
        const res = await bulk(f.users.admin.cookie, { role: 'member', people });
        expect(res.status, JSON.stringify(people).slice(0, 80)).toBe(400);
      }
      expect(await prisma.organizationInvite.count({ where: { organizationId: f.orgA.id } })).toBe(
        1,
      );
    });

    it('gives the owner role only from an owner', async () => {
      const res = await bulk(f.users.admin.cookie, {
        role: 'owner',
        people: [{ email: 'boss@example.org' }],
      });
      expect(res.status).toBe(403);
    });

    it('holds its own daily limit', async () => {
      await prisma.organizationInvite.createMany({
        data: Array.from({ length: MAX_BULK_ADDS_PER_DAY - 1 }, (_, i) => ({
          organizationId: f.orgA.id,
          email: `earlier${i}@example.org`,
          role: 'member' as const,
          emailed: false,
        })),
      });
      const refused = await bulk(f.users.admin.cookie, {
        role: 'member',
        people: [{ email: 'a@example.org' }, { email: 'b@example.org' }],
      });
      expect(refused.status).toBe(429);
      expect(refused.body).toEqual({
        error: `This organization can add ${MAX_BULK_ADDS_PER_DAY} people a day this way. 1 more can be added today.`,
      });
      expect(
        (await bulk(f.users.admin.cookie, { role: 'member', people: [{ email: 'a@example.org' }] }))
          .status,
      ).toBe(200);
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

    it("gives members' emails to admins only, and each person their own", async () => {
      for (const role of ['viewer', 'member', 'secretary'] as const) {
        const res = await call('get', members(), { cookie: f.users[role].cookie });
        const withEmail = res.body.members.filter((m: { email?: string }) => m.email);
        expect(withEmail, role).toEqual([
          expect.objectContaining({ userId: f.users[role].id, email: `${role}@example.org` }),
        ]);
        expect(res.body.members[1], role).toEqual({
          userId: res.body.members[1].userId,
          name: res.body.members[1].name,
          role: res.body.members[1].role,
          ...(res.body.members[1].userId === f.users[role].id && {
            email: `${role}@example.org`,
          }),
        });
      }
      const asAdmin = await call('get', members(), { cookie: f.users.admin.cookie });
      expect(asAdmin.body.members.every((m: { email?: string }) => m.email)).toBe(true);
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

    it('cancels their pending additions, so signing in again does not bring them back', async () => {
      // Made a member while an addition of their email was still pending (the fixture's), and
      // pending in Org B too
      const pending = await signIn('pending@example.org');
      await prisma.organizationMember.create({
        data: { organizationId: f.orgA.id, userId: pending.id, role: 'member' },
      });
      const inviteB = await prisma.organizationInvite.create({
        data: { organizationId: f.orgB.id, email: 'pending@example.org', role: 'viewer' },
      });

      const res = await call('delete', member(pending.id), { cookie: f.users.admin.cookie });
      expect(res.status).toBe(204);
      const invite = await prisma.organizationInvite.findUniqueOrThrow({ where: { id: f.invite } });
      expect(invite.canceledAt).toBeInstanceOf(Date);

      await signInByCode('pending@example.org');
      expect(await roleOf(pending.id)).toBeNull();
      // Other organizations' additions still hold
      const inB = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: f.orgB.id, userId: pending.id } },
      });
      expect(inB?.role).toBe('viewer');
      const acceptedB = await prisma.organizationInvite.findUniqueOrThrow({
        where: { id: inviteB.id },
      });
      expect(acceptedB.acceptedAt).toBeInstanceOf(Date);
    });

    it('cancels the pending additions of someone who leaves', async () => {
      const pending = await signIn('pending@example.org');
      await prisma.organizationMember.create({
        data: { organizationId: f.orgA.id, userId: pending.id, role: 'member' },
      });
      const res = await call('delete', member(pending.id), { cookie: pending.cookie });
      expect(res.status).toBe(204);

      await signInByCode('pending@example.org');
      expect(await roleOf(pending.id)).toBeNull();
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

    it('as owner only by an owner', async () => {
      const ownerInvite = await prisma.organizationInvite.create({
        data: { organizationId: f.orgA.id, email: 'next-owner@example.org', role: 'owner' },
      });
      const path = `/api/organizations/${f.orgA.id}/invites/${ownerInvite.id}`;
      const byAdmin = await call('delete', path, { cookie: f.users.admin.cookie });
      expect(byAdmin.status).toBe(403);
      expect(byAdmin.body).toEqual({ error: 'You need the owner role for this' });
      const kept = await prisma.organizationInvite.findUniqueOrThrow({
        where: { id: ownerInvite.id },
      });
      expect(kept.canceledAt).toBeNull();
      expect((await call('delete', path, { cookie: f.users.owner.cookie })).status).toBe(204);
    });
  });

  describe("the acting member's role", () => {
    // Each request passed its rule with the role in req.org, then the role changed before the
    // change took the organization's lock
    const stale = (user: TestUser, role: OrgRole, name: string) => ({
      org: { id: f.orgA.id, role },
      user: { id: user.id, email: user.email, name },
    });

    it('is read again under the lock before a change', async () => {
      const { admin, member: plain } = f.users;
      // An owner, demoted to admin, makes someone an owner
      const promote = await runHandler(membersRouter, 'put', '/organizations/:id/members/:userId', {
        params: { id: f.orgA.id, userId: String(plain.id) },
        body: { role: 'owner' },
        ...stale(admin, 'owner', 'A admin'),
      });
      expect(promote).toEqual({ status: 403, body: { error: 'You need the owner role for this' } });
      expect(await roleOf(plain.id)).toBe('member');

      // Demoted to member, then adds someone
      await setRole(admin.id, 'member');
      const added = await runHandler(membersRouter, 'post', '/organizations/:id/members', {
        params: { id: f.orgA.id },
        body: { email: 'cy@example.org', role: 'viewer' },
        ...stale(admin, 'admin', 'A admin'),
      });
      expect(added).toEqual({ status: 403, body: { error: 'You need the admin role for this' } });

      // Now a viewer, then cancels an addition
      await setRole(admin.id, 'viewer');
      const canceled = await runHandler(
        membersRouter,
        'delete',
        '/organizations/:id/invites/:inviteId',
        { params: { id: f.orgA.id, inviteId: f.invite }, ...stale(admin, 'admin', 'A admin') },
      );
      expect(canceled).toEqual({
        status: 403,
        body: { error: 'You need the admin role for this' },
      });

      // Removed, then removes someone
      await prisma.organizationMember.delete({
        where: { organizationId_userId: { organizationId: f.orgA.id, userId: admin.id } },
      });
      const removed = await runHandler(
        membersRouter,
        'delete',
        '/organizations/:id/members/:userId',
        {
          params: { id: f.orgA.id, userId: String(f.users.viewer.id) },
          ...stale(admin, 'admin', 'A admin'),
        },
      );
      expect(removed).toEqual({ status: 404, body: { error: 'Not found' } });
      expect(await roleOf(f.users.viewer.id)).toBe('viewer');
      expect(await prisma.organizationInvite.count({ where: { email: 'cy@example.org' } })).toBe(0);
    });
  });

  describe('changes made at once', () => {
    /** Wait until a request is waiting for the organization's lock */
    async function lockWaiter() {
      for (let tries = 0; tries < 100; tries++) {
        const [{ waiting }] = await prisma.$queryRaw<Array<{ waiting: bigint }>>`
          SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%FROM "Organization"%FOR UPDATE%'`;
        if (waiting > 0n) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('No request waited for the organization lock');
    }

    it("refuse an owner's change that waited while they were demoted", async () => {
      // Owners A and B. B's "make C owner" passes its rule as owner, then waits for the lock
      // that A's demotion of B holds.
      const [a, b, c] = [f.users.owner, f.users.admin, f.users.member];
      await setRole(b.id, 'owner');
      let promote: Promise<{ status: number; body: unknown }> | undefined;
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${f.orgA.id} FOR UPDATE`;
          promote = call('put', member(c.id), { cookie: b.cookie, body: { role: 'owner' } }).then(
            (res) => ({ status: res.status, body: res.body }),
          );
          await lockWaiter();
          await tx.organizationMember.update({
            where: { organizationId_userId: { organizationId: f.orgA.id, userId: b.id } },
            data: { role: 'member' },
          });
        },
        { timeout: 10_000 },
      );
      const res = await promote!;
      expect(res).toEqual({ status: 403, body: { error: 'You need the admin role for this' } });
      expect(await roleOf(b.id)).toBe('member');
      expect(await roleOf(c.id)).toBe('member');
      expect(await roleOf(a.id)).toBe('owner');
    });

    it('let only one of two owners demote the other', async () => {
      const [a, b] = [f.users.owner, f.users.admin];
      await setRole(b.id, 'owner');
      const results = await Promise.all([
        call('put', member(b.id), { cookie: a.cookie, body: { role: 'admin' } }),
        call('put', member(a.id), { cookie: b.cookie, body: { role: 'admin' } }),
      ]);
      // The second sees its actor is no longer an owner
      expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
      expect(
        await prisma.organizationMember.count({
          where: { organizationId: f.orgA.id, role: 'owner' },
        }),
      ).toBe(1);
    });

    it('hold the daily limit when additions arrive together', async () => {
      // With the fixture's pending addition, 15 so far today
      await prisma.organizationInvite.createMany({
        data: Array.from({ length: MAX_ADDS_PER_DAY - 6 }, (_, i) => ({
          organizationId: f.orgA.id,
          email: `earlier${i}@example.org`,
          role: 'member' as const,
        })),
      });
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          add(f.users.admin.cookie, `new${i}@example.org`, 'member'),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 201, 201, 429, 429, 429]);
      expect(await prisma.organizationInvite.count({ where: { organizationId: f.orgA.id } })).toBe(
        MAX_ADDS_PER_DAY,
      );
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
