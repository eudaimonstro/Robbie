import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 1, email: 'kim@example.org', name: 'Kim' } }),
}));
vi.mock('../NewOrganizationModal', () => ({
  NewOrganizationModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <p>New organization form</p> : null,
}));

const { NoOrganizations } = await import('../NoOrganizations');

describe('NoOrganizations', () => {
  it('asks the user to create an organization or to be added by email', () => {
    render(<NoOrganizations />);
    expect(
      screen.getByText(
        "Create an organization, or ask your organization's secretary to add kim@example.org.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New organization' }));
    expect(screen.getByText('New organization form')).toBeTruthy();
  });
});
