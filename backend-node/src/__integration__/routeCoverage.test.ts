import { describe, it, expect } from 'vitest';
import express from 'express';
import { app } from '../app.js';
import { authenticate } from '../auth/authenticate.js';
import { authRouter } from '../auth/authRoutes.js';
import { requireTerms } from '../auth/terms.js';
import { bylawyerRouter } from '../bylawyer/bylawyerRouter.js';
import * as routes from '../bylawyer/routes/index.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { httpLogger } from '../middleware/logger.js';
import { accessRuleOf, requireRole } from '../orgs/requireRole.js';

/** The parts of Express's router layers this test reads (router 2.x) */
interface Route {
  path: string;
  methods: Record<string, boolean>;
  // method is undefined for a layer added with all(), which runs for every method
  stack: Array<{ handle: unknown; method?: string }>;
}
interface Layer {
  route?: Route;
  handle: unknown;
  name: string;
}

// Mounted under /api, but public: sign-in, and read-only share links
const PUBLIC_ROUTERS = new Set<unknown>([authRouter, routes.publicRouter]);
// The app's own routes that need no rule: the health check, and the web app's catch-all
const TOP_LEVEL_ROUTES = new Set(['GET /api/health', 'GET /{*splat}']);

/**
 * The app's own middleware, in order: ours by identity, third-party ones by layer name. A new
 * one fails the test until it's added here deliberately.
 */
const APP_MIDDLEWARE: Array<string | ((...args: never[]) => unknown)> = [
  'helmetMiddleware',
  httpLogger,
  'corsMiddleware',
  'cookieParser',
  // The upload mount: session and terms before the 10 MB body is read
  authenticate,
  requireTerms,
  'rawParser',
  'jsonParser',
  // Everything under /api after the public routers
  authenticate,
  requireTerms,
  // The JSON 404 for unknown /api paths
  '<anonymous>',
  errorHandler,
  'serveStatic',
];

// Routers whose routes don't have rules yet. Each task that adds a router's rules removes it
// here; Task 13 removes the list.
const NOT_YET_RULED = new Set<unknown>([
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

/**
 * The methods of a route without a rule, named like "POST /path". Each method is checked on
 * its own, since one route can carry several (router.route('/x').get(...).post(...)): a rule
 * must run before the last handler that isn't a rule. Layers added with all() count for every
 * method, and on their own for the methods the route doesn't name.
 */
function unruledMethods(route: Route): string[] {
  const groups: Array<string | undefined> = Object.keys(route.methods).map((method) =>
    method === '_all' ? undefined : method,
  );
  return groups
    .filter((method) => {
      const layers = route.stack.filter((layer) => !layer.method || layer.method === method);
      const isRule = layers.map((layer) => accessRuleOf(layer.handle) !== null);
      const last = isRule.lastIndexOf(false);
      return last >= 0 && !isRule.slice(0, last).includes(true);
    })
    .map((method) => `${method?.toUpperCase() ?? 'ALL'} ${route.path}`);
}

/**
 * What a router lets through without a rule: its routes' unruled methods, and any middleware
 * that isn't a router (which could answer a request itself), as "USE name". Walks nested
 * routers, apart from the public ones and those not ruled yet.
 */
function unruled(stack: Layer[]): string[] {
  const missing: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      missing.push(...unruledMethods(layer.route));
      continue;
    }
    const inner = stackOf(layer.handle);
    if (!inner) missing.push(`USE ${layer.name}`);
    else if (!PUBLIC_ROUTERS.has(layer.handle) && !NOT_YET_RULED.has(layer.handle)) {
      missing.push(...unruled(inner));
    }
  }
  return missing;
}

/**
 * The same for the app's own stack: its routes need a rule unless listed in TOP_LEVEL_ROUTES
 * (compared exactly, since Express matches paths without regard to case), and its middleware
 * must match `middleware` in order.
 */
