import type { RequestHandler } from 'express';
import { ZodSchema, ZodError } from 'zod';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Route params for routes without wildcards. Express 5's default ParamsDictionary allows
 * string[] values (from wildcard routes), which none of these routes use.
 */
export type RouteParams = Record<string, string>;

export function validate(schemas: ValidationSchemas): RequestHandler<RouteParams> {
  return (req, res, next) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as RouteParams;
      }
      if (schemas.query) {
        // req.query is a read-only getter in Express 5; shadow it with the parsed value
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query) as typeof req.query,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      if (schemas.body) {
        // Express 5 leaves req.body undefined when the request has no body
        req.body = schemas.body.parse(req.body ?? {});
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.issues.map((e) => ({
              path: e.path.map(String).join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(error);
    }
  };
}
