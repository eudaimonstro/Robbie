import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Printer } from 'lucide-react';
import type { SectionTree } from '../../../api/client';
import { formatLongDate } from '../../../utils/dates';

/** A section as printed; annotations, the members' notes, never are */
export type PrintSection = Pick<SectionTree, 'id' | 'numberLabel' | 'title' | 'content'> & {
  children: PrintSection[];
};

interface PrintShellProps {
  /** The browser tab's title, which a saved PDF takes as its name */
  title: string;
  backTo: string;
  backLabel: string;
  /** Open the print dialog once shown (the page was opened with ?print=1) */
  autoPrint: boolean;
  children: ReactNode;
}

/**
 * A print page's frame, without the app's chrome: paper, and a toolbar the printout leaves out.
 * The page that renders it has its content loaded, so the dialog opens on the whole text.
 */
export function PrintShell({ title, backTo, backLabel, autoPrint, children }: PrintShellProps) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);

  useEffect(() => {
    if (!autoPrint) return;
    // Print once the typefaces have loaded, so the PDF isn't set in a fallback face (jsdom, in
    // the tests, has no document.fonts)
    const fonts: FontFaceSet | undefined = document.fonts;
    if (fonts) void fonts.ready.then(() => window.print());
    else window.print();
  }, [autoPrint]);

  return (
    <div className="min-h-screen bg-paper px-4 py-6 print:bg-transparent print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-3xl items-center justify-between gap-3">
        <Link to={backTo} className="inline-flex items-center gap-1 text-gavel hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
        <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print or save as PDF
        </button>
      </div>
      {children}
    </div>
  );
}

/** Whether an article is long enough to start a page: more than 4 sections, or about a page */
function isLong(article: PrintSection): boolean {
  let sections = 0;
  let characters = (article.content ?? '').length;
  const walk = (section: PrintSection) => {
    sections++;
    characters += (section.content ?? '').length;
    section.children.forEach(walk);
  };
  article.children.forEach(walk);
  return sections > 4 || characters > 1500;
}

function PrintedSection({
  section,
  depth,
  breakBefore = false,
}: {
  section: PrintSection;
  depth: number;
  breakBefore?: boolean;
}) {
  const named = !!(section.numberLabel || section.title);
  return (
    <section className={breakBefore ? 'print-break-before' : undefined}>
      {named &&
        (depth === 0 ? (
          <h2 className="font-serif-soft text-title font-semibold">
            {section.numberLabel && (
              <span className="block text-sm font-semibold uppercase tracking-[0.08em] text-ink-muted">
                {section.numberLabel}
              </span>
            )}{' '}
            {section.title}
          </h2>
        ) : (
          <h3 className="font-semibold">
            {[section.numberLabel, section.title].filter(Boolean).join(' ')}
          </h3>
        ))}
      {section.content && (
        <div className="document-content mt-2">
          <ReactMarkdown>{section.content}</ReactMarkdown>
        </div>
      )}
      {section.children.length > 0 && (
        <div className={depth === 0 ? 'mt-4 space-y-4' : 'ml-5 mt-3 space-y-3'}>
          {section.children.map((child) => (
            <PrintedSection key={child.id} section={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

interface PrintableDocumentProps {
  organizationName: string;
  documentTitle: string;
  versionNumber: number;
  effectiveDate: string | null;
  sections: PrintSection[];
}

/**
 * A version of a document as printed: the organization and the document in a running header on
 * every page, the title and "Version 2, effective March 15, 2026", and the sections in the
 * document typeface, a long article starting a new page
 */
export function PrintableDocument({
  organizationName,
  documentTitle,
  versionNumber,
  effectiveDate,
  sections,
}: PrintableDocumentProps) {
  const effective = effectiveDate ? `, effective ${formatLongDate(effectiveDate)}` : '';
  return (
    <article className="print-document mx-auto max-w-3xl rounded-xl border border-rule bg-surface px-6 py-10 sm:px-12">
      <div className="print-running-header" aria-hidden="true">
        {organizationName ? `${organizationName} | ${documentTitle}` : documentTitle}
      </div>
      {/* Not a <header>: the print styles hide the app's header elements */}
      <div className="mb-10 text-center">
        {organizationName && <p className="label-caps">{organizationName}</p>}
        <h1 className="mt-2 font-serif-soft text-page font-semibold text-ink">{documentTitle}</h1>
        <p className="mt-2 text-ink-muted">{`Version ${versionNumber}${effective}`}</p>
      </div>
      <div className="space-y-8 font-document text-ink">
        {sections.map((section, index) => (
          <PrintedSection
            key={section.id}
            section={section}
            depth={0}
            breakBefore={index > 0 && isLong(section)}
          />
        ))}
      </div>
    </article>
  );
}
