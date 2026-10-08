import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  documents as documentsApi,
  versions as versionsApi,
  type Document,
  type SectionTree,
  type Version,
} from '../../../api/client';
import { useOrganization } from '../../../context/OrganizationContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { PrintShell, PrintableDocument } from '../components/PrintableDocument';

interface Loaded {
  doc: Document;
  version: Version;
  sections: SectionTree[];
}

/** A version of a document ready to print or save as PDF: /documents/:documentId/print?version= */
export default function PrintDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [params] = useSearchParams();
  const versionId = params.get('version');
  const { organizations } = useOrganization();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let canceled = false;
    const load = async (): Promise<Loaded> => {
      const [doc, list] = await Promise.all([
        documentsApi.get(documentId),
        versionsApi.list(documentId),
      ]);
      const version = list.find((v) => v.id === (versionId ?? doc.currentVersionId)) ?? list[0];
      if (!version) throw new Error('This document has no version to print yet.');
      return { doc, version, sections: await versionsApi.getTree(version.id) };
    };
    load()
      .then((result) => {
        if (!canceled) setLoaded(result);
      })
      .catch((err: unknown) => {
        if (!canceled) setError(err instanceof Error ? err.message : 'Failed to load the document');
      });
    return () => {
      canceled = true;
    };
  }, [documentId, versionId]);

  if (error) return <p className="p-8 text-center text-ink-muted">{error}</p>;
  if (!loaded) return <LoadingPage label="Loading the document..." />;

  const { doc, version, sections } = loaded;
  return (
    <PrintShell
      title={`${doc.title}, version ${version.versionNumber}`}
      backTo={`/documents/${doc.id}`}
      backLabel="Back to the document"
      autoPrint={params.get('print') === '1'}
    >
      <PrintableDocument
        organizationName={organizations.find((o) => o.id === doc.organizationId)?.name ?? ''}
        documentTitle={doc.title}
        versionNumber={version.versionNumber}
        effectiveDate={version.effectiveDate}
        sections={sections}
      />
    </PrintShell>
  );
}
