import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import type { Document } from '../../../api/client';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../../api/client', () => ({ documents: { list } }));
const org = vi.hoisted(() => ({ currentOrganization: { id: 'org-1', name: 'Org' }, can: true }));
vi.mock('../../../context/OrganizationContext', () => ({
  useOrganization: () => org,
  useCan: () => org.can,
}));

const { default: Sidebar } = await import('../Sidebar');

const doc = (id: string, title: string) => ({ id, title, docType: 'bylaws' }) as Document;

describe('Sidebar', () => {
  beforeEach(() => {
    org.can = true;
  });

  it('shows a document created after it loaded, once the app moves to it', async () => {
    list.mockResolvedValueOnce([doc('d1', 'Bylaws')]);
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar onNewDocument={() => {}} />
        <Link to="/documents/d2">open new document</Link>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText('Bylaws')).not.toBeNull());

    // A new document was created; the app navigates to it
    list.mockResolvedValueOnce([doc('d1', 'Bylaws'), doc('d2', 'Standing Rules')]);
    fireEvent.click(screen.getByText('open new document'));

    await waitFor(() => expect(screen.queryByText('Standing Rules')).not.toBeNull());
  });

  it('offers New Document only to secretaries and above', () => {
    list.mockResolvedValueOnce([]);
    org.can = false;
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar onNewDocument={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /New Document/ })).toBeNull();
  });

  it('marks the current page for the eye and for screen readers', async () => {
    list.mockResolvedValueOnce([]);
    render(
      <MemoryRouter initialEntries={['/amendments']}>
        <Sidebar onNewDocument={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Amendments' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Live Meetings' }).getAttribute('aria-current'),
    ).toBeNull();
    await waitFor(() => expect(list).toHaveBeenCalled());
  });
});
