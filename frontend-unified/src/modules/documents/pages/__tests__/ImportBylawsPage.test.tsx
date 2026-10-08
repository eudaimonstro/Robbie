import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
// Each row asks canMerge once as it renders: the count says which rows rendered
const tree = vi.hoisted(() => ({ canMerge: vi.fn() }));
vi.mock('../../utils/parsedTree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/parsedTree')>();
  tree.canMerge.mockImplementation(actual.canMerge);
  return { ...actual, canMerge: tree.canMerge };
});

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

  it("tells a document that isn't there from one that didn't load, and tries again", async () => {
    api.getDocument.mockRejectedValueOnce(Object.assign(new Error('HTTP 500'), { status: 500 }));
    renderPage();
    expect(await screen.findByText("Couldn't load the document.")).toBeTruthy();
    expect(screen.queryByText('Document not found.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Import the bylaws' })).toBeTruthy();
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

  it('merges a section into the one above, and asks before parsing again over it', async () => {
    await readPasted(TEXT);
    fireEvent.click(
      screen.getByRole('button', { name: 'Merge Section 1.2 Purpos into the section above' }),
    );
    expect(screen.getByText('2 articles, 2 sections')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Bylaws text'), {
      target: { value: `${TEXT}\nSection 2.2 Dues\nDues are $20.` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Parse again' }));
    // Not yet: the merge would be lost
    expect(screen.getByText('2 articles, 2 sections')).toBeTruthy();
    const confirm = screen.getByRole('group', { name: 'Parse the text again?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep my changes' }));
    expect(screen.queryByRole('group', { name: 'Parse the text again?' })).toBeNull();
    expect(screen.getByText('2 articles, 2 sections')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Parse again' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Parse the text again?' })).getByRole('button', {
        name: 'Parse again and lose them',
      }),
    );
    expect(screen.getByText('2 articles, 4 sections')).toBeTruthy();
    // Nothing to lose now: parsing again goes straight ahead
    fireEvent.click(screen.getByRole('button', { name: 'Parse again' }));
    expect(screen.queryByRole('group', { name: 'Parse the text again?' })).toBeNull();
  });

  it("won't save sections from text that has changed since it was parsed", async () => {
    await readPasted(TEXT);
    const save = () =>
      screen.getByRole('button', { name: 'Save as a new version' }) as HTMLButtonElement;
    expect(save().disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Bylaws text'), {
      target: { value: `${TEXT}\nSection 2.2 Dues\nDues are $20.` },
    });
    expect(screen.getByText('The text has changed. Parse it again to save it.')).toBeTruthy();
    expect(save().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Parse again' }));
    expect(screen.queryByText('The text has changed. Parse it again to save it.')).toBeNull();
    fireEvent.click(save());
    await screen.findByText('Document page');
    const [, data] = api.saveVersion.mock.calls[0];
    expect(data.sections[1].children).toHaveLength(2);
  });

  it("doesn't draw the sections again for a keystroke in the text", async () => {
    await readPasted(TEXT);
    const rendered = tree.canMerge.mock.calls.length;
    expect(rendered).toBeGreaterThanOrEqual(5);
    fireEvent.change(screen.getByLabelText('Bylaws text'), { target: { value: `${TEXT} ` } });
    expect(tree.canMerge.mock.calls.length).toBe(rendered);

    // A fix to one title draws that row and the ones holding it, not its neighbors
    tree.canMerge.mockClear();
    fireEvent.change(screen.getByLabelText('Title of Section 1.2 Purpos'), {
      target: { value: 'Purpose' },
    });
    expect(tree.canMerge.mock.calls.length).toBe(2);
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
