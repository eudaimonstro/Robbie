import { describe, it, expect, beforeEach } from 'vitest';
import type { OrgRole } from '../generated/prisma/client.js';
import { roleBelow, roleNeeded } from '../orgs/roles.js';
import { resetDatabase } from './db.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { call, type Method } from './helpers.js';

/** One route's rule: who may call it, and what a successful call answers */
export interface RuleCase {
  method: Method;
  /** The route as written in its router, for the test name */
  route: string;
  path: (f: Fixture) => string;
  body?: (f: Fixture) => object | Buffer;
  headers?: (f: Fixture) => Record<string, string>;
  /** The lowest role that may call it */
  min: OrgRole;
  /** The status a member with that role gets */
  ok: number;
}

/**
 * For each route: 401 without a session, 404 for a member of another organization, 403 with
 * the role named for the role just below the minimum, and success at the minimum. Each route
 * gets a fresh fixture, since a successful call may change or delete it. The refusals change
 * nothing, so they run before the success on the same fixture.
 */
export function describeRules(title: string, cases: RuleCase[]): void {
  describe(title, () => {
    let f: Fixture;
    beforeEach(async () => {
      await resetDatabase();
      f = await seedFixture();
    });

    it.each(cases)('$method $route needs $min', async (c) => {
      const send = (cookie?: string) =>
        call(c.method, c.path(f), { cookie, body: c.body?.(f), headers: c.headers?.(f) });

      expect((await send()).status, 'without a session').toBe(401);

      const outsider = await send(f.outsider.cookie);
      expect(outsider.status, 'as a member of another organization').toBe(404);
      expect(outsider.body).toEqual({ error: 'Not found' });

      const below = roleBelow(c.min);
      if (below) {
        const refused = await send(f.users[below].cookie);
        expect(refused.status, `as ${below}`).toBe(403);
        expect(refused.body).toEqual({ error: roleNeeded(c.min) });
      }

      const allowed = await send(f.users[c.min].cookie);
      expect(allowed.status, `as ${c.min}: ${JSON.stringify(allowed.body)}`).toBe(c.ok);
    });
  });
}
