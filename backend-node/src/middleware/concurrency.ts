import type { RequestHandler } from 'express';

/**
 * Let at most `max` requests through this point at once; one more answers 503 with `message`
 * at once, without its body being read. A slot is freed when the response finishes or the
 * connection closes. For work that takes a lot of memory, such as reading a Word document.
 */
export function concurrencyLimit(max: number, message: string): RequestHandler {
  let active = 0;
  return (_req, res, next) => {
    if (active >= max) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({ error: message });
      return;
    }
    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active -= 1;
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}
