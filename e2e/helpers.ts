import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import pg from 'pg';
import { BASE_URL, DATABASE_URL } from './env';

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
  /** A member without a phone, in the scenarios */
  carmen: 'carmen@maplegrove.example',
  /** Secretary: the treasurer, not on the board */
  ray: 'ray@maplegrove.example',
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

/** A phone-sized, touch page: the phone view's narrowest common size */
export const PHONE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

/**
 * Forget the codes this person asked for, so the hourly limit on codes per email (five from one
 * address, which every browser in a run shares) never trips a run that signs them in often
 */
async function forgetSignInCodes(email: string): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM "SignInCode" WHERE email = $1', [email]);
  } finally {
    await client.end();
  }
}

/** Sign in the way a person does: the sign-in page, the email, then the test code */
export async function signInThroughPage(page: Page, email: string): Promise<void> {
  await forgetSignInCodes(email);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The demo's people are named and past the terms step: signed in, the page goes home
  await expect(page).not.toHaveURL(/\/sign-in/);
}

/**
 * A page in a browser context of its own (its own cookies), signed in as one of the demo's
 * people through the sign-in page: several people can be in one test, each in their own context
 */
export async function personPage(
  browser: Browser,
  email: string,
  options: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    ...options,
  });
  const page = await context.newPage();
  await signInThroughPage(page, email);
  return page;
}

/** A screenshot attached to the report (CI uploads it); never compared */
export async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

/**
 * The visible parts of a result stamp: its word and its caption (the subject and the tally).
 * The stamp also writes the result into a hidden live region inside the same figure for screen
 * readers, so a bare getByText would match it as well.
 */
export function visibleStamp(page: Page, word: string) {
  const figure = page.getByRole('figure', { name: new RegExp(`^${word}\\b`) });
  return {
    word: figure.getByText(word, { exact: true }).and(figure.locator(':not([role="status"])')),
    caption: figure.locator('figcaption'),
  };
}

/**
 * Text as the page shows it: inside its main landmark, so never a toast (the Notifications
 * region), the route announcer, the app's header or its sidebar, and never a hidden (sr-only)
 * live region that repeats the text for screen readers (the phone's announcer, a stamp's). Strict
 * like any locator: two visible matches fail the test rather than one being picked.
 */
export function shown(
  page: Page,
  text: string | RegExp,
  options: { exact?: boolean } = {},
): Locator {
  return page
    .getByRole('main')
    .getByText(text, options)
    .and(page.locator(':not(.sr-only):not(.sr-only *)'));
}

/**
 * A named region of a screen: the console's and the phone's "The question", the phone's "Your
 * part" (its one action block), the console's "Vote in progress", "Approval of the minutes"
 */
export function region(page: Page, name: string): Locator {
  return page.getByRole('region', { name, exact: true });
}

/** A toast's text, in the Notifications region */
export function toast(page: Page, text: string | RegExp): Locator {
  return region(page, 'Notifications').getByText(text);
}
