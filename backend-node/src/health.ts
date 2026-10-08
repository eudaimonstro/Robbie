import type { RequestHandler } from 'express';

export interface HealthChecks {
  /** Resolves when the database answers */
  ping: () => Promise<unknown>;
  /** The live meetings' storage mode, or "initializing" */
  mode: () => string;
  /** How long the database has to answer (2 seconds) */
  timeoutMs?: number;
}

/**
 * GET /api/health: 200 { status: 'healthy', mode } when the database answers in time, else 503
 * { status: 'unhealthy', mode }. The image's HEALTHCHECK, `docker compose up --wait` and the
 * Playwright harness wait on it.
 */
export function healthCheck({ ping, mode, timeoutMs = 2000 }: HealthChecks): RequestHandler {
  return async (_req, res) => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The database did not answer')), timeoutMs);
    });
    try {
      await Promise.race([ping(), timeout]);
      res.json({ status: 'healthy', mode: mode() });
    } catch {
      res.status(503).json({ status: 'unhealthy', mode: mode() });
    } finally {
      clearTimeout(timer);
    }
  };
}
