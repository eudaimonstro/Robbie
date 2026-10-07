import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// jsdom has no canvas; the SVG renderer needs none, and the test only checks what is drawn
const qr = vi.hoisted(() => ({ toString: vi.fn() }));
vi.mock('qrcode', () => qr);

const { QrCode } = await import('../QrCode');

describe('QrCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('draws the link as an SVG image, ink on a white tile', async () => {
    qr.toString.mockResolvedValueOnce('<svg>code</svg>');
    render(<QrCode value="http://localhost/meetings/MAPLE1" label="Scan to join" size={240} />);

    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Scan to join' }).getAttribute('src')).toBe(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg>code</svg>')}`,
      ),
    );
    expect(screen.getByRole('img', { name: 'Scan to join' }).getAttribute('width')).toBe('240');
    expect(qr.toString).toHaveBeenCalledWith(
      'http://localhost/meetings/MAPLE1',
      expect.objectContaining({ type: 'svg', color: { dark: '#15130f', light: '#ffffff' } }),
    );
  });

  it('keeps its place, with its name, while the code is drawn', () => {
    qr.toString.mockReturnValueOnce(new Promise(() => {}));
    render(<QrCode value="http://localhost/meetings/MAPLE1" label="Scan to join" />);
    const placeholder = screen.getByRole('img', { name: 'Scan to join' });
    expect(placeholder.tagName).toBe('DIV');
    expect(placeholder.style.width).toBe('200px');
  });
});
