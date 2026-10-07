import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceBadge, RoleBadge, StatusBadge } from '../Badge';

describe('badges', () => {
  it('name a meeting role, each in its own tint', () => {
    render(
      <>
        <RoleBadge role="chair" />
        <RoleBadge role="guest" />
      </>,
    );
    expect(screen.getByText('Chair').className).toContain('badge-chair');
    expect(screen.getByText('Guest').className).toContain('badge-guest');
  });

  it('say how someone is present', () => {
    render(
      <>
        <PresenceBadge presence="present" />
        <PresenceBadge presence="marked" />
        <PresenceBadge presence="absent" />
      </>,
    );
    expect(screen.getByText('Present').className).toContain('badge-present');
    expect(screen.getByText('Marked present').className).toContain('badge-marked');
    expect(screen.getByText('Absent').className).toContain('badge-absent');
  });

  it('show a failed amendment in ink, not red', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed').className).toContain('badge-failed');
  });
});
