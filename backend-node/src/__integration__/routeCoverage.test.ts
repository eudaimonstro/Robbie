import { describe, it, expect } from 'vitest';
import express from 'express';
import { app } from '../app.js';
import { authRouter } from '../auth/authRoutes.js';
import { bylawyerRouter } from '../bylawyer/bylawyerRouter.js';
import * as routes from '../bylawyer/routes/index.js';
import { accessRuleOf, requireRole } from '../orgs/requireRole.js';

/** The parts of Express's router layers this test reads (router 2.x) */
interface Route {
  path: string;
  methods: Record<string, boolean>;
  stack: Array<{ handle: unknown }>;
}
interface Layer {
  route?: Route;
  handle: unknown;
}

// Mounted under /api, but public: sign-in, and read-only share links
const PUBLIC_ROUTERS = new Set<unknown>([authRouter, routes.publicRouter]);
// App-level routes under /api that are public
const PUBLIC_ROUTES = new Set(['/api/health']);

// Routers whose routes don't have rules yet. Each task that adds a router's rules removes it
// here; Task 13 removes the list.
const NOT_YET_RULED = new Set<unknown>([
  routes.sectionsRouter,
  routes.amendmentsRouter,
  routes.meetingsRouter,
  routes.packetsRouter,
  routes.agendaItemsRouter,
  routes.attachmentsRouter,
  routes.robbieRouter,
  bylawyerRouter,
]);

/** A mounted router's layers, or null if the handle isn't a router */
function stackOf(handle: unknown): Layer[] | null {
  const stack = (handle as { stack?: unknown } | null)?.stack;
  return typeof handle === 'function' && Array.isArray(stack) ? (stack as Layer[]) : null;
}

const name = (route: Route) =>
  `${Object.keys(route.methods).join(',').toUpperCase()} ${route.path}`;

/** Whether a rule runs before the route's final handler */
const hasRule = (route: Route) =>
  route.stack.slice(0, -1).some((layer) => accessRuleOf(layer.handle) !== null);

/**
 * The routes without a rule. At the top level (the app's own stack) only routes under /api
 * count: the web app's catch-all is not an API route.
 */
function unruled(stack: Layer[], top: boolean): string[] {
  const missing: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const { path } = layer.route;
      const counts = !top || (path.startsWith('/api') && !PUBLIC_ROUTES.has(path));
      if (counts && !hasRule(layer.route)) missing.push(name(layer.route));
      continue;
    }
    const inner = stackOf(layer.handle);
    if (inner && !PUBLIC_ROUTERS.has(layer.handle) && !NOT_YET_RULED.has(layer.handle)) {
      missing.push(...unruled(inner, false));
    }
  }
  return missing;
}

const appStack = (app as unknown as { router: { stack: Layer[] } }).router.stack;

describe('route rules', () => {
  it('gives every /api route a rule, apart from sign-in, share links and health', () => {
    expect(unruled(appStack, true)).toEqual([]);
  });

  it('finds the mounted routers', () => {
    // Guards against a walk that silently finds nothing
    expect(appStack.filter((layer) => stackOf(layer.handle)).length).toBeGreaterThanOrEqual(13);
  });

  it('reports a route without a rule', () => {
    const router = express.Router();
    router.get(
      '/ruled',
      requireRole('viewer', async () => null),
      (_req, res) => {
        res.end();
      },
    );
    router.get('/open', (_req, res) => {
      res.end();
    });
    const sample = express();
    sample.use('/api', router);
    sample.get('/api/also-open', (_req, res) => {
      res.end();
    });
    sample.get('/{*splat}', (_req, res) => {
      res.end();
    });
    const stack = (sample as unknown as { router: { stack: Layer[] } }).router.stack;
    expect(unruled(stack, true)).toEqual(['GET /open', 'GET /api/also-open']);
  });

  it('keeps the public share router to share links', () => {
    const paths = (stackOf(routes.publicRouter) ?? []).map((layer) => layer.route?.path);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path).toMatch(/^\/share\//);
  });
});
