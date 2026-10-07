import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../context/OrganizationContext', () => ({
  useOrganization: () => ({ currentOrganization: null }),
}));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../api/client', () => ({ documents: { create: vi.fn() } }));
vi.mock('../Sidebar', () => ({
  default: ({ drawer, onClose }: { drawer?: boolean; onClose?: () => void }) => (
    <nav aria-label="Main">
      <span>{drawer ? 'drawer' : 'docked'}</span>
      <button type="button" onClick={onClose}>
        Close sidebar
      </button>
    </nav>
  ),
}));
vi.mock('../Header', () => ({
  default: ({ onMenuClick, menuAlways }: { onMenuClick?: () => void; menuAlways?: boolean }) => (
    <header>
      <button type="button" data-always={String(!!menuAlways)} onClick={onMenuClick}>
        Open menu
      </button>
    </header>
  ),
}));

const { default: AppLayout } = await import('../AppLayout');
const { isFocusPath } = await import('../focusMode');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout>
        <p>Page</p>
      </AppLayout>
    </MemoryRouter>,
  );
}

describe('focus mode', () => {
  it('is on in a live meeting, and off everywhere else', () => {
    expect(isFocusPath('/meetings/MAPLE1')).toBe(true);
    expect(isFocusPath('/meetings/MAPLE1/')).toBe(true);
    expect(isFocusPath('/meetings')).toBe(false);
    expect(isFocusPath('/meetings/')).toBe(false);
    expect(isFocusPath('/')).toBe(false);
    expect(isFocusPath('/documents/d1')).toBe(false);
  });

  it('docks the sidebar beside the page outside a meeting', () => {
    renderAt('/documents/d1');
    const frame = screen.getByTestId('sidebar-frame');
    expect(frame.className).toContain('md:relative');
    expect(frame.className).toContain('md:translate-x-0');
    expect(frame.hasAttribute('inert')).toBe(false);
    expect(screen.getByText('docked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open menu' }).dataset.always).toBe('false');
  });

  it('folds the sidebar into a drawer at every width in a live meeting', () => {
    renderAt('/meetings/MAPLE1');
    const frame = screen.getByTestId('sidebar-frame');
    expect(frame.className).not.toContain('md:relative');
    expect(frame.className).not.toContain('md:translate-x-0');
    expect(frame.className).toContain('-translate-x-full');
    // Out of reach while closed: no tabbing into a sidebar nobody can see
    expect(frame.hasAttribute('inert')).toBe(true);
    expect(screen.getByText('drawer')).toBeTruthy();

    // The header's menu button opens it, on laptops too
    const menu = screen.getByRole('button', { name: 'Open menu' });
    expect(menu.dataset.always).toBe('true');
    fireEvent.click(menu);
    expect(frame.className).toContain('translate-x-0');
    expect(frame.className).not.toContain('-translate-x-full');
    expect(frame.hasAttribute('inert')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));
    expect(frame.className).toContain('-translate-x-full');
  });
});
