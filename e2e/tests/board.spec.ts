import fs from 'node:fs';
import path from 'node:path';
import {
  test,
  expect,
  type BrowserContextOptions,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { resetDemo } from '../demo';
import { BASE_URL, EMAIL_OUTBOX } from '../env';
import { PEOPLE, PHONE, personPage, region, shown, visibleStamp } from '../helpers';

/**
 * Board meetings and the meeting notice on the demo: Maple Grove's board (Dana, Pat and Alice,
 * and Carmen once Pat adds her) meets in November (MAPLEB) with Ben observing; Pat emails the
 * annual meeting's notice and prints it.
 */

const BOARD = 'MAPLEB';
const ANNUAL = 'MAPLE1';

// Both tests change the demo (a board member, a meeting held, a notice sent), so they start from
// a fresh demo (a retry too) and leave a fresh one for the specs that follow
test.beforeAll(async () => {
  test.setTimeout(120_000);
  await resetDemo();
});
test.afterAll(async () => {
  test.setTimeout(120_000);
  await resetDemo();
});

/** The paper token in each palette: the page is drawn in it once the palette has switched */
const PAPER = { light: 'rgb(247, 243, 236)', dark: 'rgb(21, 19, 15)' } as const;

type Variant = { width: number; height: number; scheme: 'light' | 'dark' };
/** A laptop in each palette, and a phone in the day palette */
const LAPTOP_AND_PHONE: Variant[] = [
  { width: 1280, height: 900, scheme: 'light' },
  { width: 1280, height: 900, scheme: 'dark' },
  { width: 390, height: 844, scheme: 'light' },
];

/**
 * Screenshots of a page at each size and palette, attached to the report (never compared), named
 * `<name>-<width>-<scheme>`, from the top of the page or with `at` scrolled into view; the page is
 * left at the first variant's size and palette
 */
async function shots(
  page: Page,
  testInfo: TestInfo,
  name: string,
  variants = LAPTOP_AND_PHONE,
  at?: Locator,
) {
  for (const { width, height, scheme } of variants) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: scheme });
    // The app scrolls inside its main area, so a full-page capture is what is in view
    if (at) await at.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    else {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelectorAll('main').forEach((main) => main.scrollTo(0, 0));
      });
    }
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe(PAPER[scheme]);
    // The reveal on mount and the palette's transition settle first
    await page.waitForTimeout(400);
    const file = testInfo.outputPath(`${name}-${width}-${scheme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await testInfo.attach(`${name}-${width}-${scheme}`, { path: file, contentType: 'image/png' });
  }
  const [first] = variants;
  await page.setViewportSize({ width: first.width, height: first.height });
  await page.emulateMedia({ colorScheme: first.scheme });
}

test('a board meeting: the directors move and vote, an observer follows, and the minutes say who attended', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const before = new Set(browser.contexts());
  const open = (email: string, options: BrowserContextOptions = {}) =>
    personPage(browser, email, options);

  try {
    // Pat, an admin, puts Carmen on the board from the Members page: four directors
    const pat = await open(PEOPLE.pat, { viewport: { width: 1280, height: 900 } });
    await pat.goto('/settings#members');
    const carmen = pat.getByRole('checkbox', { name: 'Board member: Carmen Diaz' });
    await expect(carmen).not.toBeChecked();
    await expect(pat.getByRole('checkbox', { name: 'Board member: Alice Brennan' })).toBeChecked();
    await carmen.check();
    await expect(
      pat.getByRole('status').filter({ hasText: 'Carmen Diaz is on the board.' }),
    ).toBeVisible();
    await expect(carmen).toBeChecked();
    await expect(shown(pat, 'The board: 4 members, who vote in board meetings.')).toBeVisible();
    await shots(
      pat,
      testInfo,
      'members-board',
      LAPTOP_AND_PHONE,
      pat.getByRole('heading', { name: 'Members' }),
    );

    // Live Meetings marks the board meeting; scheduling one asks who votes
    await pat.goto('/meetings');
    await expect(shown(pat, 'Board meeting', { exact: true })).toBeVisible();
    await pat.getByRole('button', { name: 'Schedule a meeting' }).click();
    await expect(pat.getByRole('radio', { name: 'All members' })).toBeChecked();
    await pat.getByRole('radio', { name: 'The board' }).check();
    await expect(
      shown(pat, 'The 4 directors vote. Other members may attend and observe.'),
    ).toBeVisible();
    await shots(pat, testInfo, 'scheduler-kind');
    await pat.getByRole('button', { name: 'Back' }).click();

    // The TV, in the evening palette
    const tv = await open(PEOPLE.pat, {
      viewport: { width: 1920, height: 1080 },
      colorScheme: 'dark',
    });
    await tv.goto(`/meetings/${BOARD}/display`);
    await expect(shown(tv, 'Maple Grove HOA, Board meeting', { exact: true })).toBeVisible();
    await expect(
      shown(tv, 'The directors vote. Members may follow the meeting on their phones.'),
    ).toBeVisible();

    // Dana chairs from the console; Alice, a director, and Ben, a member, on their phones
    const dana = await open(PEOPLE.dana, { viewport: { width: 1280, height: 900 } });
    await dana.goto(`/meetings/${BOARD}`);
    await expect(dana.getByRole('heading', { name: 'November board meeting' })).toBeVisible();
    await expect(shown(dana, 'Board meeting', { exact: true })).toBeVisible();
    const alice = await open(PEOPLE.alice, PHONE);
    await alice.goto(`/meetings/${BOARD}`);
    await expect(
      region(alice, 'Your part').getByText('The meeting has not been called to order yet.'),
    ).toBeVisible();
    const ben = await open(PEOPLE.ben, PHONE);
    await ben.goto(`/meetings/${BOARD}`);
    await expect(
      region(ben, 'Your part').getByText("You're observing this board meeting."),
    ).toBeVisible();
    await expect(shown(ben, 'Observer', { exact: true })).toBeVisible();

    // Pat, a director at the TV without a phone of her own, is marked present: three of the four
    // directors, and a majority of them is the quorum. Ben observes and doesn't count.
    await dana.getByRole('button', { name: 'Mark Pat Lindqvist present' }).click();
    await expect(shown(dana, '3 present of 4, quorum 3, met')).toBeVisible();
    await expect(
      dana.getByRole('list', { name: 'Also present' }).getByText('Ben Whitaker'),
    ).toBeVisible();
    // Nobody is counted in the room at a board meeting
    await expect(dana.getByLabel('Headcount')).toHaveCount(0);

    await dana.getByRole('button', { name: 'Call to order', exact: true }).click();
    await dana.getByRole('button', { name: 'Adopt the agenda' }).click();
    await expect(dana.getByRole('button', { name: 'Adopt the agenda' })).toHaveCount(0);

    // Alice moves from her phone; Ben can't second it, so Dana records Pat's second
    await alice
      .getByLabel('Motion text')
      .fill('I move that we hire Green Thumb Landscaping for 2027');
    await alice.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(
      region(ben, 'The question').getByText(
        'I move that we hire Green Thumb Landscaping for 2027',
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(ben.getByRole('button', { name: 'Second', exact: true })).toHaveCount(0);
    await dana.getByRole('button', { name: 'Seconded from the floor' }).click();
    await dana.getByLabel('Who seconded it').selectOption({ label: 'Pat Lindqvist' });
    await dana.getByRole('button', { name: 'Record the second' }).click();
    await expect(
      region(dana, 'The question').getByText('Moved by Alice Brennan, seconded by Pat Lindqvist'),
    ).toBeVisible();

    // Ben, observing, asks to speak: the chair decides whom to recognize
    await ben.getByRole('button', { name: 'Ask to speak' }).click();
    await expect(ben.getByRole('button', { name: 'Withdraw the request' })).toBeVisible();
    await expect(
      dana.getByRole('button', { name: 'Recognize Ben Whitaker to speak' }),
    ).toBeVisible();
    await ben.getByRole('button', { name: 'Withdraw the request' }).click();

    // Ray, the treasurer, keeps the console without a vote (he isn't on the board), and records
    // what someone in the room does: an objection to adopting it without a vote
    const ray = await open(PEOPLE.ray, { viewport: { width: 1280, height: 900 } });
    await ray.goto(`/meetings/${BOARD}`);
    await expect(ray.getByRole('heading', { name: 'November board meeting' })).toBeVisible();
    await dana.getByRole('button', { name: 'Ask for unanimous consent' }).click();
    await ray.getByRole('button', { name: 'Objection from the floor' }).click();
    await expect(dana.getByRole('button', { name: 'Open the vote' })).toBeVisible();

    // The vote: Alice on her phone, Pat's hand in the room; Ben has no vote
    await dana.getByRole('button', { name: 'Open the vote' }).click();
    await alice.getByRole('button', { name: 'Vote yes' }).click();
    await expect(region(ben, 'Your part').getByText('The directors are voting.')).toBeVisible();
    await expect(ben.getByRole('button', { name: /^Vote / })).toHaveCount(0);
    await expect(region(dana, 'Vote in progress').getByText('1 voted on devices')).toBeVisible();
    await shots(ben, testInfo, 'observer-phone', [
      { width: 390, height: 844, scheme: 'light' },
      { width: 1280, height: 900, scheme: 'light' },
      { width: 1280, height: 900, scheme: 'dark' },
    ]);
    await dana.getByLabel('Yea in the room').fill('1');
    await dana.getByLabel('Nay in the room').fill('0');
    await dana.getByLabel('Abstain in the room').fill('0');
    await dana.getByRole('button', { name: 'Enter the count' }).click();
    await expect(region(dana, 'Vote in progress').getByText('Together: 2 to 0')).toBeVisible();
    await shots(dana, testInfo, 'board-console');
    await dana.getByRole('button', { name: 'Close the vote' }).click();

    const stamp = visibleStamp(tv, 'Carried');
    await expect(stamp.word).toBeVisible();
    await expect(
      stamp.caption.getByText('On devices 1 to 0, in the room 1 to 0: 2 to 0', { exact: true }),
    ).toBeVisible();
    await shots(tv, testInfo, 'board-tv', [{ width: 1920, height: 1080, scheme: 'dark' }]);

    await dana.getByRole('button', { name: 'Adjourn', exact: true }).click();
    await dana
      .getByRole('dialog', { name: 'Adjourn the meeting?' })
      .getByRole('button', { name: 'Adjourn', exact: true })
      .click();
    await expect(shown(dana, /^Adjourned at /)).toBeVisible();

    // The minutes the server drafted list the directors present and absent, and Ben
    const draft = pat.getByRole('link', { name: /November board meeting/ });
    await expect(async () => {
      await pat.goto('/minutes');
      await expect(draft).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await draft.click();
    const minutes = pat.getByRole('region', { name: 'Preview' });
    await expect(
      minutes.getByRole('heading', { name: 'Minutes of the meeting of the Board of Directors' }),
    ).toBeVisible();
    await expect(
      minutes.getByText(
        'Directors present (3): Alice Brennan, Dana Okafor, Pat Lindqvist (marked present).',
      ),
    ).toBeVisible();
    await expect(minutes.getByText('Directors absent (1): Carmen Diaz.')).toBeVisible();
    await expect(minutes.getByText('Also present: Ben Whitaker, Ray Castillo.')).toBeVisible();
    await expect(
      minutes.getByText(
        'A quorum of the board (3 of the 4 directors) was present at the call to order.',
      ),
    ).toBeVisible();
    await expect(
      minutes.getByText(
        /Alice Brennan moved: "I move that we hire Green Thumb Landscaping for 2027\." Seconded by Pat Lindqvist\. Carried, on devices 1 to 0 and in the room 1 to 0: 2 to 0\./,
      ),
    ).toBeVisible();
  } finally {
    const opened = browser.contexts().filter((context) => !before.has(context));
    await Promise.all(opened.map((context) => context.close()));
  }
});

test('the notice of the annual meeting goes to every member, and prints with its QR code', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const before = new Set(browser.contexts());
  // What a run before this one left in the outbox isn't this notice
  fs.rmSync(EMAIL_OUTBOX, { recursive: true, force: true });

  try {
    const pat = await personPage(browser, PEOPLE.pat, { viewport: { width: 1280, height: 900 } });
    await pat.goto('/meetings');
    await pat.getByRole('button', { name: 'Send the notice of 2026 Annual Meeting' }).click();
    const dialog = pat.getByRole('dialog', { name: 'Send the meeting notice' });
    // The 17 people of the demo, and the 2 added who haven't signed in
    await expect(dialog.getByText(/^19 people: every member with an email/)).toBeVisible();
    await expect(
      dialog.getByText('Meeting notice from "Maple Grove HOA": Tuesday, October 20'),
    ).toBeVisible();
    await expect(dialog.getByLabel('The email')).toContainText(`${BASE_URL}/meetings/${ANNUAL}`);
    await shots(pat, testInfo, 'notice-preview');
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(shown(pat, 'The notice was sent to 19 people.')).toBeVisible();
    await expect(shown(pat, /^Notice sent /)).toBeVisible();

    // Captured, not delivered: one plain-text email to each person, the same for all
    const sent = fs.readdirSync(EMAIL_OUTBOX).map(
      (file) =>
        JSON.parse(fs.readFileSync(path.join(EMAIL_OUTBOX, file), 'utf8')) as {
          to: string;
          subject: string;
          text: string;
        },
    );
    const recipients = sent.map((email) => email.to).sort();
    expect(recipients).toHaveLength(19);
    expect(new Set(recipients).size).toBe(19);
    for (const person of ['pat', 'dana', 'alice', 'ben', 'morgan', 'sam', 'harold', 'rosa']) {
      expect(recipients).toContain(`${person}@maplegrove.example`);
    }
    for (const email of sent) {
      expect(email.subject).toBe('Meeting notice from "Maple Grove HOA": Tuesday, October 20');
      expect(email.text).toContain('Sent by "Pat Lindqvist" (pat@maplegrove.example)');
      expect(email.text).toContain(`${BASE_URL}/meetings/${ANNUAL}`);
      expect(email.text).toContain(
        'This is a courtesy notice. Your bylaws and state law set the official notice requirements.',
      );
      expect(email.text).not.toMatch(/<[a-z]/i);
    }

    // Sending again asks first, saying when it went
    await pat.getByRole('button', { name: 'Send the notice of 2026 Annual Meeting' }).click();
    await expect(dialog.getByText(/^The notice was sent on .+ by Pat Lindqvist\./)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send it again' })).toBeVisible();

    // The printed notice, for the clubhouse board and the owners without email
    await dialog.getByRole('link', { name: 'Print the notice for posting and mailing' }).click();
    await expect(pat).toHaveURL(new RegExp(`/meetings/${ANNUAL}/notice$`));
    await expect(pat.getByRole('heading', { name: 'Notice of a meeting' })).toBeVisible();
    await expect(
      pat.getByRole('heading', { name: 'How to take part with your phone' }),
    ).toBeVisible();
    await expect(
      pat.getByRole('img', {
        name: `QR code for the meeting's page, ${BASE_URL}/meetings/${ANNUAL}`,
      }),
    ).toBeVisible();
    await shots(pat, testInfo, 'notice-print');

    // A member can't print it
    const alice = await personPage(browser, PEOPLE.alice, PHONE);
    await alice.goto(`/meetings/${ANNUAL}/notice`);
    // The notice page is outside the app's layout: its refusal is the page's one paragraph
    await expect(
      alice
        .getByRole('paragraph')
        .filter({ hasText: "The meeting's notice is printed by a secretary." }),
    ).toBeVisible();
  } finally {
    const opened = browser.contexts().filter((context) => !before.has(context));
    await Promise.all(opened.map((context) => context.close()));
  }
});
