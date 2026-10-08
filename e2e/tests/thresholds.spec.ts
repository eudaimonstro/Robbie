import {
  test,
  expect,
  type BrowserContextOptions,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { resetDemo } from '../demo';
import { PEOPLE, PHONE, capture, personPage, visibleStamp } from '../helpers';

/**
 * The bylaw threshold an organization sets (Settings, Bylaw amendments) on the demo's 2026 Annual
 * Meeting: two thirds of all 142 voting members, so 22 to 3 in the room fails; then a voice vote
 * the chair declares, and a division called from a phone right after.
 */

const CODE = 'MAPLE1';
const ITEM = 'New business: amend Section 4.2 to lower the quorum to 15%';
const NEEDED = 'Two thirds of all 142 voting members: 95 votes needed';

// The test runs the demo's own meeting and changes the organization's rule, so it starts from a
// fresh demo (a retry too) and leaves a fresh one for the specs that follow
test.beforeAll(async () => {
  test.setTimeout(120_000);
  await resetDemo();
});
test.afterAll(async () => {
  test.setTimeout(120_000);
  await resetDemo();
});

/** A screen as the person sees it, scrolled to this part */
async function phoneShot(page: Page, testInfo: TestInfo, name: string, at: Locator) {
  await at.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

test('a bylaw amendment needs two thirds of all the members, and a voice vote is divided', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const before = new Set(browser.contexts());
  const open = (email: string, options: BrowserContextOptions = {}) =>
    personPage(browser, email, options);

  try {
    // Pat, the owner, sets what the association's bylaws require to amend them
    const pat = await open(PEOPLE.pat, { viewport: { width: 1280, height: 900 } });
    await pat.goto('/settings');
    const rule = pat.getByLabel('Bylaw amendments need');
    await expect(rule).toHaveValue('twoThirdsCast');
    await rule.selectOption({ label: 'Two thirds of all the voting members' });
    await expect(pat.getByText('Saved what bylaw amendments need')).toBeVisible();
    await pat.reload();
    await expect(pat.getByLabel('Bylaw amendments need')).toHaveValue('twoThirdsMembers');

    const tv = await open(PEOPLE.morgan, { viewport: { width: 1920, height: 1080 } });
    await tv.goto(`/meetings/${CODE}/display`);
    const dana = await open(PEOPLE.dana, { viewport: { width: 1440, height: 1000 } });
    await dana.goto(`/meetings/${CODE}`);
    await expect(dana.getByRole('heading', { name: '2026 Annual Meeting' })).toBeVisible();
    const alice = await open(PEOPLE.alice, PHONE);
    const ben = await open(PEOPLE.ben, PHONE);
    for (const phone of [alice, ben]) {
      await phone.goto(`/meetings/${CODE}`);
      await expect(phone.getByText('The meeting has not been called to order yet.')).toBeVisible();
    }

    // A quorum: Dana, Alice and Ben on devices, Carmen marked present, 25 counted in the room
    await dana.getByRole('button', { name: 'Mark Carmen Diaz present' }).click();
    await expect(dana.getByRole('button', { name: 'Mark Carmen Diaz absent' })).toBeEnabled();
    await dana.getByLabel('Headcount').fill('25');
    await dana.getByRole('button', { name: 'Save the headcount' }).click();
    await expect(dana.getByText('29 present of 142, quorum 29, met')).toBeVisible();
    await dana.getByRole('button', { name: 'Call to order', exact: true }).click();
    await dana.getByRole('button', { name: 'Adopt the agenda' }).click();
    await expect(dana.getByRole('button', { name: 'Adopt the agenda' })).toHaveCount(0);
    await dana.getByRole('button', { name: `Call ${ITEM}` }).click();

    // Alice moves the board's proposed amendment from her phone, and Ben seconds
    await alice.locator('summary', { hasText: 'Other motions' }).click();
    await alice.getByRole('radio', { name: /^Amend the bylaws/ }).check();
    await alice
      .getByRole('group', { name: 'Other motions' })
      .getByRole('button', { name: 'Move' })
      .click();
    const form = alice.getByRole('form', { name: 'Amend the bylaws' });
    await form
      .getByRole('group', { name: 'Proposed amendments' })
      .getByRole('radio', { name: /Lower the quorum to 15%/ })
      .check();
    await form.getByRole('button', { name: 'Move', exact: true }).click();
    await ben.getByRole('button', { name: 'Second', exact: true }).click();

    // Everyone reads the vote it needs, in plain words
    for (const page of [dana, alice, ben, tv]) {
      await expect(page.getByText(NEEDED).first()).toBeVisible();
    }

    await dana.getByRole('button', { name: 'Open the vote' }).click();
    for (const phone of [alice, ben]) {
      await phone.getByRole('button', { name: 'Vote yes' }).click();
    }
    await expect(dana.getByText('2 voted on devices')).toBeVisible();
    await dana.getByLabel('Yea in the room').fill('20');
    await dana.getByLabel('Nay in the room').fill('3');
    await dana.getByLabel('Abstain in the room').fill('0');
    await dana.getByRole('button', { name: 'Enter the count' }).click();
    await expect(dana.getByText('95 yes votes needed: 22 so far')).toBeVisible();
    await capture(dana, testInfo, 'threshold-console');
    await phoneShot(
      dana,
      testInfo,
      'threshold-console-question',
      dana.getByRole('region', { name: 'The question' }),
    );
    await phoneShot(
      alice,
      testInfo,
      'threshold-phone',
      alice.getByRole('region', { name: 'The question' }),
    );
    await capture(tv, testInfo, 'threshold-display');

    // 22 to 3 is far more than two thirds of the votes cast, and far short of 95
    await dana.getByRole('button', { name: 'Close the vote' }).click();
    const failed = visibleStamp(tv, 'Failed');
    await expect(failed.word).toBeVisible();
    await expect(
      failed.caption.getByText('On devices 2 to 0, in the room 20 to 3: 22 to 3', { exact: true }),
    ).toBeVisible();

    // A main motion on a voice vote: Dana hears the ayes and declares it, without a count
    await alice.getByLabel('Motion text').fill('I move that we thank the landscaping committee');
    await alice.getByRole('button', { name: 'Move', exact: true }).click();
    await ben.getByRole('button', { name: 'Second', exact: true }).click();
    await dana
      .getByLabel('How the vote is taken')
      .selectOption({ label: 'Voice vote or show of hands' });
    await dana.getByRole('button', { name: 'Open the vote' }).click();
    await expect(tv.getByText('Answer aloud when the chair asks.')).toBeVisible();
    await dana.getByRole('button', { name: 'The ayes have it' }).click();
    const carried = visibleStamp(tv, 'Carried');
    await expect(carried.caption).toContainText('By voice vote');

    // Ben doubts it and calls for a division from his phone: the vote is counted instead
    await ben.getByRole('button', { name: 'Call for a division' }).click();
    await expect(dana.getByText('Vote in progress')).toBeVisible();
    await expect(tv.getByText(/^Division: /)).toBeVisible();
    for (const [phone, choice] of [
      [alice, 'Vote yes'],
      [ben, 'Vote no'],
    ] as const) {
      await phone.getByRole('button', { name: choice }).click();
    }
    await expect(dana.getByText('2 voted on devices')).toBeVisible();
    await dana.getByLabel('Yea in the room').fill('15');
    await dana.getByLabel('Nay in the room').fill('10');
    await dana.getByLabel('Abstain in the room').fill('0');
    await dana.getByRole('button', { name: 'Enter the count' }).click();
    await expect(dana.getByText('Together: 16 to 11')).toBeVisible();
    await dana.getByRole('button', { name: 'Close the vote' }).click();
    await expect(
      visibleStamp(tv, 'Carried').caption.getByText(
        'On devices 1 to 1, in the room 15 to 10: 16 to 11',
        {
          exact: true,
        },
      ),
    ).toBeVisible();
  } finally {
    const opened = browser.contexts().filter((context) => !before.has(context));
    await Promise.all(opened.map((context) => context.close()));
  }
});
