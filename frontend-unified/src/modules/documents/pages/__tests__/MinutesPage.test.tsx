import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MinutesRecord } from '../../../../api/client';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  regenerate: vi.fn(),
}));
vi.mock('../../../../api/client', async (importOriginal) => ({
  HttpError: (await importOriginal<typeof import('../../../../api/client')>()).HttpError,
  minutes: api,
}));
const org = vi.hoisted(() => ({ isSecretary: true }));
vi.mock('../../../../context/OrganizationContext', () => ({
  useCan: () => org.isSecretary,
  useSelectRecordOrganization: () => {},
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));
const download = vi.hoisted(() => ({ downloadText: vi.fn() }));
vi.mock('../../../../utils/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/download')>()),
  downloadText: download.downloadText,
}));

const { HttpError } = await import('../../../../api/client');
const { default: MinutesPage, AUTOSAVE_MS } = await import('../MinutesPage');
const { default: MinutesPrintPage } = await import('../MinutesPrintPage');

const BODY =
  '# Maple Grove HOA\n\nThe pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.';

// The server's answers when minutes can't be changed as asked (backend-node's minutes routes)
const BEFORE_MEETING = 'These minutes are before a meeting; corrections are made there';
const APPROVED = 'Approved minutes are the record and cannot be changed';
const ONLY_DRAFTS = 'Only a draft can be written again from the meeting';
const NO_RECORD = 'The meeting has no record to write the minutes from';

function record(overrides: Partial<MinutesRecord> = {}): MinutesRecord {
  return {
    id: 'm1',
    organizationId: 'org-1',
    packetId: 'p1',
    status: 'draft',
    body: BODY,
    generatedAt: '2026-10-21T02:00:00.000Z',
    updatedAt: '2026-10-21T02:00:00.000Z',
    publishedAt: null,
    approvedAt: null,
    corrections: null,
    packet: {
      id: 'p1',
      robbieCode: 'MAPLE1',
      title: '2026 Annual Meeting',
      scheduledFor: '2026-10-21T00:00:00.000Z',
      location: 'Maple Grove Clubhouse',
    },
    organization: { id: 'org-1', name: 'Maple Grove HOA', timeZone: 'America/Chicago' },
    updatedBy: null,
    publishedBy: null,
    approvedAtPacket: null,
    ...overrides,
  };
}

