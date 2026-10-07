import { useId, useMemo, useState, type FormEvent } from 'react';
import { MAX_FLOOR_NAME_LENGTH, MOTIONS } from '@robbie-bylawyer/shared/constants';
import { generateId, generateTimestamp, getValidMotions } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import Modal from '../../../../components/ui/Modal';
import { FORM_MOTIONS, motionWords } from '../../utils/motionWords';

/**
 * The people the chair can name as moving or seconding from the floor: members present in the
 * meeting, on a device or marked present, never a guest or the presiding officer (the server
 * refuses both)
 */
function floorMembers(state: MeetingState, presidingId: number | null): Member[] {
  return state.members.filter(
    (m) => m.present && m.role !== 'guest' && m.role !== 'chair' && m.id !== presidingId,
  );
}

function presence(member: Member): string {
  return member.presentBy === 'device' ? 'On a device' : 'Marked present';
}

interface FloorMotionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  presidingId: number | null;
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
}: FloorMotionDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="A motion from the floor">
      {/* Mounted only while open, so each motion starts from an empty form */}
      {isOpen && (
        <FloorMotionForm
          state={state}
          dispatch={dispatch}
          presidingId={presidingId}
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
  onDone,
}: Omit<FloorMotionDialogProps, 'isOpen' | 'onClose'> & { onDone: () => void }) {
  const kindId = useId();
  const textId = useId();
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
  const [text, setText] = useState('');
  const [who, setWho] = useState('');
  const [mover, setMover] = useState<Member | null>(null);

  const members = floorMembers(state, presidingId);
  const query = who.trim().toLowerCase();
  const matches = mover
    ? []
    : members.filter((m) => !query || m.name.toLowerCase().includes(query)).slice(0, 6);
  const phrase = MOTIONS[kind]?.phrase ?? '';
  // A main motion needs its words; another motion has its standard phrase to fall back on
  const words = text.trim() || (kind === 'mainMotion' ? '' : phrase);
  const ready = words !== '' && (mover !== null || who.trim() !== '');

  const record = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    dispatch({
      type: 'MAKE_FLOOR_MOTION',
      motionType: kind,
      text: words,
      moverName: mover ? '' : who.trim(),
      ...(mover ? { moverMemberId: mover.id } : {}),
      // The server gives the motion its ID
      motionId: generateId(),
      timestamp: generateTimestamp(),
    });
    onDone();
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
          onChange={(e) => setKind(e.target.value)}
        >
          {kinds.map((key) => (
            <option key={key} value={key}>
              {motionWords(key).name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={textId} className="label">
          The motion
        </label>
        <textarea
          id={textId}
          className="textarea"
          rows={3}
          maxLength={500}
          placeholder={phrase || 'I move that...'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
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
      <div className="flex justify-end gap-3 border-t border-rule pt-4">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!ready}>
          Record the motion
        </button>
      </div>
    </form>
  );
}

interface FloorSecondFormProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  presidingId: number | null;
  onDone: () => void;
}

/**
 * A second from someone in the room, under the toolbar: a member present, or nobody named for
 * "a member in the room". The mover can't second their own motion, so they aren't offered.
 */
export function FloorSecondForm({ state, dispatch, presidingId, onDone }: FloorSecondFormProps) {
  const whoId = useId();
  const [who, setWho] = useState('');
  const moverId = state.pendingSecond?.moverId;
  const members = floorMembers(state, presidingId).filter((m) => m.id !== moverId);

  const record = (e: FormEvent) => {
    e.preventDefault();
    dispatch({
      type: 'SECOND_FROM_FLOOR',
      ...(who ? { seconderMemberId: Number(who) } : {}),
      timestamp: generateTimestamp(),
    });
    onDone();
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
      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm">
          Record the second
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
