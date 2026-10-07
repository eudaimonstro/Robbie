import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { PEOPLE, signIn } from '../helpers';

/** The pages captured after signing in, each with the heading that says it is ready */
const PAGES = [
  { name: 'dashboard', path: '/', heading: 'Dashboard' },
  { name: 'live-meetings', path: '/meetings', heading: 'Live meetings' },
  { name: 'settings', path: '/settings', heading: 'Settings' },
  { name: 'style-guide', path: '/style-guide', heading: 'Style guide' },
];

/** The paper token in each palette (docs/design-brief.md): the page background */
const PAPER = { light: 'rgb(247, 243, 236)', dark: 'rgb(21, 19, 15)' } as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`the ${scheme} palette`, () => {
    // The app follows the system palette until the user picks one in Settings
    test.use({ colorScheme: scheme });

    test('the sign-in page', async ({ page }, testInfo) => {
      await page.goto('/sign-in');
      await expect(page.getByLabel('Email')).toBeVisible();
      await expectPalette(page, scheme);
      await capture(page, testInfo, `sign-in-${scheme}`);
    });

    test('the main pages', async ({ page }, testInfo) => {
      await signIn(page, PEOPLE.pat);
      for (const { name, path, heading } of PAGES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        await expectPalette(page, scheme);
        await capture(page, testInfo, `${name}-${scheme}`);
      }

      const bylaws = 'Bylaws of Maple Grove Homeowners Association';
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: bylaws })
        .click();
      await expect(page.getByRole('heading', { name: bylaws })).toBeVisible();
      await capture(page, testInfo, `bylaws-${scheme}`);
    });
  });
}

/** The page is paper in this palette, and its type is Public Sans, served by the app */
async function expectPalette(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    .toBe(PAPER[scheme]);
  const publicSans = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (face) => face.family.replace(/"/g, '') === 'Public Sans' && face.status === 'loaded',
    );
  });
  expect(publicSans).toBe(true);
}

/** A full-page screenshot, attached to the report (CI uploads it); never compared */
async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}
