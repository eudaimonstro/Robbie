import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const session = vi.hoisted(() => ({
  status: 'signedOut' as 'loading' | 'signedIn' | 'signedOut',
  user: null as null | { id: number; email: string; name: string | null },
}));
vi.mock('../../../context/SessionContext', () => ({ useSession: () => session }));

const { RequireSession } = await import('../RequireSession');

function SignInSpy() {
  const location = useLocation();
  return <p>sign-in {location.search}</p>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sign-in" element={<SignInSpy />} />
        <Route
          path="/documents/:id"
          element={
            <RequireSession>
              <p>Document page</p>
            </RequireSession>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireSession', () => {
  it('sends a signed-out user to sign in, remembering the page', () => {
    session.status = 'signedOut';
    renderAt('/documents/d1?tab=history');
    expect(screen.getByText('sign-in ?next=%2Fdocuments%2Fd1%3Ftab%3Dhistory')).toBeTruthy();
  });

  it('sends a signed-in user without a name to finish signing in', () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'a@b.c', name: null };
    renderAt('/documents/d1');
    expect(screen.getByText(/^sign-in/)).toBeTruthy();
  });

  it('shows the page to a signed-in user with a name', () => {
    session.status = 'signedIn';
    session.user = { id: 1, email: 'a@b.c', name: 'Ann' };
    renderAt('/documents/d1');
    expect(screen.getByText('Document page')).toBeTruthy();
  });

  it('shows nothing from the page while the session loads', () => {
    session.status = 'loading';
    renderAt('/documents/d1');
    expect(screen.queryByText('Document page')).toBeNull();
    expect(screen.queryByText(/^sign-in/)).toBeNull();
  });
});
