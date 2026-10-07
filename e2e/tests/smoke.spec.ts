import { test, expect } from '@playwright/test';
import { PEOPLE, signIn } from '../helpers';

test('Pat signs in, opens the bylaws and finds the annual meeting on the schedule', async ({
  page,
}) => {
  await signIn(page, PEOPLE.pat);
  await page.goto('/');
  await expect(page.getByText('Welcome to Maple Grove HOA')).toBeVisible();

  const bylaws = 'Bylaws of Maple Grove Homeowners Association';
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: bylaws }).click();
  await expect(page.getByRole('heading', { name: bylaws })).toBeVisible();

  await page.getByRole('link', { name: 'Live Meetings' }).click();
  await expect(page.getByRole('heading', { name: 'Live meetings' })).toBeVisible();
  // Dana presides over it, so Pat joins it
  await expect(page.getByRole('link', { name: 'Join 2026 Annual Meeting' })).toBeVisible();
});

test('a meeting link opened signed out goes to sign-in and keeps the link', async ({ page }) => {
  await page.goto('/meetings/MAPLE1');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fmeetings%2FMAPLE1$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});
