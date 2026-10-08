import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ listDocuments: vi.fn() }));
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  listDocuments: api.listDocuments,
}));

const { DocumentPicker } = await import('../AttachmentUploader');

describe('DocumentPicker', () => {
  it("says the documents couldn't load, rather than that there are none, and tries again", async () => {
    api.listDocuments.mockRejectedValueOnce(new Error('Failed to list documents'));
    render(<DocumentPicker organizationId="org-1" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText("Couldn't load the documents.")).toBeTruthy();
    expect(screen.queryByText('No documents in this organization.')).toBeNull();

    api.listDocuments.mockResolvedValueOnce([
      { id: 'd1', title: 'Bylaws', docType: 'bylaws', organizationId: 'org-1' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Bylaws/ })).toBeTruthy();
  });
});
