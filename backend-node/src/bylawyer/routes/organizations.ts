import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';

export const organizationsRouter: RouterType = Router();

// Generate URL-friendly slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// List all organizations
organizationsRouter.get('/organizations', async (req, res) => {
  try {
    const activeOnly = req.query.active_only !== 'false';

    const organizations = await prisma.organization.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' }
    });

    res.json(organizations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

// Create organization
organizationsRouter.post('/organizations', async (req, res) => {
  try {
    const { name, slug: providedSlug, description } = req.body;
    const slug = providedSlug || generateSlug(name);

    // Check for existing slug
    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      return res.status(400).json({ error: `Organization with slug '${slug}' already exists` });
    }

    const org = await prisma.organization.create({
      data: { name, slug, description }
    });

    res.status(201).json(org);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Get organization by slug
organizationsRouter.get('/organizations/by-slug/:slug', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: req.params.slug }
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
organizationsRouter.get('/organizations/:id', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id }
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
organizationsRouter.put('/organizations/:id', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id }
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const updated = await prisma.organization.update({
      where: { id: req.params.id },
      data: req.body
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// Delete organization
organizationsRouter.delete('/organizations/:id', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id }
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    await prisma.organization.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});
