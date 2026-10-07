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
// The page's note when a meeting has the minutes before it
const BEFORE_MEETING_NOTE =
  'These minutes are before a meeting for approval. Any corrections are made by the meeting when it approves them.';

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
    beforeMeeting: false,
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

/** A promise settled by the test */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    await act(async () => {});
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith('m1', 'Left in a hurry');
  });

  it('sends one save at a time, so an older save never lands after a newer one', async () => {
    // The first save is slow and fails; the text typed meanwhile is saved after it, not beside it
    const first = deferred<MinutesRecord>();
    api.save.mockImplementationOnce(() => first.promise);
    api.save.mockImplementation(async (_id: string, body: string) => record({ body }));
    renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('First');
    expect(api.save).toHaveBeenCalledTimes(1);
    await typeAndWait('Second');
    // Waiting for the first
    expect(api.save).toHaveBeenCalledTimes(1);

    await act(async () => first.reject(new HttpError('Bad gateway', 502)));
    await act(async () => {});
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenLastCalledWith('m1', 'Second');
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('saves again when the text changed while a save was out', async () => {
    const first = deferred<MinutesRecord>();
    api.save.mockImplementationOnce(() => first.promise);
    api.save.mockImplementation(async (_id: string, body: string) => record({ body }));
    renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('First');
    // Typed while the first save is out: saved as soon as the first is back, not left unsaved
    fireEvent.change(textarea(), { target: { value: 'Second' } });
    await act(async () => first.resolve(record({ body: 'First' })));
    await act(async () => {});
    expect(api.save.mock.calls.map(([, body]) => body)).toEqual(['First', 'Second']);
    expect(screen.getByText('Saved')).toBeTruthy();
    // Its own timer finds nothing more to send
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    expect(api.save).toHaveBeenCalledTimes(2);
  });

  it('saves on the way out when the last save failed', async () => {
    api.save.mockRejectedValueOnce(new Error('Failed to fetch'));
    api.save.mockResolvedValue(record({ body: 'Unlucky' }));
    const view = renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('Unlucky');
    expect(screen.getAllByText(/^Couldn't save\./).length).toBeGreaterThan(0);
    view.unmount();
    await act(async () => {});
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save).toHaveBeenLastCalledWith('m1', 'Unlucky');
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

  it('opens published minutes read-only when a meeting is about to approve them', async () => {
    api.get.mockResolvedValue(record({ status: 'published', beforeMeeting: true }));
    renderAt();
    await heading();
    expect(screen.getByText(BEFORE_MEETING_NOTE)).toBeTruthy();
    // Read, not edited: no editor to type in and nothing saved
    expect(screen.queryByLabelText('Minutes text')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByText(
        'The pool motion carried, on devices 12 to 3 and in the room 9 to 2: 21 to 5.',
      ),
    ).toBeTruthy();
    // They can still be printed for the meeting
    expect(screen.getByRole('link', { name: 'Print or save as PDF' })).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('tells a member reading them that a meeting is about to approve them', async () => {
    org.isSecretary = false;
    api.get.mockResolvedValue(record({ status: 'published', beforeMeeting: true }));
    renderAt();
    await heading();
    expect(screen.getByText(BEFORE_MEETING_NOTE)).toBeTruthy();
  });

  it('keeps the text typed when a meeting takes the minutes up during the edit', async () => {
    api.get.mockResolvedValueOnce(record({ status: 'published' }));
    api.get.mockResolvedValueOnce(record({ status: 'published', beforeMeeting: true }));
    api.save.mockRejectedValue(new HttpError(BEFORE_MEETING, 409));
    renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('Changed as the meeting opened');
    await act(async () => {});

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText(BEFORE_MEETING_NOTE)).toBeTruthy();
    expect(textarea().readOnly).toBe(true);
    expect(textarea().value).toBe('Changed as the meeting opened');
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

  it('publishes after the save that is out, with the text typed since', async () => {
    const first = deferred<MinutesRecord>();
    api.save.mockImplementationOnce(() => first.promise);
    api.save.mockImplementation(async (_id: string, body: string) => record({ body }));
    api.publish.mockImplementation(async () =>
      record({ body: 'Second', status: 'published', publishedBy: { id: 1, name: 'Pat' } }),
    );
    renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('First');
    // Typed, and Publish pressed before its autosave
    fireEvent.change(textarea(), { target: { value: 'Second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await act(async () => {});
    expect(api.publish).not.toHaveBeenCalled();
    expect(api.save).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(record({ body: 'First' })));
    await act(async () => {});
    expect(api.save.mock.calls.map(([, body]) => body)).toEqual(['First', 'Second']);
    expect(api.publish).toHaveBeenCalledTimes(1);
    expect(api.save.mock.invocationCallOrder[1]).toBeLessThan(
      api.publish.mock.invocationCallOrder[0],
    );
  });

  it('writes the minutes again only after the save that is out, dropping the edits pending', async () => {
    const first = deferred<MinutesRecord>();
    api.save.mockImplementationOnce(() => first.promise);
    api.regenerate.mockResolvedValue(record({ body: '# Maple Grove HOA\n\nWritten again.' }));
    renderAt();
    await heading();
    vi.useFakeTimers();
    await typeAndWait('First');
    fireEvent.change(textarea(), { target: { value: 'Second, to be dropped' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate from the meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write them again' }));
    await act(async () => {});
    expect(api.regenerate).not.toHaveBeenCalled();

    await act(async () => first.resolve(record({ body: 'First' })));
    await act(async () => {});
    expect(api.regenerate).toHaveBeenCalledTimes(1);
    expect(textarea().value).toBe('# Maple Grove HOA\n\nWritten again.');
    // The edit pending when it was confirmed is never sent, then or later
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
    });
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('keeps the edits, and saves them, when the minutes could not be written again', async () => {
    api.save.mockImplementation(async (_id: string, body: string) => record({ body }));
    api.regenerate.mockRejectedValue(new Error('Failed to fetch'));
    renderAt();
    await heading();
    fireEvent.change(textarea(), { target: { value: 'Kept' } });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate from the meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write them again' }));

    await vi.waitFor(() => expect(api.save).toHaveBeenCalledWith('m1', 'Kept'));
    expect(textarea().value).toBe('Kept');
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
