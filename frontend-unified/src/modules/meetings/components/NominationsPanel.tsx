import { useId, useMemo, useState, type FormEvent } from 'react';
import { MAX_NAME_LENGTH, MAX_POSITION_LENGTH } from '@robbie-bylawyer/shared/constants';
import { generateId, generateTimestamp } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';

interface NominationsPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  /** The signed-in user, who nominates and may decline their own nomination */
  currentUser: Member;
  /**
   * The chair, or an admin presiding: opens and closes nominations, and records nominations made
   * from the floor (the chair doesn't nominate in their own name)
   */
  isChair?: boolean;
  /** Inside the console's election card: no card or heading of its own, and no Elected list */
  embedded?: boolean;
}

/** The nominee select's value for someone typed in by name */
const SOMEONE_ELSE = 'someone-else';

/**
 * Nominations (docs/superpowers/specs/2026-10-06-in-the-room-design.md, "Elections from the
 * chair's screen"): the chair opens them for any position at any time no election is running.
 * Nominees are anyone present who isn't a guest (members marked present included), or someone
 * not in the meeting, by name. Nominations need no second.
 */
export function NominationsPanel({
  state,
  dispatch,
  currentUser,
  isChair = false,
  embedded = false,
}: NominationsPanelProps) {
  const positionId = useId();
  const nomineeId = useId();
  const nameId = useId();
  const [position, setPosition] = useState('');
  const [nominee, setNominee] = useState('');
  const [name, setName] = useState('');

  const openPosition = state.nominationsOpen ? state.currentNominationPosition : null;
  const candidates = useMemo(
    () => state.members.filter((m) => m.present && m.role !== 'guest'),
    [state.members],
  );
  const nominations = state.nominations.filter((n) => n.position === openPosition);
  const canNominate = currentUser.role !== 'guest';

  const openNominations = (e: FormEvent) => {
    e.preventDefault();
    if (!position.trim()) return;
    dispatch({
      type: 'OPEN_NOMINATIONS',
      position: position.trim(),
      timestamp: generateTimestamp(),
    });
    setPosition('');
  };

  const nominate = (e: FormEvent) => {
    e.preventDefault();
    if (!openPosition) return;
    const member =
      nominee && nominee !== SOMEONE_ELSE
        ? candidates.find((m) => String(m.id) === nominee)
        : undefined;
    const nomineeName = member ? member.name : name.trim();
    if (!nomineeName) return;
    dispatch({
      type: 'NOMINATE',
      position: openPosition,
      nomineeName,
      // Someone not in the meeting has no member ID: the server tells them apart by name
      nomineeId: member?.id ?? 0,
      nominatedBy: currentUser.name,
      nominatorId: currentUser.id,
      nominationId: generateId(),
      // The chair records a nomination someone made in the room
      ...(isChair ? { fromFloor: true } : {}),
      timestamp: generateTimestamp(),
    });
    setNominee('');
    setName('');
  };

  const ready = nominee !== '' && (nominee !== SOMEONE_ELSE || name.trim() !== '');
  // Nothing is opened once the meeting is adjourned, nor while a question is pending
  const canOpen =
    isChair &&
    !state.nominationsOpen &&
    !state.currentElection &&
    !state.currentMotion &&
    !state.pendingSecond &&
    state.meetingStage !== 'adjourned';
  const showElected = !embedded && state.electedOfficers.length > 0;
  const showNone = !embedded && !isChair && !openPosition && state.electedOfficers.length === 0;
  if (embedded && !canOpen && !openPosition) return null;

  const body = (
    <>
      {canOpen && (
        <form onSubmit={openNominations} className="space-y-2">
          <label htmlFor={positionId} className="label">
            Open nominations for
          </label>
          <div className="flex gap-2">
            <input
              id={positionId}
              className="input min-w-0 flex-1"
              placeholder="Director, Treasurer..."
              maxLength={MAX_POSITION_LENGTH}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
            <button
              type="submit"
              className="btn-secondary btn-sm shrink-0 whitespace-nowrap"
              disabled={!position.trim()}
            >
              Open nominations
            </button>
          </div>
        </form>
      )}

      {openPosition && (
        <div className="space-y-3">
          <p role="status" className="text-sm text-ink">
            Nominations are open for <span className="font-semibold">{openPosition}</span>. They
            need no second, and members may nominate themselves.
          </p>

          {canNominate && (
            <form
              onSubmit={nominate}
              aria-label={isChair ? 'Nominate from the floor' : 'Nominate'}
              className="space-y-2"
            >
              <label htmlFor={nomineeId} className="label">
                Nominee
              </label>
              <select
                id={nomineeId}
                className="select"
                value={nominee}
                onChange={(e) => setNominee(e.target.value)}
              >
                <option value="">Choose someone present</option>
                {candidates.map((member) => (
                  <option key={member.id} value={String(member.id)}>
                    {member.name}
                  </option>
                ))}
                <option value={SOMEONE_ELSE}>Someone not in the meeting</option>
              </select>
              {nominee === SOMEONE_ELSE && (
                <div>
                  <label htmlFor={nameId} className="label">
                    Nominee&apos;s name
                  </label>
                  <input
                    id={nameId}
                    className="input"
                    maxLength={MAX_NAME_LENGTH}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              <button
                type="submit"
                className={isChair ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                disabled={!ready}
              >
                {isChair ? 'Nominate from the floor' : 'Nominate'}
              </button>
            </form>
          )}

          {nominations.length > 0 && (
            <ul aria-label="Nominations" className="divide-y divide-rule">
              {nominations.map((nomination) => (
                <li key={nomination.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p
                      className={`text-sm font-medium ${nomination.declined ? 'text-ink-muted line-through' : 'text-ink'}`}
                    >
                      {nomination.nomineeName}
                      {nomination.declined && ' (declined)'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {nomination.fromFloor
                        ? 'Nominated from the floor'
                        : `Nominated by ${nomination.nominatedBy}`}
                    </p>
                  </div>
                  {!nomination.declined && nomination.nomineeId === currentUser.id && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        dispatch({
                          type: 'DECLINE_NOMINATION',
                          nominationId: nomination.id,
                          timestamp: generateTimestamp(),
                        })
                      }
                    >
                      Decline
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isChair && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                dispatch({ type: 'CLOSE_NOMINATIONS', timestamp: generateTimestamp() })
              }
            >
              Close nominations
            </button>
          )}
        </div>
      )}

      {showElected && <ElectedOfficers state={state} />}

      {showNone && <p className="text-sm text-ink-muted">No nominations are open.</p>}
    </>
  );

  if (embedded) return <div className="space-y-4">{body}</div>;
  return (
    <section className="card space-y-4 p-5" aria-labelledby="nominations-heading">
      <h3 id="nominations-heading" className="label-caps">
        Nominations and elections
      </h3>
      {body}
    </section>
  );
}

/** Who the meeting has elected, to what */
export function ElectedOfficers({ state }: { state: MeetingState }) {
  if (state.electedOfficers.length === 0) return null;
  return (
    <div>
      <p className="label-caps mb-2">Elected</p>
      <ul className="space-y-1">
        {state.electedOfficers.map((officer) => (
          <li
            key={`${officer.position}-${officer.memberId}-${officer.name}`}
            className="text-sm text-ink"
          >
            <span className="font-medium">{officer.position}:</span> {officer.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
