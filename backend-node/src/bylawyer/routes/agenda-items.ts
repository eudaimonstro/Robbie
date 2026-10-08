/**
 * Agenda Item Routes
 *
 * CRUD operations for pre-meeting agenda items
 */

import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import {
  createAgendaItemBody,
  updateAgendaItemBody,
  reorderAgendaItemsBody,
  bulkCreateAgendaItemsBody,
} from '../../schemas/agenda-items.js';
import { uuidParam } from '../../schemas/common.js';
import { logger } from '../../middleware/logger.js';
import { deleteFiles } from '../services/fileStorage.js';
import { fromBody, fromParam, requireRole, type OrgResolver } from '../../orgs/requireRole.js';
import { orgOfAgendaItem, orgOfPacket } from '../../orgs/resolvers.js';

export const agendaItemsRouter: RouterType = Router();

const byPacket = fromParam('packetId', orgOfPacket);
const byItem = fromParam('id', orgOfAgendaItem);

// A reorder is checked through its first item; the handler checks the rest share its packet
const byFirstItem: OrgResolver = async (req) => {
  const first = (req.body as { itemIds?: unknown[] } | undefined)?.itemIds?.[0];
  return typeof first === 'string' ? orgOfAgendaItem(first) : null;
};

/**
 * GET /api/packets/:packetId/agenda
 * List agenda items for a packet
 */
agendaItemsRouter.get(
  '/packets/:packetId/agenda',
  validate({ params: z.object({ packetId: z.string().uuid() }) }),
  requireRole('viewer', byPacket),
  async (req, res) => {
    try {
      const { packetId } = req.params;

      const packet = await prisma.meetingPacket.findUnique({
        where: { id: packetId },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }

      const items = await prisma.meetingAgendaItem.findMany({
        where: { packetId },
        orderBy: { position: 'asc' },
        include: {
          attachments: {
            orderBy: { position: 'asc' },
            include: {
              document: {
                select: { id: true, title: true, docType: true },
              },
            },
          },
        },
      });

      res.json(items);
    } catch (error) {
      logger.error({ err: error }, 'Error listing agenda items');
      res.status(500).json({ error: 'Failed to list agenda items' });
    }
  },
);

/**
 * POST /api/packets/:packetId/agenda
 * Create agenda item
 * Body: { title, description?, estimatedMinutes?, presenter? }
 */
agendaItemsRouter.post(
  '/packets/:packetId/agenda',
  validate({ params: z.object({ packetId: z.string().uuid() }), body: createAgendaItemBody }),
  requireRole('secretary', byPacket),
  async (req, res) => {
    try {
      const { packetId } = req.params;
      const { title, description, estimatedMinutes, presenter } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'title is required' });
      }

      const packet = await prisma.meetingPacket.findUnique({
        where: { id: packetId },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }

      // Next position: after the highest one, not at the count (after a delete, the count is
      // a position already taken)
      const { _max } = await prisma.meetingAgendaItem.aggregate({
        where: { packetId },
        _max: { position: true },
      });
      const nextPosition = (_max.position ?? -1) + 1;

      const item = await prisma.meetingAgendaItem.create({
        data: {
          packetId,
          title,
          description,
          estimatedMinutes,
          presenter,
          position: nextPosition,
        },
        include: {
          attachments: true,
        },
      });

      res.status(201).json(item);
    } catch (error) {
      logger.error({ err: error }, 'Error creating agenda item');
      res.status(500).json({ error: 'Failed to create agenda item' });
    }
  },
);

/**
 * GET /api/agenda-items/:id
 * Get a single agenda item
 */
agendaItemsRouter.get(
  '/agenda-items/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byItem),
  async (req, res) => {
    try {
      const { id } = req.params;

      const item = await prisma.meetingAgendaItem.findUnique({
        where: { id },
        include: {
          attachments: {
            orderBy: { position: 'asc' },
            include: {
              document: {
                select: { id: true, title: true, docType: true },
              },
            },
          },
        },
      });

      if (!item) {
        return res.status(404).json({ error: 'Agenda item not found' });
      }

      res.json(item);
    } catch (error) {
      logger.error({ err: error }, 'Error getting agenda item');
      res.status(500).json({ error: 'Failed to get agenda item' });
    }
  },
);

/**
 * PUT /api/agenda-items/reorder
 * Reorder agenda items within a packet
 * Body: { itemIds: string[] } (in desired order)
 */
