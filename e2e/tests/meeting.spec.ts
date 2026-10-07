import {
  test,
  expect,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { PEOPLE, PHONE, personPage } from '../helpers';

test('a scheduled meeting runs a vote from the phones to the display', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  // Each person's browser context, closed in the end whether the scenario passes or stops
  // partway (a sign-in that fails leaves its context open too, so they are found on the browser)
  const before = new Set(browser.contexts());
  const open = (email: string, options: BrowserContextOptions = {}) =>
    personPage(browser, email, options);

  try {
    // Pat, the secretary, schedules a meeting with Dana presiding
    const pat = await open(PEOPLE.pat, { viewport: { width: 1280, height: 900 } });
    await pat.goto('/meetings');
    await pat.getByRole('button', { name: 'Schedule a meeting' }).click();
    await pat.getByLabel('Meeting title').fill('Special meeting on the pool');
    await pat.getByLabel('Presiding officer').selectOption({ label: 'Dana Okafor' });
    await pat.getByRole('button', { name: 'Next: build the agenda' }).click();
    const code = (await pat.getByTestId('meeting-code').innerText()).trim();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await pat.getByRole('button', { name: 'Done' }).click();
    // This meeting's link: a retry (CI retries once) finds the first attempt's meeting there too
    await expect(
      pat
        .getByRole('link', { name: 'Join Special meeting on the pool' })
        .and(pat.locator(`[href="/meetings/${code}"]`)),
    ).toBeVisible();

    // Pat puts the display on the TV
    await pat.setViewportSize({ width: 1920, height: 1080 });
    await pat.goto(`/meetings/${code}/display`);
    await expect(pat.getByText('Join at')).toBeVisible();
    await expect(pat.getByText(code, { exact: true })).toBeVisible();
    await expect(pat.getByRole('img', { name: 'Scan to join' })).toBeVisible();

    // Dana opens the console; Alice and Ben follow the link on their phones
    const dana = await open(PEOPLE.dana, { viewport: { width: 1440, height: 1000 } });
    await dana.goto(`/meetings/${code}`);
    await expect(dana.getByRole('heading', { name: 'Special meeting on the pool' })).toBeVisible();
    const alice = await open(PEOPLE.alice, PHONE);
    const ben = await open(PEOPLE.ben, PHONE);
    for (const phone of [alice, ben]) {
      await phone.goto(`/meetings/${code}`);
      await expect(phone.getByText('The meeting has not been called to order yet.')).toBeVisible();
    }

    // Carmen has no phone: Dana marks her present, and counts three people without an account.
    // Dana, Alice and Ben on devices, Carmen marked, three counted: 7 of 142, quorum 29.
    await dana.getByRole('button', { name: 'Mark Carmen Diaz present' }).click();
    await expect(dana.getByRole('button', { name: 'Mark Carmen Diaz absent' })).toBeEnabled();
    await dana.getByLabel('Headcount').fill('3');
    await dana.getByRole('button', { name: 'Save the headcount' }).click();
    await expect(dana.getByText('7 present of 142, quorum 29, not met')).toBeVisible();
    await expect(pat.getByText('Need 22 more')).toBeVisible();

    // The meeting is called to order and the agenda adopted. (The agenda's "Remove Call to order
    // from agenda" button would match the name too.)
    await dana.getByRole('button', { name: 'Call to order', exact: true }).click();
    await dana.getByRole('button', { name: 'Adopt the agenda' }).click();
    // The server has adopted it before Alice moves: her phone may offer a motion a moment sooner
    await expect(dana.getByRole('button', { name: 'Adopt the agenda' })).toHaveCount(0);

    // Alice moves from her phone, and Ben seconds
    await alice.getByLabel('Motion text').fill('I move that we resurface the pool this spring');
    await alice.getByRole('button', { name: 'Submit Motion' }).click();
    await ben.getByRole('button', { name: 'Second', exact: true }).click();
    await expect(dana.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeVisible();
    await expect(pat.getByText('I move that we resurface the pool this spring')).toBeVisible();

    // The vote opens. Sam, a viewer in the organization, follows as a guest and has no vote.
    await dana.getByRole('button', { name: 'Open the vote' }).click();
    const sam = await open(PEOPLE.sam, PHONE);
    await sam.goto(`/meetings/${code}`);
    await expect(sam.getByText('Guest', { exact: true })).toBeVisible();
    await expect(sam.getByRole('button', { name: 'Request the floor' })).toBeVisible();
    await expect(sam.getByRole('button', { name: /^Vote / })).toHaveCount(0);

    // The phones vote; Dana enters the show of hands and closes the vote
    await alice.getByRole('button', { name: 'Vote yea' }).click();
    await ben.getByRole('button', { name: 'Vote yea' }).click();
    await expect(dana.getByText('2 voted on devices')).toBeVisible();
    await expect(pat.getByText('2 votes received')).toBeVisible();
    await dana.getByLabel('Yea in the room').fill('9');
    await dana.getByLabel('Nay in the room').fill('2');
    await dana.getByLabel('Abstain in the room').fill('0');
    await dana.getByRole('button', { name: 'Enter the count' }).click();
    await expect(dana.getByText('Together: 11 to 2')).toBeVisible();
    await expect(pat.getByText('In the room: 9 to 2')).toBeVisible();
    await dana.getByRole('button', { name: 'Close the vote' }).click();

    // The display announces the result in both parts, with the quorum
    await expect(pat.getByText('Carried', { exact: true })).toBeVisible();
    await expect(pat.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeVisible();
    await expect(pat.getByText('Need 22 more')).toBeVisible();
    await expect(alice.getByText('Carried', { exact: true })).toBeVisible();

    await capture(dana, testInfo, 'console');
    await capture(alice, testInfo, 'phone');
    await capture(pat, testInfo, 'display');
  } finally {
    const opened = browser.contexts().filter((context) => !before.has(context));
    await Promise.all(opened.map((context) => context.close()));
  }
});

/** A screenshot attached to the report (CI uploads it); never compared */
async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}
