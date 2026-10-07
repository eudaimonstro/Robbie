import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, Download, Info, Printer, RefreshCw, Send } from 'lucide-react';
import { HttpError, minutes as minutesApi, type MinutesRecord } from '../../../api/client';
import { useCan, useSelectRecordOrganization } from '../../../context/OrganizationContext';
import { useToast } from '../../../context/ToastContext';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import { MinutesStatusBadge } from '../../../components/ui/Badge';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { formatMeetingTimeWithYear } from '../../../utils/dates';
import { downloadText, fileName } from '../../../utils/download';
import { meetingName } from '../utils/minutes';

/** How long the editor waits after the last keystroke before it saves */
export const AUTOSAVE_MS = 2000;

type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed' | 'refused';

/**
 * The server's refusal to change the minutes as asked (409): they were approved, they are
 * before a meeting, or there is nothing to write them from. Its message says which.
 */
const isRefusal = (err: unknown): err is HttpError =>
  err instanceof HttpError && err.status === 409;

/** The server's message as a sentence */
const sentence = (message: string) => (/[.!?]$/.test(message) ? message : `${message}.`);

/** A meeting's minutes (/minutes/:minutesId): a secretary edits them, members read them */
export default function MinutesPage() {
  const { minutesId = '' } = useParams<{ minutesId: string }>();
  const [record, setRecord] = useState<MinutesRecord | null>(null);
  const [loadError, setLoadError] = useState<'missing' | 'failed' | null>(null);
  // Why the last change was refused, kept above the editor or the reader it turns into
  const [notice, setNotice] = useState<string | null>(null);
  // Whether the editor was open when a save was refused: it stays, read-only, with the text
  const [stoppedEditor, setStoppedEditor] = useState(false);
  useSelectRecordOrganization(record?.organizationId);
  const isSecretary = useCan('secretary');

  useEffect(() => {
    let canceled = false;
    minutesApi
      .get(minutesId)
      .then((found) => {
        if (!canceled) setRecord(found);
      })
      .catch((err) => {
        // A draft is not found below secretary, like minutes that don't exist
        if (!canceled)
          setLoadError(err instanceof HttpError && err.status === 404 ? 'missing' : 'failed');
      });
    return () => {
      canceled = true;
    };
  }, [minutesId]);

  // After a refusal the minutes have changed under the editor (approved, published): read them
  // again, so the page shows them as they now are
  const reload = useCallback(() => {
    minutesApi
      .get(minutesId)
      .then(setRecord)
      .catch(() => {});
  }, [minutesId]);

  const refused = useCallback(
    (message: string) => {
      setNotice(message);
      setStoppedEditor(true);
      reload();
    },
    [reload],
  );

  if (loadError) {
    return (
      <div className="py-12 text-center">
        <p className="text-ink">
          {loadError === 'missing'
            ? "These minutes aren't available."
            : "Couldn't load the minutes."}
        </p>
        {loadError === 'missing' && (
          <p className="mt-1 text-sm text-ink-muted">
            Minutes are here once the secretary publishes them.
          </p>
        )}
        <Link to="/minutes" className="mt-4 inline-block text-gavel hover:underline">
          All minutes
        </Link>
      </div>
    );
  }
  if (!record) return <LoadingPage />;

  // Published minutes a meeting has before it are the meeting's to correct (the server refuses
  // a save; see beforeMeeting): they open read. An editor already open when the meeting took them
  // up stays, stopped, so the text typed isn't lost.
  const beforeMeeting = record.status === 'published' && record.beforeMeeting;
  // Approved minutes are the record: nobody edits them
  const editable = isSecretary && record.status !== 'approved' && (!beforeMeeting || stoppedEditor);
  // The editor takes the width for its two columns; the reader keeps a readable measure
  return (
    <div className={`mx-auto space-y-6 ${editable ? 'max-w-7xl' : 'max-w-4xl'}`}>
      <MinutesHeading record={record} />
      {beforeMeeting && (
        <p className="flex items-start gap-2 rounded-md border border-rule bg-surface-2 px-4 py-3 text-sm text-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          These minutes are before a meeting for approval. Any corrections are made by the meeting
          when it approves them.
        </p>
      )}
      {notice && (
        <p
          role="alert"
          className="rounded-md border border-caution/40 bg-caution-tint px-4 py-3 text-sm text-caution-ink"
        >
          {notice}
        </p>
      )}
      {editable ? (
        <MinutesEditor
          key={record.id}
          record={record}
          onChange={setRecord}
          onRefused={refused}
          onReload={reload}
        />
      ) : (
        <MinutesReader record={record} />
      )}
    </div>
  );
}

