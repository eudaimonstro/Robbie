import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const { JoinMeetingScreen } = await import('../JoinMeetingScreen');

function renderBox(props: { message?: string; initialCode?: string } = {}) {
  render(
    <MemoryRouter>
      <JoinMeetingScreen {...props} />
    </MemoryRouter>,
  );
}

describe('JoinMeetingScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("goes to the meeting's link", () => {
    renderBox();
    fireEvent.change(screen.getByLabelText('Meeting code'), { target: { value: ' sync02 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join meeting' }));
    expect(navigate).toHaveBeenCalledWith('/meetings/SYNC02');
  });

  it('rejects a code that is not 4 to 8 letters or digits', () => {
    renderBox();
    fireEvent.change(screen.getByLabelText('Meeting code'), { target: { value: 'ab!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join meeting' }));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText('Meeting codes are 4 to 8 letters or digits')).toBeTruthy();
  });

  it('says why the visitor is here, with the code ready to correct', () => {
    renderBox({ message: 'No meeting with that code', initialCode: 'NOPE01' });
    expect(screen.getByText('No meeting with that code')).toBeTruthy();
    expect((screen.getByLabelText('Meeting code') as HTMLInputElement).value).toBe('NOPE01');
  });
});
