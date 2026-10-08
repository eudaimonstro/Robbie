/**
 * Attachment Routes
 *
 * File upload, download, and Bylawyer document linking
 */

import { Router, type Request, type RequestHandler, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { validate, type RouteParams } from '../../middleware/validate.js';
import {
  NOT_BOTH_PARENTS,
  linkDocumentBody,
  updateAttachmentBody,
  reorderAttachmentsBody,
} from '../../schemas/attachments.js';
import { meetingCode, uuidParam } from '../../schemas/common.js';
import { storeFile, deleteFile, getFullPath, validateFile } from '../services/fileStorage.js';
import { orgStorageLimitMb, orgStorageUsed, storageFullMessage } from '../services/storageQuota.js';
import fs from 'fs';
import { logger } from '../../middleware/logger.js';
import { fromParam, requireRole, type OrgResolver } from '../../orgs/requireRole.js';
import { orgOfAgendaItem, orgOfAttachment, orgOfPacket } from '../../orgs/resolvers.js';

export const attachmentsRouter: RouterType = Router();

const byAttachment = fromParam('id', orgOfAttachment);

// An attachment goes on a packet or, without one, an agenda item: the handlers check them in
// the same order, so the rule checks the resource that is written to. A request naming both is
// refused before the rule (see NOT_BOTH_PARENTS); should one get here, it resolves to nothing.
function packetOrAgendaItem(read: (req: Request<RouteParams>) => unknown): OrgResolver {
  return async (req) => {
    const input = read(req) as { packetId?: unknown; agendaItemId?: unknown } | undefined;
    if (input?.packetId && input.agendaItemId) {
      return null;
    }
    if (typeof input?.packetId === 'string' && input.packetId) {
      return orgOfPacket(input.packetId);
    }
    if (typeof input?.agendaItemId === 'string' && input.agendaItemId) {
      return orgOfAgendaItem(input.agendaItemId);
    }
    return null;
  };
}

// The upload has no schema (its body is the raw file), so its query is checked for naming both
// here, before the rule
const notBothParentsInQuery: RequestHandler<RouteParams> = (req, res, next) => {
  if (req.query.packetId && req.query.agendaItemId) {
    res.status(400).json({ error: NOT_BOTH_PARENTS });
    return;
  }
  next();
};

// A reorder is checked through its first attachment; the handler checks the rest
const byFirstAttachment: OrgResolver = async (req) => {
  const first = (req.body as { attachmentIds?: unknown[] } | undefined)?.attachmentIds?.[0];
  return typeof first === 'string' ? orgOfAttachment(first) : null;
};

// We'll use raw body parsing for file uploads
// The main app should configure express.raw() for /api/attachments/upload

/**
 * POST /api/attachments/upload
 * Upload a file attachment
 * Headers: Content-Type (file mime type), X-Filename, X-Robbie-Code
 * Query: packetId OR agendaItemId (one required)
 * Body: Raw file buffer
 */
attachmentsRouter.post(
  '/attachments/upload',
  notBothParentsInQuery,
  requireRole(
    'secretary',
    packetOrAgendaItem((req) => req.query),
  ),
  async (req, res) => {
    try {
      const filename = req.headers['x-filename'] as string;
      const robbieCode = req.headers['x-robbie-code'] as string;
      const mimeType = req.headers['content-type'] || 'application/octet-stream';
      // An empty parameter counts as absent (the rule and the checks below read it so too)
      const packetId = (req.query.packetId as string | undefined) || undefined;
      const agendaItemId = (req.query.agendaItemId as string | undefined) || undefined;
      const { displayName, description } = req.query;

      if (!filename) {
        return res.status(400).json({ error: 'X-Filename header required' });
      }

      if (!robbieCode) {
        return res.status(400).json({ error: 'X-Robbie-Code header required' });
      }

      if (!packetId && !agendaItemId) {
        return res
          .status(400)
          .json({ error: 'Either packetId or agendaItemId query param required' });
      }

      // Validate the file
      const buffer = req.body as Buffer;
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ error: 'No file data received' });
      }

      const validation = validateFile(mimeType, buffer.length);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Verify packet or agenda item exists, and take the meeting code from it: the file is
      // stored under that code, so a header can't choose where it goes
      let packetCode: string;
      if (packetId) {
        const packet = await prisma.meetingPacket.findUnique({
          where: { id: packetId },
        });
        if (!packet) {
          return res.status(404).json({ error: 'Packet not found' });
        }
        packetCode = packet.robbieCode;
      } else {
        const agendaItem = await prisma.meetingAgendaItem.findUnique({
          where: { id: agendaItemId },
          include: { packet: { select: { robbieCode: true } } },
        });
        if (!agendaItem) {
          return res.status(404).json({ error: 'Agenda item not found' });
        }
        packetCode = agendaItem.packet.robbieCode;
      }
      // Codes are stored in upper case; one the header gives in any case matches
      const headerCode = meetingCode.safeParse(robbieCode);
      if (!headerCode.success || headerCode.data !== packetCode) {
        return res.status(400).json({ error: 'X-Robbie-Code does not match the meeting' });
      }

      // The organization's storage limit. A cheap check first, so a full organization's upload
      // writes nothing; then again, with the row created, under a lock on the organization, so
      // two uploads at once can't both take the last of it.
      const organizationId = req.org!.id;
      const limitMb = orgStorageLimitMb();
      const limitBytes = limitMb * 1024 * 1024;
      if ((await orgStorageUsed(prisma, organizationId)) + buffer.length > limitBytes) {
        return res.status(413).json({ error: storageFullMessage(limitMb) });
      }

      // Store the file
      const result = await storeFile(packetCode, filename, mimeType, buffer);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      let attachment;
      try {
        attachment = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
          const used = await orgStorageUsed(tx, organizationId);
          if (used + result.file.sizeBytes > limitBytes) return null;

          // Next position: after the highest one, not at the count (after a delete, the count
          // is a position already taken)
          const { _max } = await tx.attachment.aggregate({
            where: packetId ? { meetingPacketId: packetId } : { agendaItemId },
            _max: { position: true },
          });
          const nextPosition = (_max.position ?? -1) + 1;

          return tx.attachment.create({
            data: {
              type: 'uploaded_file',
              filename: result.file.filename,
              mimeType: result.file.mimeType,
              sizeBytes: result.file.sizeBytes,
              storagePath: result.file.storagePath,
              displayName: (displayName as string) || result.file.filename,
              description: description as string | undefined,
              position: nextPosition,
              meetingPacketId: packetId,
              agendaItemId,
              // Who uploaded it, for a report about the file (src/abuse/reportHandling.ts)
              uploadedBy: req.user!.email,
            },
          });
        });
      } catch (error) {
        // No record, so no file: one left behind would count toward nothing and never be removed
        await deleteFile(result.file.storagePath).catch((err) =>
          logger.error({ err, storagePath: result.file.storagePath }, 'Failed to remove a file'),
        );
        throw error;
      }
      if (!attachment) {
        await deleteFile(result.file.storagePath);
        return res.status(413).json({ error: storageFullMessage(limitMb) });
      }

      res.status(201).json(attachment);
    } catch (error) {
      logger.error({ err: error }, 'Error uploading file');
      res.status(500).json({ error: 'Failed to upload file' });
    }
  },
);

