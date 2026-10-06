/**
 * Attachment Routes
 *
 * File upload, download, and Bylawyer document linking
 */

import { Router, type Router as RouterType } from 'express';
import { prisma } from '../../db/prisma.js';
import { validate } from '../../middleware/validate.js';
import { linkDocumentBody, updateAttachmentBody, reorderAttachmentsBody } from '../../schemas/attachments.js';
import { uuidParam } from '../../schemas/common.js';
import {
  storeFile,
  readFile,
  deleteFile,
  getFullPath,
  validateFile
} from '../services/fileStorage.js';
import fs from 'fs';
import path from 'path';
import { logger } from '../../middleware/logger.js';

export const attachmentsRouter: RouterType = Router();

// We'll use raw body parsing for file uploads
// The main app should configure express.raw() for /api/attachments/upload

/**
 * POST /api/attachments/upload
 * Upload a file attachment
 * Headers: Content-Type (file mime type), X-Filename, X-Robbie-Code
 * Query: packetId OR agendaItemId (one required)
 * Body: Raw file buffer
 */
attachmentsRouter.post('/attachments/upload', async (req, res) => {
  try {
    const filename = req.headers['x-filename'] as string;
    const robbieCode = req.headers['x-robbie-code'] as string;
    const mimeType = req.headers['content-type'] || 'application/octet-stream';
    const { packetId, agendaItemId, displayName, description } = req.query;

    if (!filename) {
      return res.status(400).json({ error: 'X-Filename header required' });
    }

    if (!robbieCode) {
      return res.status(400).json({ error: 'X-Robbie-Code header required' });
    }

    if (!packetId && !agendaItemId) {
      return res.status(400).json({ error: 'Either packetId or agendaItemId query param required' });
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

    // Verify packet or agenda item exists
    if (packetId) {
      const packet = await prisma.meetingPacket.findUnique({
        where: { id: packetId as string }
      });
      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }
    } else {
      const agendaItem = await prisma.meetingAgendaItem.findUnique({
        where: { id: agendaItemId as string }
      });
      if (!agendaItem) {
        return res.status(404).json({ error: 'Agenda item not found' });
      }
    }

    // Store the file
    const result = await storeFile(robbieCode, filename, mimeType, buffer);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Get next position
    const existingCount = await prisma.attachment.count({
      where: packetId
        ? { meetingPacketId: packetId as string }
        : { agendaItemId: agendaItemId as string }
    });

    // Create attachment record
    const attachment = await prisma.attachment.create({
      data: {
        type: 'uploaded_file',
        filename: result.file.filename,
        mimeType: result.file.mimeType,
        sizeBytes: result.file.sizeBytes,
        storagePath: result.file.storagePath,
        displayName: (displayName as string) || result.file.filename,
        description: description as string | undefined,
        position: existingCount,
        meetingPacketId: packetId as string | undefined,
        agendaItemId: agendaItemId as string | undefined
      }
    });

    res.status(201).json(attachment);
  } catch (error) {
    logger.error({ err: error }, 'Error uploading file');
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * POST /api/attachments/link-document
 * Link a Bylawyer document as an attachment
 * Body: { documentId, versionId?, packetId?, agendaItemId?, displayName?, description? }
 */
attachmentsRouter.post('/attachments/link-document', validate({ body: linkDocumentBody }), async (req, res) => {
  try {
    const { documentId, versionId, packetId, agendaItemId, displayName, description } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: 'documentId required' });
    }

    if (!packetId && !agendaItemId) {
      return res.status(400).json({ error: 'Either packetId or agendaItemId required' });
    }

    // Verify document exists
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, docType: true }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Verify version if specified
    if (versionId) {
      const version = await prisma.version.findFirst({
        where: { id: versionId, documentId }
      });
      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }
    }

    // Verify packet or agenda item
    if (packetId) {
      const packet = await prisma.meetingPacket.findUnique({
        where: { id: packetId }
      });
      if (!packet) {
        return res.status(404).json({ error: 'Packet not found' });
      }
    } else {
      const agendaItem = await prisma.meetingAgendaItem.findUnique({
        where: { id: agendaItemId }
      });
      if (!agendaItem) {
        return res.status(404).json({ error: 'Agenda item not found' });
      }
    }

    // Get next position
    const existingCount = await prisma.attachment.count({
      where: packetId ? { meetingPacketId: packetId } : { agendaItemId }
    });

    // Create attachment record
    const attachment = await prisma.attachment.create({
      data: {
        type: 'bylawyer_document',
        documentId,
        versionId: versionId || undefined,
        displayName: displayName || document.title,
        description,
        position: existingCount,
        meetingPacketId: packetId || undefined,
        agendaItemId: agendaItemId || undefined
      },
      include: {
        document: {
          select: { id: true, title: true, docType: true }
        }
      }
    });

    res.status(201).json(attachment);
  } catch (error) {
    logger.error({ err: error }, 'Error linking document');
    res.status(500).json({ error: 'Failed to link document' });
  }
});

