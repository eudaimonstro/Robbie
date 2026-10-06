import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MotionCard } from '../../components/MotionCard';
import type { Motion } from '@robbie-bylawyer/shared/types';

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
  secondedBy: null,
  precedence: 1,
  category: 'main',
  interrupt: false,
  needsSecond: true,
  reconsidered: true,
  phrase: 'I move that...',
  help: 'Introduces new business for the assembly.',
  whenToUse: 'When you want the assembly to take action.',
  ...overrides,
});

describe('MotionCard', () => {
  describe('basic rendering', () => {
    it('renders motion name', async () => {
      const motion = createMockMotion();
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('Main Motion')).toBeTruthy();
    });

    it('renders motion text', async () => {
      const motion = createMockMotion();
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('I move that we approve the budget.')).toBeTruthy();
    });

    it('renders mover name', async () => {
      const motion = createMockMotion();
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('Moved by: John Smith')).toBeTruthy();
    });

    it('renders seconder name when present', async () => {
      const motion = createMockMotion({ secondedBy: 'Jane Doe' });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('Seconded by: Jane Doe')).toBeTruthy();
    });

    it('does not render seconder when not present', async () => {
      const motion = createMockMotion();
      await render(<MotionCard motion={motion} />);

      expect(screen.queryByText(/Seconded by:/)).toBeNull();
    });
  });

  describe('status badges', () => {
    it('shows VOTING badge when votingOpen is true', async () => {
      const motion = createMockMotion();
      await render(<MotionCard motion={motion} votingOpen />);

      expect(screen.getByText('VOTING')).toBeTruthy();
    });

    it('shows DEBATING badge when status is active', async () => {
      const motion = createMockMotion({ status: 'active' });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('DEBATING')).toBeTruthy();
    });

    it('shows PENDING badge when status is pending', async () => {
      const motion = createMockMotion({ status: 'pending' });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('PENDING')).toBeTruthy();
    });

    it('VOTING takes precedence over status', async () => {
      const motion = createMockMotion({ status: 'active' });
      await render(<MotionCard motion={motion} votingOpen />);

      expect(screen.getByText('VOTING')).toBeTruthy();
      expect(screen.queryByText('DEBATING')).toBeNull();
    });
  });

  describe('vote requirement display', () => {
    it('shows Majority for majority vote', async () => {
      const motion = createMockMotion({ vote: 'majority' });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('Majority')).toBeTruthy();
    });

    it('shows Two-Thirds for 2/3 vote', async () => {
      const motion = createMockMotion({ vote: '2/3' });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('Two-Thirds')).toBeTruthy();
    });

    it('shows None for no vote requirement', async () => {
      const motion = createMockMotion({ vote: 'none' });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('None')).toBeTruthy();
    });
  });

  describe('property chips', () => {
    it('shows Debatable chip when motion is debatable', async () => {
      const motion = createMockMotion({ debatable: true });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('Debatable')).toBeTruthy();
    });

    it('does not show Debatable chip when motion is not debatable', async () => {
      const motion = createMockMotion({ debatable: false });
      await render(<MotionCard motion={motion} />);

      expect(screen.queryByText('Debatable')).toBeNull();
    });

    it('shows Amendable chip when motion is amendable', async () => {
      const motion = createMockMotion({ amendable: true });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('Amendable')).toBeTruthy();
    });

    it('does not show Amendable chip when motion is not amendable', async () => {
      const motion = createMockMotion({ amendable: false });
      await render(<MotionCard motion={motion} />);

      expect(screen.queryByText('Amendable')).toBeNull();
    });
  });

  describe('motion without optional fields', () => {
    it('renders without motion text', async () => {
      const motion = createMockMotion({ text: undefined });
      await render(<MotionCard motion={motion} />);

      expect(screen.getByText('Main Motion')).toBeTruthy();
    });

    it('renders without mover', async () => {
      const motion = createMockMotion({ mover: undefined });
      await render(<MotionCard motion={motion} />);

      expect(screen.queryByText(/Moved by:/)).toBeNull();
    });
  });
});
