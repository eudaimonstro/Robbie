import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentContentCard } from '../DocumentContentCard';

describe('DocumentContentCard', () => {
  it('disables Add Section until the document has a version', () => {
    render(
      <DocumentContentCard
        selectedVersion={null}
        sectionTree={[]}
        selectedSection={null}
        onSelectSection={vi.fn()}
        onEditSection={vi.fn()}
        onDeleteSection={vi.fn()}
        onAddChild={vi.fn()}
        onReorder={vi.fn()}
        onAddSection={vi.fn()}
        onCreateVersion={vi.fn()}
      />,
    );

    // A section needs a version to belong to; saving one without it did nothing
    expect(screen.getByRole('button', { name: 'Add Section' })).toHaveProperty('disabled', true);
  });
});
