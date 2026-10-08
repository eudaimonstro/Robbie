import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PEOPLE, signIn } from '../helpers';

/**
 * axe (WCAG 2.1 A and AA) over the main pages outside a live meeting, in both palettes: a
 * serious or critical violation (a button without a name, a select without a label, text a
 * palette makes unreadable) fails the run. The live meeting screens are walked by the meeting
 * scenarios.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoSeriousViolations(page: Page, name: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.impact} ${v.id}: ${v.help} (${v.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join(' | ')})`,
    );
  expect(serious, `axe on ${name}`).toEqual([]);
}

const BYLAWS = 'Bylaws of Maple Grove Homeowners Association';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility in the ${scheme} palette`, () => {
    test.use({ colorScheme: scheme });

    test('the sign-in page', async ({ page }) => {
      await page.goto('/sign-in');
      await expect(page.getByLabel('Email')).toBeVisible();
      await expectNoSeriousViolations(page, 'sign-in');
    });

    test('the main pages, signed in', async ({ page }) => {
      await signIn(page, PEOPLE.pat);
      const pages: Array<{ name: string; path: string; ready: () => Promise<void> }> = [
        {
          name: 'home',
          path: '/',
          ready: () => expect(page.getByRole('heading', { name: 'Maple Grove HOA' })).toBeVisible(),
        },
        {
          name: 'amendments',
          path: '/amendments',
          ready: () =>
            expect(page.getByRole('heading', { name: 'Amendments', exact: true })).toBeVisible(),
        },
        {
          name: 'minutes',
          path: '/minutes',
          ready: () =>
            expect(page.getByRole('link', { name: /2025 Annual Meeting/ })).toBeVisible(),
        },
        {
          name: 'live meetings',
          path: '/meetings',
          ready: () => expect(page.getByRole('heading', { name: 'Live meetings' })).toBeVisible(),
        },
        {
          name: 'settings',
          path: '/settings',
          ready: () => expect(page.getByRole('heading', { name: 'Members' })).toBeVisible(),
        },
      ];
      for (const { name, path, ready } of pages) {
        await page.goto(path);
        await ready();
        await expectNoSeriousViolations(page, name);
      }

      // The bylaws, their comparison, and an amendment with its preview
      await page.goto('/');
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: BYLAWS })
        .click();
      await expect(page.getByRole('heading', { name: BYLAWS })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Version' })).toBeVisible();
      await expectNoSeriousViolations(page, 'the bylaws');

      await page.getByRole('link', { name: 'Compare' }).click();
      await expect(page.getByRole('heading', { name: 'Version comparison' })).toBeVisible();
      await expectNoSeriousViolations(page, 'the version comparison');

      await page.goto('/amendments');
      await page.getByRole('link', { name: /Lower the quorum/ }).click();
      await expect(page.getByRole('heading', { name: /Lower the quorum/ })).toBeVisible();
      await expectNoSeriousViolations(page, 'an amendment');
      await page.getByRole('tab', { name: 'Preview' }).click();
      await expect(page.getByRole('region', { name: /Section 1\.1/ })).toBeVisible();
      await expectNoSeriousViolations(page, "an amendment's preview");
    });

    test('a shared document, signed out', async ({ page, browser, baseURL }) => {
      await signIn(page, PEOPLE.pat);
      const [organization] = await (await page.request.get('/api/organizations')).json();
      const list = await (
        await page.request.get(`/api/organizations/${organization.id}/documents`)
      ).json();
      const bylaws = list.find((doc: { title: string }) => doc.title === BYLAWS);
      const share = await (await page.request.post(`/api/documents/${bylaws.id}/share`)).json();
      const reader = await browser.newContext({ baseURL, colorScheme: scheme });
      try {
        const publicPage = await reader.newPage();
        await publicPage.goto(`/share/${share.shareToken}`);
        await expect(publicPage.getByRole('heading', { name: BYLAWS })).toBeVisible();
        await expectNoSeriousViolations(publicPage, 'the shared document');
      } finally {
        await reader.close();
        // Sharing stays off in the demo, as it was
        await page.request.delete(`/api/documents/${bylaws.id}/share`);
      }
    });
  });
}
