import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MotionCard } from '../../components/MotionCard';
import type { Motion } from '@robbie/shared/types';

// Helper to create a mock motion
const createMockMotion = (overrides: Partial<Motion> = {}): Motion => ({
  id: 1,
  type: 'mainMotion',
  name: 'Main Motion',
  text: 'I move that we approve the budget.',
  mover: 'John Smith',
  moverId: 1,
  status: 'active',
  debatable: true,
  amendable: true,
  vote: 'majority',
  timestamp: '2024-01-01T12:00:00Z',
  ...overrides,
});

describe('MotionCard', () => {
  describe('basic rendering', () => {
    it('renders motion name', () => {
      const motion = createMockMotion();
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('Main Motion')).toBeTruthy();
    });

    it('renders motion text', () => {
      const motion = createMockMotion();
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('I move that we approve the budget.')).toBeTruthy();
    });

    it('renders mover name', () => {
      const motion = createMockMotion();
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('Moved by: John Smith')).toBeTruthy();
    });

    it('renders seconder name when present', () => {
      const motion = createMockMotion({ secondedBy: 'Jane Doe' });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('Seconded by: Jane Doe')).toBeTruthy();
    });

    it('does not render seconder when not present', () => {
      const motion = createMockMotion();
      render(<MotionCard motion={motion} />);

      expect(screen.queryByText(/Seconded by:/)).toBeNull();
    });
  });

  describe('status badges', () => {
    it('shows VOTING badge when votingOpen is true', () => {
      const motion = createMockMotion();
      render(<MotionCard motion={motion} votingOpen />);

      expect(screen.getByText('VOTING')).toBeTruthy();
    });

    it('shows DEBATING badge when status is active', () => {
      const motion = createMockMotion({ status: 'active' });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('DEBATING')).toBeTruthy();
    });

    it('shows PENDING badge when status is pending', () => {
      const motion = createMockMotion({ status: 'pending' });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('PENDING')).toBeTruthy();
    });

    it('VOTING takes precedence over status', () => {
      const motion = createMockMotion({ status: 'active' });
      render(<MotionCard motion={motion} votingOpen />);

      expect(screen.getByText('VOTING')).toBeTruthy();
      expect(screen.queryByText('DEBATING')).toBeNull();
    });
  });

  describe('vote requirement display', () => {
    it('shows Majority for majority vote', () => {
      const motion = createMockMotion({ vote: 'majority' });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('Majority')).toBeTruthy();
    });

    it('shows Two-Thirds for 2/3 vote', () => {
      const motion = createMockMotion({ vote: '2/3' });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('Two-Thirds')).toBeTruthy();
    });

    it('shows None for no vote requirement', () => {
      const motion = createMockMotion({ vote: 'none' });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('None')).toBeTruthy();
    });
  });

  describe('property chips', () => {
    it('shows Debatable chip when motion is debatable', () => {
      const motion = createMockMotion({ debatable: true });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('Debatable')).toBeTruthy();
    });

    it('does not show Debatable chip when motion is not debatable', () => {
      const motion = createMockMotion({ debatable: false });
      render(<MotionCard motion={motion} />);

      expect(screen.queryByText('Debatable')).toBeNull();
    });

    it('shows Amendable chip when motion is amendable', () => {
      const motion = createMockMotion({ amendable: true });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('Amendable')).toBeTruthy();
    });

    it('does not show Amendable chip when motion is not amendable', () => {
      const motion = createMockMotion({ amendable: false });
      render(<MotionCard motion={motion} />);

      expect(screen.queryByText('Amendable')).toBeNull();
    });
  });

  describe('motion without optional fields', () => {
    it('renders without motion text', () => {
      const motion = createMockMotion({ text: undefined });
      render(<MotionCard motion={motion} />);

      expect(screen.getByText('Main Motion')).toBeTruthy();
    });

    it('renders without mover', () => {
      const motion = createMockMotion({ mover: undefined });
      render(<MotionCard motion={motion} />);

      expect(screen.queryByText(/Moved by:/)).toBeNull();
    });
  });
});
