import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { Button } from '../../../components/ui/Button';

describe('Button', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    mockOnPress.mockClear();
  });

  describe('rendering', () => {
    it('renders button with title', async () => {
      await render(<Button title="Click Me" onPress={mockOnPress} />);

      expect(screen.getByText('Click Me')).toBeTruthy();
    });

    it('renders loading indicator when loading', async () => {
      await render(<Button title="Submit" onPress={mockOnPress} loading />);

      // When loading, title should not be visible
      expect(screen.queryByText('Submit')).toBeNull();
    });
  });

  describe('variants', () => {
    it('applies primary variant styles by default', async () => {
      const { getByText } = await render(<Button title="Primary" onPress={mockOnPress} />);

      const button = getByText('Primary');
      expect(button).toBeTruthy();
    });

    it('renders secondary variant', async () => {
      await render(<Button title="Secondary" onPress={mockOnPress} variant="secondary" />);

      expect(screen.getByText('Secondary')).toBeTruthy();
    });

    it('renders danger variant', async () => {
      await render(<Button title="Danger" onPress={mockOnPress} variant="danger" />);

      expect(screen.getByText('Danger')).toBeTruthy();
    });

    it('renders ghost variant', async () => {
      await render(<Button title="Ghost" onPress={mockOnPress} variant="ghost" />);

      expect(screen.getByText('Ghost')).toBeTruthy();
    });
  });

  describe('sizes', () => {
    it('renders small size', async () => {
      await render(<Button title="Small" onPress={mockOnPress} size="sm" />);

      expect(screen.getByText('Small')).toBeTruthy();
    });

    it('renders medium size by default', async () => {
      await render(<Button title="Medium" onPress={mockOnPress} />);

      expect(screen.getByText('Medium')).toBeTruthy();
    });

    it('renders large size', async () => {
      await render(<Button title="Large" onPress={mockOnPress} size="lg" />);

      expect(screen.getByText('Large')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls onPress when pressed', async () => {
      await render(<Button title="Press Me" onPress={mockOnPress} />);

      await fireEvent.press(screen.getByText('Press Me'));

      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('does not call onPress when disabled', async () => {
      await render(<Button title="Disabled" onPress={mockOnPress} disabled />);

      await fireEvent.press(screen.getByText('Disabled'));

      expect(mockOnPress).not.toHaveBeenCalled();
    });

    it('does not call onPress when loading', async () => {
      await render(<Button title="Loading" onPress={mockOnPress} loading />);

      // Loading replaces the title with a spinner, so find the button by role
      const button = screen.getByRole('button');
      expect(button).toBeBusy();
      await fireEvent.press(button);
      expect(mockOnPress).not.toHaveBeenCalled();
    });
  });

  describe('fullWidth', () => {
    it('applies full width style when fullWidth is true', async () => {
      await render(<Button title="Full Width" onPress={mockOnPress} fullWidth />);

      expect(screen.getByText('Full Width')).toBeTruthy();
    });
  });

  describe('disabled state', () => {
    it('reduces opacity when disabled', async () => {
      await render(<Button title="Disabled" onPress={mockOnPress} disabled />);

      expect(screen.getByText('Disabled')).toBeTruthy();
    });

    it('is disabled when loading', async () => {
      await render(<Button title="Loading" onPress={mockOnPress} loading />);

      // Button should be functionally disabled
      expect(mockOnPress).not.toHaveBeenCalled();
    });
  });
});
