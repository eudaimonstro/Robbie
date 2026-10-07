import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Stamp } from '../Stamp';

describe('Stamp', () => {
  it('lands carried in the carried color, tilted, over the tally', () => {
    render(
      <Stamp
        outcome="carried"
        subject="Resurface the pool this spring"
        tally="On devices 2 to 0, in the room 9 to 2: 11 to 2"
      />,
    );
    const word = screen.getByText('Carried');
    expect(word.className).toContain('border-carried');
    expect(word.className).toContain('-rotate-4');
    expect(word.className).toContain('animate-stamp');
    expect(screen.getByText('On devices 2 to 0, in the room 9 to 2: 11 to 2')).toBeTruthy();
    expect(screen.getByRole('figure', { name: /Carried/ })).toBeTruthy();
  });

  it('is read out: its live region is on the page, empty, before the result is written in', async () => {
    render(<Stamp outcome="carried" subject="Resurface the pool" tally="11 to 2" />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    await waitFor(() => expect(region.textContent).toBe('Carried, Resurface the pool, 11 to 2'));
  });

  it('says failed in ink, never red', () => {
    render(<Stamp outcome="failed" tally="3 to 9" />);
    const word = screen.getByText('Failed');
    expect(word.className).toContain('border-ink');
    expect(word.className).not.toContain('gavel');
  });

  it('says adopted, by unanimous consent, in the carried color', () => {
    render(<Stamp outcome="adopted" tally="By unanimous consent" />);
    const word = screen.getByText('Adopted');
    expect(word.className).toContain('border-carried');
    expect(screen.getByText('By unanimous consent')).toBeTruthy();
  });

  it('declares who was elected', () => {
    render(<Stamp outcome="elected" subject="Carmen Diaz, Director" size="display" />);
    expect(screen.getByText('Elected')).toBeTruthy();
    expect(screen.getByText('Carmen Diaz, Director')).toBeTruthy();
  });
});
