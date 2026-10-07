import { expect, type Page } from '@playwright/test';

/**
 * The demo's people (backend-node/src/demo/demoSeed.ts): named, past the terms step, and signed in
 * with the test code
 */
export const PEOPLE = {
  /** Owner: the secretary in the scenario */
  pat: 'pat@maplegrove.example',
  /** Admin: the president, who presides over the demo's meetings */
  dana: 'dana@maplegrove.example',
  /** Members: homeowners */
  alice: 'alice@maplegrove.example',
  ben: 'ben@maplegrove.example',
  /** Viewers: a display, and a guest in a meeting */
  morgan: 'morgan@maplegrove.example',
  sam: 'sam@maplegrove.example',
} as const;

/** Sign a page's browser context in as one of the demo's people, with the test code */
export async function signIn(page: Page, email: string): Promise<void> {
  const response = await page.request.post('/api/auth/verify', {
    data: { email, code: '000000' },
  });
  expect(response.ok(), `sign in as ${email}`).toBe(true);
}
