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
import { uuidParam } from '../../schemas/common.js';
import { logger } from '../../middleware/logger.js';

export const packetsRouter: RouterType = Router();

/**
 * GET /api/packets/:robbieCode
 * Get packet for a Robbie meeting (creates one if doesn't exist)
 */
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

packetsRouter.get(
  '/packets/:robbieCode',
  validate({ params: robbieCodeParam }),
  async (req, res) => {
    try {
      const { robbieCode } = req.params;

      let packet = await prisma.meetingPacket.findUnique({
        where: { robbieCode },
        include: packetInclude,
      });

      if (!packet) {
        // Auto-create packet for this meeting. Two first loads at once can both try; the one
        // that loses gets the packet the other made, not an error.
        try {
          packet = await prisma.meetingPacket.create({
            data: { robbieCode },
            include: packetInclude,
          });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
            throw error;
          }
          packet = await prisma.meetingPacket.findUnique({
            where: { robbieCode },
            include: packetInclude,
          });
        }
      }

      res.json(packet);
    } catch (error) {
      logger.error({ err: error }, 'Error getting packet');
      res.status(500).json({ error: 'Failed to get meeting packet' });
    }
  },
);

/**
 * POST /api/packets
 * Create a new meeting packet
 * Body: { robbieCode, title?, description?, scheduledFor? }
 */
packetsRouter.post('/packets', validate({ body: createPacketBody }), async (req, res) => {
  try {
    const { robbieCode, title, description, scheduledFor } = req.body;

    if (!robbieCode) {
      return res.status(400).json({ error: 'robbieCode is required' });
    }

    // Check if packet already exists
    const existing = await prisma.meetingPacket.findUnique({
      where: { robbieCode },
    });

    if (existing) {
      return res.status(409).json({
        error: 'Packet already exists for this meeting',
        packetId: existing.id,
      });
    }

    const packet = await prisma.meetingPacket.create({
      data: {
        robbieCode,
        title,
        description,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      },
      include: {
        attachments: true,
        agendaItems: {
          include: { attachments: true },
        },
      },
    });

    res.status(201).json(packet);
  } catch (error) {
    logger.error({ err: error }, 'Error creating packet');
    res.status(500).json({ error: 'Failed to create meeting packet' });
  }
});

/**
 * PUT /api/packets/:id
 * Update packet metadata
 * Body: { title?, description?, scheduledFor? }
 */
packetsRouter.put(
  '/packets/:id',
  validate({ params: uuidParam, body: updatePacketBody }),
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
packetsRouter.delete('/packets/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const { id } = req.params;

    const packet = await prisma.meetingPacket.findUnique({
      where: { id },
    });

    if (!packet) {
      return res.status(404).json({ error: 'Packet not found' });
    }

    // Cascade delete will handle attachments and agenda items
    await prisma.meetingPacket.delete({ where: { id } });

    // TODO: Clean up uploaded files from storage

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Error deleting packet');
    res.status(500).json({ error: 'Failed to delete meeting packet' });
  }
});

/**
 * GET /api/packets/:id/summary
 * Get a summary of packet contents (counts, titles)
 */
packetsRouter.get('/packets/:id/summary', validate({ params: uuidParam }), async (req, res) => {
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
});
