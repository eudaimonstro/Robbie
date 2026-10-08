import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Version } from '../../../../../api/client';

const api = vi.hoisted(() => ({ exportMarkdown: vi.fn(async () => {}) }));
vi.mock('../../../../../api/client', () => ({ versions: { exportMarkdown: api.exportMarkdown } }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { ExportDropdown } = await import('../ExportDropdown');

const version = { id: 'v2', documentId: 'd1', versionNumber: 2 } as Version;

describe('ExportDropdown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prints the version shown in a new tab, or downloads it as Markdown, and nothing else', async () => {
    render(<ExportDropdown documentId="d1" selectedVersion={version} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Print or save as PDF',
      'Markdown',
    ]);
    const print = screen.getByRole('menuitem', { name: 'Print or save as PDF' });
    expect(print.getAttribute('href')).toBe('/documents/d1/print?version=v2&print=1');
    expect(print.getAttribute('target')).toBe('_blank');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Markdown' }));
    await waitFor(() => expect(api.exportMarkdown).toHaveBeenCalledWith('v2'));
  });

  it('says when the Markdown download fails', async () => {
    api.exportMarkdown.mockRejectedValueOnce(new Error('HTTP 500'));
    render(<ExportDropdown documentId="d1" selectedVersion={version} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Markdown' }));
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith('error', "Couldn't download the Markdown"),
    );
  });

  it('is off until a version is shown', () => {
    render(<ExportDropdown documentId="d1" selectedVersion={null} />);
    expect(screen.getByRole('button', { name: 'Export' })).toHaveProperty('disabled', true);
  });
});
