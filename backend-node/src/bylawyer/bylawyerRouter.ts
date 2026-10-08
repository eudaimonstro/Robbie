/**
 * Bylawyer Router for Robbie Integration
 *
 * Organizations, documents and section trees for the live meeting screens, and linking a live
 * meeting to an organization. A meeting's packet records its organization; linking creates it.
 */

import { Router, type Router as RouterType, type RequestHandler } from 'express';
import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { logger } from '../middleware/logger.js';
import { validate, type RouteParams } from '../middleware/validate.js';
import { docIdParam, orgIdParam } from '../schemas/common.js';
import { linkMeetingBody, meetingCodeParam } from '../schemas/bylawyer.js';
import { userOrganizations } from '../orgs/organizationService.js';
import { fromBody, fromParam, requireRole, signedInOnly } from '../orgs/requireRole.js';
import { orgOfDocument, orgOfOrganization, orgOfPacketCode } from '../orgs/resolvers.js';
import { CODE_IN_USE } from './routes/packets.js';

export const bylawyerRouter: RouterType = Router();

const byOrganization = fromParam('orgId', orgOfOrganization);
const byMeetingCode = fromParam('meetingCode', orgOfPacketCode);

/**
 * GET /api/bylawyer/organizations
 * The signed-in user's organizations, each with the user's role
 */
const listOrganizations: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { organizations } = await userOrganizations(req.user!.id);
    res.json(organizations);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching organizations');
    res.status(500).json({
      error: 'Failed to fetch organizations',
    });
  }
};

bylawyerRouter.get('/organizations', signedInOnly(), listOrganizations);

/**
 * GET /api/bylawyer/organizations/:orgId
 * Get a specific organization
 */
const getOrganization: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { orgId } = req.params;
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(organization);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching organization');
    res.status(500).json({
      error: 'Failed to fetch organization',
    });
  }
};

bylawyerRouter.get(
  '/organizations/:orgId',
  validate({ params: orgIdParam }),
  requireRole('viewer', byOrganization),
  getOrganization,
);

/**
 * GET /api/bylawyer/organizations/:orgId/documents
 * Get documents for an organization
 */
const getOrganizationDocuments: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      where: { organizationId: req.params.orgId },
      // Only an admin sees a share token, through the share routes
      omit: { shareToken: true },
      orderBy: { title: 'asc' },
    });

    res.json(documents);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching documents');
    res.status(500).json({
      error: 'Failed to fetch documents',
    });
  }
};

bylawyerRouter.get(
  '/organizations/:orgId/documents',
  validate({ params: orgIdParam }),
  requireRole('viewer', byOrganization),
  getOrganizationDocuments,
);

/**
 * POST /api/bylawyer/link-meeting
 * Link a live meeting to an organization by giving its code a packet there. Linking a code
 * that is already the organization's succeeds; another organization's code is 409.
 * Body: { meetingCode: string, organizationId: string }
 */
const linkMeeting: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { meetingCode } = req.body as { meetingCode: string };
    const organizationId = req.org!.id;

    const find = () =>
      prisma.meetingPacket.findUnique({
        where: { robbieCode: meetingCode },
        select: { organizationId: true },
      });
    let packet = await find();
    if (!packet) {
      try {
        packet = await prisma.meetingPacket.create({
          data: { robbieCode: meetingCode, organizationId },
          select: { organizationId: true },
        });
      } catch (error) {
        // Two links at once: the one that loses reads the packet the other made
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
        packet = await find();
      }
    }

    if (packet?.organizationId !== organizationId) {
      return res.status(409).json({ error: CODE_IN_USE });
    }

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    res.json({
      success: true,
      meetingCode,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error linking meeting to organization');
    res.status(500).json({
      error: 'Failed to link meeting to organization',
    });
  }
};

bylawyerRouter.post(
  '/link-meeting',
  validate({ body: linkMeetingBody }),
  requireRole('secretary', fromBody('organizationId', orgOfOrganization)),
  linkMeeting,
);

/** The answer when a meeting called to order is unlinked: its minutes go with its packet */
export const MEETING_STAYS_LINKED = 'A meeting that has been called to order stays linked';

/**
 * DELETE /api/bylawyer/link-meeting/:meetingCode
 * Unlink a live meeting by deleting its packet, which must have no agenda or attachments, and
 * must not have been called to order (its minutes would go with it)
 */
const unlinkMeeting: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { meetingCode } = req.params;
    const organizationId = req.org!.id;

    // One statement, so an item added or a call to order meanwhile can't be deleted with the
    // packet. It names the organization too: the code may have been unlinked and linked
    // elsewhere since the rule.
    const deleted = await prisma.meetingPacket.deleteMany({
      where: {
        robbieCode: meetingCode,
        organizationId,
        startedAt: null,
        agendaItems: { none: {} },
        attachments: { none: {} },
      },
    });
    if (deleted.count === 0) {
      const packet = await prisma.meetingPacket.findFirst({
        where: { robbieCode: meetingCode, organizationId },
        select: { startedAt: true },
      });
      if (!packet) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (packet.startedAt) {
        return res.status(409).json({ error: MEETING_STAYS_LINKED });
      }
      return res.status(409).json({ error: 'Remove the agenda and attachments first' });
    }

    res.json({ success: true, meetingCode });
  } catch (error) {
    logger.error({ err: error }, 'Error unlinking meeting from organization');
    res.status(500).json({
      error: 'Failed to unlink meeting from organization',
    });
  }
};

bylawyerRouter.delete(
  '/link-meeting/:meetingCode',
  validate({ params: meetingCodeParam }),
  requireRole('secretary', byMeetingCode),
  unlinkMeeting,
);

/**
 * GET /api/bylawyer/meeting/:meetingCode/organization
 * The organization a live meeting is linked to, through its packet. An unlinked code is 404.
 */
const getMeetingOrganization: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.org!.id },
    });

    res.json({
      linked: true,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        description: organization.description,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting meeting organization');
    res.status(500).json({
      error: 'Failed to get meeting organization',
    });
  }
};

bylawyerRouter.get(
  '/meeting/:meetingCode/organization',
  validate({ params: meetingCodeParam }),
  requireRole('viewer', byMeetingCode),
  getMeetingOrganization,
);

/**
 * GET /api/bylawyer/documents/:docId/sections
 * Get sections for a document's latest version
 */
const getDocumentSections: RequestHandler<RouteParams> = async (req, res) => {
  try {
    const { docId } = req.params;

    // Get the document with current version
    const document = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!document.currentVersionId) {
      return res.json([]); // No versions yet
    }

    // Fetch sections for the current version
    const sections = await prisma.section.findMany({
      where: { versionId: document.currentVersionId },
      orderBy: { position: 'asc' },
    });

    // Build section tree
    const buildTree = (parentId: string | null = null): any[] => {
      return sections
        .filter((s) => s.parentId === parentId)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.id,
          versionId: s.versionId,
          parentId: s.parentId,
          position: s.position,
          numberLabel: s.numberLabel,
          title: s.title,
          content: s.content,
          annotation: s.annotation,
          children: buildTree(s.id),
        }));
    };

    res.json(buildTree());
  } catch (error) {
    logger.error({ err: error }, 'Error fetching document sections');
    res.status(500).json({
      error: 'Failed to fetch sections',
    });
  }
};

bylawyerRouter.get(
  '/documents/:docId/sections',
  validate({ params: docIdParam }),
  requireRole('viewer', fromParam('docId', orgOfDocument)),
  getDocumentSections,
);
