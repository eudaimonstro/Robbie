import express from 'express';

/**
 * The JSON parser for the bodies that can be larger than the 100 KB default (a whole set of
 * bylaws, a meeting's minutes). It goes in those routes after the role check, and the app's
 * own parser leaves them alone (LARGE_JSON_ROUTES in app.ts).
 */
export const largeJson = express.json({ limit: '2mb' });