function MinutesHeading({ record }: { record: MinutesRecord }) {
  const when = record.packet.scheduledFor
    ? formatMeetingTimeWithYear(record.packet.scheduledFor)
    : null;
  const approvedAt = record.approvedAtPacket?.title;
  return (
    <div>
      <Link
        to="/minutes"
        className="inline-flex items-center gap-1 text-sm text-gavel hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Minutes
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h2 className="page-title">Minutes of the {meetingName(record)}</h2>
        <MinutesStatusBadge status={record.status} />
      </div>
      {(when || record.packet.location) && (
        <p className="mt-1 text-ink-muted">
          {[when, record.packet.location].filter(Boolean).join(', ')}
        </p>
      )}
      {record.status === 'approved' && (
        <p className="mt-2 text-ink">
          {approvedAt ? `Approved at the ${approvedAt}` : 'Approved'}
          {record.corrections ? ` with corrections: ${record.corrections}` : ', as read.'}
        </p>
      )}
    </div>
  );
}

/** Print or save as PDF, and download the Markdown */
function TakeAway({ record, body }: { record: MinutesRecord; body: string }) {
  return (
    <>
      <a
        href={`/minutes/${record.id}/print?print=1`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary btn-sm"
      >
        <Printer className="h-4 w-4" aria-hidden="true" />
        Print or save as PDF
      </a>
      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={() => downloadText(`${fileName(meetingName(record))}-minutes.md`, body)}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download Markdown
      </button>
    </>
  );
}

function MinutesReader({ record }: { record: MinutesRecord }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <TakeAway record={record} body={record.body} />
      </div>
      <article className="card p-5 sm:p-10">
        <div className="document-content">
          <ReactMarkdown>{record.body}</ReactMarkdown>
        </div>
      </article>
    </>
  );
}

/**
 * The secretary's editor: Markdown and its preview, saved AUTOSAVE_MS after typing stops (the
 * last save wins, and the status names who made it). A save the server refuses stops the
 * editor: the text stays, read-only, and the page says why.
 */
