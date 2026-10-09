import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MeetingNotice } from '../../../api/client';

const api = vi.hoisted(() => ({ notice: vi.fn(), sendNotice: vi.fn() }));
vi.mock('../../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/client')>()),
  meetingPackets: api,
}));
vi.mock('../components/QrCode', () => ({
  QrCode: ({ label }: { label: string }) => <img alt={label} />,
}));

const { default: NoticePrintPage } = await import('../notice');
const { SendNoticeDialog, sentMessage } = await import('../components/scheduling/SendNoticeDialog');
const { HttpError } = await import('../../../api/client');

const notice: MeetingNotice = {
  code: 'MAPLE1',
  organization: 'Maple Grove HOA',
  title: '2026 Annual Meeting',
  kind: 'members',
  when: 'Tuesday, November 10, 2026, at 7:00 PM CST',
  day: 'Tuesday, November 10',
  scheduledFor: '2026-11-11T01:00:00.000Z',
  location: 'the clubhouse',
  agenda: [
    { title: 'Call to order', attachments: [] },
    { title: "Treasurer's report", attachments: ['Budget 2027.pdf'] },
  ],
  attachments: ['Bylaws'],
  link: 'https://robbie.example/meetings/MAPLE1',
  footer:
    'This is a courtesy notice. Your bylaws and state law set the official notice requirements.',
  subject: 'Meeting notice from "Maple Grove HOA": Tuesday, November 10',
  text: '"Maple Grove HOA" will hold a meeting of its members:\n\n  "2026 Annual Meeting"\n',
  recipients: 142,
  noticeSentAt: null,
  noticeSentBy: null,
  sentToday: 0,
  limit: 3,
  sendable: true,
  reason: null,
};

describe('the printed notice', () => {
  beforeEach(() => vi.clearAllMocks());

  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/meetings/:code/notice" element={<NoticePrintPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('gives the meeting, its agenda, the QR code and how to take part', async () => {
    api.notice.mockResolvedValue(notice);
    renderAt('/meetings/maple1/notice');
    expect(await screen.findByRole('heading', { name: 'Notice of a meeting' })).toBeTruthy();
    expect(api.notice).toHaveBeenCalledWith('MAPLE1');
    expect(screen.getByText('2026 Annual Meeting')).toBeTruthy();
    expect(screen.getByText('Tuesday, November 10, 2026, at 7:00 PM CST')).toBeTruthy();
    expect(screen.getByText('(attached: Budget 2027.pdf)', { exact: false })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'How to take part with your phone' })).toBeTruthy();
    expect(
      screen.getByAltText("QR code for the meeting's page, https://robbie.example/meetings/MAPLE1"),
    ).toBeTruthy();
    expect(
      screen.getByText('No phone? You still count: the chair will count you in the room.'),
    ).toBeTruthy();
    expect(screen.getByText(notice.footer)).toBeTruthy();
  });

  it("says a board meeting's members may observe", async () => {
    api.notice.mockResolvedValue({ ...notice, kind: 'board' });
    renderAt('/meetings/MAPLE1/notice');
    expect(
      await screen.findByRole('heading', {
        name: 'Notice of a meeting of the Board of Directors',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Members may attend and observe/)).toBeTruthy();
    expect(screen.queryByText(/No phone\?/)).toBeNull();
  });

  it('is for a secretary', async () => {
    api.notice.mockRejectedValue(new HttpError('Requires the secretary role', 403));
    renderAt('/meetings/MAPLE1/notice');
    expect(await screen.findByText("The meeting's notice is printed by a secretary.")).toBeTruthy();
  });
});

describe('SendNoticeDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  const open = (onSent = vi.fn()) =>
    render(
      <MemoryRouter>
        <SendNoticeDialog code="MAPLE1" isOpen onClose={vi.fn()} onSent={onSent} />
      </MemoryRouter>,
    );

  it('previews the email, then sends it and says how it went', async () => {
    api.notice.mockResolvedValue(notice);
    api.sendNotice.mockResolvedValue({ sent: 138, failed: 4, noticeSentAt: '' });
    const onSent = vi.fn();
    open(onSent);
    expect(await screen.findByText(notice.subject)).toBeTruthy();
    expect(screen.getByText(/^142 people: every member with an email/)).toBeTruthy();
    expect(screen.getByLabelText('The email').textContent).toBe(notice.text);
    expect(
      screen
        .getByRole('link', { name: 'Print the notice for posting and mailing' })
        .getAttribute('href'),
    ).toBe('/meetings/MAPLE1/notice');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(onSent).toHaveBeenCalledWith(
        "The notice was sent to 138 people. 4 emails couldn't be delivered.",
      ),
    );
    expect(api.sendNotice).toHaveBeenCalledWith('MAPLE1', false);
  });

  it('says when it was sent before, and sends it again only when asked', async () => {
    api.notice.mockResolvedValue({
      ...notice,
      noticeSentAt: '2026-10-08T15:00:00.000Z',
      noticeSentBy: 'Pat Lindqvist',
    });
    api.sendNotice.mockResolvedValue({ sent: 142, failed: 0, noticeSentAt: '' });
    open();
    expect(await screen.findByText(/^The notice was sent on .* by Pat Lindqvist\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send it again' }));
    await waitFor(() => expect(api.sendNotice).toHaveBeenCalledWith('MAPLE1', true));
  });

  it("won't send without a date, or past the day's limit", async () => {
    api.notice.mockResolvedValue({
      ...notice,
      sendable: false,
      reason: 'Set the date of the meeting before sending its notice',
    });
    const { unmount } = open();
    expect(
      await screen.findByText('Set the date of the meeting before sending its notice.'),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    unmount();

    api.notice.mockResolvedValue({ ...notice, sentToday: 3 });
    open();
    expect(await screen.findByText(/has sent 3 notices in the last day/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('words what sending came to', () => {
    expect(sentMessage(1, 0)).toBe('The notice was sent to 1 person.');
    expect(sentMessage(5, 1)).toBe(
      "The notice was sent to 5 people. 1 email couldn't be delivered.",
    );
  });
});
