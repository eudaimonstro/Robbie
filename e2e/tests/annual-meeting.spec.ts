import {
  test,
  expect,
  type BrowserContextOptions,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { resetDemo } from '../demo';
import { BASE_URL } from '../env';
import { PEOPLE, PHONE, capture, personPage, visibleStamp } from '../helpers';

/**
 * The roadmap's acceptance scenario (docs/mvp-roadmap.md, steps 5 to 14) on the demo's 2026
 * Annual Meeting: Dana chairs from a laptop, the TV shows the display, Alice and Ben take part on
 * phones, Carmen and 25 homeowners without phones are counted in the room, and afterward Pat has
 * the minutes and version 2 of the bylaws.
 */

const CODE = 'MAPLE1';
const CLUBHOUSE = 'Maple Grove Clubhouse, 400 Maple Grove Drive';
const POOL_HOUSE = 'Maple Grove Pool House';
const BYLAWS = 'Bylaws of Maple Grove Homeowners Association';
const LOWER_QUORUM =
  'The presence, in person or by proxy, of members holding fifteen percent (15%) of the votes of the Association constitutes a quorum at any meeting of the members.';

// The test runs the demo's own meeting, so it starts from a fresh demo (a retry too) and leaves
// a fresh one for the specs that follow
test.beforeAll(async () => {
  test.setTimeout(120_000);
  await resetDemo();
});
test.afterAll(async () => {
  test.setTimeout(120_000);
  await resetDemo();
});

/** A phone's screen as the person sees it, scrolled to this part (a full-page capture of a phone
 * leaves the page below its height blank) */
async function phoneShot(page: Page, testInfo: TestInfo, name: string, at: Locator) {
  await at.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

interface PacketJson {
  organizationId: string;
  agendaItems: Array<{ id: string; title: string }>;
}

test('the annual meeting runs from the call to order to published minutes and new bylaws', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const before = new Set(browser.contexts());
  const open = (email: string, options: BrowserContextOptions = {}) =>
    personPage(browser, email, options);

  try {
    // Before the meeting, the clubhouse is booked: Pat moves the meeting to the pool house from
    // Live Meetings (Change, before the call to order)
    const pat = await open(PEOPLE.pat, { viewport: { width: 1280, height: 900 } });
    await pat.goto('/meetings');
    await pat.getByRole('button', { name: 'Change 2026 Annual Meeting' }).click();
    await expect(pat.getByRole('heading', { name: 'Change the meeting' })).toBeFocused();
    await expect(pat.getByLabel('Place')).toHaveValue(CLUBHOUSE);
    await pat.getByLabel('Place').fill(POOL_HOUSE);
    await pat.getByRole('button', { name: 'Next: the agenda' }).click();
    await expect(
      pat.getByRole('status').filter({ hasText: 'The details are saved.' }),
    ).toBeVisible();
    await pat.getByRole('button', { name: 'Done' }).click();
    await expect(
      pat.getByRole('status').filter({ hasText: '2026 Annual Meeting is changed.' }),
    ).toBeVisible();

    // Pat also attaches a document to the treasurer's report under a name of its own. The screen
    // links a document under its title, so this goes through the API (POST
    // /api/attachments/link-document, secretary and above), which takes a display name.
    const packet: PacketJson = await (await pat.request.get(`/api/packets/${CODE}`)).json();
    const treasurer = packet.agendaItems.find(
      (item) => item.title === "Treasurer's report and the 2027 budget",
    );
    const documents: Array<{ id: string; title: string }> = await (
      await pat.request.get(`/api/organizations/${packet.organizationId}/documents`)
    ).json();
    const bylaws = documents.find((document) => document.title === BYLAWS);
    expect(treasurer && bylaws, 'the demo has the item and the bylaws').toBeTruthy();
    const linked = await pat.request.post('/api/attachments/link-document', {
      data: {
        documentId: bylaws!.id,
        agendaItemId: treasurer!.id,
        displayName: 'Assessments in the bylaws',
      },
    });
    expect(linked.ok(), "link a document to the treasurer's report").toBe(true);

    // The board proposed its amendment to Section 4.2 ahead of the meeting (the demo has it
    // proposed), so a member can move it as drafted
    const drafts: Array<{ id: string; title: string; status: string }> = await (
      await pat.request.get(`/api/documents/${bylaws!.id}/amendments`)
    ).json();
    const lowerQuorum = drafts.find((amendment) => amendment.title === 'Lower the quorum to 15%');
    expect(lowerQuorum?.status, "the demo's proposed amendment").toBe('proposed');

    // The TV shows the display (Morgan, a viewer, is signed in on it)
    const tv = await open(PEOPLE.morgan, { viewport: { width: 1920, height: 1080 } });
    await tv.goto(`/meetings/${CODE}/display`);
    await expect(tv.getByText(CODE, { exact: true })).toBeVisible();
    await expect(tv.getByRole('img', { name: 'Scan to join' })).toBeVisible();

    // Dana opens the console; Alice and Ben follow the link on their phones
    const dana = await open(PEOPLE.dana, { viewport: { width: 1440, height: 1000 } });
    await dana.goto(`/meetings/${CODE}`);
    await expect(dana.getByRole('heading', { name: '2026 Annual Meeting' })).toBeVisible();
    const alice = await open(PEOPLE.alice, PHONE);
    const ben = await open(PEOPLE.ben, PHONE);
    for (const phone of [alice, ben]) {
      await phone.goto(`/meetings/${CODE}`);
      await expect(phone.getByText('The meeting has not been called to order yet.')).toBeVisible();
    }

    // Quorum: Dana, Alice and Ben on devices, Carmen marked present, 25 counted in the room:
    // 29 of 142 lots, and 20% of 142 is 29 (attendance/HeadcountForm.tsx, utils/attendance.ts)
    await dana.getByRole('button', { name: 'Mark Carmen Diaz present' }).click();
    await expect(dana.getByRole('button', { name: 'Mark Carmen Diaz absent' })).toBeEnabled();
    await dana.getByLabel('Headcount').fill('25');
    await dana.getByRole('button', { name: 'Save the headcount' }).click();
    await expect(dana.getByText('29 present of 142, quorum 29, met')).toBeVisible();
    await expect(tv.getByText('Quorum met')).toBeVisible();

    // Called to order (which completes the "Call to order" item); the agenda is adopted
    await dana.getByRole('button', { name: 'Call to order', exact: true }).click();
    await dana.getByRole('button', { name: 'Adopt the agenda' }).click();
    await expect(dana.getByRole('button', { name: 'Adopt the agenda' })).toHaveCount(0);

    // The 2025 minutes, approved as read (console/MinutesApprovalCard.tsx, phone/MinutesNotice.tsx)
    await callNext(dana, 'Approval of the minutes of the 2025 annual meeting');
    const approval = dana.getByRole('region', { name: 'Approval of the minutes' });
    await expect(approval.getByText('Minutes of the 2025 Annual Meeting').first()).toBeVisible();
    await expect(tv.getByText('Any corrections?')).toBeVisible();
    await expect(
      alice.getByRole('region', { name: 'Approval of the minutes' }).getByText('Any corrections?'),
    ).toBeVisible();
    await approval.getByRole('button', { name: 'Approve as read' }).click();
    await expect(approval.getByText('Minutes approved')).toBeVisible();
    await expect(tv.getByText('Approved as read')).toBeVisible();
    await expect(alice.getByText('Approved as read')).toBeVisible();

    // The treasurer's report: the attachment opens from the console in a new tab
    await callNext(dana, "Treasurer's report and the 2027 budget");
    const [attachment] = await Promise.all([
      dana.context().waitForEvent('page'),
      dana.getByRole('link', { name: 'Assessments in the bylaws' }).click(),
    ]);
    await expect(attachment).toHaveURL(/\/documents\//);
    await expect(attachment.getByRole('heading', { name: BYLAWS })).toBeVisible();
    await attachment.close();

    // Old business: Alice moves the pool contract, Ben seconds, both speak, and it carries
    await callNext(dana, 'Old business: pool resurfacing contract');
    await alice
      .getByLabel('Motion text')
      .fill('I move that we approve the pool resurfacing contract');
    await alice.getByRole('button', { name: 'Move', exact: true }).click();
    await ben.getByRole('button', { name: 'Second', exact: true }).click();
    await expect(dana.getByText('Moved by Alice Brennan, seconded by Ben Whitaker')).toBeVisible();
    // Both ask to speak; the display shows the queue (phone/DebateBlock.tsx,
    // chair/SpeakerQueuePanel.tsx)
    for (const phone of [ben, alice]) {
      await phone
        .getByRole('group', { name: 'Your position' })
        .getByRole('button', { name: 'For', exact: true })
        .click();
      await phone.getByRole('button', { name: 'Ask to speak' }).click();
    }
    // The display's speaker rail (DisplayView's SpeakerRail): "Speaking time" under the speaker
    // would also match a loose 'Speaking', so look at the names
    const speakers = tv.getByRole('complementary', { name: 'Speakers' });
    await expect(speakers.getByText('Waiting', { exact: true })).toBeVisible();
    await expect(speakers.getByRole('listitem')).toHaveText([/^Alice Brennan/, /^Ben Whitaker/]);
    // The mover speaks first, though Ben asked first (the server refuses anyone else)
    for (const [name, phone] of [
      ['Alice Brennan', alice],
      ['Ben Whitaker', ben],
    ] as const) {
      await dana.getByRole('button', { name: `Recognize ${name} to speak` }).click();
      await expect(phone.getByRole('region', { name: 'You have the floor' })).toBeVisible();
      await expect(speakers.getByText(name, { exact: true })).toBeVisible();
      await expect(speakers.getByRole('listitem').filter({ hasText: name })).toHaveCount(0);
      await phone.getByRole('button', { name: 'Yield the floor' }).click();
    }
    await voteOn(dana, [alice, ben], { yea: 20, nay: 3 });
    const pool = visibleStamp(tv, 'Carried');
    await expect(pool.word).toBeVisible();
    await expect(
      pool.caption.getByText('On devices 2 to 0, in the room 20 to 3: 22 to 3', { exact: true }),
    ).toBeVisible();

    // New business: Alice moves the proposed amendment to Section 4.2 from her phone, as the
    // board drafted it (phone/MotionPanel.tsx, BylawAmendmentForm.tsx; the console's floor
    // motion leaves out bylaw amendments)
    await callNext(dana, 'New business: amend Section 4.2 to lower the quorum to 15%');
    await alice.locator('summary', { hasText: 'Other motions' }).click();
    await alice.getByRole('radio', { name: /^Amend the bylaws/ }).check();
    await alice
      .getByRole('group', { name: 'Other motions' })
      .getByRole('button', { name: 'Move' })
      .click();
    const form = alice.getByRole('form', { name: 'Amend the bylaws' });
    await expect(form.getByLabel('Document')).toHaveValue(bylaws!.id);
    await form
      .getByRole('group', { name: 'Proposed amendments' })
      .getByRole('radio', { name: /Lower the quorum to 15%/ })
      .check();
    // Before moving it, Alice sees the section as it reads and as it would read
    await expect(form.getByRole('region', { name: 'The text' })).toContainText(LOWER_QUORUM);
    await expect(form.getByRole('region', { name: 'The text' })).toContainText('twenty percent');
    await phoneShot(alice, testInfo, 'bylaw-form-phone', form);
    await form.getByRole('button', { name: 'Move', exact: true }).click();
    const words =
      'I move to amend the bylaws by modifying Section 4.2 "Quorum", as proposed in "Lower the quorum to 15%"';
    await expect(dana.getByText(words).first()).toBeVisible();
    await ben.getByRole('button', { name: 'Second', exact: true }).click();
    await expect(dana.getByText('Two thirds').first()).toBeVisible();
    // Everyone sees the text they are voting on: the console and the phones as it reads now
    // and as it would read, the TV the new text
    for (const page of [dana, alice, ben, tv]) {
      await expect(page.getByRole('region', { name: 'The text' })).toContainText(LOWER_QUORUM);
    }
    await expect(dana.getByRole('region', { name: 'The text' })).toContainText('Now reads');
    // The TV fits it all on the screen, with the speaker rail up too
    await fitsTheScreen(tv);
    await ben.getByRole('button', { name: 'For', exact: true }).click();
    await ben.getByRole('button', { name: 'Ask to speak' }).click();
    await expect(tv.getByRole('complementary', { name: 'Speakers' })).toBeVisible();
    await fitsTheScreen(tv);
    await capture(dana, testInfo, 'bylaw-text-console');
    await phoneShot(
      alice,
      testInfo,
      'bylaw-text-phone',
      alice.getByRole('region', { name: 'The question' }),
    );
    await capture(tv, testInfo, 'bylaw-text-display');
    // 22 to 5 is more than two thirds (abstentions don't count)
    await voteOn(dana, [alice, ben], { yea: 20, nay: 5 }, async () => {
      await expect(tv.getByText('Voting now')).toBeVisible();
      await fitsTheScreen(tv);
    });
    const amendment = visibleStamp(tv, 'Carried');
    await expect(
      amendment.caption.getByText('On devices 2 to 0, in the room 20 to 5: 22 to 5', {
        exact: true,
      }),
    ).toBeVisible();
    await capture(dana, testInfo, 'annual-console');
    await capture(alice, testInfo, 'annual-phone');
    await capture(tv, testInfo, 'annual-display');

    // The election of two directors: one election per seat (an election elects one person)
    await callNext(dana, 'Election of two directors');
    await elect(dana, {
      position: 'Director, seat 1',
      nominator: ben,
      nominee: 'Alice Brennan',
      fromTheFloor: 'Carmen Diaz',
      voters: [alice, ben],
      inTheRoom: { 'Alice Brennan': 15, 'Carmen Diaz': 8 },
    });
    await expect(visibleStamp(tv, 'Elected').caption).toContainText(
      'Alice Brennan, Director, seat 1',
    );
    await elect(dana, {
      position: 'Director, seat 2',
      nominator: alice,
      nominee: 'Ben Whitaker',
      fromTheFloor: 'Carmen Diaz',
      voters: [alice, ben],
      inTheRoom: { 'Ben Whitaker': 14, 'Carmen Diaz': 9 },
    });
    await expect(visibleStamp(tv, 'Elected').caption).toContainText(
      'Ben Whitaker, Director, seat 2',
    );

    // Dana adjourns at the last item
    await callNext(dana, 'Adjournment');
    await dana
      .getByRole('toolbar', { name: "The chair's actions" })
      .getByRole('button', { name: 'Adjourn', exact: true })
      .click();
    const adjourn = dana.getByRole('dialog', { name: 'Adjourn the meeting?' });
    await adjourn.getByRole('button', { name: 'Adjourn', exact: true }).click();
    await expect(dana.getByText(/^Adjourned at /)).toBeVisible();
    await expect(tv.getByText(/^Adjourned at /)).toBeVisible();
    await expect(alice.getByText(/^The meeting was adjourned at /)).toBeVisible();

    // After: the bylaws are version 2 with the new quorum (applied a moment after the vote
    // closed; documentPage/DocumentHeader.tsx lists versions in an unlabeled select)
    await pat.goto('/');
    await pat.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: BYLAWS }).click();
    await expect(async () => {
      await pat.reload();
      await expect(pat.locator('option', { hasText: 'Version 2 (Current)' })).toHaveCount(1, {
        timeout: 2_000,
      });
    }).toPass({ timeout: 30_000 });
    await expect(pat.getByText(/fifteen percent \(15%\)/).first()).toBeVisible();
    // The board's amendment is the one adopted: passed, with no second one beside it
    const after: Array<{ id: string; status: string }> = await (
      await pat.request.get(`/api/documents/${bylaws!.id}/amendments`)
    ).json();
    expect(after.find((amendment) => amendment.id === lowerQuorum!.id)?.status).toBe('passed');
    expect(after).toHaveLength(drafts.length);

    // Pat opens the drafted minutes, sees last year's approved, fixes a name and publishes
    // this year's
    const draft = pat.getByRole('link', { name: /2026 Annual Meeting/ }).first();
    await expect(async () => {
      await pat.goto('/minutes');
      await expect(draft).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(draft).toContainText('Draft');
    await expect(pat.getByRole('link', { name: /2025 Annual Meeting/ })).toContainText('Approved');
    await draft.click();
    const minutes = pat.getByRole('region', { name: 'Preview' });
    // The minutes give the place as Pat changed it
    await expect(minutes).toContainText(`at ${POOL_HOUSE}`);
    await expect(minutes).not.toContainText(`at ${CLUBHOUSE}`);
    await expect(minutes).toContainText('Section 4.2');
    await expect(minutes).toContainText('As adopted, Section 4.2 "Quorum" reads:');
    await expect(minutes).toContainText(LOWER_QUORUM);
    await expect(minutes).toContainText('Director, seat 1');
    await expect(minutes).toContainText('Director, seat 2');
    // Ben goes by Benjamin in the record. Publish saves the text as typed first, without waiting
    // for the autosave (MinutesPage.tsx)
    const text = pat.getByLabel('Minutes text');
    const generated = await text.inputValue();
    expect(generated).toContain('Ben Whitaker');
    await text.fill(generated.replaceAll('Ben Whitaker', 'Benjamin Whitaker'));
    await pat.getByRole('button', { name: 'Publish' }).click();
    const heading = pat.getByRole('heading', { name: /^Minutes of the 2026 Annual Meeting/ });
    await expect(heading.locator('..').getByText('Published', { exact: true })).toBeVisible();
    await pat.reload();
    await expect(minutes).toContainText('Benjamin Whitaker');
    await expect(minutes).not.toContainText('Ben Whitaker');

    // A member reads them as published
    await alice.goto('/minutes');
    await alice
      .getByRole('link', { name: /2026 Annual Meeting/ })
      .first()
      .click();
    await expect(
      alice
        .getByRole('heading', { name: /^Minutes of the 2026 Annual Meeting/ })
        .locator('..')
        .getByText('Published', { exact: true }),
    ).toBeVisible();
    await expect(alice.getByRole('article')).toContainText('Benjamin Whitaker');
    await expect(alice.getByRole('article')).not.toContainText('Ben Whitaker');

    // The bylaws' public share link shows version 2 to someone signed out
    // (documents/components/ShareModal.tsx; its link field has no label)
    await pat.goto('/');
    await pat.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: BYLAWS }).click();
    await pat.getByRole('button', { name: 'Share' }).click();
    const share = pat.getByRole('dialog', { name: 'Share Document' });
    await share.getByRole('button', { name: 'Enable Sharing' }).click();
    await expect(share.getByText('Sharing Enabled')).toBeVisible();
    const link = await share.getByRole('textbox').inputValue();
    expect(link).toMatch(/\/share\/[^/]+$/);
    const reader = await (await browser.newContext({ baseURL: BASE_URL })).newPage();
    await reader.goto(new URL(link).pathname);
    await expect(reader.getByText('You are viewing a shared document (read-only)')).toBeVisible();
    await expect(reader.getByRole('heading', { name: BYLAWS })).toBeVisible();
    await expect(reader.locator('option', { hasText: 'Version 2 (Current)' })).toHaveCount(1);
    await expect(reader.getByText(/fifteen percent \(15%\)/).first()).toBeVisible();
  } finally {
    const opened = browser.contexts().filter((context) => !before.has(context));
    await Promise.all(opened.map((context) => context.close()));
  }
});

