/**
 * Meeting Packet Routes
 *
 * CRUD operations for meeting packets (agenda + attachments)
 */

import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { createPacketBody, robbieCodeParam, updatePacketBody } from '../../schemas/packets.js';
import { orgIdParam, uuidParam } from '../../schemas/common.js';
import { logger } from '../../middleware/logger.js';
import { deleteFiles } from '../services/fileStorage.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfOrganization, orgOfPacket, orgOfPacketCode } from '../../orgs/resolvers.js';

export const packetsRouter: RouterType = Router();

/** The answer when a meeting code already has a packet, in any organization */
export const CODE_IN_USE = 'That meeting code is already in use';

const byPacket = fromParam('id', orgOfPacket);

// What a packet response includes
const packetInclude = {
  attachments: {
    orderBy: { position: 'asc' as const },
    include: { document: { select: { id: true, title: true, docType: true } } },
  },
  agendaItems: {
    orderBy: { position: 'asc' as const },
    include: {
      attachments: {
        orderBy: { position: 'asc' as const },
        include: { document: { select: { id: true, title: true, docType: true } } },
      },
    },
  },
};

/**
 * GET /api/packets/:robbieCode
 * Get the packet for a Robbie meeting. Packets are created in an organization
 * (POST /api/organizations/:orgId/packets) or by linking a live meeting
 * (POST /api/bylawyer/link-meeting), never by reading.
 */
packetsRouter.get(
  '/packets/:robbieCode',
  validate({ params: robbieCodeParam }),
  requireRole('viewer', fromParam('robbieCode', orgOfPacketCode)),
  async (req, res) => {
    try {
      const packet = await prisma.meetingPacket.findFirst({
        where: { robbieCode: req.params.robbieCode, organizationId: req.org!.id },
        include: packetInclude,
      });

      if (!packet) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.json(packet);
    } catch (error) {
      logger.error({ err: error }, 'Error getting packet');
      res.status(500).json({ error: 'Failed to get meeting packet' });
    }
  },
);

/**
 * POST /api/organizations/:orgId/packets
 * Create the packet for a meeting code in an organization. Codes are unique across all
 * organizations.
 * Body: { robbieCode, title?, description?, scheduledFor? }
 */
packetsRouter.post(
  '/organizations/:orgId/packets',
  validate({ params: orgIdParam, body: createPacketBody }),
  requireRole('secretary', fromParam('orgId', orgOfOrganization)),
  async (req, res) => {
    try {
      const { robbieCode, title, description, scheduledFor } = req.body;

      const packet = await prisma.meetingPacket.create({
        data: {
          organizationId: req.org!.id,
          robbieCode,
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        },
        include: packetInclude,
      });

      res.status(201).json(packet);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.status(409).json({ error: CODE_IN_USE });
      }
      logger.error({ err: error }, 'Error creating packet');
      res.status(500).json({ error: 'Failed to create meeting packet' });
    }
  },
);

/**
 * PUT /api/packets/:id
 * Update packet metadata
 * Body: { title?, description?, scheduledFor? }
 */
packetsRouter.put(
  '/packets/:id',
  validate({ params: uuidParam, body: updatePacketBody }),
  requireRole('secretary', byPacket),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, scheduledFor } = req.body;

      const packet = await prisma.meetingPacket.findUnique({
        where: { id },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }

      const updated = await prisma.meetingPacket.update({
        where: { id },
        data: {
          title,
          description,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        },
        include: {
          attachments: {
            orderBy: { position: 'asc' },
          },
          agendaItems: {
            orderBy: { position: 'asc' },
            include: { attachments: { orderBy: { position: 'asc' } } },
          },
        },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating packet');
      res.status(500).json({ error: 'Failed to update meeting packet' });
    }
  },
);

/**
 * DELETE /api/packets/:id
 * Delete packet and all its contents
 */
packetsRouter.delete(
  '/packets/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byPacket),
  async (req, res) => {
    try {
      const { id } = req.params;

      const packet = await prisma.meetingPacket.findUnique({
        where: { id },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }

      // The uploaded files of the packet and its agenda items, which the cascade leaves on disk
      const uploads = await prisma.attachment.findMany({
        where: {
          type: 'uploaded_file',
          OR: [{ meetingPacketId: id }, { agendaItem: { packetId: id } }],
        },
        select: { storagePath: true },
      });

      // Cascade delete will handle attachments and agenda items
      await prisma.meetingPacket.delete({ where: { id } });

      await deleteFiles(uploads.map((upload) => upload.storagePath));

      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Error deleting packet');
      res.status(500).json({ error: 'Failed to delete meeting packet' });
    }
  },
);

/**
 * GET /api/packets/:id/summary
 * Get a summary of packet contents (counts, titles)
 */
packetsRouter.get(
  '/packets/:id/summary',
  validate({ params: uuidParam }),
  requireRole('viewer', byPacket),
  async (req, res) => {
    try {
      const { id } = req.params;

      const packet = await prisma.meetingPacket.findUnique({
        where: { id },
        include: {
          attachments: {
            select: { id: true, displayName: true, type: true },
          },
          agendaItems: {
            select: {
              id: true,
              title: true,
              position: true,
              _count: { select: { attachments: true } },
            },
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }

      res.json({
        id: packet.id,
        robbieCode: packet.robbieCode,
        title: packet.title,
        scheduledFor: packet.scheduledFor,
        meetingAttachmentCount: packet.attachments.length,
        agendaItemCount: packet.agendaItems.length,
        agendaItems: packet.agendaItems.map((item) => ({
          id: item.id,
          title: item.title,
          position: item.position,
          attachmentCount: item._count.attachments,
        })),
      });
    } catch (error) {
      logger.error({ err: error }, 'Error getting packet summary');
      res.status(500).json({ error: 'Failed to get packet summary' });
    }
  },
);
