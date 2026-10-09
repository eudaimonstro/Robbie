/**
 * Bylawyer Router for the live meeting screens
 *
 * The organization of a meeting code (its packet's), an organization's documents, and a
 * document's current sections: what a bylaw amendment motion is made from.
 */

import { Router, type Router as RouterType, type RequestHandler } from 'express';
import { prisma } from '../db/prisma.js';
import { logger } from '../middleware/logger.js';
import { validate, type RouteParams } from '../middleware/validate.js';
import { docIdParam, orgIdParam } from '../schemas/common.js';
import { meetingCodeParam } from '../schemas/bylawyer.js';
import { fromParam, requireRole } from '../orgs/requireRole.js';
import { orgOfDocument, orgOfOrganization, orgOfPacketCode } from '../orgs/resolvers.js';
import { buildSectionTree } from './services/sectionTree.js';

export const bylawyerRouter: RouterType = Router();

const byOrganization = fromParam('orgId', orgOfOrganization);
const byMeetingCode = fromParam('meetingCode', orgOfPacketCode);

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

    res.json(buildSectionTree(sections));
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
