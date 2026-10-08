/**
 * Member routes: list, add by email, change role, remove or leave, and cancel a pending
 * addition. Mounted at /api.
 */

import { Router, type Response, type Router as RouterType } from 'express';
import type { OrgRole } from '../generated/prisma/client.js';
import type { SessionUser } from '../auth/sessionService.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../middleware/logger.js';
import { syncOrganizationLiveRoles } from '../socket/meetingRoles.js';
import {
  addMemberBody,
  addMembersBulkBody,
  changeRoleBody,
  inviteParams,
  memberParams,
  organizationMembersParams,
} from '../schemas/members.js';
import { heavyWriteLimiter } from '../middleware/userLimits.js';
import {
  addMemberByEmail,
  addMembersInBulk,
  cancelInvite,
  changeRole,
  listMembers,
  removeMember,
  type Actor,
} from './membershipService.js';
import { OrgError } from './orgError.js';
import { fromParam, requireRole } from './requireRole.js';
import { orgOfOrganization } from './resolvers.js';
import { atLeast } from './roles.js';

export const membersRouter: RouterType = Router();

const byOrganization = fromParam('id', orgOfOrganization);

/** The signed-in user, with their role in the organization the rule found */
const actorOf = (user: SessionUser, org: { role: OrgRole }): Actor => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: org.role,
});

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof OrgError) {
    return res.status(error.status).json({ error: error.message });
  }
  logger.error({ err: error }, fallback);
  res.status(500).json({ error: fallback });
}

/**
 * After a membership changes: the organization's live meetings give the person their new role
 * at once (a member removed becomes a guest, say). Best effort: the change stands regardless.
 */
async function syncLiveMeetings(organizationId: string): Promise<void> {
  try {
    await syncOrganizationLiveRoles(organizationId);
  } catch (error) {
    logger.error({ err: error, organizationId }, "Failed to sync a live meeting's roles");
  }
}

// GET /api/organizations/:id/members: the members by name and role, and for admins their emails
// and the pending additions
membersRouter.get(
  '/organizations/:id/members',
  validate({ params: organizationMembersParams }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      res.json(await listMembers(req.params.id, atLeast(req.org!.role, 'admin'), req.user!.id));
    } catch (error) {
      sendError(res, error, 'Failed to list members');
    }
  },
);

// POST /api/organizations/:id/members { email, role }: add someone by email
membersRouter.post(
  '/organizations/:id/members',
  validate({ params: organizationMembersParams, body: addMemberBody }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      const result = await addMemberByEmail(
        req.params.id,
        actorOf(req.user!, req.org!),
        req.body.email,
        req.body.role,
        new Date(),
        req.body.name,
      );
      if (result.status === 'added') await syncLiveMeetings(req.params.id);
      res.status(result.status === 'updated' ? 200 : 201).json(result);
    } catch (error) {
      sendError(res, error, 'Failed to add the member');
    }
  },
);

// POST /api/organizations/:id/members/bulk { people: [{ email, name? }], role }: add many people
// at once with one role, emailing nobody. One request, counted among the heavy writes.
membersRouter.post(
  '/organizations/:id/members/bulk',
  validate({ params: organizationMembersParams, body: addMembersBulkBody }),
  requireRole('admin', byOrganization),
  heavyWriteLimiter,
  async (req, res) => {
    try {
      const results = await addMembersInBulk(
        req.params.id,
        actorOf(req.user!, req.org!),
        req.body.people,
        req.body.role,
      );
      res.json({ results });
    } catch (error) {
      sendError(res, error, 'Failed to add them');
    }
  },
);

// PUT /api/organizations/:id/members/:userId { role }: change a member's role
membersRouter.put(
  '/organizations/:id/members/:userId',
  validate({ params: memberParams, body: changeRoleBody }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      const member = await changeRole(
        req.params.id,
        actorOf(req.user!, req.org!),
        Number(req.params.userId),
        req.body.role,
      );
      await syncLiveMeetings(req.params.id);
      res.json({ member });
    } catch (error) {
      sendError(res, error, 'Failed to change the role');
    }
  },
);

// DELETE /api/organizations/:id/members/:userId: remove a member (admin), or leave (anyone)
membersRouter.delete(
  '/organizations/:id/members/:userId',
  validate({ params: memberParams }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      await removeMember(req.params.id, actorOf(req.user!, req.org!), Number(req.params.userId));
      await syncLiveMeetings(req.params.id);
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 'Failed to remove the member');
    }
  },
);

// DELETE /api/organizations/:id/invites/:inviteId: cancel a pending addition
membersRouter.delete(
  '/organizations/:id/invites/:inviteId',
  validate({ params: inviteParams }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      await cancelInvite(req.params.id, actorOf(req.user!, req.org!), req.params.inviteId);
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 'Failed to cancel the addition');
    }
  },
);
