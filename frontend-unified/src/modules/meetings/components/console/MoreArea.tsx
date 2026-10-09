import { useId, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type {
  MeetingAction,
  MeetingLogEntry,
  MeetingState,
  Member,
} from '@robbie-bylawyer/shared/types';
import { meetingPackets } from '../../../../api/client';
import { RoleBadge } from '../../../../components/ui/Badge';
import { formatClockTime } from '../../../../utils/dates';
import { MeetingDocumentsPanel } from '../chair';
import { MeetingOrganizationPanel } from '../MeetingOrganizationPanel';

interface MoreAreaProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The signed-in user: the chair or an admin */
  me: Member | null;
  meetingCode: string;
  organizationId: string | null;
}

/**
 * The console's "More": everything the chair and admins need now and then, closed until opened
 */
export function MoreArea({ state, dispatch, me, meetingCode, organizationId }: MoreAreaProps) {
  const isAdmin = me?.role === 'admin';
  // The server lets the chair and admins set the quorum
  const presides = isAdmin || me?.role === 'chair';
  // Once adjourned, the console is a record: nothing more is done here
  const adjourned = state.meetingStage === 'adjourned';
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
        <span className="label-caps">More</span>
        <ChevronDown
          className="h-4 w-4 text-ink-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-8 border-t border-rule p-5">
        {!adjourned && presides && (
          <MeetingSettings state={state} dispatch={dispatch} isAdmin={isAdmin} />
        )}
        <PeopleInMeeting state={state} dispatch={dispatch} readOnly={adjourned} />
        {state.meetingStage === 'not-started' && <ReloadAgenda meetingCode={meetingCode} />}
        {isAdmin && <MeetingOrganizationPanel organizationId={organizationId} />}
        <MeetingDocumentsPanel meetingCode={meetingCode} />
        <MeetingLog log={state.meetingLog} />
      </div>
    </details>
  );
}

/** This meeting's quorum, for the chair and admins, and for admins the time limits */
function MeetingSettings({
  state,
  dispatch,
  isAdmin,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  isAdmin: boolean;
}) {
  const quorumId = useId();
  const speakerId = useId();
  const voteId = useId();
  const [quorum, setQuorum] = useState(String(state.quorum));
  const [speaker, setSpeaker] = useState(String(state.speakerTimeLimit));
  const [vote, setVote] = useState(String(state.voteTimeLimit));

  const setTheQuorum = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(quorum);
    if (!Number.isInteger(value) || value < 1) return;
    dispatch({ type: 'SET_QUORUM', quorum: value, timestamp: generateTimestamp() });
  };

  const saveTimeLimits = (e: FormEvent) => {
    e.preventDefault();
    const speakerSeconds = Number(speaker);
    const voteSeconds = Number(vote);
    if (Number.isInteger(speakerSeconds) && speakerSeconds >= 0) {
      dispatch({ type: 'SET_SPEAKER_TIME_LIMIT', seconds: speakerSeconds });
    }
    if (Number.isInteger(voteSeconds) && voteSeconds >= 0) {
      dispatch({ type: 'SET_VOTE_TIME_LIMIT', seconds: voteSeconds });
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="meeting-settings-heading">
      <h4 id="meeting-settings-heading" className="label-caps">
        Meeting settings
      </h4>
      <form onSubmit={setTheQuorum} className="space-y-2">
        <label htmlFor={quorumId} className="label">
          Quorum for this meeting
        </label>
        <div className="flex gap-2">
          <input
            id={quorumId}
            className="input min-w-0 flex-1 tabular-nums"
            inputMode="numeric"
            value={quorum}
            onChange={(e) => setQuorum(e.target.value)}
          />
          <button type="submit" className="btn-secondary btn-sm shrink-0 whitespace-nowrap">
            Set the quorum
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          It starts from the organization&apos;s setting. Change it here when the bylaws set another
          for this meeting.
        </p>
      </form>
      {isAdmin && (
        <form onSubmit={saveTimeLimits} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={speakerId} className="label">
                Speaking time (seconds)
              </label>
              <input
                id={speakerId}
                className="input tabular-nums"
                inputMode="numeric"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={voteId} className="label">
                Voting time (seconds)
              </label>
              <input
                id={voteId}
                className="input tabular-nums"
                inputMode="numeric"
                value={vote}
                onChange={(e) => setVote(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-ink-muted">0 means no limit.</p>
          <button type="submit" className="btn-secondary btn-sm">
            Save the time limits
          </button>
        </form>
      )}
    </section>
  );
}

/**
 * The people in the meeting, with Hand over the chair. Roles otherwise come from the organization;
 * only the chair is handed over in a meeting. Names come from accounts, so there is no Rename.
 */
function PeopleInMeeting({
  state,
  dispatch,
  readOnly,
}: {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  readOnly: boolean;
}) {
  const [handingTo, setHandingTo] = useState<number | null>(null);
  const people = state.members.filter((m) => m.present);

  return (
    <section className="space-y-3" aria-labelledby="people-heading">
      <h4 id="people-heading" className="label-caps">
        People in the meeting
      </h4>
      <p className="text-xs text-ink-muted">
        Roles come from the organization and names from accounts.
      </p>
      <ul className="divide-y divide-rule">
        {people.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2 text-sm text-ink">
              {person.name}
              <RoleBadge role={person.role} />
            </span>
            <span className="flex gap-1">
              {/* The new chair needs a screen to run the meeting: only someone on a device */}
              {!readOnly &&
                person.role !== 'chair' &&
                person.role !== 'guest' &&
                person.role !== 'observer' &&
                person.presentBy === 'device' &&
                (handingTo === person.id ? (
                  <>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      aria-label={`Confirm: ${person.name} takes the chair`}
                      onClick={() => {
                        dispatch({
                          type: 'SET_MEMBER_ROLE',
                          targetMemberId: person.id,
                          newRole: 'chair',
                          timestamp: generateTimestamp(),
                        });
                        setHandingTo(null);
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setHandingTo(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    aria-label={`Hand the chair to ${person.name}`}
                    onClick={() => setHandingTo(person.id)}
                  >
                    Hand over the chair
                  </button>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Before the call to order: replace the live agenda with the schedule's */
function ReloadAgenda({ meetingCode }: { meetingCode: string }) {
  const [status, setStatus] = useState<string | null>(null);

  const reload = async () => {
    try {
      await meetingPackets.reloadAgenda(meetingCode);
      setStatus('The agenda now matches the schedule.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't reload the agenda");
    }
  };

  return (
    <section className="space-y-2" aria-labelledby="reload-agenda-heading">
      <h4 id="reload-agenda-heading" className="label-caps">
        Agenda from the schedule
      </h4>
      <p className="text-sm text-ink-muted">
        Before the meeting is called to order, replace this agenda with the one on the schedule.
      </p>
      <button type="button" className="btn-secondary btn-sm" onClick={() => void reload()}>
        Reload the agenda
      </button>
      {status && (
        <p role="status" className="text-sm text-ink-muted">
          {status}
        </p>
      )}
    </section>
  );
}

function MeetingLog({ log }: { log: MeetingLogEntry[] }) {
  return (
    <section className="space-y-2" aria-labelledby="log-heading">
      <h4 id="log-heading" className="label-caps">
        Log
      </h4>
      {log.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing yet.</p>
      ) : (
        <ol className="max-h-64 space-y-1 overflow-y-auto text-sm scrollbar-thin">
          {[...log].reverse().map((entry, index) => (
            <li key={log.length - index} className="text-ink">
              <span className="tabular-nums text-ink-muted">{formatClockTime(entry.time)}</span>{' '}
              {entry.message}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
