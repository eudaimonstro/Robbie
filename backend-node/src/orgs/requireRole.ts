import type { Request, RequestHandler } from 'express';
import type { OrgRole } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../middleware/logger.js';
import type { RouteParams } from '../middleware/validate.js';
import { atLeast, roleNeeded } from './roles.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** The organization the route acts on, and the user's role in it, set by requireRole */
    org?: { id: string; role: OrgRole };
  }
}

/** Finds the organization a request acts on: its id, or null when the resource doesn't exist */
export type OrgResolver = (req: Request<RouteParams>) => Promise<string | null>;

/** The access rule a route handler enforces, read by the route coverage test */
export type AccessRule = { kind: 'role'; min: OrgRole } | { kind: 'signedIn' };

const ACCESS_RULE = Symbol('accessRule');

function withRule<T extends object>(handler: T, rule: AccessRule): T {
  Object.defineProperty(handler, ACCESS_RULE, { value: rule });
  return handler;
}

/** The rule a handler enforces, or null if it isn't a rule */
export function accessRuleOf(handler: unknown): AccessRule | null {
  if (typeof handler !== 'function') return null;
  return (handler as unknown as Record<symbol, AccessRule | undefined>)[ACCESS_RULE] ?? null;
}

/**
 * Require the signed-in user (see authenticate) to have at least `min` in the organization the
 * request acts on. Answers 404 when the resource doesn't exist or the user isn't a member, so
 * an organization's resources don't exist to outsiders, and 403 when the role is too low.
 * Otherwise sets req.org.
 */
export function requireRole(min: OrgRole, resolve: OrgResolver): RequestHandler<RouteParams> {
  const rule: RequestHandler<RouteParams> = async (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    try {
      const organizationId = await resolve(req);
      const membership = organizationId
        ? await prisma.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId, userId: req.user.id } },
            select: { role: true },
          })
        : null;
      if (!organizationId || !membership) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (!atLeast(membership.role, min)) {
        res.status(403).json({ error: roleNeeded(min) });
        return;
      }
      req.org = { id: organizationId, role: membership.role };
      next();
    } catch (error) {
      logger.error({ err: error }, 'Failed to check organization access');
      res.status(500).json({ error: 'Failed to check access' });
    }
  };
  return withRule(rule, { kind: 'role', min });
}

/**
 * The rule for a route that acts on the signed-in user's own organizations rather than on one
 * organization (listing them, creating one). It lets every signed-in user through.
 */
export function signedInOnly(): RequestHandler<RouteParams> {
  const rule: RequestHandler<RouteParams> = (_req, _res, next) => next();
  return withRule(rule, { kind: 'signedIn' });
}

type FindOrg = (key: string) => Promise<string | null>;

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** Resolve through a route parameter */
export function fromParam(name: string, find: FindOrg): OrgResolver {
  return async (req) => {
    const key = text(req.params[name]);
    return key ? find(key) : null;
  };
}

/** Resolve through a field of the (validated) body */
export function fromBody(name: string, find: FindOrg): OrgResolver {
  return async (req) => {
    const key = text((req.body as Record<string, unknown> | undefined)?.[name]);
    return key ? find(key) : null;
  };
}

/** Resolve through a query parameter */
export function fromQuery(name: string, find: FindOrg): OrgResolver {
  return async (req) => {
    const key = text(req.query[name]);
    return key ? find(key) : null;
  };
}
