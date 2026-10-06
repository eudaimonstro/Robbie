/**
 * File Storage Service
 *
 * Handles local file storage for meeting packet attachments.
 * Files are stored in ./uploads/{robbieCode}/{uuid}-{sanitizedFilename}
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../middleware/logger.js';

// Configurable upload directory (defaults to ./uploads relative to project root)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/rtf',
  'application/rtf',
]);

// Max file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// File extensions for MIME types
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'text/rtf': '.rtf',
  'application/rtf': '.rtf',
};

export interface StoredFile {
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export type UploadResult =
  | { success: true; file: StoredFile }
  | { success: false; error: string };

/**
 * Sanitize a filename for safe storage
 */
function sanitizeFilename(filename: string): string {
  // Remove path components and dangerous characters
  const basename = path.basename(filename);
  // Allow alphanumeric, dash, underscore, and dot
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

/**
 * Ensure the upload directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Initialize the upload directory
 */
export async function initializeStorage(): Promise<void> {
  await ensureDir(UPLOAD_DIR);
  logger.info({ uploadDir: UPLOAD_DIR }, 'File storage initialized');
}

/**
 * Validate file before upload
 */
export function validateFile(
  mimeType: string,
  sizeBytes: number
): { valid: true } | { valid: false; error: string } {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    const allowed = Array.from(ALLOWED_MIME_TYPES).join(', ');
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${allowed}`,
    };
  }

  if (sizeBytes > MAX_FILE_SIZE) {
    const maxMB = MAX_FILE_SIZE / (1024 * 1024);
    return {
      valid: false,
      error: `File too large. Maximum size: ${maxMB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Store a file from a buffer
 */
export async function storeFile(
  robbieCode: string,
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<UploadResult> {
  // Validate
  const validation = validateFile(mimeType, buffer.length);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Create meeting-specific directory
  const meetingDir = path.join(UPLOAD_DIR, robbieCode);
  await ensureDir(meetingDir);

  // Generate unique filename
  const uuid = randomUUID();
  const safeFilename = sanitizeFilename(filename);
  const ext = MIME_TO_EXT[mimeType] || path.extname(safeFilename) || '';
  const storedFilename = `${uuid}${ext}`;
  const storagePath = path.join(robbieCode, storedFilename);
  const fullPath = path.join(UPLOAD_DIR, storagePath);

  // Write file
  await fs.writeFile(fullPath, buffer);

  return {
    success: true,
    file: {
      storagePath,
      filename: safeFilename,
      mimeType,
      sizeBytes: buffer.length,
    },
  };
}

/**
 * Read a stored file
 */
export async function readFile(storagePath: string): Promise<Buffer | null> {
  try {
    const fullPath = path.join(UPLOAD_DIR, storagePath);
    return await fs.readFile(fullPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a stored file
 */
export async function deleteFile(storagePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(UPLOAD_DIR, storagePath);
    await fs.unlink(fullPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true; // File already gone
    }
    throw error;
  }
}

/**
 * Get full path for a storage path (for streaming)
 */
export function getFullPath(storagePath: string): string {
  return path.join(UPLOAD_DIR, storagePath);
}

/**
 * Check if a file exists
 */
export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(UPLOAD_DIR, storagePath);
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up files for a meeting (when meeting is deleted)
 */
export async function cleanupMeetingFiles(robbieCode: string): Promise<void> {
  try {
    const meetingDir = path.join(UPLOAD_DIR, robbieCode);
    await fs.rm(meetingDir, { recursive: true, force: true });
  } catch (error) {
    logger.error({ err: error, robbieCode }, 'Failed to clean up files for meeting');
  }
}
