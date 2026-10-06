import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam } from '../../schemas/common.js';
import {
  createOrganizationBody,
  updateOrganizationBody,
  listOrganizationsQuery,
} from '../../schemas/organizations.js';
import { getPagination, paginatedResponse } from '../../middleware/pagination.js';
import { logger } from '../../middleware/logger.js';
import { OrgError } from '../../orgs/orgError.js';
import {
  createOwnedOrganization,
  slugTaken,
  userOrganizations,
} from '../../orgs/organizationService.js';
import { fromParam, requireRole, signedInOnly } from '../../orgs/requireRole.js';
import { orgOfOrganization, orgOfSlug } from '../../orgs/resolvers.js';

export const organizationsRouter: RouterType = Router();

const byOrganization = fromParam('id', orgOfOrganization);

// Generate URL-friendly slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// List the signed-in user's organizations, each with the user's role
organizationsRouter.get(
  '/organizations',
  validate({ query: listOrganizationsQuery }),
  signedInOnly(),
  async (req, res) => {
    try {
      const activeOnly = req.query.active_only !== 'false';

      if (req.query.page) {
        const pagination = getPagination(req);
        const { organizations, total } = await userOrganizations(req.user!.id, {
          activeOnly,
          skip: pagination.skip,
          take: pagination.limit,
        });
        return res.json(paginatedResponse(organizations, total, pagination));
      }

      const { organizations } = await userOrganizations(req.user!.id, { activeOnly });
      res.json(organizations);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list organizations');
      res.status(500).json({ error: 'Failed to list organizations' });
    }
  },
);

// Create an organization; the creator becomes its owner
organizationsRouter.post(
  '/organizations',
  validate({ body: createOrganizationBody }),
  signedInOnly(),
  async (req, res) => {
    try {
      const { name, slug: providedSlug, description } = req.body;
      const slug = providedSlug || generateSlug(name);

      // Check for existing slug
      const existing = await prisma.organization.findUnique({ where: { slug } });
      if (existing) {
        return res.status(400).json({ error: slugTaken(slug) });
      }

      const org = await createOwnedOrganization(req.user!.id, { name, slug, description });
      res.status(201).json(org);
    } catch (error) {
      if (error instanceof OrgError) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error({ err: error }, 'Failed to create organization');
      res.status(500).json({ error: 'Failed to create organization' });
    }
  },
);

// Get organization by slug
organizationsRouter.get(
  '/organizations/by-slug/:slug',
  requireRole('viewer', fromParam('slug', orgOfSlug)),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { slug: req.params.slug },
      });

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(org);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get organization');
      res.status(500).json({ error: 'Failed to get organization' });
    }
  },
);

// Get organization by ID
organizationsRouter.get(
  '/organizations/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byOrganization),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.id },
      });

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      res.json(org);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get organization');
      res.status(500).json({ error: 'Failed to get organization' });
    }
  },
);

// Update the organization's name and description
organizationsRouter.put(
  '/organizations/:id',
  validate({ params: uuidParam, body: updateOrganizationBody }),
  requireRole('admin', byOrganization),
  async (req, res) => {
    try {
      const updated = await prisma.organization.update({
        where: { id: req.params.id },
        data: { name: req.body.name, description: req.body.description },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to update organization');
      res.status(500).json({ error: 'Failed to update organization' });
    }
  },
);

// Delete organization
organizationsRouter.delete(
  '/organizations/:id',
  validate({ params: uuidParam }),
  requireRole('owner', byOrganization),
  async (req, res) => {
    try {
      await prisma.organization.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete organization');
      res.status(500).json({ error: 'Failed to delete organization' });
    }
  },
);
