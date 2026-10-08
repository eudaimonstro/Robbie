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
import { ApiError } from '../../middleware/apiError.js';
import { meetingCodeLimiter } from '../../middleware/userLimits.js';
import { randomMeetingCode } from '../services/meetingCodes.js';
import { deleteFiles } from '../services/fileStorage.js';
import { fromParam, requireRole } from '../../orgs/requireRole.js';
import { orgOfOrganization, orgOfPacket, orgOfPacketCode } from '../../orgs/resolvers.js';
import { atLeast, roleNeeded } from '../../orgs/roles.js';
import { listMembers } from '../../orgs/membershipService.js';
import { getStorage } from '../../db/meetingStorage.js';
import { agendaFromPacket, findMeetingPacket } from '../../socket/meetingPacket.js';
import { syncLiveRoles } from '../../socket/meetingRoles.js';
import { closeCanceledMeeting } from '../../socket/meetingLifecycle.js';
import { getIoInstance } from '../../socket/ioInstance.js';
import { applyAction } from '../../socket/stateManager.js';
import { emitState } from '../../socket/statePublisher.js';
import { validateAction } from '../../socket/actionValidator.js';

export const packetsRouter: RouterType = Router();

/**
 * The answer when a meeting code already has a packet, in any organization. It doesn't say
 * whose: codes of other organizations aren't confirmed to anyone (and claiming codes is rate
 * limited), since a code lets a guest into a meeting.
 */
export const CODE_UNAVAILABLE = "That meeting code can't be used. Choose another.";

/** How many random codes a packet created without one tries before giving up */
const GENERATED_CODE_ATTEMPTS = 5;

const codeTaken = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** The answer when the presiding officer named isn't a voting member of the organization */
export const CHAIR_NOT_MEMBER =
  'The presiding officer must be a member of the organization with the member role or above';

/**
 * The answer when a meeting called to order is deleted: its record (the minutes, which go with
 * the packet) stays
 */
export const MEETING_HELD = "A meeting that has been called to order can't be canceled";

/** Whether a user may preside over the organization's meetings: member role or above */
async function canPreside(organizationId: string, userId: number): Promise<boolean> {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  return !!membership && atLeast(membership.role, 'member');
}

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
 * (POST /api/organizations/:orgId/packets), never by reading.
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
 * GET /api/organizations/:orgId/packets
 * The organization's scheduled meetings: those not yet adjourned first, soonest first (those
 * without a date after them), then the adjourned ones, most recent first
 */
