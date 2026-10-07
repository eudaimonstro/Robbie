import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { PEOPLE, signIn } from '../helpers';

/** The Maple Grove bylaws as a secretary would paste them (the demo seed's text) */
const BYLAWS = readFileSync(path.join(__dirname, '../fixtures/maple-grove-bylaws.txt'), 'utf8');

test('pasted bylaws become articles and sections, checked and saved as a version', async ({
  page,
}) => {
  await signIn(page, PEOPLE.pat);
  await page.setViewportSize({ width: 1280, height: 900 });

  // A new document, so the demo's own bylaws stay as they are (a retry makes another)
  const title = `Imported bylaws ${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'New Document' }).click();
  await page.getByLabel('Document Title').fill(title);
  await page.getByRole('button', { name: 'Create Document' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

  // Pat pastes the bylaws in: the articles and sections are found from the headings
  await page.getByRole('button', { name: 'Import the bylaws' }).click();
  await page.getByLabel('Bylaws text').fill(BYLAWS);
  await page.getByRole('button', { name: 'Read the bylaws' }).click();
  const found = page.getByRole('region', { name: 'What Robbie found' });
  await expect(found.getByText('6 articles, 23 sections', { exact: true })).toBeVisible();
  await expect(
    found.getByLabel('Title of Article IV Meetings of Members', { exact: true }),
  ).toBeVisible();

  // Pat corrects one title and saves: version 1
  await found
    .getByLabel('Title of Section 4.2 Quorum', { exact: true })
    .fill('Quorum of the Members');
  await page.getByRole('button', { name: 'Save as a new version' }).click();

  // The document page shows the sections (the save's toast names the version, not them)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const sections = page.locator('[id^="section-"]');
  await expect(sections.getByText('Quorum of the Members', { exact: true })).toBeVisible();
  await expect(sections.getByText('Name and Purpose', { exact: true })).toBeVisible();
});
