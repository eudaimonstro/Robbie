import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileUp, ListTree, Merge } from 'lucide-react';
import {
  describeParsedBylaws,
  parseBylaws,
  type ParsedSection,
} from '@robbie-bylawyer/shared/utils';
import { bylawsImport, documents as documentsApi, type Document } from '../../../api/client';
import { useCan, useSelectRecordOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { canMerge, mergeIntoPrevious, renameSection, type TreePath } from '../utils/parsedTree';

/** The largest Word document the server reads */
const DOCX_LIMIT_BYTES = 5 * 1024 * 1024;

const PLACEHOLDER =
  'ARTICLE I\nNAME AND PURPOSE\n\nSection 1.1 Name. The name of this corporation is...';

/**
 * The bylaws pasted or from a file, read into sections, reviewed and saved as a new version
 * (/documents/:documentId/import, secretaries)
 */
export default function ImportBylawsPage() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [doc, setDoc] = useState<Document | null>(null);
  const [notFound, setNotFound] = useState(false);
  useSelectRecordOrganization(doc?.organizationId);
  const canImport = useCan('secretary');

  const [step, setStep] = useState<'source' | 'review'>('source');
  const [source, setSource] = useState<'paste' | 'file'>('paste');
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The review: the text, which can be edited and parsed again, and the sections found in it
  const [text, setText] = useState('');
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => describeParsedBylaws(sections), [sections]);

  useEffect(() => {
    let canceled = false;
    documentsApi
      .get(documentId)
      .then((found) => {
        if (!canceled) setDoc(found);
      })
      .catch(() => {
        if (!canceled) setNotFound(true);
      });
    return () => {
      canceled = true;
    };
  }, [documentId]);

  const review = (value: string) => {
    setText(value);
    setSections(parseBylaws(value));
    setStep('review');
  };

  const read = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (source === 'paste') {
      if (pasted.trim()) review(pasted);
      else setProblem('Paste the bylaws first.');
      return;
    }
    if (!file) {
      setProblem('Choose a file first.');
      return;
    }
    const name = file.name.toLowerCase();
    if (!/\.(txt|md|docx)$/.test(name)) {
      setProblem('Choose a .txt, .md or .docx file.');
      return;
    }
    if (name.endsWith('.docx') && file.size > DOCX_LIMIT_BYTES) {
      setProblem('That file is over 5 MB.');
      return;
    }
    setReading(true);
    try {
      review(
        name.endsWith('.docx') ? await bylawsImport.docxText(documentId, file) : await file.text(),
      );
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't read the file");
    } finally {
      setReading(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const version = await bylawsImport.saveVersion(documentId, {
        effectiveDate: effectiveDate || undefined,
        notes: notes.trim() || undefined,
        sections,
      });
      const count = version.sectionCount;
      showToast(
        'success',
        `Saved version ${version.versionNumber}, with ${count} section${count === 1 ? '' : 's'}`,
      );
      navigate(`/documents/${documentId}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : "Couldn't save the version");
      setSaving(false);
    }
  };

  if (notFound) return <p className="py-12 text-center text-ink-muted">Document not found.</p>;
  if (!doc) return <LoadingPage />;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Link
          to={`/documents/${doc.id}`}
          className="inline-flex items-center gap-1 text-sm text-gavel hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {doc.title}
        </Link>
        <h2 className="page-title mt-1">Import the bylaws</h2>
        <p className="mt-1 text-ink-muted">
          Paste the text or choose a file. Robbie finds the articles and sections, and you check
          them before saving a new version.
        </p>
      </div>

      {!canImport ? (
        <p className="card p-6 text-ink-muted">Only a secretary or above can import the bylaws.</p>
      ) : step === 'source' ? (
        <form onSubmit={(e) => void read(e)} className="card max-w-3xl space-y-5 p-6">
          <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
            <legend className="label">Source</legend>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="source"
                className="accent-gavel"
                checked={source === 'paste'}
                onChange={() => setSource('paste')}
              />
              Paste the text
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="source"
                className="accent-gavel"
                checked={source === 'file'}
                onChange={() => setSource('file')}
              />
              A file (.txt, .md or .docx)
            </label>
          </fieldset>
          {source === 'paste' ? (
            <div>
              <label htmlFor="bylawsText" className="label">
                Bylaws text
              </label>
              <textarea
                id="bylawsText"
                className="textarea h-80 font-document"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={PLACEHOLDER}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="bylawsFile" className="label">
                File
              </label>
              <input
                id="bylawsFile"
                type="file"
                accept=".txt,.md,.docx"
                className="block text-sm text-ink"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-ink-muted">
                A Word document is read on the server and not kept. It can be up to 5 MB.
              </p>
            </div>
          )}
          {problem && (
            <p role="alert" className="text-sm text-gavel">
              {problem}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={reading}>
            <FileUp className="h-5 w-5" aria-hidden="true" />
            {reading ? 'Reading...' : 'Read the bylaws'}
          </button>
        </form>
      ) : (
        <>
          {/* The sections get the wider column: each row holds a label, a title and Merge up */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section aria-labelledby="found-heading" className="card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 id="found-heading" className="card-title flex items-center gap-2">
                  <ListTree className="h-5 w-5" aria-hidden="true" />
                  What Robbie found
                </h3>
                <p className="text-sm tabular-nums text-ink-muted">{summary}</p>
              </div>
              {sections.length === 0 ? (
                <p className="text-ink-muted">
                  No sections yet. Check the text and parse it again.
                </p>
              ) : (
                <ol className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
                  {sections.map((section, index) => (
                    <ParsedNode
                      key={index}
                      section={section}
                      path={[index]}
                      tree={sections}
                      onChange={setSections}
                    />
                  ))}
                </ol>
              )}
            </section>
            <section aria-labelledby="text-heading" className="card flex flex-col p-5">
              <h3 id="text-heading" className="card-title mb-4">
                The text
              </h3>
              <label htmlFor="reviewText" className="sr-only">
                Bylaws text
              </label>
              <textarea
                id="reviewText"
                className="textarea min-h-80 flex-1 font-document"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="mt-2 text-xs text-ink-muted">
                To split a section, add its heading line here and parse again. Parsing again starts
                over from the text.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setSections(parseBylaws(text))}
                >
                  Parse again
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setStep('source')}
                >
                  Choose another source
                </button>
              </div>
            </section>
          </div>
          <form
            onSubmit={(e) => void save(e)}
            className="card grid gap-4 p-6 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
          >
            <div>
              <label htmlFor="importEffectiveDate" className="label">
                Effective date (optional)
              </label>
              <input
                id="importEffectiveDate"
                type="date"
                className="input"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="importNotes" className="label">
                Version notes (optional)
              </label>
              <input
                id="importNotes"
                className="input"
                value={notes}
                maxLength={5000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Imported from the 2024 bylaws"
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || sections.length === 0}
            >
              {saving ? 'Saving...' : 'Save as a new version'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

interface ParsedNodeProps {
  section: ParsedSection;
  path: TreePath;
  tree: ParsedSection[];
  onChange: (next: ParsedSection[]) => void;
}

/** One section found: its label and title to correct, and Merge up */
function ParsedNode({ section, path, tree, onChange }: ParsedNodeProps) {
  const name = [section.numberLabel, section.title].filter(Boolean).join(' ') || 'the preamble';
  return (
    <li className="rounded-lg border border-rule bg-surface p-2 sm:p-3">
      <div className="flex items-start gap-2">
        {/* Stacked on phones, side by side from sm up; the title takes what the label leaves */}
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <input
            className="input py-1 text-sm"
            aria-label={`Label of ${name}`}
            placeholder="Label"
            maxLength={100}
            value={section.numberLabel ?? ''}
            onChange={(e) => onChange(renameSection(tree, path, { numberLabel: e.target.value }))}
          />
          <input
            className="input py-1 text-sm"
            aria-label={`Title of ${name}`}
            placeholder="Title"
            maxLength={500}
            value={section.title ?? ''}
            onChange={(e) => onChange(renameSection(tree, path, { title: e.target.value }))}
          />
        </div>
        {/* Its words from sm up; on a phone the icon alone, to leave the inputs their width */}
        <button
          type="button"
          className="btn-ghost btn-sm shrink-0 px-2 sm:px-3"
          disabled={!canMerge(path)}
          aria-label={`Merge ${name} into the section above`}
          title="Merge up"
          onClick={() => onChange(mergeIntoPrevious(tree, path))}
        >
          <Merge className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Merge up</span>
        </button>
      </div>
      {section.content && (
        <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink-muted">
          {section.content}
        </p>
      )}
      {section.children.length > 0 && (
        <ol className="ml-1 mt-2 space-y-2 border-l border-rule pl-2 sm:ml-3 sm:pl-3">
          {section.children.map((child, index) => (
            <ParsedNode
              key={index}
              section={child}
              path={[...path, index]}
              tree={tree}
              onChange={onChange}
            />
          ))}
        </ol>
      )}
    </li>
  );
}