packetsRouter.get(
  '/organizations/:orgId/packets',
  validate({ params: orgIdParam }),
  requireRole('viewer', fromParam('orgId', orgOfOrganization)),
  async (req, res) => {
    try {
      const organizationId = req.org!.id;
      const select = {
        id: true,
        robbieCode: true,
        title: true,
        description: true,
        location: true,
        scheduledFor: true,
        chairUserId: true,
        startedAt: true,
        endedAt: true,
        chair: { select: { name: true } },
      } as const;
      const [upcoming, past] = await Promise.all([
        prisma.meetingPacket.findMany({
          where: { organizationId, endedAt: null },
          select,
          orderBy: [{ scheduledFor: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        }),
        prisma.meetingPacket.findMany({
          where: { organizationId, endedAt: { not: null } },
          select,
          orderBy: { endedAt: 'desc' },
        }),
      ]);
      res.json([...upcoming, ...past]);
    } catch (error) {
      logger.error({ err: error }, 'Error listing packets');
      res.status(500).json({ error: 'Failed to list meeting packets' });
    }
  },
);

/**
 * POST /api/organizations/:orgId/packets
 * Schedule a meeting: create its packet in the organization, claiming its meeting code. Codes
 * are unique across all organizations; without one, a random code is generated. A code that is
 * taken is refused (409) without saying whose. The presiding officer defaults to the person
 * creating it. Limited per user (meetingCodeLimiter).
 * Body: { robbieCode?, title?, description?, location?, scheduledFor?, chairUserId? }
 */
packetsRouter.post(
  '/organizations/:orgId/packets',
  validate({ params: orgIdParam, body: createPacketBody }),
  requireRole('secretary', fromParam('orgId', orgOfOrganization)),
  meetingCodeLimiter,
  async (req, res) => {
    const { robbieCode, title, description, location, scheduledFor } = req.body;
    const chairUserId: number | null =
      req.body.chairUserId === undefined ? req.user!.id : req.body.chairUserId;
    if (chairUserId !== null && !(await canPreside(req.org!.id, chairUserId))) {
      throw ApiError.badRequest(CHAIR_NOT_MEMBER);
    }

    const create = (code: string) =>
      prisma.meetingPacket.create({
        data: {
          organizationId: req.org!.id,
          robbieCode: code,
          title,
          description,
          location,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
          chairUserId,
        },
        include: packetInclude,
      });

    for (let attempt = 1; ; attempt++) {
      try {
        const packet = await create(robbieCode ?? randomMeetingCode());
        return res.status(201).json(packet);
      } catch (error) {
        if (!codeTaken(error)) throw error;
        if (robbieCode || attempt >= GENERATED_CODE_ATTEMPTS) {
          throw ApiError.conflict(CODE_UNAVAILABLE);
        }
      }
    }
  },
);

/**
 * PUT /api/packets/:id
 * Update packet metadata
 * Body: { title?, description?, location?, scheduledFor?, chairUserId? } (null clears the description, the location or the date)
 */
packetsRouter.put(
  '/packets/:id',
  validate({ params: uuidParam, body: updatePacketBody }),
  requireRole('secretary', byPacket),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, location, scheduledFor, chairUserId } = req.body;

      const packet = await prisma.meetingPacket.findUnique({
        where: { id },
      });

      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }
      if (
        typeof chairUserId === 'number' &&
        !(await canPreside(packet.organizationId, chairUserId))
      ) {
        return res.status(400).json({ error: CHAIR_NOT_MEMBER });
      }

      const updated = await prisma.meetingPacket.update({
        where: { id },
        data: {
          title,
          description,
          location,
          scheduledFor:
            scheduledFor === null ? null : scheduledFor ? new Date(scheduledFor) : undefined,
          chairUserId,
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

      if (chairUserId !== undefined && chairUserId !== packet.chairUserId) {
        await syncLiveRoles(packet.robbieCode);
      }

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating packet');
      res.status(500).json({ error: 'Failed to update meeting packet' });
    }
  },
);

/**
 * DELETE /api/packets/:id
 * Delete packet and all its contents (canceling the meeting). A meeting already called to order
 * is refused (409): its minutes would go with it. A meeting already open is closed: the people
 * in it are told and sent out, and its live state is deleted.
 */
packetsRouter.delete(
  '/packets/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byPacket),
  async (req, res) => {
    try {
      const { id } = req.params;
      const organizationId = req.org!.id;

      // The uploaded files of the packet and its agenda items, which the cascade leaves on disk
      // (read first: the cascade takes their rows)
      const uploads = await prisma.attachment.findMany({
        where: {
          type: 'uploaded_file',
          OR: [{ meetingPacketId: id }, { agendaItem: { packetId: id } }],
        },
        select: { storagePath: true },
      });

      // The meeting code, whose live meeting (if it is open) closes with the packet
      const code = await prisma.meetingPacket.findFirst({
        where: { id, organizationId },
        select: { robbieCode: true },
      });

      // One statement, so a call to order meanwhile can't be deleted with the packet; the
      // cascade takes the agenda items and attachments. It names the rule's organization too.
      const deleted = await prisma.meetingPacket.deleteMany({
        where: { id, organizationId, startedAt: null },
      });
      if (deleted.count === 0) {
        const packet = await prisma.meetingPacket.findFirst({
          where: { id, organizationId },
          select: { startedAt: true },
        });
        if (!packet) {
          return res.status(404).json({ error: 'Packet not found' });
        }
        return res.status(409).json({ error: MEETING_HELD });
      }

      await deleteFiles(uploads.map((upload) => upload.storagePath));
      // A meeting already open (not yet called to order) closes with it
      if (code) await closeCanceledMeeting(code.robbieCode);

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

/**
 * GET /api/packets/:robbieCode/roster
 * The meeting's organization's members, for marking people present. Admins also get their
 * emails and the pending additions; everyone else gets names and roles only.
 */
packetsRouter.get(
  '/packets/:robbieCode/roster',
  validate({ params: robbieCodeParam }),
  requireRole('viewer', fromParam('robbieCode', orgOfPacketCode)),
  async (req, res) => {
    try {
      const admin = atLeast(req.org!.role, 'admin');
      const { members, invites = [] } = await listMembers(req.org!.id, admin);
      res.json({
        members: members.map((m) => ({
          userId: m.userId,
          name: m.name,
          ...(admin && { email: m.email }),
          orgRole: m.role,
        })),
        invites: admin ? invites.map((i) => ({ email: i.email, role: i.role })) : [],
      });
    } catch (error) {
      logger.error({ err: error }, 'Error getting roster');
      res.status(500).json({ error: 'Failed to get the roster' });
    }
  },
);

/**
 * POST /api/packets/:robbieCode/reload-agenda
 * Replace a live meeting's agenda with the packet's, before the meeting starts: for a
 * secretary or above, or the meeting's presiding officer. Without a live meeting yet there is
 * nothing to replace; the first person to join brings the packet's agenda.
 */
packetsRouter.post(
  '/packets/:robbieCode/reload-agenda',
  validate({ params: robbieCodeParam }),
  requireRole('member', fromParam('robbieCode', orgOfPacketCode)),
  async (req, res) => {
    try {
      const meetingCode = req.params.robbieCode;
      const packet = await findMeetingPacket(meetingCode);
      if (!packet || packet.organizationId !== req.org!.id) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (!atLeast(req.org!.role, 'secretary') && packet.chairUserId !== req.user!.id) {
        return res.status(403).json({ error: roleNeeded('secretary') });
      }

      const agenda = agendaFromPacket(packet.agendaItems);
      const meeting = await getStorage().getMeeting(meetingCode);
      if (!meeting) {
        return res.json({ live: false, agenda });
      }

      const result = await applyAction(
        meetingCode,
        { type: 'RELOAD_AGENDA', agenda, timestamp: new Date().toISOString() },
        validateAction,
      );
      // Refused once the meeting has started (see the validator)
      if (!result.success) {
        return res.status(409).json({ error: result.error });
      }
      const io = getIoInstance();
      if (io) {
        emitState(io, meetingCode, { state: result.state, stateVersion: result.stateVersion });
      }
      res.json({ live: true, agenda: result.state.agenda });
    } catch (error) {
      logger.error({ err: error }, 'Error reloading the agenda');
      res.status(500).json({ error: 'Failed to reload the agenda' });
    }
  },
);
