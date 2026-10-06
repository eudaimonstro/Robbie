import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import type { Section } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { uuidParam, versionIdParam } from '../../schemas/common.js';
import {
  createSectionBody,
  updateSectionBody,
  reorderSectionsBody,
} from '../../schemas/sections.js';
import { logger } from '../../middleware/logger.js';
import { findParentProblem } from '../sectionParent.js';

export const sectionsRouter: RouterType = Router();

const findSectionRef = (id: string) =>
  prisma.section.findUnique({
    where: { id },
    select: { id: true, versionId: true, parentId: true },
  });

// List sections for a version
sectionsRouter.get(
  '/versions/:versionId/sections',
  validate({ params: versionIdParam }),
  async (req, res) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.params.versionId },
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      const sections = await prisma.section.findMany({
        where: { versionId: req.params.versionId },
        orderBy: { position: 'asc' },
      });

      res.json(sections);
    } catch (error) {
      logger.error({ err: error }, 'Failed to list sections');
      res.status(500).json({ error: 'Failed to list sections' });
    }
  },
);

// Reorder sections
sectionsRouter.put(
  '/versions/:versionId/sections/reorder',
  validate({ params: versionIdParam, body: reorderSectionsBody }),
  async (req, res) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.params.versionId },
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      const data = req.body as Array<{ id: string; position: number }>;

      if (!data || data.length === 0) {
        return res.json({ status: 'ok', updated: 0 });
      }

      // Validate all sections exist and belong to this version
      const sectionIds = data.map((item) => item.id);
      const sections = await prisma.section.findMany({
        where: { id: { in: sectionIds } },
      });

      const sectionMap = new Map(sections.map((s) => [s.id, s]));

      for (const item of data) {
        const section = sectionMap.get(item.id);
        if (!section) {
          return res.status(404).json({ error: `Section ${item.id} not found` });
        }
        if (section.versionId !== req.params.versionId) {
          return res.status(400).json({
            error: `Section ${item.id} does not belong to version ${req.params.versionId}`,
          });
        }
      }

      // Validate all sections have same parent
      const parentIds = new Set(sections.map((s) => s.parentId));
      if (parentIds.size > 1) {
        return res
          .status(400)
          .json({ error: 'All sections must have the same parent (siblings only)' });
      }

      // Update positions
      for (const item of data) {
        await prisma.section.update({
          where: { id: item.id },
          data: { position: item.position },
        });
      }

      res.json({ status: 'ok', updated: data.length });
    } catch (error) {
      logger.error({ err: error }, 'Failed to reorder sections');
      res.status(500).json({ error: 'Failed to reorder sections' });
    }
  },
);

// Create section
sectionsRouter.post(
  '/versions/:versionId/sections',
  validate({ params: versionIdParam, body: createSectionBody }),
  async (req, res) => {
    try {
      const version = await prisma.version.findUnique({
        where: { id: req.params.versionId },
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      const parentId = req.body.parent_id || req.body.parentId || null;
      const parentProblem = await findParentProblem(
        { versionId: req.params.versionId, parentId },
        findSectionRef,
      );
      if (parentProblem) {
        return res.status(400).json({ error: parentProblem });
      }

      // Find max position among siblings
      const maxSection = await prisma.section.findFirst({
        where: {
          versionId: req.params.versionId,
          parentId,
        },
        orderBy: { position: 'desc' },
      });
      const position = (maxSection?.position ?? -1) + 1;

      const section = await prisma.section.create({
        data: {
          versionId: req.params.versionId,
          parentId,
          position,
          numberLabel: req.body.number_label || req.body.numberLabel,
          title: req.body.title,
          content: req.body.content,
          annotation: req.body.annotation,
        },
      });

      res.status(201).json(section);
    } catch (error) {
      logger.error({ err: error }, 'Failed to create section');
      res.status(500).json({ error: 'Failed to create section' });
    }
  },
);

// Get section by ID
sectionsRouter.get('/sections/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const section = await prisma.section.findUnique({
      where: { id: req.params.id },
    });

    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    res.json(section);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get section');
    res.status(500).json({ error: 'Failed to get section' });
  }
});

// Update section
sectionsRouter.put(
  '/sections/:id',
  validate({ params: uuidParam, body: updateSectionBody }),
  async (req, res) => {
    try {
      const section = await prisma.section.findUnique({
        where: { id: req.params.id },
      });

      if (!section) {
        return res.status(404).json({ error: 'Section not found' });
      }

      // A parent given as null moves the section to the root
      const parentId =
        req.body.parent_id !== undefined
          ? req.body.parent_id
          : req.body.parentId !== undefined
            ? req.body.parentId
            : section.parentId;
      if (parentId !== section.parentId) {
        const parentProblem = await findParentProblem(
          { versionId: section.versionId, sectionId: section.id, parentId },
          findSectionRef,
        );
        if (parentProblem) {
          return res.status(400).json({ error: parentProblem });
        }
      }

      // A field given as null is cleared; a field left out keeps its value
      const given = <T>(
        snake: T | null | undefined,
        camel: T | null | undefined,
        current: T | null,
      ) => (snake !== undefined ? snake : camel !== undefined ? camel : current);

      const updated = await prisma.section.update({
        where: { id: req.params.id },
        data: {
          parentId,
          position: req.body.position ?? section.position,
          numberLabel: given(req.body.number_label, req.body.numberLabel, section.numberLabel),
          title: given(req.body.title, undefined, section.title),
          content: given(req.body.content, undefined, section.content),
          annotation: given(req.body.annotation, undefined, section.annotation),
        },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Failed to update section');
      res.status(500).json({ error: 'Failed to update section' });
    }
  },
);

// Delete section
sectionsRouter.delete('/sections/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const section = await prisma.section.findUnique({
      where: { id: req.params.id },
    });

    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Delete cascade handles children
    await prisma.section.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete section');
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// Add child section
sectionsRouter.post(
  '/sections/:id/children',
  validate({ params: uuidParam, body: createSectionBody }),
  async (req, res) => {
    try {
      const parent = await prisma.section.findUnique({
        where: { id: req.params.id },
        include: { children: true },
      });

      if (!parent) {
        return res.status(404).json({ error: 'Section not found' });
      }

      const maxPosition =
        parent.children.length > 0 ? Math.max(...parent.children.map((c) => c.position)) : -1;

      const child = await prisma.section.create({
        data: {
          versionId: parent.versionId,
          parentId: parent.id,
          position: maxPosition + 1,
          numberLabel: req.body.number_label || req.body.numberLabel,
          title: req.body.title,
          content: req.body.content,
          annotation: req.body.annotation,
        },
      });

      res.status(201).json(child);
    } catch (error) {
      logger.error({ err: error }, 'Failed to add child section');
      res.status(500).json({ error: 'Failed to add child section' });
    }
  },
);

// Get section path
sectionsRouter.get('/sections/:id/path', validate({ params: uuidParam }), async (req, res) => {
  try {
    const path: Array<{ id: string; numberLabel: string | null; title: string | null }> = [];
    let currentId: string | null = req.params.id;
    // Stop at a cycle in the data rather than looping forever
    const seen = new Set<string>();

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const section: Section | null = await prisma.section.findUnique({
        where: { id: currentId },
      });

      if (!section) break;

      path.push({
        id: section.id,
        numberLabel: section.numberLabel,
        title: section.title,
      });

      currentId = section.parentId;
    }

    path.reverse();
    res.json({ path });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get section path');
    res.status(500).json({ error: 'Failed to get section path' });
  }
});
