import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpError } from '../../../../../api/client';
import type { MeetingPacket } from '../types';

const api = vi.hoisted(() => ({
  createAgendaItem: vi.fn(),
  updateAgendaItem: vi.fn(),
  deleteAgendaItem: vi.fn(),
  reorderAgendaItems: vi.fn(),
  uploadAttachment: vi.fn(),
  linkDocument: vi.fn(),
  deleteAttachment: vi.fn(),
  listDocuments: vi.fn(),
  getAttachmentDownloadUrl: (id: string) => `/api/attachments/${id}/download`,
}));
vi.mock('../api', () => api);

const { PacketBuilder } = await import('../PacketBuilder');

const item = (id: string, title: string, position: number) => ({
  id,
  title,
  position,
  attachments: [],
});

const budget = {
  id: 'a1',
  type: 'uploaded_file' as const,
  filename: 'budget-2027.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  displayName: 'Budget 2027',
  position: 0,
  uploadedAt: '',
};

const scheduled = (): MeetingPacket => ({
  id: 'p1',
  organizationId: 'org-1',
  robbieCode: 'MAPLE1',
  createdAt: '',
  attachments: [budget],
  agendaItems: [
    item('i1', 'Call to order', 0),
    item('i2', "Treasurer's report", 1),
    item('i3', 'Adjournment', 2),
  ],
});

/** The builder holding its packet, as the scheduler does */
function Harness({ initial }: { initial: MeetingPacket }) {
  const [packet, setPacket] = useState(initial);
  return <PacketBuilder packet={packet} onPacketUpdate={setPacket} />;
}

const titles = () =>
  screen
    .getAllByRole('textbox', { name: /^Agenda item \d+$/ })
    .map((input) => (input as HTMLInputElement).value);