function unruledInApp(stack: Layer[], middleware = APP_MIDDLEWARE): string[] {
  const missing: string[] = [];
  let next = 0;
  for (const layer of stack) {
    if (layer.route) {
      missing.push(...unruledMethods(layer.route).filter((name) => !TOP_LEVEL_ROUTES.has(name)));
      continue;
    }
    const inner = stackOf(layer.handle);
    if (inner) {
      if (!PUBLIC_ROUTERS.has(layer.handle) && !NOT_YET_RULED.has(layer.handle)) {
        missing.push(...unruled(inner));
      }
      continue;
    }
    const expected = middleware[next];
    const matches =
      typeof expected === 'string' ? layer.name === expected : layer.handle === expected;
    if (matches) next++;
    else missing.push(`USE ${layer.name}`);
  }
  for (const expected of middleware.slice(next)) {
    missing.push(`missing ${typeof expected === 'string' ? expected : expected.name}`);
  }
  return missing;
}

const stackOfApp = (sample: express.Express) =>
  (sample as unknown as { router: { stack: Layer[] } }).router.stack;
const appStack = stackOfApp(app);

const rule = () => requireRole('viewer', async () => null);
const handler: express.RequestHandler = (_req, res) => {
  res.end();
};

describe('route rules', () => {
  it('gives every /api route a rule, apart from sign-in, share links and health', () => {
    expect(unruledInApp(appStack)).toEqual([]);
  });

  it('finds the mounted routers', () => {
    // Guards against a walk that silently finds nothing
    expect(appStack.filter((layer) => stackOf(layer.handle)).length).toBeGreaterThanOrEqual(13);
  });

  it('lists only routers that still have routes without a rule as not yet ruled', () => {
    for (const router of NOT_YET_RULED) {
      const routesWithoutRule = unruled(stackOf(router) ?? []).filter(
        (name) => !name.startsWith('USE '),
      );
      expect(routesWithoutRule.length).toBeGreaterThan(0);
    }
  });

  it('reports a route without a rule', () => {
    const router = express.Router();
    router.get('/ruled', rule(), handler);
    router.get('/open', handler);
    const sample = express();
    sample.use('/api', router);
    sample.get('/api/also-open', handler);
    sample.get('/{*splat}', handler);
    expect(unruledInApp(stackOfApp(sample), [])).toEqual(['GET /open', 'GET /api/also-open']);
  });

  it('reports each method of a route that has no rule', () => {
    const router = express.Router();
    router.route('/x').get(rule(), handler).post(handler);
    router.route('/y').all(handler).put(handler);
    // all() answers a GET here on its own, before the rule that only PUT runs
    router.route('/z').all(handler).put(rule(), handler);
    expect(unruled(router.stack as Layer[])).toEqual(['POST /x', 'ALL /y', 'PUT /y', 'ALL /z']);
  });

  it('reports middleware inside a router, however deeply nested', () => {
    const inner = express.Router();
    inner.use(function innerTerminal(_req, res) {
      res.end();
    });
    const router = express.Router();
    router.use('/x', function terminal(_req, res) {
      res.end();
    });
    router.use('/inner', inner);
    expect(unruled(router.stack as Layer[])).toEqual(['USE terminal', 'USE innerTerminal']);
  });

  it('reports app middleware that is not on the list, matching ours by identity', () => {
    const sample = express();
    sample.use(authenticate);
    sample.use('/api/x', function sneaky(_req, res) {
      res.end();
    });
    // Named like ours, but not ours
    sample.use(function requireTerms(_req, _res, next) {
      next();
    });
    expect(unruledInApp(stackOfApp(sample), [authenticate, requireTerms, errorHandler])).toEqual([
      'USE sneaky',
      'USE requireTerms',
      'missing requireTerms',
      'missing errorHandler',
    ]);
  });

  it('reports an app route whatever the case of its path', () => {
    const sample = express();
    sample.get('/API/x', handler);
    sample.get('/Api/Health', handler);
    expect(unruledInApp(stackOfApp(sample), [])).toEqual(['GET /API/x', 'GET /Api/Health']);
  });

  it('accepts a router whose routes all have rules', () => {
    const inner = express.Router();
    inner.delete('/z', rule(), handler);
    const router = express.Router();
    router.get('/a', rule(), handler);
    router.route('/x').get(rule(), handler).post(rule(), rule(), handler);
    router.route('/y').all(rule()).get(handler).patch(handler);
    router.use('/inner', inner);
    expect(unruled(router.stack as Layer[])).toEqual([]);
  });

  it('keeps the public share router to share links', () => {
    const paths = (stackOf(routes.publicRouter) ?? []).map((layer) => layer.route?.path);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path).toMatch(/^\/share\//);
  });
});
