import { useId, useMemo, useState, type FormEvent } from 'react';
import { MAX_FLOOR_NAME_LENGTH, motionWords } from '@robbie-bylawyer/shared/constants';
import {
  generateId,
  generateTimestamp,
  getValidMotions,
  takesPart,
} from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member } from '@robbie-bylawyer/shared/types';
import Modal from '../../../../components/ui/Modal';
import { useSocket } from '../../context/SocketContext';
import type { MeetingDispatch } from '../../types/socket';
import { FORM_MOTIONS } from '../../utils/motionWords';
import { MotionWordsFields } from '../MotionWordsFields';
import { EMPTY_DRAFT, motionFromDraft, type MotionDraft } from '../../utils/motionDraft';

/**
 * The people the chair can name as moving or seconding from the floor: members present in the
 * meeting, on a device or marked present, never a guest or an observer (or, in a board meeting,
 * anyone who isn't a director), the presiding officer or the one
 * recording it (an admin at the console): the server refuses them
 */
function floorMembers(state: MeetingState, presidingId: number | null, meId: number | null) {
  return state.members.filter(
    (m) => m.present && takesPart(m) && m.role !== 'chair' && m.id !== presidingId && m.id !== meId,
  );
}

/** What the server said when it refused, while it says it; otherwise a line of our own */
function Refused({ fallback }: { fallback: string }) {
  const { error } = useSocket();
  return (
    <p role="alert" className="text-sm text-gavel">
      {error ?? fallback}
    </p>
  );
}

function presence(member: Member): string {
  return member.presentBy === 'device' ? 'On a device' : 'Marked present';
}

interface FloorMotionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  state: MeetingState;
  dispatch: MeetingDispatch;
  presidingId: number | null;
  /** The one at the console, who can't record themself */
  meId: number | null;
}

/**
 * A motion made by someone in the room, recorded by the chair: the kind of motion (a main motion
 * unless another is chosen), its words, and who moved it, from the members present or by name
 */
