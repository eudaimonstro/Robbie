import { Request, Response, NextFunction } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { ZodError } from 'zod';
import { ApiError } from './apiError.js';
import { logger } from './logger.js';

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as unknown as Record<string, unknown>).id as string | undefined;

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.issues.map((e) => ({
          path: e.path.map(String).join('.'),
          message: e.message,
        })),
        requestId,
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn({ err, requestId }, 'Prisma known request error');
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          error: { code: 'CONFLICT', message: 'Resource already exists', requestId },
        });
      case 'P2025':
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Resource not found', requestId },
        });
      default:
        return res.status(400).json({
          error: { code: 'DATABASE_ERROR', message: 'Database operation failed', requestId },
        });
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn({ err, requestId }, 'Prisma validation error');
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid data format', requestId },
    });
  }

  // A client's mistake reported by a library, such as body-parser's malformed JSON (400) or
  // body over the limit (413): expose says its message is safe to show
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  if (typeof status === 'number' && status >= 400 && status < 500 && expose === true) {
    logger.warn({ err, requestId }, 'Client error');
    return res.status(status).json({
      error: {
        code: CLIENT_ERROR_CODES[status] ?? 'CLIENT_ERROR',
        message: err.message,
        requestId,
      },
    });
  }

  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  });
}
