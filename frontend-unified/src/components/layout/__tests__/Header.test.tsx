import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { SearchResult } from '../../../api/client';

const orgState = vi.hoisted(() => {
  const organizations = [
    { id: 'o1', name: 'Maple Grove Homeowners Association', slug: 'maple-grove', role: 'owner' },
  ];
  return {
    organizations,
    currentOrganization: organizations[0],
    setCurrentOrganization: vi.fn(),
  };
});
vi.mock('../../../context/OrganizationContext', () => ({ useOrganization: () => orgState }));
const session = vi.hoisted(() => ({
  user: { id: 1, email: 'ann@example.org', name: 'Ann Chair' },
  signOut: vi.fn(async () => {}),
  signOutEverywhere: vi.fn(async () => {}),
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const api = vi.hoisted(() => ({
  query: vi.fn(async (): Promise<SearchResult> => ({ query: '', results: [] })),
}));
vi.mock('../../../api/client', () => ({ search: { query: api.query } }));
vi.mock('../../organizations/NewOrganizationModal', () => ({ NewOrganizationModal: () => null }));

const { default: Header } = await import('../Header');

/** A promise settled by the test */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A search's answer with one section */
function result(query: string, numberLabel: string, title: string): SearchResult {
  return {
    query,
    results: [
      {
        documentId: 'd1',
        documentTitle: 'Bylaws of Maple Grove',
        versionId: 'v1',
        sectionId: `s-${numberLabel}`,
        numberLabel,
        title,
        snippet: '',
      },
    ],
  };
}

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header onMenuClick={() => {}} />
    </MemoryRouter>,
  );
}

describe('Header', () => {
  beforeEach(() => vi.clearAllMocks());

  it('collapses the search box to an icon button below xl, which opens it over the header', async () => {
    renderHeader();
    const open = screen.getByRole('button', { name: 'Search' });
    expect(open.className).toContain('xl:hidden');
    // The box itself is only laid out from xl up until the button opens it
    const box = screen.getByRole('textbox', { name: 'Search documents' });
    expect(box.closest('div.hidden')?.className).toContain('xl:block');
    expect(open.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(box.closest('div.absolute')?.className).toContain('inset-0');
    await waitFor(() => expect(document.activeElement).toBe(box));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('truncates the organization name, and keeps it out of sight on phones', () => {
    renderHeader();
    const name = screen.getByText('Maple Grove Homeowners Association');
    expect(name.className).toContain('truncate');
    expect(name.parentElement?.className).toBe('sr-only sm:not-sr-only min-w-0');
    // Still the switcher's name for a screen reader
    expect(screen.getByRole('button', { name: /Maple Grove Homeowners Association/ })).toBeTruthy();
  });

  it('shows the user menu as an icon below xl, its name read out but not drawn', () => {
    renderHeader();
    const name = screen.getByText('Ann Chair');
    expect(name.parentElement?.className).toBe('sr-only xl:not-sr-only');
    expect(screen.getByRole('button', { name: /Ann Chair/ })).toBeTruthy();
  });

  it('searches the bylaws of the current organization and opens the document at a section', async () => {
    api.query.mockResolvedValueOnce({
      query: 'quorum',
      results: [
        {
          documentId: 'd1',
          documentTitle: 'Bylaws of Maple Grove',
          versionId: 'v1',
          sectionId: 's42',
          numberLabel: 'Section 4.2',
          title: 'Quorum',
          snippet: '...twenty percent of the votes constitutes a quorum...',
        },
      ],
    });
    function Location() {
      const { pathname, hash } = useLocation();
      return <p>At {`${pathname}${hash}`}</p>;
    }
    render(
      <MemoryRouter>
        <Header onMenuClick={() => {}} />
        <Location />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search documents' }), {
      target: { value: 'quorum' },
    });
    const hit = await screen.findByRole('button', { name: /Section 4\.2 Quorum/ });
    expect(api.query).toHaveBeenCalledWith('o1', 'quorum');
    expect(screen.getByText('in Bylaws of Maple Grove')).toBeTruthy();
    expect(screen.getByText('...twenty percent of the votes constitutes a quorum...')).toBeTruthy();

    fireEvent.click(hit);
    expect(screen.getByText('At /documents/d1#section-s42')).toBeTruthy();
  });

  it("never shows an older search's answer over a newer one's", async () => {
    const older = deferred<SearchResult>();
    const newer = deferred<SearchResult>();
    api.query.mockImplementationOnce(() => older.promise);
    api.query.mockImplementationOnce(() => newer.promise);
    renderHeader();
    const box = screen.getByRole('textbox', { name: 'Search documents' });
    fireEvent.change(box, { target: { value: 'quo' } });
    await waitFor(() => expect(api.query).toHaveBeenCalledWith('o1', 'quo'));
    fireEvent.change(box, { target: { value: 'quorum' } });
    await waitFor(() => expect(api.query).toHaveBeenCalledWith('o1', 'quorum'));

    // The newer answer first, then the older one
    await act(async () => newer.resolve(result('quorum', 'Section 4.2', 'Quorum')));
    expect(await screen.findByRole('button', { name: /Section 4\.2 Quorum/ })).toBeTruthy();
    await act(async () => older.resolve(result('quo', 'Section 9.9', 'Quotas')));
    expect(screen.queryByRole('button', { name: /Section 9\.9 Quotas/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Section 4\.2 Quorum/ })).toBeTruthy();
  });

  it('keeps the results closed when an answer arrives after Clear', async () => {
    const late = deferred<SearchResult>();
    api.query.mockImplementationOnce(() => late.promise);
    renderHeader();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search documents' }), {
      target: { value: 'quorum' },
    });
    await waitFor(() => expect(api.query).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    await act(async () => late.resolve(result('quorum', 'Section 4.2', 'Quorum')));
    expect(screen.queryByRole('button', { name: /Section 4\.2 Quorum/ })).toBeNull();
    expect(screen.queryByText(/Searching/)).toBeNull();
  });

  it('waits for 2 characters', async () => {
    renderHeader();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search documents' }), {
      target: { value: 'q' },
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(api.query).not.toHaveBeenCalled();
  });
});
