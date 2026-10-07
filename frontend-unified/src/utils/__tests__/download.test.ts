import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadText, fileName } from '../download';

describe('fileName', () => {
  it('makes a file name from a title', () => {
    expect(fileName('2026 Annual Meeting')).toBe('2026-annual-meeting');
    expect(fileName("Treasurer's report: Q3")).toBe('treasurer-s-report-q3');
    expect(fileName('***')).toBe('download');
  });
});

describe('downloadText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('hands the browser a text file to save', () => {
    const createObjectURL = vi.fn(() => 'blob:minutes');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    vi.useFakeTimers();

    downloadText('minutes.md', '# Minutes');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toMatchObject({ download: 'minutes.md' });
    // Kept a moment after the click, which some browsers read after it returns
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:minutes');
    click.mockRestore();
  });
});
