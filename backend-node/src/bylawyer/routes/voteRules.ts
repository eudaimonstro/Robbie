import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam } from '../../schemas/common.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfOrganization } from '../../orgs/resolvers.js';

/**
 * The organization's vote rules: what its bylaws require to amend them (two thirds of the votes
 * cast unless set). Read with the organization (GET /organizations, /organizations/:id); each
 * bylaw amendment moved in a meeting carries the rule as it was then (prepareBylawMotion).
 */
export const voteRulesRouter: RouterType = Router();

export const voteRulesBody = z.object({
  bylawAmendmentVote: z.enum([
    'twoThirdsCast',
    'majorityCast',
    'majorityMembers',
    'twoThirdsMembers',
  ]),
});

/** PUT /api/organizations/:id/vote-rules: set what bylaw amendments need (admin) */
voteRulesRouter.put(
  '/organizations/:id/vote-rules',
  validate({ params: uuidParam, body: voteRulesBody }),
  requireRole('admin', fromParam('id', orgOfOrganization)),
  async (req, res) => {
    const { bylawAmendmentVote } = req.body as z.infer<typeof voteRulesBody>;
    const updated = await prisma.organization.update({
      where: { id: req.params.id },
      data: { bylawAmendmentVote },
      select: { bylawAmendmentVote: true },
    });
    res.json(updated);
  },
);
