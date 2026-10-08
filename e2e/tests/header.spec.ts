import { test, expect, type Locator } from '@playwright/test';
import { PEOPLE, signIn } from '../helpers';

/** Phones, a tablet beside the sidebar, and a laptop */
const WIDTHS = [
  { name: 'small-phone', width: 360, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet', width: 913, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
];

test('the header fits at phone, tablet and laptop widths', async ({ page }, testInfo) => {
  await signIn(page, PEOPLE.pat);

  for (const { name, width, height } of WIDTHS) {
    // Load the page at this width, so the sidebar isn't caught sliding
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Maple Grove HOA' })).toBeVisible();
    const header = page.locator('header').first();
    await expect(header.getByRole('button', { name: /Maple Grove HOA/ })).toBeVisible();
    await expectInside(header, width);

    // Home's join button for the next meeting stays on one line (on phones, the full width)
    const join = await page.getByRole('link', { name: 'Join 2026 Annual Meeting' }).boundingBox();
    expect(join?.height, `the join button's height at ${width}px`).toBeLessThanOrEqual(44);
    expect(join!.x + join!.width, `the join button at ${width}px`).toBeLessThanOrEqual(width);

    const file = testInfo.outputPath(`header-${name}.png`);
    await page.screenshot({ path: file });
    await testInfo.attach(`header-${name}`, { path: file, contentType: 'image/png' });

    // Below the laptop the search box is an icon button that opens it over the header
    if (width < 1280) {
      await header.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(header.getByRole('textbox', { name: 'Search documents' })).toBeFocused();
      await expectInside(header, width);
      const open = testInfo.outputPath(`header-${name}-search.png`);
      await page.screenshot({ path: open });
      await testInfo.attach(`header-${name}-search`, { path: open, contentType: 'image/png' });
      await header.getByRole('button', { name: 'Close' }).click();
    }
  }
});

test('a live meeting takes the full width, with the menu in the header', async ({ page }) => {
  await signIn(page, PEOPLE.pat);
  await page.setViewportSize({ width: 1280, height: 800 });
  const nav = page.getByRole('navigation', { name: 'Main' });
  const menu = page.getByRole('button', { name: 'Open menu' });

  // Beside the sidebar elsewhere: no menu button on a laptop
  await page.goto('/');
  await expect(nav).toBeInViewport();
  await expect(menu).toBeHidden();

  // A meeting link (one that isn't scheduled, so nobody joins anything): the sidebar is a drawer
  await page.goto('/meetings/ZZZ999');
  await expect(page.getByText('No meeting with that code')).toBeVisible();
  await expect(nav).not.toBeInViewport();
  await expectInside(page.locator('header').first(), 1280);
  await menu.click();
  await expect(nav).toBeInViewport();
  await page.getByRole('button', { name: 'Close sidebar' }).click();
  await expect(nav).not.toBeInViewport();
});

/** Every control drawn in the header lies inside the page */
async function expectInside(header: Locator, width: number): Promise<void> {
  const outside = await header.evaluate((el) => {
    const right = document.documentElement.clientWidth;
    return [...el.querySelectorAll('button, input, a')]
      .map((control) => ({ control, box: control.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .filter(({ box }) => box.left < 0 || box.right > right)
      .map(({ control, box }) => ({
        label: control.getAttribute('aria-label') ?? control.textContent?.trim() ?? '',
        left: Math.round(box.left),
        right: Math.round(box.right),
      }));
  });
  expect(outside, `controls outside the page at ${width}px`).toEqual([]);
}
