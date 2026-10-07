import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getDocument: vi.fn(),
  docxText: vi.fn(),
  saveVersion: vi.fn(),
}));
vi.mock('../../../../api/client', () => ({
  documents: { get: api.getDocument },
  bylawsImport: { docxText: api.docxText, saveVersion: api.saveVersion },
}));
const org = vi.hoisted(() => ({ canEdit: true }));
vi.mock('../../../../context/OrganizationContext', () => ({
  useCan: () => org.canEdit,
  useSelectRecordOrganization: () => {},
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => toast }));

const { default: ImportBylawsPage } = await import('../ImportBylawsPage');

const TEXT = [
  'Article I',
  'Name and Purpose',
  'Section 1.1 Name',
  'The name is Maple Grove.',
  'Section 1.2 Purpos',
  'Gardens.',
  'Article II',
  'Members',
  'Section 2.1 Membership',
  'Every owner is a member.',
].join('\n');

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/documents/d1/import']}>
      <Routes>
        <Route path="/documents/:documentId/import" element={<ImportBylawsPage />} />
        <Route path="/documents/:documentId" element={<p>Document page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function readPasted(text: string) {
  renderPage();
  await screen.findByRole('heading', { name: 'Import the bylaws' });
  fireEvent.change(screen.getByLabelText('Bylaws text'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Read the bylaws' }));
}

function chooseFile(file: File) {
  fireEvent.click(screen.getByLabelText('A file (.txt, .md or .docx)'));
  fireEvent.change(screen.getByLabelText('File'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Read the bylaws' }));
}

describe('ImportBylawsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.canEdit = true;
    api.getDocument.mockResolvedValue({ id: 'd1', organizationId: 'org-1', title: 'Bylaws' });
    api.saveVersion.mockResolvedValue({ id: 'v2', versionNumber: 2, sectionCount: 5 });
  });

  it('reads pasted bylaws into articles and sections, takes a fix, and saves them', async () => {
    await readPasted(TEXT);
    expect(screen.getByText('2 articles, 3 sections')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Title of Section 1.2 Purpos'), {
      target: { value: 'Purpose' },
    });
    fireEvent.change(screen.getByLabelText('Effective date (optional)'), {
      target: { value: '2026-03-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as a new version' }));

    expect(await screen.findByText('Document page')).toBeTruthy();
    expect(api.saveVersion).toHaveBeenCalledWith('d1', {
      effectiveDate: '2026-03-15',
      notes: undefined,
      sections: [
        {
          numberLabel: 'Article I',
          title: 'Name and Purpose',
          content: '',
          children: [
            {
              numberLabel: 'Section 1.1',
              title: 'Name',
              content: 'The name is Maple Grove.',
              children: [],
            },
            { numberLabel: 'Section 1.2', title: 'Purpose', content: 'Gardens.', children: [] },
          ],
        },
        {
          numberLabel: 'Article II',
          title: 'Members',
          content: '',
          children: [
            {
              numberLabel: 'Section 2.1',
              title: 'Membership',
              content: 'Every owner is a member.',
              children: [],
            },
          ],
        },
      ],
    });
    expect(toast.showToast).toHaveBeenCalledWith('success', 'Saved version 2, with 5 sections');
  });

  it('merges a section into the one above, and parses edited text again', async () => {
    await readPasted(TEXT);
    fireEvent.click(
      screen.getByRole('button', { name: 'Merge Section 1.2 Purpos into the section above' }),
    );
    expect(screen.getByText('2 articles, 2 sections')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Bylaws text'), {
      target: { value: `${TEXT}\nSection 2.2 Dues\nDues are $20.` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parse again' }));
    expect(screen.getByText('2 articles, 4 sections')).toBeTruthy();
  });

  it('reads a Word document on the server', async () => {
    api.docxText.mockResolvedValueOnce('# Article I\n\n## Section 1.1 Name\n\nThe name is A.');
    renderPage();
    await screen.findByRole('heading', { name: 'Import the bylaws' });
    const docx = new File(['docx'], 'Bylaws.DOCX');
    chooseFile(docx);
    expect(await screen.findByText('1 article, 1 section')).toBeTruthy();
    expect(api.docxText).toHaveBeenCalledWith('d1', docx);
  });

  it('reads a text file in the browser', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Import the bylaws' });
    chooseFile(new File(['Article I\nName\nSection 1.1 Name\nText.'], 'bylaws.txt'));
    expect(await screen.findByText('1 article, 1 section')).toBeTruthy();
    expect(api.docxText).not.toHaveBeenCalled();
  });

  it('refuses other files, and a Word document over 5 MB', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Import the bylaws' });
    chooseFile(new File(['%PDF'], 'bylaws.pdf'));
    expect(await screen.findByText('Choose a .txt, .md or .docx file.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('File'), {
      target: { files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.docx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read the bylaws' }));
    expect(await screen.findByText('That file is over 5 MB.')).toBeTruthy();
    expect(api.docxText).not.toHaveBeenCalled();
  });

  it('is for secretaries and above', async () => {
    org.canEdit = false;
    renderPage();
    expect(
      await screen.findByText('Only a secretary or above can import the bylaws.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Read the bylaws' })).toBeNull();
  });
});