/**
 * POST /api/attachments/link-document
 * Link a Bylawyer document as an attachment
 * Body: { documentId, versionId?, packetId?, agendaItemId?, displayName?, description? }
 */
attachmentsRouter.post(
  '/attachments/link-document',
  validate({ body: linkDocumentBody }),
  requireRole(
    'secretary',
    packetOrAgendaItem((req) => req.body),
  ),
  async (req, res) => {
    try {
      const { documentId, versionId, packetId, agendaItemId, displayName, description } = req.body;

      if (!documentId) {
        return res.status(400).json({ error: 'documentId required' });
      }

      if (!packetId && !agendaItemId) {
        return res.status(400).json({ error: 'Either packetId or agendaItemId required' });
      }

      // The document must be in the packet's organization; another organization's is not found
      const document = await prisma.document.findFirst({
        where: { id: documentId, organizationId: req.org!.id },
        select: { id: true, title: true, docType: true },
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      // Verify version if specified
      if (versionId) {
        const version = await prisma.version.findFirst({
          where: { id: versionId, documentId },
        });
        if (!version) {
          return res.status(404).json({ error: 'Version not found' });
        }
      }

      // Verify packet or agenda item
      if (packetId) {
        const packet = await prisma.meetingPacket.findUnique({
          where: { id: packetId },
        });
        if (!packet) {
          return res.status(404).json({ error: 'Packet not found' });
        }
      } else {
        const agendaItem = await prisma.meetingAgendaItem.findUnique({
          where: { id: agendaItemId },
        });
        if (!agendaItem) {
          return res.status(404).json({ error: 'Agenda item not found' });
        }
      }

      // Next position: after the highest one, not at the count (after a delete, the count is
      // a position already taken)
      const { _max } = await prisma.attachment.aggregate({
        where: packetId ? { meetingPacketId: packetId } : { agendaItemId },
        _max: { position: true },
      });
      const nextPosition = (_max.position ?? -1) + 1;

      // Create attachment record
      const attachment = await prisma.attachment.create({
        data: {
          type: 'bylawyer_document',
          documentId,
          versionId: versionId || undefined,
          displayName: displayName || document.title,
          description,
          position: nextPosition,
          meetingPacketId: packetId || undefined,
          agendaItemId: agendaItemId || undefined,
        },
        include: {
          document: {
            select: { id: true, title: true, docType: true },
          },
        },
      });

      res.status(201).json(attachment);
    } catch (error) {
      logger.error({ err: error }, 'Error linking document');
      res.status(500).json({ error: 'Failed to link document' });
    }
  },
);

/**
 * GET /api/attachments/:id
 * Get attachment metadata
 */
attachmentsRouter.get(
  '/attachments/:id',
  validate({ params: uuidParam }),
  requireRole('viewer', byAttachment),
  async (req, res) => {
    try {
      const { id } = req.params;

      const attachment = await prisma.attachment.findUnique({
        where: { id },
        include: {
          document: {
            select: { id: true, title: true, docType: true },
          },
        },
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      res.json(attachment);
    } catch (error) {
      logger.error({ err: error }, 'Error getting attachment');
      res.status(500).json({ error: 'Failed to get attachment' });
    }
  },
);

/**
 * GET /api/attachments/:id/download
 * Download uploaded file
 */
attachmentsRouter.get(
  '/attachments/:id/download',
  validate({ params: uuidParam }),
  requireRole('viewer', byAttachment),
  async (req, res) => {
    try {
      const { id } = req.params;

      const attachment = await prisma.attachment.findUnique({
        where: { id },
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      if (attachment.type !== 'uploaded_file' || !attachment.storagePath) {
        return res.status(400).json({
          error: 'Not a downloadable file attachment',
        });
      }

      const fullPath = getFullPath(attachment.storagePath);

      // Check file exists
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }

      // Set headers
      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${attachment.filename || 'download'}"`,
      );
      res.setHeader('Content-Length', attachment.sizeBytes || 0);

      // Stream file
      const readStream = fs.createReadStream(fullPath);
      readStream.pipe(res);
    } catch (error) {
      logger.error({ err: error }, 'Error downloading file');
      res.status(500).json({ error: 'Failed to download file' });
    }
  },
);

/**
 * PUT /api/attachments/reorder
 * Reorder attachments within a packet or agenda item
 * Body: { attachmentIds: string[] } (in desired order)
 */
attachmentsRouter.put(
  '/attachments/reorder',
  validate({ body: reorderAttachmentsBody }),
  requireRole('secretary', byFirstAttachment),
  async (req, res) => {
    try {
      const { attachmentIds } = req.body;

      if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
        return res.status(400).json({ error: 'attachmentIds array required' });
      }

      // Every attachment must share one parent: the first one's packet or agenda item, which
      // the rule checked
      const attachments = await prisma.attachment.findMany({
        where: { id: { in: attachmentIds } },
        select: { meetingPacketId: true, agendaItemId: true },
      });
      const parents = new Set(
        attachments.map((a) => `${a.meetingPacketId ?? ''}/${a.agendaItemId ?? ''}`),
      );
      if (attachments.length !== new Set(attachmentIds).size || parents.size !== 1) {
        return res
          .status(400)
          .json({ error: 'Every attachment must be in the same packet or agenda item' });
      }

      // Update positions
      const updates = attachmentIds.map((id, index) =>
        prisma.attachment.update({
          where: { id },
          data: { position: index },
        }),
      );

      await prisma.$transaction(updates);

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'Error reordering attachments');
      // An ID that matches no item is a 404 (the error handler maps it); anything else, 500
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return res.status(404).json({ error: 'Item not found' });
      }
      res.status(500).json({ error: 'Failed to reorder attachments' });
    }
  },
);

/**
 * PUT /api/attachments/:id
 * Update attachment metadata
 * Body: { displayName?, description?, position? }
 */
attachmentsRouter.put(
  '/attachments/:id',
  validate({ params: uuidParam, body: updateAttachmentBody }),
  requireRole('secretary', byAttachment),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { displayName, description, position } = req.body;

      const attachment = await prisma.attachment.findUnique({
        where: { id },
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      const updated = await prisma.attachment.update({
        where: { id },
        data: {
          displayName,
          description,
          position,
        },
        include: {
          document: {
            select: { id: true, title: true, docType: true },
          },
        },
      });

      res.json(updated);
    } catch (error) {
      logger.error({ err: error }, 'Error updating attachment');
      res.status(500).json({ error: 'Failed to update attachment' });
    }
  },
);

/**
 * DELETE /api/attachments/:id
 * Delete attachment (and file if uploaded)
 */
attachmentsRouter.delete(
  '/attachments/:id',
  validate({ params: uuidParam }),
  requireRole('secretary', byAttachment),
  async (req, res) => {
    try {
      const { id } = req.params;

      const attachment = await prisma.attachment.findUnique({
        where: { id },
      });

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // Delete file from storage if uploaded
      if (attachment.type === 'uploaded_file' && attachment.storagePath) {
        await deleteFile(attachment.storagePath);
      }

      // Delete database record
      await prisma.attachment.delete({ where: { id } });

      res.status(204).send();
    } catch (error) {
      logger.error({ err: error }, 'Error deleting attachment');
      res.status(500).json({ error: 'Failed to delete attachment' });
    }
  },
);
