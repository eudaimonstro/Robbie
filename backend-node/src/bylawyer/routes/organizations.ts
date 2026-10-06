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

export const organizationsRouter: RouterType = Router();

// Generate URL-friendly slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// List all organizations
organizationsRouter.get(
  '/organizations',
  validate({ query: listOrganizationsQuery }),
  async (req, res) => {
    try {
      const activeOnly = req.query.active_only !== 'false';
      const where = activeOnly ? { isActive: true } : undefined;

      if (req.query.page) {
        const pagination = getPagination(req);
        const [organizations, total] = await Promise.all([
          prisma.organization.findMany({
            where,
            orderBy: { name: 'asc' },
            skip: pagination.skip,
            take: pagination.limit,
          }),
          prisma.organization.count({ where }),
        ]);
        return res.json(paginatedResponse(organizations, total, pagination));
      }

      const organizations = await prisma.organization.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      res.json(organizations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to list organizations' });
    }
  },
);

// Create organization
organizationsRouter.post(
  '/organizations',
  validate({ body: createOrganizationBody }),
  async (req, res) => {
    try {
      const { name, slug: providedSlug, description } = req.body;
      const slug = providedSlug || generateSlug(name);

      // Check for existing slug
      const existing = await prisma.organization.findUnique({ where: { slug } });
      if (existing) {
        return res.status(400).json({ error: `Organization with slug '${slug}' already exists` });
      }

      const org = await prisma.organization.create({
        data: { name, slug, description },
      });

      res.status(201).json(org);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create organization' });
    }
  },
);

// Get organization by slug
organizationsRouter.get('/organizations/by-slug/:slug', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: req.params.slug },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(org);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

// Get organization by ID
organizationsRouter.get('/organizations/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(org);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

// Update organization
organizationsRouter.put(
  '/organizations/:id',
  validate({ params: uuidParam, body: updateOrganizationBody }),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.id },
      });

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const updated = await prisma.organization.update({
        where: { id: req.params.id },
        data: req.body,
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update organization' });
    }
  },
);

// Delete organization
organizationsRouter.delete(
  '/organizations/:id',
  validate({ params: uuidParam }),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.id },
      });

      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      await prisma.organization.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete organization' });
    }
  },
);
