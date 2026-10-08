import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicDocuments, type SharedDocument, type SharedVersion } from '../../../api/client';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { PrintShell, PrintableDocument } from '../components/PrintableDocument';

interface Loaded {
  shared: SharedDocument;
  version: SharedVersion;
}

/** A shared document ready to print, for anyone with the link: /share/:shareToken/print?version= */
export default function PublicPrintPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [params] = useSearchParams();
  const versionId = params.get('version');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) return;
    let canceled = false;
    const load = async (): Promise<Loaded> => {
      const shared = await publicDocuments.get(shareToken);
      const wanted = versionId ?? shared.currentVersion?.id ?? shared.versions[0]?.id;
      if (!wanted) throw new Error('This document has no version to print yet.');
      const version =
        shared.currentVersion?.id === wanted
          ? shared.currentVersion
          : await publicDocuments.getVersion(shareToken, wanted);
      return { shared, version };
    };
    load()
      .then((result) => {
        if (!canceled) setLoaded(result);
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setError(
            err instanceof Error && /no version/.test(err.message)
              ? err.message
              : 'This document is not available. The link may be invalid or sharing may have been disabled.',
          );
        }
      });
    return () => {
      canceled = true;
    };
  }, [shareToken, versionId]);

  if (error) return <p className="p-8 text-center text-ink-muted">{error}</p>;
  if (!loaded) return <LoadingPage label="Loading the document..." />;

  const { shared, version } = loaded;
  return (
    <PrintShell
      title={`${shared.document.title}, version ${version.versionNumber}`}
      backTo={`/share/${shareToken}`}
      backLabel="Back to the document"
      autoPrint={params.get('print') === '1'}
    >
      <PrintableDocument
        organizationName={shared.document.organization.name}
        documentTitle={shared.document.title}
        versionNumber={version.versionNumber}
        effectiveDate={version.effectiveDate}
        sections={version.sections}
      />
    </PrintShell>
  );
}
