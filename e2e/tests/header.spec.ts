import { test, expect, type Locator } from '@playwright/test';
import { PEOPLE, signIn } from '../helpers';

/** Phones, a tablet beside the sidebar, and a laptop */
const WIDTHS = [
  { name: 'small-phone', width: 360, height: 740 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 913, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
];

test('the header fits at phone, tablet and laptop widths', async ({ page }, testInfo) => {
  await signIn(page, PEOPLE.pat);

  for (const { name, width, height } of WIDTHS) {
    // Load the page at this width, so the sidebar isn't caught sliding
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByText('Welcome to Maple Grove HOA')).toBeVisible();
    const header = page.locator('header').first();
    await expect(header.getByRole('button', { name: /Maple Grove HOA/ })).toBeVisible();
    await expectInside(header, width);

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
