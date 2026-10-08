import helmet from 'helmet';

/**
 * The web app's own address as a WebSocket origin (https://host becomes wss://host), or none if
 * the address isn't a URL.
 */
export function webSocketOrigin(appUrl: string): string | null {
  try {
    const url = new URL(appUrl);
    if (url.protocol === 'https:') return `wss://${url.host}`;
    if (url.protocol === 'http:') return `ws://${url.host}`;
    return null;
  } catch {
    return null;
  }
}

/**
 * Helmet's headers and Content Security Policy, without upgrade-insecure-requests: in production
 * Caddy redirects HTTP to HTTPS and Helmet sends HSTS, so it adds nothing there, and without it
 * the same image serves the app over plain http://localhost (CI's smoke test, a laptop).
 *
 * connect-src names the meeting socket's address (wss://robbie.scouch.dev, from APP_URL) beside
 * 'self'. CSP Level 3 lets 'self' cover a WebSocket to the page's own host, and Chromium follows
 * it, but older Safari doesn't: there Socket.io's upgrade from long-polling would be refused and
 * every phone would stay on polling. Naming the one host is tighter than any wss: host.
 */
export function securityHeaders(appUrl: string) {
  const socket = webSocketOrigin(appUrl);
  return helmet({
    contentSecurityPolicy: {
      directives: {
        connectSrc: socket ? ["'self'", socket] : ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  });
}
