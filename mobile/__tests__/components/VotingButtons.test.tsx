import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { VotingButtons } from '../../components/VotingButtons';

describe('VotingButtons', () => {
  const mockOnVote = jest.fn();

  beforeEach(() => {
    mockOnVote.mockClear();
  });

  describe('rendering', () => {
    it('renders all three vote buttons', () => {
      render(<VotingButtons onVote={mockOnVote} />);

      expect(screen.getByText('YEA')).toBeTruthy();
      expect(screen.getByText('NAY')).toBeTruthy();
      expect(screen.getByText('ABSTAIN')).toBeTruthy();
    });

    it('shows quorum warning when hasQuorum is false', () => {
      render(<VotingButtons onVote={mockOnVote} hasQuorum={false} />);

      expect(screen.getByText('Quorum not met - voting paused')).toBeTruthy();
    });

    it('does not show quorum warning when hasQuorum is true', () => {
      render(<VotingButtons onVote={mockOnVote} hasQuorum={true} />);

      expect(screen.queryByText('Quorum not met - voting paused')).toBeNull();
    });

    it('shows current vote status when a vote is selected', () => {
      render(<VotingButtons onVote={mockOnVote} currentVote="yea" />);

      expect(screen.getByText('Your vote: YEA')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls onVote with "yea" when YEA button is pressed', () => {
      render(<VotingButtons onVote={mockOnVote} />);

      fireEvent.press(screen.getByText('YEA'));

      expect(mockOnVote).toHaveBeenCalledWith('yea');
    });

    it('calls onVote with "nay" when NAY button is pressed', () => {
      render(<VotingButtons onVote={mockOnVote} />);

      fireEvent.press(screen.getByText('NAY'));

      expect(mockOnVote).toHaveBeenCalledWith('nay');
    });

    it('calls onVote with "abstain" when ABSTAIN button is pressed', () => {
      render(<VotingButtons onVote={mockOnVote} />);

      fireEvent.press(screen.getByText('ABSTAIN'));

      expect(mockOnVote).toHaveBeenCalledWith('abstain');
    });

    it('does not call onVote when disabled', () => {
      render(<VotingButtons onVote={mockOnVote} disabled />);

      fireEvent.press(screen.getByText('YEA'));

      expect(mockOnVote).not.toHaveBeenCalled();
    });

    it('does not call onVote when quorum not met', () => {
      render(<VotingButtons onVote={mockOnVote} hasQuorum={false} />);

      fireEvent.press(screen.getByText('YEA'));

      expect(mockOnVote).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has correct accessibility labels for vote buttons', () => {
      render(<VotingButtons onVote={mockOnVote} />);

      const yeaButton = screen.getByLabelText('Vote YEA');
      const nayButton = screen.getByLabelText('Vote NAY');
      const abstainButton = screen.getByLabelText('Vote ABSTAIN');

      expect(yeaButton).toBeTruthy();
      expect(nayButton).toBeTruthy();
      expect(abstainButton).toBeTruthy();
    });

    it('indicates selected state in accessibility label', () => {
      render(<VotingButtons onVote={mockOnVote} currentVote="yea" />);

      const yeaButton = screen.getByLabelText('Vote YEA, currently selected');
      expect(yeaButton).toBeTruthy();
    });

    it('has correct accessibility state for disabled buttons', () => {
      render(<VotingButtons onVote={mockOnVote} disabled />);

      const yeaButton = screen.getByLabelText('Vote YEA');
      expect(yeaButton.props.accessibilityState.disabled).toBe(true);
    });
  });
});
