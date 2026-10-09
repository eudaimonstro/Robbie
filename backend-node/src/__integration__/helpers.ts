import request from 'supertest';
import type { Request, Response, Router } from 'express';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';
import { app } from '../app.js';
import { prisma } from '../db/prisma.js';
import { createSession, type SessionUser } from '../auth/sessionService.js';

export interface TestUser {
  id: number;
  email: string;
  /** A Cookie header value for the user's web session */
  cookie: string;
}

/**
 * A signed-in user with a web session, made directly rather than through emailed codes. The
 * user has accepted the current terms unless acceptTerms is false.
 */
export async function signIn(
  email: string,
  options: { name?: string; acceptTerms?: boolean } = {},
): Promise<TestUser> {
  const accepted = options.acceptTerms ?? true;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: options.name ?? null,
      termsVersion: accepted ? TERMS_VERSION : null,
      termsAcceptedAt: accepted ? new Date() : null,
    },
  });
  const { token } = await createSession(user.id);
  return { id: user.id, email, cookie: `session=${token}` };
}

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Send a request to the app, signed in when a cookie is given */
export function call(
  method: Method,
  path: string,
  options: { cookie?: string; body?: object | Buffer; headers?: Record<string, string> } = {},
): request.Test {
  const agent = request(app) as unknown as Record<Method, (path: string) => request.Test>;
  let test = agent[method](path);
  if (options.cookie) test = test.set('Cookie', options.cookie);
  for (const [name, value] of Object.entries(options.headers ?? {})) test = test.set(name, value);
  if (options.body !== undefined) test = test.send(options.body);
  return test;
}

/** What a route handler answered when run directly (see runHandler) */
export interface HandlerResult {
  status: number;
  body: unknown;
}

/**
 * Run a route's last handler directly with a request that has passed its rule, as req.org
 * says. This tests a handler against a resource that changed after its rule ran, which a
 * request through the app can't arrange.
 */
export async function runHandler(
  router: Router,
  method: Method,
  path: string,
  req: { params: Record<string, string>; org: Request['org']; body?: object; user?: SessionUser },
): Promise<HandlerResult> {
  const layer = (router.stack as Array<{ route?: StackRoute }>).find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  if (!layer?.route) throw new Error(`No ${method} ${path} route`);
  const handle = layer.route.stack.at(-1)!.handle;

  const result: HandlerResult = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(body: unknown) {
      result.body = body;
      return res;
    },
    send(body?: unknown) {
      result.body = body;
      return res;
    },
  };
  await handle(req as unknown as Request, res as unknown as Response, () => {});
  return result;
}

interface StackRoute {
  path: string;
  methods: Record<string, boolean>;
  stack: Array<{ handle: (req: Request, res: Response, next: () => void) => unknown }>;
}