/**
 * Move to the next agenda item from the console's toolbar (utils/chairActions.ts): the item under
 * way is completed first, unless the meeting's business already completed it
 */
async function callNext(dana: Page, title: string): Promise<void> {
  const toolbar = dana.getByRole('toolbar', { name: "The chair's actions" });
  const call = toolbar.getByRole('button', { name: `Call the next item: ${title}`, exact: true });
  const complete = toolbar.getByRole('button', { name: 'Complete the item', exact: true });
  await expect(call.or(complete)).toBeVisible();
  if (await complete.isVisible()) await complete.click();
  await call.click();
  await expect(complete).toBeVisible();
}

/** Put the pending question to a vote: every phone votes yea, then the room's show of hands */
async function voteOn(
  dana: Page,
  phones: Page[],
  room: { yea: number; nay: number },
  whileOpen?: () => Promise<void>,
): Promise<void> {
  await dana.getByRole('button', { name: 'Open the vote' }).click();
  for (const phone of phones) await phone.getByRole('button', { name: 'Vote yea' }).click();
  await expect(dana.getByText(`${phones.length} voted on devices`)).toBeVisible();
  await dana.getByLabel('Yea in the room').fill(String(room.yea));
  await dana.getByLabel('Nay in the room').fill(String(room.nay));
  await dana.getByLabel('Abstain in the room').fill('0');
  await dana.getByRole('button', { name: 'Enter the count' }).click();
  await expect(
    dana.getByText(`Together: ${phones.length + room.yea} to ${room.nay}`),
  ).toBeVisible();
  await whileOpen?.();
  await dana.getByRole('button', { name: 'Close the vote' }).click();
}

