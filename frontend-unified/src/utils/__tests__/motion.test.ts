import { afterEach, describe, it, expect, vi } from 'vitest';
import { scrollBehavior } from '../motion';

function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      media: query,
    })),
  );
}

describe('scrollBehavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scrolls smoothly by default', () => {
    prefersReducedMotion(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('jumps for someone who asked for reduced motion', () => {
    prefersReducedMotion(true);
    expect(scrollBehavior()).toBe('auto');
  });
});
