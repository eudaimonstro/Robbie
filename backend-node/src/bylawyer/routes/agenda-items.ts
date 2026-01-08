/**
 * Agenda Item Routes
 *
 * CRUD operations for pre-meeting agenda items
 */

import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';

export const agendaItemsRouter: RouterType = Router();

/**
 * GET /api/packets/:packetId/agenda
 * List agenda items for a packet
 */
agendaItemsRouter.get('/packets/:packetId/agenda', async (req, res) => {
  try {
    const { packetId } = req.params;

    const packet = await prisma.meetingPacket.findUnique({
      where: { id: packetId }
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
              select: { id: true, title: true, docType: true }
            }
          }
        }
      }
    });

    res.json(items);
  } catch (error) {
    console.error('Error listing agenda items:', error);
    res.status(500).json({ error: 'Failed to list agenda items' });
  }
});

/**
 * POST /api/packets/:packetId/agenda
 * Create agenda item
 * Body: { title, description?, estimatedMinutes?, presenter? }
 */
agendaItemsRouter.post('/packets/:packetId/agenda', async (req, res) => {
  try {
    const { packetId } = req.params;
    const { title, description, estimatedMinutes, presenter } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const packet = await prisma.meetingPacket.findUnique({
      where: { id: packetId }
    });

    if (!packet) {
      return res.status(404).json({ error: 'Packet not found' });
    }

    // Get next position
    const existingCount = await prisma.meetingAgendaItem.count({
      where: { packetId }
    });

    const item = await prisma.meetingAgendaItem.create({
      data: {
        packetId,
        title,
        description,
        estimatedMinutes,
        presenter,
        position: existingCount
      },
      include: {
        attachments: true
      }
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating agenda item:', error);
    res.status(500).json({ error: 'Failed to create agenda item' });
  }
});

/**
 * GET /api/agenda-items/:id
 * Get a single agenda item
 */
agendaItemsRouter.get('/agenda-items/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const item = await prisma.meetingAgendaItem.findUnique({
      where: { id },
      include: {
        attachments: {
          orderBy: { position: 'asc' },
          include: {
            document: {
              select: { id: true, title: true, docType: true }
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Agenda item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error getting agenda item:', error);
    res.status(500).json({ error: 'Failed to get agenda item' });
  }
});

/**
 * PUT /api/agenda-items/:id
 * Update agenda item
 * Body: { title?, description?, estimatedMinutes?, presenter?, position? }
 */
agendaItemsRouter.put('/agenda-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, estimatedMinutes, presenter, position } = req.body;

    const item = await prisma.meetingAgendaItem.findUnique({
      where: { id }
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
        position
      },
      include: {
        attachments: {
          orderBy: { position: 'asc' },
          include: {
            document: {
              select: { id: true, title: true, docType: true }
            }
          }
        }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating agenda item:', error);
    res.status(500).json({ error: 'Failed to update agenda item' });
  }
});

/**
 * DELETE /api/agenda-items/:id
 * Delete agenda item (cascades to attachments)
 */
agendaItemsRouter.delete('/agenda-items/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const item = await prisma.meetingAgendaItem.findUnique({
      where: { id }
    });

    if (!item) {
      return res.status(404).json({ error: 'Agenda item not found' });
    }

    // Cascade delete handles attachments
    await prisma.meetingAgendaItem.delete({ where: { id } });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting agenda item:', error);
    res.status(500).json({ error: 'Failed to delete agenda item' });
  }
});

/**
 * PUT /api/agenda-items/reorder
 * Reorder agenda items within a packet
 * Body: { itemIds: string[] } (in desired order)
 */
agendaItemsRouter.put('/agenda-items/reorder', async (req, res) => {
  try {
    const { itemIds } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds array required' });
    }

    // Update positions
    const updates = itemIds.map((id, index) =>
      prisma.meetingAgendaItem.update({
        where: { id },
        data: { position: index }
      })
    );

    await prisma.$transaction(updates);

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering agenda items:', error);
    res.status(500).json({ error: 'Failed to reorder agenda items' });
  }
});

/**
 * POST /api/agenda-items/bulk
 * Create multiple agenda items at once (for importing)
 * Body: { packetId, items: Array<{ title, description?, estimatedMinutes?, presenter? }> }
 */
agendaItemsRouter.post('/agenda-items/bulk', async (req, res) => {
  try {
    const { packetId, items } = req.body;

    if (!packetId) {
      return res.status(400).json({ error: 'packetId required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }

    const packet = await prisma.meetingPacket.findUnique({
      where: { id: packetId }
    });

    if (!packet) {
      return res.status(404).json({ error: 'Packet not found' });
    }

    // Get current count for positioning
    const existingCount = await prisma.meetingAgendaItem.count({
      where: { packetId }
    });

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
            position: existingCount + index
          }
        })
      )
    );

    res.status(201).json(created);
  } catch (error) {
    console.error('Error bulk creating agenda items:', error);
    res.status(500).json({ error: 'Failed to create agenda items' });
  }
});
