import helmet from 'helmet';

/**
 * Helmet's headers and Content Security Policy, without upgrade-insecure-requests: in production
 * Caddy redirects HTTP to HTTPS and Helmet sends HSTS, so it adds nothing there, and without it
 * the same image serves the app over plain http://localhost (CI's smoke test, a laptop).
 */
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  });
}
