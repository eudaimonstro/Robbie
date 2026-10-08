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

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    return (req.headers['x-request-id'] as string) || crypto.randomUUID();
  },
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
