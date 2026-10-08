import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { BASE_URL } from './env';

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

/** A phone-sized, touch page: the phone view's narrowest common size */
export const PHONE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

/**
 * Sign in the way a person does: the sign-in page, the email, then the test code. The global
 * setup clears the sign-in codes, so the hourly limit on codes per email never trips a run.
 */
export async function signInThroughPage(page: Page, email: string): Promise<void> {
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