function renderAt(path = '/minutes/m1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/minutes/:minutesId" element={<MinutesPage />} />
        <Route path="/minutes/:minutesId/print" element={<MinutesPrintPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const heading = () =>
  screen.findByRole('heading', { level: 2, name: 'Minutes of the 2026 Annual Meeting' });
const preview = () => within(screen.getByRole('region', { name: 'Preview' }));
const textarea = () => screen.getByLabelText('Minutes text') as HTMLTextAreaElement;

/** Type, then let the autosave run (under fake timers) */
async function typeAndWait(text: string) {
  fireEvent.change(textarea(), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
  });
  await act(async () => {});
}

describe('MinutesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.isSecretary = true;
    api.get.mockResolvedValue(record());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a draft beside its preview, and saves two seconds after typing stops', async () => {
    api.save.mockImplementation(async (_id: string, body: string) =>
      record({ body, updatedBy: { id: 1, name: 'Pat Lindqvist' } }),
    );
    renderAt();
    await heading();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText(/^Tue, Oct 20, 2026, 7:00\sPM, Maple Grove Clubhouse$/)).toBeTruthy();
    expect(
      preview().getByText(
        'The pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.',
      ),
    ).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.change(textarea(), {
      target: { value: '# Maple Grove HOA\n\nFixed a name.' },
    });
    expect(screen.getByText('Not saved yet')).toBeTruthy();
    expect(preview().getByText('Fixed a name.')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 100);
    });
    expect(api.save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith('m1', '# Maple Grove HOA\n\nFixed a name.');
    expect(screen.getByText('Saved by Pat Lindqvist')).toBeTruthy();
  });

  it('saves what was typed when the page is left before the autosave', async () => {
    api.save.mockResolvedValue(record({ body: 'Left in a hurry' }));
    const view = renderAt();
    await heading();
    vi.useFakeTimers();
    fireEvent.change(textarea(), { target: { value: 'Left in a hurry' } });
    view.unmount();
    expect(api.save).toHaveBeenCalledWith('m1', 'Left in a hurry');
  });

  it('says why a save was refused, keeps the text and stops saving', async () => {
    api.get.mockResolvedValue(record({ status: 'published' }));
    api.save.mockRejectedValue(new HttpError(BEFORE_MEETING, 409));
    renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('Changed while the meeting has them');

    expect(screen.getByRole('alert').textContent).toContain(`${BEFORE_MEETING}.`);
    expect(screen.queryByText(/keep typing to try again/)).toBeNull();
    expect(textarea().readOnly).toBe(true);
    expect(textarea().value).toBe('Changed while the meeting has them');
    // No more saves from the editor
    fireEvent.change(textarea(), { target: { value: 'More' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
    });
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it('turns to the record when the minutes were approved while they were being edited', async () => {
    api.get.mockResolvedValueOnce(record({ status: 'published' }));
    api.get.mockResolvedValueOnce(
      record({
        status: 'approved',
        approvedAtPacket: { id: 'p2', title: '2027 Annual Meeting', scheduledFor: null },
      }),
    );
    api.save.mockRejectedValue(new HttpError(APPROVED, 409));
    renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('Too late');
    await act(async () => {});

    expect(screen.getByRole('alert').textContent).toContain(`${APPROVED}.`);
    expect(screen.queryByLabelText('Minutes text')).toBeNull();
    expect(screen.getByText('Approved at the 2027 Annual Meeting, as read.')).toBeTruthy();
  });

  it("keeps the plan's message for a save that didn't reach the server", async () => {
    api.save.mockRejectedValue(new Error('Failed to fetch'));
    renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('Offline');
    expect(
      screen.getByText("Couldn't save. Your text is still here; keep typing to try again."),
    ).toBeTruthy();
    expect(textarea().readOnly).toBe(false);
  });

  it('publishes a draft, saving the last changes first', async () => {
    api.save.mockResolvedValue(record({ body: 'Edited' }));
    api.publish.mockResolvedValue(
      record({ body: 'Edited', status: 'published', publishedBy: { id: 1, name: 'Pat' } }),
    );
    renderAt();
    await heading();
    fireEvent.change(textarea(), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Published')).toBeTruthy();
    expect(api.save).toHaveBeenCalledWith('m1', 'Edited');
    expect(api.save.mock.invocationCallOrder[0]).toBeLessThan(
      api.publish.mock.invocationCallOrder[0],
    );
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Print or save as PDF' }).getAttribute('href')).toBe(
      '/minutes/m1/print?print=1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
    expect(download.downloadText).toHaveBeenCalledWith('2026-annual-meeting-minutes.md', 'Edited');
  });

  it("doesn't publish when the last changes couldn't be saved, and says so", async () => {
    api.save.mockRejectedValue(new Error('Failed to fetch'));
    renderAt();
    await heading();
    fireEvent.change(textarea(), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await vi.waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith(
        'error',
        "Couldn't publish: the last changes weren't saved",
      ),
    );
    expect(api.publish).not.toHaveBeenCalled();
  });

  it('writes a draft again from the meeting, after asking', async () => {
    api.regenerate.mockResolvedValue(record({ body: '# Maple Grove HOA\n\nWritten again.' }));
    renderAt();
    await heading();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate from the meeting' }));
    expect(api.regenerate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Write them again' }));

    expect(await preview().findByText('Written again.')).toBeTruthy();
    expect(textarea().value).toBe('# Maple Grove HOA\n\nWritten again.');
  });

  it.each([NO_RECORD, ONLY_DRAFTS])(
    'says why the minutes could not be written again: %s',
    async (message) => {
      api.regenerate.mockRejectedValue(new HttpError(message, 409));
      renderAt();
      await heading();
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate from the meeting' }));
      fireEvent.click(screen.getByRole('button', { name: 'Write them again' }));

      await vi.waitFor(() => expect(toast.showToast).toHaveBeenCalledWith('error', message));
      // The text is as it was
      expect(textarea().value).toBe(BODY);
    },
  );

  it('lets a member read published minutes and take them away, without editing', async () => {
    org.isSecretary = false;
    api.get.mockResolvedValue(record({ status: 'published' }));
    renderAt();
    await heading();
    expect(screen.queryByLabelText('Minutes text')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(
      screen.getByText(
        'The pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
    expect(download.downloadText).toHaveBeenCalledWith('2026-annual-meeting-minutes.md', BODY);
  });

  it('says where approved minutes were approved, and the corrections, and keeps them as they are', async () => {
    api.get.mockResolvedValue(
      record({
        status: 'approved',
        corrections: 'Twenty-two members were present',
        approvedAtPacket: { id: 'p2', title: '2027 Annual Meeting', scheduledFor: null },
      }),
    );
    renderAt();
    await heading();
    expect(
      screen.getByText(
        'Approved at the 2027 Annual Meeting with corrections: Twenty-two members were present',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Minutes text')).toBeNull();
  });

  it("says when the minutes aren't there, as a draft is for a member", async () => {
    org.isSecretary = false;
    api.get.mockRejectedValue(new HttpError('Not found', 404));
    renderAt();
    expect(await screen.findByText("These minutes aren't available.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All minutes' }).getAttribute('href')).toBe('/minutes');
  });

  it("says when the minutes couldn't be loaded", async () => {
    api.get.mockRejectedValue(new Error('Failed to fetch'));
    renderAt();
    expect(await screen.findByText("Couldn't load the minutes.")).toBeTruthy();
  });
});

describe('MinutesPrintPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(record({ status: 'published' }));
    vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  it('prints the minutes with the organization in the running header', async () => {
    renderAt('/minutes/m1/print?print=1');
    expect(
      await screen.findByText(
        'The pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.',
      ),
    ).toBeTruthy();
    expect(document.querySelector('.print-running-header')?.textContent).toBe(
      'Maple Grove HOA | Minutes of the 2026 Annual Meeting',
    );
    expect(document.title).toBe('Minutes of the 2026 Annual Meeting');
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
