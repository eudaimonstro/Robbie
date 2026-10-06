import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from './apiError.js';
import { logger } from './logger.js';

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

  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  });
}
