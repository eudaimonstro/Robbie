import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StyleGuidePage from '../StyleGuidePage';

const TOKENS = [
  'paper',
  'surface',
  'surface-2',
  'ink',
  'ink-muted',
  'rule',
  'gavel',
  'gavel-tint',
  'carried',
  'carried-tint',
  'caution',
  'caution-tint',
  'caution-ink',
];

describe('StyleGuidePage', () => {
  it('shows every token in the current palette and in the evening palette', () => {
    render(<StyleGuidePage />);
    expect(screen.getByRole('heading', { name: 'Style guide' })).toBeTruthy();
    for (const token of TOKENS) {
      expect(screen.getAllByText(token, { exact: true }), token).toHaveLength(2);
    }
  });

  it('sets the evening sample in a .dark panel, as the display is', () => {
    render(<StyleGuidePage />);
    const evening = screen.getByRole('region', { name: 'Evening session' });
    expect(evening.className.split(' ')).toContain('dark');
    expect(screen.getByRole('region', { name: 'This palette' }).className).not.toContain('dark');
  });

  it('shows the components in the brief voice', () => {
    render(<StyleGuidePage />);
    expect(screen.getAllByRole('button', { name: 'Call to order' })).toHaveLength(2);
    expect(screen.getAllByText('Marked present')).toHaveLength(2);
    expect(screen.getAllByLabelText('Headcount')).toHaveLength(2);
  });
});
