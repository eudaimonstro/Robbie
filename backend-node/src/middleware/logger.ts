import pino from 'pino';
import pinoHttp from 'pino-http';
import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }),
});

/**
 * A request's URL without a share link's token: /api/share/<token>/... (the API) and
 * /share/<token>/... (the web app's pages, including /print) log as /share/[token]. The token is
 * the only key to a shared document, and the logs are kept for days.
 */
export function redactUrl(url: string | undefined): string | undefined {
  return url?.replace(/^((?:\/api)?\/share\/)[^/?#]+/, '$1[token]');
}

/** A client's X-Request-Id, if it is a plain id (letters, digits, dashes, at most 64) */
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The id a request is logged under: the client's X-Request-Id when it is a plain id (so it
 * can't write a line of its own, or a megabyte, into the log), otherwise a new one
 */
export function requestId(header: string | string[] | undefined): string {
  return typeof header === 'string' && REQUEST_ID.test(header) ? header : crypto.randomUUID();
}

/** An email address as the log keeps it: its domain only, which says enough to debug a send */
export function emailForLog(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? `*${email.slice(at)}` : '*';
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => requestId(req.headers['x-request-id']),
  serializers: {
    req: (req) => ({
      method: req.method,
      url: redactUrl(req.url),
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});
