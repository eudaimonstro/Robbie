import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { HttpError, minutes as minutesApi, type MinutesRecord } from '../../../api/client';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { PrintShell } from '../components/PrintableDocument';
import { meetingName } from '../utils/minutes';

/** A meeting's minutes ready to print or save as PDF: /minutes/:minutesId/print */
export default function MinutesPrintPage() {
  const { minutesId = '' } = useParams<{ minutesId: string }>();
  const [params] = useSearchParams();
  const [record, setRecord] = useState<MinutesRecord | null>(null);
  const [loadError, setLoadError] = useState<'missing' | 'failed' | null>(null);

  useEffect(() => {
    let canceled = false;
    minutesApi
      .get(minutesId)
      .then((found) => {
        if (!canceled) setRecord(found);
      })
      .catch((err) => {
        if (!canceled) {
          setLoadError(err instanceof HttpError && err.status === 404 ? 'missing' : 'failed');
        }
      });
    return () => {
      canceled = true;
    };
  }, [minutesId]);

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-ink">
          {loadError === 'missing'
            ? "These minutes aren't available."
            : "Couldn't load the minutes."}
        </p>
        <Link to="/minutes" className="mt-4 inline-block text-gavel hover:underline">
          All minutes
        </Link>
      </div>
    );
  }
  if (!record) return <LoadingPage />;

  const title = `Minutes of the ${meetingName(record)}`;
  return (
    <PrintShell
      title={title}
      backTo={`/minutes/${record.id}`}
      backLabel="Back to the minutes"
      autoPrint={params.get('print') === '1'}
    >
      <article className="print-document mx-auto max-w-3xl rounded-xl border border-rule bg-surface px-6 py-10 sm:px-12">
        <div className="print-running-header" aria-hidden="true">
          {`${record.organization.name} | ${title}`}
        </div>
        <div className="document-content">
          <ReactMarkdown>{record.body}</ReactMarkdown>
        </div>
      </article>
    </PrintShell>
  );
}
