import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrintableDocument, type PrintSection } from '../PrintableDocument';

const rules = (prefix: string): PrintSection[] =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `${prefix}${i}`,
    numberLabel: `Section ${i + 1}`,
    title: 'Rule',
    content: 'Text.',
    children: [],
  }));

describe('PrintableDocument', () => {
  it('heads the version with the organization, the title and its effective date', () => {
    render(
      <PrintableDocument
        organizationName="Maple Grove HOA"
        documentTitle="Bylaws of Maple Grove"
        versionNumber={2}
        effectiveDate="2026-03-15T00:00:00.000Z"
        sections={[
          {
            id: 'a1',
            numberLabel: 'Article I',
            title: 'Name and Purpose',
            content: null,
            children: [
              {
                id: 's1',
                numberLabel: 'Section 1.1',
                title: 'Name',
                content: 'The name is **Maple Grove**.',
                children: [],
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Bylaws of Maple Grove' })).toBeTruthy();
    expect(screen.getByText('Version 2, effective March 15, 2026')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Article I Name and Purpose' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Section 1.1 Name' })).toBeTruthy();
    expect(screen.getByText('Maple Grove').tagName).toBe('STRONG');
    // Repeated at the top of every printed page, and only there
    expect(document.querySelector('.print-running-header')?.textContent).toBe(
      'Maple Grove HOA | Bylaws of Maple Grove',
    );
  });

  it('starts a long article on a new page, never the first', () => {
    render(
      <PrintableDocument
        organizationName="Maple Grove HOA"
        documentTitle="Bylaws"
        versionNumber={1}
        effectiveDate={null}
        sections={[
          {
            id: 'a1',
            numberLabel: 'Article I',
            title: 'Long',
            content: null,
            children: rules('a'),
          },
          {
            id: 'a2',
            numberLabel: 'Article II',
            title: 'Short',
            content: 'One line.',
            children: [],
          },
          {
            id: 'a3',
            numberLabel: 'Article III',
            title: 'Also long',
            content: null,
            children: rules('b'),
          },
        ]}
      />,
    );
    const article = (name: string) => screen.getByRole('heading', { name }).closest('section')!;
    expect(article('Article I Long').className).not.toContain('print-break-before');
    expect(article('Article II Short').className).not.toContain('print-break-before');
    expect(article('Article III Also long').className).toContain('print-break-before');
    expect(screen.getByText('Version 1')).toBeTruthy();
  });
});