/** The display shows everything within the TV's 1080 lines: nothing on it scrolls */
async function fitsTheScreen(tv: Page): Promise<void> {
  const height = await tv.evaluate(() => document.documentElement.scrollHeight);
  expect(height, 'the display fits the screen').toBeLessThanOrEqual(1080);
}

/**
 * One election (NominationsPanel.tsx, ElectionPanel.tsx, console/ElectionCard.tsx): nominations
 * from a phone and from the floor, ballots on the phones and paper ballots counted in the room,
 * and the winner declared
 */
async function elect(
  dana: Page,
  election: {
    position: string;
    nominator: Page;
    nominee: string;
    fromTheFloor: string;
    voters: Page[];
    inTheRoom: Record<string, number>;
  },
): Promise<void> {
  const { position, nominator, nominee, fromTheFloor, voters, inTheRoom } = election;
  await dana.getByLabel('Open nominations for').fill(position);
  await dana.getByRole('button', { name: 'Open nominations' }).click();
  await expect(dana.getByRole('heading', { name: `Election for ${position}` })).toBeVisible();

  const fromPhone = nominator.getByRole('form', { name: 'Nominate' });
  await fromPhone.getByLabel('Nominee').selectOption({ label: nominee });
  await fromPhone.getByRole('button', { name: 'Nominate' }).click();
  const floor = dana.getByRole('form', { name: 'Nominate from the floor' });
  await floor.getByLabel('Nominee').selectOption({ label: fromTheFloor });
  await floor.getByRole('button', { name: 'Nominate from the floor' }).click();
  // The console lists this seat's nominations only (the meeting log, hidden, has them as well)
  const nominations = dana.getByRole('list', { name: 'Nominations' }).getByRole('listitem');
  await expect(nominations).toHaveCount(2);
  await expect(nominations.filter({ hasText: nominee })).toContainText('Nominated by');
  await expect(nominations.filter({ hasText: fromTheFloor })).toContainText(
    'Nominated from the floor',
  );

  await dana.getByRole('button', { name: 'Close nominations' }).click();
  await dana.getByRole('button', { name: 'Open the ballot' }).click();
  for (const voter of voters) {
    await voter
      .getByRole('group', { name: 'Your ballot' })
      .getByRole('button', { name: `Vote for ${nominee}` })
      .click();
    await expect(voter.getByText('Ballot recorded')).toBeVisible();
  }
  await expect(dana.getByText(`${voters.length} ballots received on devices`)).toBeVisible();
  for (const [name, count] of Object.entries(inTheRoom)) {
    await dana.getByLabel(`${name} in the room`).fill(String(count));
  }
  await dana.getByRole('button', { name: 'Enter the paper ballots' }).click();
  await dana.getByRole('button', { name: 'Close the ballot' }).click();
  await expect(dana.getByText(`${nominee} has the vote required.`)).toBeVisible();
  await dana.getByRole('button', { name: `Declare ${nominee} elected` }).click();
}
