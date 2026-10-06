/**
 * Bylawyer Router for Robbie Integration
 *
 * Provides direct database access to Bylawyer data for Robbie.
 * Used for linking meetings to organizations and fetching document data.
 */

import { Router, type Router as RouterType, type RequestHandler } from 'express';
import { getStorage } from '../db/meetingStorage.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../middleware/logger.js';

export const bylawyerRouter: RouterType = Router();

/**
 * GET /api/bylawyer/organizations
 * List all organizations
 */
const listOrganizations: RequestHandler = async (_req, res) => {
  try {
    const organizations = await prisma.organization.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(organizations);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching organizations');
    res.status(500).json({
      error: 'Failed to fetch organizations',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

bylawyerRouter.get('/organizations', listOrganizations);

/**
 * GET /api/bylawyer/organizations/:orgId
 * Get a specific organization
 */
const getOrganization: RequestHandler = async (req, res) => {
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
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

bylawyerRouter.get('/organizations/:orgId', getOrganization);

/**
 * GET /api/bylawyer/organizations/:orgId/documents
 * Get documents for an organization
 */
const getOrganizationDocuments: RequestHandler = async (req, res) => {
  try {
    const { orgId } = req.params;

    // Verify organization exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const documents = await prisma.document.findMany({
      where: { organizationId: orgId },
      orderBy: { title: 'asc' },
    });

    res.json(documents);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching documents');
    res.status(500).json({
      error: 'Failed to fetch documents',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

bylawyerRouter.get('/organizations/:orgId/documents', getOrganizationDocuments);

/**
 * POST /api/bylawyer/link-meeting
 * Link a Robbie meeting to a Bylawyer organization
 * Body: { meetingCode: string, organizationId: string }
 */
const linkMeeting: RequestHandler = async (req, res) => {
  try {
    const { meetingCode, organizationId } = req.body;

    if (!meetingCode || !organizationId) {
      return res.status(400).json({
        error: 'Missing required fields: meetingCode and organizationId',
      });
    }

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found in Bylawyer' });
    }

    // Link the meeting to the organization
    const storage = getStorage();
    const success = await storage.linkToBylawyerOrg(meetingCode, organizationId);

    if (!success) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

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
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

bylawyerRouter.post('/link-meeting', linkMeeting);

/**
 * DELETE /api/bylawyer/link-meeting/:meetingCode
 * Unlink a Robbie meeting from its Bylawyer organization
 */
const unlinkMeeting: RequestHandler = async (req, res) => {
  try {
    const { meetingCode } = req.params;

    const storage = getStorage();
    const success = await storage.unlinkFromBylawyerOrg(meetingCode);

    if (!success) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ success: true, meetingCode });
  } catch (error) {
    logger.error({ err: error }, 'Error unlinking meeting from organization');
    res.status(500).json({
      error: 'Failed to unlink meeting from organization',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

bylawyerRouter.delete('/link-meeting/:meetingCode', unlinkMeeting);

/**
 * GET /api/bylawyer/meeting/:meetingCode/organization
 * Get the linked Bylawyer organization for a meeting
 */
const getMeetingOrganization: RequestHandler = async (req, res) => {
  try {
    const { meetingCode } = req.params;

    const storage = getStorage();
    const orgId = await storage.getBylawyerOrgId(meetingCode);

    if (!orgId) {
      return res.json({ linked: false, organization: null });
    }

    // Fetch organization details
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!organization) {
      return res.json({
        linked: true,
        organizationId: orgId,
        organization: null,
        warning: 'Organization not found in Bylawyer',
      });
    }

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
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

bylawyerRouter.get('/meeting/:meetingCode/organization', getMeetingOrganization);

/**
 * GET /api/bylawyer/documents/:docId/sections
 * Get sections for a document's latest version
 */
const getDocumentSections: RequestHandler = async (req, res) => {
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
          version_id: s.versionId,
          parent_id: s.parentId,
          position: s.position,
          number_label: s.numberLabel,
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
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

bylawyerRouter.get('/documents/:docId/sections', getDocumentSections);