/**
 * GET /api/attachments/:id
 * Get attachment metadata
 */
attachmentsRouter.get('/attachments/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const { id } = req.params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: {
        document: {
          select: { id: true, title: true, docType: true }
        }
      }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.json(attachment);
  } catch (error) {
    logger.error({ err: error }, 'Error getting attachment');
    res.status(500).json({ error: 'Failed to get attachment' });
  }
});

/**
 * GET /api/attachments/:id/download
 * Download uploaded file
 */
attachmentsRouter.get('/attachments/:id/download', validate({ params: uuidParam }), async (req, res) => {
  try {
    const { id } = req.params;

    const attachment = await prisma.attachment.findUnique({
      where: { id }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (attachment.type !== 'uploaded_file' || !attachment.storagePath) {
      return res.status(400).json({
        error: 'Not a downloadable file attachment'
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
      `attachment; filename="${attachment.filename || 'download'}"`
    );
    res.setHeader('Content-Length', attachment.sizeBytes || 0);

    // Stream file
    const readStream = fs.createReadStream(fullPath);
    readStream.pipe(res);
  } catch (error) {
    logger.error({ err: error }, 'Error downloading file');
    res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * PUT /api/attachments/:id
 * Update attachment metadata
 * Body: { displayName?, description?, position? }
 */
attachmentsRouter.put('/attachments/:id', validate({ params: uuidParam, body: updateAttachmentBody }), async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, description, position } = req.body;

    const attachment = await prisma.attachment.findUnique({
      where: { id }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const updated = await prisma.attachment.update({
      where: { id },
      data: {
        displayName,
        description,
        position
      },
      include: {
        document: {
          select: { id: true, title: true, docType: true }
        }
      }
    });

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Error updating attachment');
    res.status(500).json({ error: 'Failed to update attachment' });
  }
});

/**
 * DELETE /api/attachments/:id
 * Delete attachment (and file if uploaded)
 */
attachmentsRouter.delete('/attachments/:id', validate({ params: uuidParam }), async (req, res) => {
  try {
    const { id } = req.params;

    const attachment = await prisma.attachment.findUnique({
      where: { id }
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
});

/**
 * PUT /api/attachments/reorder
 * Reorder attachments within a packet or agenda item
 * Body: { attachmentIds: string[] } (in desired order)
 */
attachmentsRouter.put('/attachments/reorder', validate({ body: reorderAttachmentsBody }), async (req, res) => {
  try {
    const { attachmentIds } = req.body;

    if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
      return res.status(400).json({ error: 'attachmentIds array required' });
    }

    // Update positions
    const updates = attachmentIds.map((id, index) =>
      prisma.attachment.update({
        where: { id },
        data: { position: index }
      })
    );

    await prisma.$transaction(updates);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error reordering attachments');
    res.status(500).json({ error: 'Failed to reorder attachments' });
  }
});