describe('PacketBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.reorderAgendaItems.mockResolvedValue(undefined);
    api.deleteAgendaItem.mockResolvedValue(undefined);
    api.deleteAttachment.mockResolvedValue(undefined);
  });

  it('shows the current agenda and files', () => {
    render(<Harness initial={scheduled()} />);
    expect(titles()).toEqual(['Call to order', "Treasurer's report", 'Adjournment']);
    expect(screen.getByText('Budget 2027')).toBeTruthy();
  });

  it('adds an item at the end', async () => {
    api.createAgendaItem.mockResolvedValue(item('i4', 'Election of directors', 3));
    render(<Harness initial={scheduled()} />);
    fireEvent.change(screen.getByLabelText('New agenda item'), {
      target: { value: '  Election of directors ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(titles()).toHaveLength(4));
    expect(api.createAgendaItem).toHaveBeenCalledWith('p1', { title: 'Election of directors' });
    expect(titles()[3]).toBe('Election of directors');
  });

  it('renames an item when its title loses focus, and keeps a title emptied', async () => {
    api.updateAgendaItem.mockImplementation(async (id: string, data: { title: string }) => ({
      ...item(id, data.title, 1),
    }));
    render(<Harness initial={scheduled()} />);
    const second = screen.getByRole('textbox', { name: 'Agenda item 2' });
    fireEvent.change(second, { target: { value: "Treasurer's report and the 2027 budget" } });
    fireEvent.blur(second);
    await waitFor(() =>
      expect(api.updateAgendaItem).toHaveBeenCalledWith('i2', {
        title: "Treasurer's report and the 2027 budget",
      }),
    );

    const first = screen.getByRole('textbox', { name: 'Agenda item 1' });
    fireEvent.change(first, { target: { value: '  ' } });
    fireEvent.blur(first);
    expect((first as HTMLInputElement).value).toBe('Call to order');
    expect(api.updateAgendaItem).toHaveBeenCalledTimes(1);
  });

  it("clears an item's description, presenter and time when they are emptied", async () => {
    api.updateAgendaItem.mockImplementation(async (id: string, data: object) => ({
      ...item(id, "Treasurer's report", 1),
      ...data,
    }));
    const initial = scheduled();
    initial.agendaItems[1] = {
      ...initial.agendaItems[1],
      description: 'The 2027 budget',
      presenter: 'Ben Ortiz',
      estimatedMinutes: 15,
    };
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: "Details of Treasurer's report" }));
    const details = screen.getByRole('group', { name: "Treasurer's report" });
    for (const label of ['Description', 'Presenter', 'Time in minutes']) {
      const field = within(details).getByLabelText(label);
      fireEvent.change(field, { target: { value: '' } });
      fireEvent.blur(field);
    }
    await waitFor(() => expect(api.updateAgendaItem).toHaveBeenCalledTimes(3));
    expect(api.updateAgendaItem).toHaveBeenNthCalledWith(1, 'i2', { description: null });
    expect(api.updateAgendaItem).toHaveBeenNthCalledWith(2, 'i2', { presenter: null });
    expect(api.updateAgendaItem).toHaveBeenNthCalledWith(3, 'i2', { estimatedMinutes: null });
  });

  it('removes an item', async () => {
    render(<Harness initial={scheduled()} />);
    fireEvent.click(screen.getByRole('button', { name: "Remove Treasurer's report" }));
    await waitFor(() => expect(titles()).toEqual(['Call to order', 'Adjournment']));
    expect(api.deleteAgendaItem).toHaveBeenCalledWith('i2');
  });

  it('moves an item up and down', async () => {
    render(<Harness initial={scheduled()} />);
    expect(
      (screen.getByRole('button', { name: 'Move Call to order up' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Move Adjournment down' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: "Move Treasurer's report up" }));
    expect(titles()).toEqual(["Treasurer's report", 'Call to order', 'Adjournment']);
    await waitFor(() => expect(api.reorderAgendaItems).toHaveBeenCalledWith(['i2', 'i1', 'i3']));

    fireEvent.click(screen.getByRole('button', { name: 'Move Call to order down' }));
    expect(titles()).toEqual(["Treasurer's report", 'Adjournment', 'Call to order']);
    await waitFor(() =>
      expect(api.reorderAgendaItems).toHaveBeenLastCalledWith(['i2', 'i3', 'i1']),
    );
  });

  it("shows the server's refusal and puts the order back", async () => {
    api.reorderAgendaItems.mockRejectedValue(
      new HttpError('You need the secretary role for this', 403),
    );
    render(<Harness initial={scheduled()} />);
    fireEvent.click(screen.getByRole('button', { name: "Move Treasurer's report up" }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'You need the secretary role for this',
    );
    expect(titles()).toEqual(['Call to order', "Treasurer's report", 'Adjournment']);
  });

  /** A promise and the functions that settle it, for answering requests out of order */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('keeps a move made while a rename was being saved', async () => {
    const rename = deferred<ReturnType<typeof item>>();
    api.updateAgendaItem.mockReturnValue(rename.promise);
    render(<Harness initial={scheduled()} />);
    const second = screen.getByRole('textbox', { name: 'Agenda item 2' });
    fireEvent.change(second, { target: { value: 'The budget' } });
    fireEvent.blur(second);

    fireEvent.click(screen.getByRole('button', { name: "Move Treasurer's report up" }));
    await waitFor(() => expect(api.reorderAgendaItems).toHaveBeenCalledWith(['i2', 'i1', 'i3']));
    // The rename is answered last, with the position the item had when it was sent
    rename.resolve(item('i2', 'The budget', 1));
    await waitFor(() => expect(titles()).toEqual(['The budget', 'Call to order', 'Adjournment']));
  });

  it('keeps an item removed while its rename was being saved removed', async () => {
    const rename = deferred<ReturnType<typeof item>>();
    api.updateAgendaItem.mockReturnValue(rename.promise);
    render(<Harness initial={scheduled()} />);
    const second = screen.getByRole('textbox', { name: 'Agenda item 2' });
    fireEvent.change(second, { target: { value: 'The budget' } });
    fireEvent.blur(second);

    fireEvent.click(screen.getByRole('button', { name: "Remove Treasurer's report" }));
    await waitFor(() => expect(titles()).toEqual(['Call to order', 'Adjournment']));
    rename.resolve(item('i2', 'The budget', 1));
    await rename.promise;
    await waitFor(() => expect(api.updateAgendaItem).toHaveBeenCalledTimes(1));
    expect(titles()).toEqual(['Call to order', 'Adjournment']);
  });

  it('saves one move at a time', async () => {
    const reorder = deferred<void>();
    api.reorderAgendaItems.mockReturnValueOnce(reorder.promise);
    render(<Harness initial={scheduled()} />);
    fireEvent.click(screen.getByRole('button', { name: "Move Treasurer's report up" }));
    // Still focusable (a disabled button would drop the focus), but it waits
    const moveDown = screen.getByRole('button', { name: 'Move Call to order down' });
    expect(moveDown.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(moveDown);
    expect(api.reorderAgendaItems).toHaveBeenCalledTimes(1);

    reorder.resolve();
    await waitFor(() => expect(moveDown.getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(moveDown);
    await waitFor(() =>
      expect(api.reorderAgendaItems).toHaveBeenLastCalledWith(['i2', 'i3', 'i1']),
    );
  });

  it('keeps the focus on the moved item, and says where it is now', async () => {
    render(<Harness initial={scheduled()} />);
    const down = screen.getByRole('button', { name: 'Move Call to order down' });
    down.focus();
    fireEvent.click(down);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Move Call to order down' }),
    );
    expect(screen.getByRole('status').textContent).toBe('Call to order, 2 of 3');
    const up = screen.getByRole('button', { name: 'Move Call to order up' });
    await waitFor(() => expect(up.getAttribute('aria-disabled')).toBeNull());

    // Back at the top, Move up can't be pressed again: the focus goes to Move down
    up.focus();
    fireEvent.click(up);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Move Call to order down' }),
    );
    expect(screen.getByRole('status').textContent).toBe('Call to order, 1 of 3');
  });

  it('puts back only the refused move, keeping a rename saved meanwhile', async () => {
    const reorder = deferred<void>();
    api.reorderAgendaItems.mockReturnValueOnce(reorder.promise);
    api.updateAgendaItem.mockImplementation(async (id: string, data: { title: string }) =>
      item(id, data.title, 2),
    );
    render(<Harness initial={scheduled()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Adjournment up' }));
    expect(titles()).toEqual(['Call to order', 'Adjournment', "Treasurer's report"]);

    const first = screen.getByRole('textbox', { name: 'Agenda item 1' });
    fireEvent.change(first, { target: { value: 'Opening' } });
    fireEvent.blur(first);
    await waitFor(() => expect(titles()[0]).toBe('Opening'));

    reorder.reject(new HttpError('You need the secretary role for this', 403));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'You need the secretary role for this',
    );
    expect(titles()).toEqual(['Opening', "Treasurer's report", 'Adjournment']);
  });

  it('keeps an item the server refused to remove, and says why', async () => {
    api.deleteAgendaItem.mockRejectedValue(new HttpError('Not found', 404));
    render(<Harness initial={scheduled()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Adjournment' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Not found');
    expect(titles()).toHaveLength(3);
  });

  it('attaches a file to the meeting, and removes one', async () => {
    const minutes = { ...budget, id: 'a2', displayName: 'Minutes of 2025', position: 1 };
    api.uploadAttachment.mockResolvedValue(minutes);
    render(<Harness initial={scheduled()} />);
    const file = new File(['%PDF'], 'minutes-2025.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Attach files to the meeting'), {
      target: { files: [file] },
    });
    expect(await screen.findByText('Minutes of 2025')).toBeTruthy();
    expect(api.uploadAttachment).toHaveBeenCalledWith('MAPLE1', file, { packetId: 'p1' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Budget 2027' }));
    await waitFor(() => expect(screen.queryByText('Budget 2027')).toBeNull());
    expect(api.deleteAttachment).toHaveBeenCalledWith('a1');
  });

  it("links one of the organization's documents to an agenda item", async () => {
    api.listDocuments.mockResolvedValue([
      { id: 'd1', title: 'Bylaws of Maple Grove', docType: 'bylaws', organizationId: 'org-1' },
    ]);
    api.linkDocument.mockResolvedValue({
      id: 'a3',
      type: 'bylawyer_document',
      documentId: 'd1',
      displayName: 'Bylaws of Maple Grove',
      position: 0,
      uploadedAt: '',
      document: { id: 'd1', title: 'Bylaws of Maple Grove', docType: 'bylaws' },
    });
    render(<Harness initial={scheduled()} />);
    fireEvent.click(screen.getByRole('button', { name: "Details of Treasurer's report" }));
    const details = screen.getByRole('group', { name: "Treasurer's report" });
    fireEvent.click(within(details).getByRole('button', { name: 'Link a document' }));
    fireEvent.click(await screen.findByRole('button', { name: /Bylaws of Maple Grove/ }));
    expect(await within(details).findByText('Bylaws of Maple Grove')).toBeTruthy();
    expect(api.linkDocument).toHaveBeenCalledWith('d1', { agendaItemId: 'i2' });
  });
});
