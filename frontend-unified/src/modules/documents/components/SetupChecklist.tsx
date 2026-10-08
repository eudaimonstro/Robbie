import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import {
  documents as documentsApi,
  members as membersApi,
  organizations as organizationsApi,
  type Document,
  type OrganizationWithRole,
  type ScheduledMeeting,
} from '../../../api/client';
import { useCan, useOrganization } from '../../../context/OrganizationContext';
import {
  QuorumFields,
  quorumDraftOf,
  readQuorumDraft,
} from '../../../components/organizations/QuorumFields';
import { MEMBERS_SETTINGS, quorumIsSet } from '../../../utils/quorum';

interface SetupChecklistProps {
  organization: OrganizationWithRole;
  /** The organization's documents and schedule as the home page loaded them */
  documents: Document[];
  meetings: ScheduledMeeting[];
}

/** The bylaws are in when a bylaws document has a version */
const bylawsIn = (documents: Document[]) =>
  documents.some((doc) => doc.docType === 'bylaws' && doc.currentVersionId);

/**
 * What a new organization does before its first meeting, on its home page, for secretaries and
 * above: 1. the voting members and quorum, 2. the bylaws, 3. the members, 4. the first meeting.
 * Each step links to where it is done and ticks itself off from the organization's own data;
 * the card is gone once all four are done.
 */
export function SetupChecklist({ organization, documents, meetings }: SetupChecklistProps) {
  const navigate = useNavigate();
  const isAdmin = useCan('admin');
  // Someone besides the creator: another member, or a pending addition (admins see those)
  const [hasMembers, setHasMembers] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let canceled = false;
    membersApi
      .list(organization.id)
      .then((list) => {
        if (!canceled) setHasMembers(list.members.length > 1 || (list.invites ?? []).length > 0);
      })
      .catch(() => {
        // The other steps still show; this one stays open
        if (!canceled) setHasMembers(false);
      });
    return () => {
      canceled = true;
    };
  }, [organization.id]);

  const steps = {
    quorum: quorumIsSet(organization),
    bylaws: bylawsIn(documents),
    members: hasMembers === true,
    meeting: meetings.length > 0,
  };
  if (hasMembers === null || Object.values(steps).every(Boolean)) return null;

  const addBylaws = async () => {
    setProblem(null);
    // A bylaws document without a version yet is the one to import into
    const waiting = documents.find((doc) => doc.docType === 'bylaws' && !doc.currentVersionId);
    if (waiting) {
      navigate(`/documents/${waiting.id}/import`);
      return;
    }
    setCreating(true);
    try {
      const created = await documentsApi.create(organization.id, {
        title: 'Bylaws',
        docType: 'bylaws',
      });
      navigate(`/documents/${created.id}/import`);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't create the bylaws document");
      setCreating(false);
    }
  };

  return (
    <section aria-labelledby="setup-heading" className="card">
      <div className="border-b border-rule px-5 py-4">
        <h3 id="setup-heading" className="card-title">
          Set up {organization.name}
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          Four steps before the first meeting. Each one ticks itself off when it is done.
        </p>
      </div>
      <ol className="divide-y divide-rule">
        <Step number={1} title="Voting members and quorum" done={steps.quorum}>
          {isAdmin ? (
            <QuorumStep organization={organization} />
          ) : (
            <p>An admin sets them in Settings. No meeting can open until they are set.</p>
          )}
        </Step>
        <Step number={2} title="The bylaws" done={steps.bylaws}>
          <p>Paste them or upload a Word file: Robbie finds the articles and sections.</p>
          <button
            type="button"
            className="btn-secondary btn-sm mt-2"
            disabled={creating}
            onClick={() => void addBylaws()}
          >
            Add the bylaws
          </button>
          {problem && (
            <p role="alert" className="mt-2 text-gavel">
              {problem}
            </p>
          )}
        </Step>
        <Step number={3} title="Members" done={steps.members}>
          {isAdmin ? (
            <>
              <p>Add the owners by email, one at a time or a pasted list.</p>
              <Link to={MEMBERS_SETTINGS} className="btn-secondary btn-sm mt-2">
                Add people
              </Link>
            </>
          ) : (
            <p>An admin adds the owners in Settings.</p>
          )}
        </Step>
        <Step number={4} title="The first meeting" done={steps.meeting}>
          <p>Schedule it with its date, place and agenda.</p>
          <Link to="/meetings" className="btn-secondary btn-sm mt-2">
            Schedule a meeting
          </Link>
        </Step>
      </ol>
    </section>
  );
}

function Step({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3 px-5 py-4">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-carried" aria-hidden="true" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${done ? 'text-ink-muted' : 'text-ink'}`}>
          {number}. {title}
          {done && <span className="sr-only"> (done)</span>}
        </p>
        {done ? (
          <p className="text-sm text-carried">Done</p>
        ) : (
          <div className="mt-1 text-sm text-ink-muted">{children}</div>
        )}
      </div>
    </li>
  );
}

/** The voting members and quorum, set right here (admins) */
function QuorumStep({ organization }: { organization: OrganizationWithRole }) {
  const { refreshOrganizations } = useOrganization();
  const [draft, setDraft] = useState(quorumDraftOf(null));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const settings = readQuorumDraft(draft);
    if ('problem' in settings) {
      setProblem(settings.problem);
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      await organizationsApi.update(organization.id, settings.body);
      // The step ticks itself off with the organization as it is now
      await refreshOrganizations();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't save them");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="mt-2 space-y-3 text-ink">
      <p className="text-ink-muted">
        From your bylaws. Until they are set, no meeting can open: the quorum would be a guess.
      </p>
      <QuorumFields value={draft} onChange={setDraft} />
      {problem && (
        <p role="alert" className="text-gavel">
          {problem}
        </p>
      )}
      <button type="submit" className="btn-primary btn-sm" disabled={saving}>
        Save
      </button>
    </form>
  );
}
