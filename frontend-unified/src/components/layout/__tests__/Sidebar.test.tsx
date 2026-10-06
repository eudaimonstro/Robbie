import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import type { Document } from '../../../api/client';

const list = vi.hoisted(() => vi.fn());
vi.mock('../../../api/client', () => ({ documents: { list } }));
const org = vi.hoisted(() => ({ currentOrganization: { id: 'org-1', name: 'Org' } }));
vi.mock('../../../context/OrganizationContext', () => ({ useOrganization: () => org }));

const { default: Sidebar } = await import('../Sidebar');

const doc = (id: string, title: string) => ({ id, title, docType: 'bylaws' }) as Document;

describe('Sidebar', () => {
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
});