function MinutesEditor({
  record,
  onChange,
  onRefused,
  onReload,
}: {
  record: MinutesRecord;
  onChange: (next: MinutesRecord) => void;
  /** A save was refused, with the reason to show */
  onRefused: (message: string) => void;
  /** Read the minutes again after a refused publish or regenerate */
  onReload: () => void;
}) {
  const { showToast } = useToast();
  const [body, setBody] = useState(record.body);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [busy, setBusy] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  // The text as typed, for a save that runs after the render that scheduled it
  const latest = useRef(record.body);
  // The text the server last took from this editor (or sent it)
  const lastSaved = useRef(record.body);
  // The saves, one after another: a save waits for the one before it, so an older text never
  // lands after a newer one
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once the server refuses a save: nothing more is sent
  const stopped = useRef(false);
  // Set while the minutes are written again: the text typed before is dropped, not sent
  const discarding = useRef(false);
  const [regenerating, setRegenerating] = useState(false);
  const id = record.id;

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Send the text as typed until the server has it; false when it couldn't be saved */
  const sendLatest = useCallback(async (): Promise<boolean> => {
    // Text typed during a save is sent once it is back, whether or not a timer is waiting
    while (!stopped.current && !discarding.current && latest.current !== lastSaved.current) {
      const text = latest.current;
      setSaveState('saving');
      try {
        onChange(await minutesApi.save(id, text));
        lastSaved.current = text;
      } catch (err) {
        if (isRefusal(err)) {
          stopped.current = true;
          cancelTimer();
          setSaveState('refused');
          onRefused(`${sentence(err.message)} Your last changes weren't saved.`);
        } else {
          setSaveState('failed');
        }
        return false;
      }
    }
    if (stopped.current) return false;
    if (!discarding.current) setSaveState('saved');
    return true;
  }, [id, onChange, onRefused]);

  /** Save the text as typed, after any save already out; false when it couldn't be saved */
  const save = useCallback((): Promise<boolean> => {
    cancelTimer();
    chain.current = chain.current.then(sendLatest);
    return chain.current;
  }, [sendLatest]);

  // Leaving the page with text the server doesn't have (typed before the autosave, or after a
  // save failed): save it on the way out, after any save still out
  useEffect(
    () => () => {
      cancelTimer();
      void chain.current.then(() => {
        if (stopped.current || discarding.current || latest.current === lastSaved.current) return;
        minutesApi.save(id, latest.current).catch(() => {});
      });
    },
    [id],
  );

  // Closing or reloading the tab with text not yet saved: the browser asks first
  const pending = saveState === 'unsaved' || saveState === 'saving' || saveState === 'failed';
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  const edit = (text: string) => {
    if (stopped.current) return;
    setBody(text);
    latest.current = text;
    setSaveState('unsaved');
    cancelTimer();
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };

  const publish = async () => {
    setBusy(true);
    try {
      // The text as typed goes first, after any save still out, so what is published is it
      if (!(await save())) {
        // A refusal is explained on the page; anything else, here
        if (!stopped.current) {
          showToast('error', "Couldn't publish: the last changes weren't saved");
        }
        return;
      }
      onChange(await minutesApi.publish(id));
      showToast(
        'success',
        'Published: the members can read them, and the next meeting will be asked to approve them',
      );
    } catch (err) {
      showToast('error', err instanceof HttpError ? err.message : "Couldn't publish the minutes");
      if (isRefusal(err)) onReload();
    } finally {
      setBusy(false);
    }
  };

  // Confirmed: the edits not yet saved are dropped, since the text is replaced. A save already
  // out lands first, so it can't put the old text back over the new.
  const regenerate = async () => {
    setConfirmRegenerate(false);
    setBusy(true);
    setRegenerating(true);
    cancelTimer();
    discarding.current = true;
    let written: MinutesRecord | null = null;
    try {
      await chain.current;
      written = await minutesApi.regenerate(id);
      setBody(written.body);
      latest.current = written.body;
      lastSaved.current = written.body;
      setSaveState('saved');
      onChange(written);
      showToast('success', 'The minutes were written again from the meeting');
    } catch (err) {
      showToast(
        'error',
        err instanceof HttpError ? err.message : "Couldn't write the minutes again",
      );
      // Published in the meantime, or no record: show the minutes as they are
      if (isRefusal(err)) onReload();
    } finally {
      discarding.current = false;
      setRegenerating(false);
      setBusy(false);
    }
    // Not written again: the text typed stays, and is saved
    if (!written && latest.current !== lastSaved.current) void save();
  };

  const status = {
    saved: record.updatedBy?.name ? `Saved by ${record.updatedBy.name}` : 'Saved',
    unsaved: 'Not saved yet',
    saving: 'Saving...',
    failed: "Couldn't save. Your text is still here; keep typing to try again.",
    refused: 'Not saved',
  }[saveState];
  const refused = saveState === 'refused';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {record.status === 'draft' ? (
          <>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={busy || refused}
              onClick={() => void publish()}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Publish
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={busy || refused}
              onClick={() => setConfirmRegenerate(true)}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Regenerate from the meeting
            </button>
          </>
        ) : (
          <TakeAway record={record} body={body} />
        )}
        <p role="status" className="ml-auto text-sm text-ink-muted">
          {status}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="minutes-text-heading" className="card flex flex-col p-4 sm:p-6">
          <h3 id="minutes-text-heading" className="label-caps mb-3">
            Markdown
          </h3>
          <label htmlFor="minutesText" className="sr-only">
            Minutes text
          </label>
          <textarea
            id="minutesText"
            className="textarea min-h-[60vh] flex-1 text-sm read-only:bg-surface-2 read-only:text-ink-muted"
            value={body}
            readOnly={refused || regenerating}
            onChange={(e) => edit(e.target.value)}
          />
        </section>
        <section aria-labelledby="minutes-preview-heading" className="card p-4 sm:p-6">
          <h3 id="minutes-preview-heading" className="label-caps mb-3">
            Preview
          </h3>
          <div className="document-content">
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>
        </section>
      </div>
      <ConfirmDialog
        isOpen={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={() => void regenerate()}
        title="Write the minutes again?"
        message="This replaces the text with minutes written again from the meeting's record. Your edits will be lost."
        confirmText="Write them again"
        variant="danger"
      />
    </>
  );
}