export function FloorMotionDialog({
  isOpen,
  onClose,
  state,
  dispatch,
  presidingId,
  meId,
}: FloorMotionDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="A motion from the floor">
      {/* Mounted only while open, so each motion starts from an empty form */}
      {isOpen && (
        <FloorMotionForm
          state={state}
          dispatch={dispatch}
          presidingId={presidingId}
          meId={meId}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

function FloorMotionForm({
  state,
  dispatch,
  presidingId,
  meId,
  onDone,
}: Omit<FloorMotionDialogProps, 'isOpen' | 'onClose'> & { onDone: () => void }) {
  const kindId = useId();
  const whoId = useId();
  const kinds = useMemo(
    () =>
      // Motions with details of their own (a bylaw change, a rule to suspend) are made on a
      // device, where their forms are
      getValidMotions(state)
        .map((m) => m.key)
        .filter((key) => !FORM_MOTIONS.includes(key)),
    [state],
  );
  const [kind, setKind] = useState(() =>
    kinds.includes('mainMotion') ? 'mainMotion' : (kinds[0] ?? 'mainMotion'),
  );
  const [draft, setDraft] = useState<MotionDraft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const [mover, setMover] = useState<Member | null>(null);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState(false);

  const members = floorMembers(state, presidingId, meId);
  const query = who.trim().toLowerCase();
  const matches = mover
    ? []
    : members.filter((m) => !query || m.name.toLowerCase().includes(query)).slice(0, 6);
  const made = motionFromDraft(kind, draft, state);
  const ready = mover !== null || who.trim() !== '';

  // Closes once the server has recorded it; refused, it stays open with what was typed
  const record = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || sending) return;
    if ('problem' in made) {
      setProblem(made.problem);
      return;
    }
    setProblem(null);
    setSending(true);
    setRefused(false);
    const recorded = await dispatch({
      type: 'MAKE_FLOOR_MOTION',
      motionType: kind,
      text: made.text,
      ...made.details,
      moverName: mover ? '' : who.trim(),
      ...(mover ? { moverMemberId: mover.id } : {}),
      // The server gives the motion its ID
      motionId: generateId(),
      timestamp: generateTimestamp(),
    });
    setSending(false);
    if (recorded) onDone();
    else setRefused(true);
  };

  return (
    <form onSubmit={record} className="space-y-4">
      <div>
        <label htmlFor={kindId} className="label">
          Kind of motion
        </label>
        <select
          id={kindId}
          className="select"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setDraft(EMPTY_DRAFT);
            setProblem(null);
          }}
        >
          {kinds.map((key) => (
            <option key={key} value={key}>
              {motionWords(key).name}
            </option>
          ))}
        </select>
      </div>
      <MotionWordsFields type={kind} state={state} draft={draft} onChange={setDraft} />
      <div className="space-y-2">
        <label htmlFor={whoId} className="label">
          Who moved it
        </label>
        <input
          id={whoId}
          className="input"
          autoComplete="off"
          maxLength={MAX_FLOOR_NAME_LENGTH}
          placeholder="Find a member present, or type a name"
          value={who}
          onChange={(e) => {
            setWho(e.target.value);
            setMover(null);
          }}
        />
        {mover ? (
          <p className="text-sm text-ink">
            <span className="font-medium">{mover.name}</span>{' '}
            <span className="text-ink-muted">({presence(mover).toLowerCase()})</span>
          </p>
        ) : matches.length > 0 ? (
          <ul
            aria-label="Members present"
            className="divide-y divide-rule rounded-lg border border-rule"
          >
            {matches.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gavel-tint"
                  onClick={() => {
                    setMover(member);
                    setWho(member.name);
                  }}
                >
                  <span className="text-sm font-medium text-ink">{member.name}</span>
                  <span className="text-xs text-ink-muted">{presence(member)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          query && (
            <p className="text-sm text-ink-muted">
              Nobody present by that name: the motion is recorded with the name as typed.
            </p>
          )
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm text-gavel">
          {problem}
        </p>
      )}
      {refused && <Refused fallback="The motion was not recorded. Try again." />}
      <div className="flex justify-end gap-3 border-t border-rule pt-4">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!ready || sending}>
          Record the motion
        </button>
      </div>
    </form>
  );
}

interface FloorSecondFormProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  presidingId: number | null;
  /** The one at the console, who can't record themself */
  meId: number | null;
  onDone: () => void;
}

/**
 * A second from someone in the room, under the toolbar: a member present, or nobody named for
 * "a member in the room". The mover can't second their own motion, so they aren't offered.
 */
export function FloorSecondForm({
  state,
  dispatch,
  presidingId,
  meId,
  onDone,
}: FloorSecondFormProps) {
  const whoId = useId();
  const [who, setWho] = useState('');
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState(false);
  const moverId = state.pendingSecond?.moverId;
  const members = floorMembers(state, presidingId, meId).filter((m) => m.id !== moverId);

  // Closes once the server has recorded it; refused, it stays open with the choice made
  const record = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setRefused(false);
    const recorded = await dispatch({
      type: 'SECOND_FROM_FLOOR',
      ...(who ? { seconderMemberId: Number(who) } : {}),
      timestamp: generateTimestamp(),
    });
    setSending(false);
    if (recorded) onDone();
    else setRefused(true);
  };

  return (
    <form
      onSubmit={record}
      aria-label="Seconded from the floor"
      className="mt-3 space-y-3 rounded-lg border border-rule bg-surface-2 p-4"
    >
      <div>
        <label htmlFor={whoId} className="label">
          Who seconded it
        </label>
        <select id={whoId} className="select" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">A member in the room</option>
          {members.map((member) => (
            <option key={member.id} value={String(member.id)}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      {refused && <Refused fallback="The second was not recorded. Try again." />}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={sending}>
          Record the second
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
