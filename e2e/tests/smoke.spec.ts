import { test, expect } from '@playwright/test';
import { PEOPLE, signIn, signInThroughPage } from '../helpers';
import { BASE_URL } from '../env';

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

test('the app runs under the content security policy production sends', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });

  const response = await page.goto('/sign-in');
  const policy = response?.headers()['content-security-policy'];
  expect(policy).toContain("default-src 'self'");
  // The meeting socket's address, from APP_URL (Safari before CSP Level 3 needs it named)
  expect(policy).toContain(`connect-src 'self' ${BASE_URL.replace(/^http/, 'ws')}`);
  await signInThroughPage(page, PEOPLE.pat);

  // The pages with the most moving parts: the fonts and icons, the QR code, the socket
  await page.goto('/');
  await expect(page.getByText('Welcome to Maple Grove HOA')).toBeVisible();
  // Socket.io starts on long-polling and moves to a WebSocket: the policy lets it, and frames
  // come back (listening from the start: after the upgrade the next frame is 25 seconds away)
  const socketWorks = page
    .waitForEvent('websocket', (ws) => ws.url().includes('/socket.io/'))
    .then((ws) => ws.waitForEvent('framereceived'));
  await page.goto('/meetings/MAPLE1/display');
  await expect(page.getByRole('img', { name: 'Scan to join' })).toBeVisible();
  await socketWorks;
  await page.goto('/minutes');
  await expect(page.getByRole('link', { name: /2025 Annual Meeting/ })).toBeVisible();

  expect(violations).toEqual([]);
});
