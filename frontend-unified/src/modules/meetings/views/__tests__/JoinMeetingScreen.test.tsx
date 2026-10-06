import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const socket = vi.hoisted(() => ({ joinMeeting: vi.fn(), error: null as string | null }));
vi.mock('../../context/SocketContext', () => ({ useSocket: () => socket }));
vi.mock('../../components/scheduling', () => ({ MeetingScheduler: () => <p>Scheduler</p> }));

const { JoinMeetingScreen } = await import('../JoinMeetingScreen');

describe('JoinMeetingScreen', () => {
  beforeEach(() => {
    socket.joinMeeting.mockClear();
  });

  it('joins by meeting code', () => {
    render(<JoinMeetingScreen />);
    fireEvent.change(screen.getByLabelText('Meeting code'), { target: { value: ' sync02 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join meeting' }));
    expect(socket.joinMeeting).toHaveBeenCalledWith('SYNC02');
  });

  it('rejects a code that is not 4 to 8 letters or digits', () => {
    render(<JoinMeetingScreen />);
    fireEvent.change(screen.getByLabelText('Meeting code'), { target: { value: 'ab!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join meeting' }));
    expect(socket.joinMeeting).not.toHaveBeenCalled();
    expect(screen.getByText('Meeting codes are 4 to 8 letters or digits')).toBeTruthy();
  });
});
