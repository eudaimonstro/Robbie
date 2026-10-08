import path from 'path';
import express, { type Express } from 'express';

/**
 * Serve the built web app (frontend-unified/dist) on the API's origin, as production does:
 * - /assets holds Vite's hashed bundles: cached for a year, and a missing one is a 404 (a page
 *   from before a deploy then fails plainly instead of running index.html as JavaScript);
 * - other files at the root are served as they are;
 * - any other path without a file extension is a route of the app (a meeting link, a share
 *   link): index.html, never cached, so a deploy reaches the next page load;
 * - a missing file with an extension is a 404.
 * Register it after the API routes.
 */
export function serveWebApp(app: Express, distDir: string): void {
  app.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y', index: false }),
    (_req, res) => {
      res.status(404).type('text/plain').send('Not found');
    },
  );

  app.use(express.static(distDir, { index: false }));

  app.get('/{*splat}', (req, res, next) => {
    if (path.extname(req.path) !== '') {
      res.status(404).type('text/plain').send('Not found');
      return;
    }
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}
