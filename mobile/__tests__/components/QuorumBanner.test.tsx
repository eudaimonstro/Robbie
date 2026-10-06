import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QuorumBanner } from '../../components/QuorumBanner';

describe('QuorumBanner', () => {
  describe('visibility', () => {
    it('renders nothing when quorum is met', async () => {
      const { toJSON } = await render(
        <QuorumBanner presentCount={10} quorum={5} hasQuorum={true} />,
      );

      expect(toJSON()).toBeNull();
    });

    it('renders banner when quorum is not met', async () => {
      await render(<QuorumBanner presentCount={3} quorum={5} hasQuorum={false} />);

      expect(screen.getByText('Quorum Not Met')).toBeTruthy();
    });
  });

  describe('content', () => {
    it('displays correct count of present members', async () => {
      await render(<QuorumBanner presentCount={3} quorum={5} hasQuorum={false} />);

      expect(screen.getByText(/3 present/)).toBeTruthy();
    });

    it('displays how many more members are needed', async () => {
      await render(<QuorumBanner presentCount={3} quorum={5} hasQuorum={false} />);

      expect(screen.getByText(/need 2 more/)).toBeTruthy();
    });

    it('displays the quorum requirement', async () => {
      await render(<QuorumBanner presentCount={3} quorum={5} hasQuorum={false} />);

      expect(screen.getByText(/5 required/)).toBeTruthy();
    });

    it('calculates needed count correctly for various scenarios', async () => {
      const { rerender } = await render(
        <QuorumBanner presentCount={0} quorum={10} hasQuorum={false} />,
      );

      expect(screen.getByText(/need 10 more/)).toBeTruthy();

      await rerender(<QuorumBanner presentCount={9} quorum={10} hasQuorum={false} />);

      expect(screen.getByText(/need 1 more/)).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('has alert role for screen readers', async () => {
      await render(<QuorumBanner presentCount={3} quorum={5} hasQuorum={false} />);

      // React Native Testing Library queries accessibility properties differently
      const banner = screen.getByLabelText(
        /Quorum not met.*3 members present.*need 2 more.*5 required/i,
      );
      expect(banner.props.accessibilityRole).toBe('alert');
    });

    it('has comprehensive accessibility label', async () => {
      await render(<QuorumBanner presentCount={3} quorum={5} hasQuorum={false} />);

      const banner = screen.getByLabelText(
        /Quorum not met.*3 members present.*need 2 more.*5 required/i,
      );
      expect(banner).toBeTruthy();
    });
  });
});