agendaItemsRouter.put(
  '/agenda-items/reorder',
  validate({ body: reorderAgendaItemsBody }),
  requireRole('secretary', byFirstItem),
  async (req, res) => {
    try {
      const { itemIds } = req.body;

      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'itemIds array required' });
      }

      // Every item must be in one packet: the first item's, which the rule checked
      const items = await prisma.meetingAgendaItem.findMany({
        where: { id: { in: itemIds } },
        select: { packetId: true },
      });
      const packets = new Set(items.map((item) => item.packetId));
      if (items.length !== new Set(itemIds).size || packets.size !== 1) {
        return res.status(400).json({ error: 'Every item must be in the same packet' });
      }

      // Update positions
      const updates = itemIds.map((id, index) =>
        prisma.meetingAgendaItem.update({
          where: { id },
          data: { position: index },
        }),
      );

      await prisma.$transaction(updates);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error reordering agenda items');
      // An ID that matches no item is a 404 (the error handler maps it); anything else, 500
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return res.status(404).json({ error: 'Item not found' });
      }
      res.status(500).json({ error: 'Failed to reorder agenda items' });
    }
  },
);

/**
 * PUT /api/agenda-items/:id
 * Update agenda item
 * Body: { title?, description?, estimatedMinutes?, presenter?, position? }
 */
agendaItemsRouter.put(
  '/agenda-items/:id',
  validate({ params: uuidParam, body: updateAgendaItemBody }),
  requireRole('secretary', byItem),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, estimatedMinutes, presenter, position } = req.body;

      const item = await prisma.meetingAgendaItem.findUnique({
        where: { id },
      });

      if (!item) {
        return res.status(404).json({ error: 'Agenda item not found' });
      }

      const updated = await prisma.meetingAgendaItem.update({
        where: { id },
        data: {
          title,
          description,
          estimatedMinutes,
          presenter,
          position,
        },
        include: {
          attachments: {
            orderBy: { position: 'asc' },
            include: {
              document: {
                select: { id: true, title: true, docType: true },
              },
            },
          },
        },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating agenda item');
      res.status(500).json({ error: 'Failed to update agenda item' });
    }
  },
);

/**
 * DELETE /api/agenda-items/:id
 * Delete agenda item. The cascade takes its attachments' rows; their uploaded files are deleted
 * here, as the packet delete does (otherwise they stay on disk with nothing pointing at them).
 */
agendaItemsRouter.delete(
  '/agenda-items/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byItem),
  async (req, res) => {
    try {
      const { id } = req.params;

      const item = await prisma.meetingAgendaItem.findUnique({
        where: { id },
      });

      if (!item) {
        return res.status(404).json({ error: 'Agenda item not found' });
      }

      // The uploaded files, read first: the cascade takes their rows
      const uploads = await prisma.attachment.findMany({
        where: { agendaItemId: id, type: 'uploaded_file' },
        select: { storagePath: true },
      });
      await prisma.meetingAgendaItem.delete({ where: { id } });
      await deleteFiles(uploads.map((upload) => upload.storagePath));

      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Error deleting agenda item');
      res.status(500).json({ error: 'Failed to delete agenda item' });
    }
  },
);

/**
 * POST /api/agenda-items/bulk
 * Create multiple agenda items at once (for importing)
 * Body: { packetId, items: Array<{ title, description?, estimatedMinutes?, presenter? }> }
 */
agendaItemsRouter.post(
  '/agenda-items/bulk',
  validate({ body: bulkCreateAgendaItemsBody }),
  requireRole('secretary', fromBody('packetId', orgOfPacket)),
  async (req, res) => {
    try {
      const { packetId, items } = req.body;

      if (!packetId) {
        return res.status(400).json({ error: 'packetId required' });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array required' });
      }

      const packet = await prisma.meetingPacket.findUnique({
        where: { id: packetId },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }

      // Next position: after the highest one, not at the count (after a delete, the count is
      // a position already taken)
      const { _max } = await prisma.meetingAgendaItem.aggregate({
        where: { packetId },
        _max: { position: true },
      });
      const nextPosition = (_max.position ?? -1) + 1;

      // Create all items
      const created = await prisma.$transaction(
        items.map((item, index) =>
          prisma.meetingAgendaItem.create({
            data: {
              packetId,
              title: item.title,
              description: item.description,
              estimatedMinutes: item.estimatedMinutes,
              presenter: item.presenter,
              position: nextPosition + index,
            },
          }),
        ),
      );

      res.status(201).json(created);
    } catch (error) {
      logger.error({ err: error }, 'Error bulk creating agenda items');
      res.status(500).json({ error: 'Failed to create agenda items' });
    }
  },
);
