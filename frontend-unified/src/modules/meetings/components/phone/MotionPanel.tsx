import { useId, useMemo, useState, type FormEvent } from 'react';
import { motionWords } from '@robbie-bylawyer/shared/constants';
import { generateId, generateTimestamp, getValidMotions } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, Member, MotionDetails } from '@robbie-bylawyer/shared/types';
import { AgendaAmendmentForm } from '../AgendaAmendmentForm';
import { BylawAmendmentForm } from '../BylawAmendmentForm';
import { MotionWordsFields } from '../MotionWordsFields';
import { EMPTY_DRAFT, motionFromDraft, type MotionDraft } from '../../utils/motionDraft';
import { FORM_MOTIONS } from '../../utils/motionWords';
import { electionUnderway } from '../../utils/chairActions';
import { useSocket } from '../../context/SocketContext';
import type { MeetingDispatch } from '../../types/socket';

interface MotionPanelProps {
  state: MeetingState;
  dispatch: MeetingDispatch;
  me: Member;
  /**
   * Only the other motions, without the heading and the main motion's box: inside the debate
   * block's "Other motions", while a question is pending
   */
  othersOnly?: boolean;
}

/** The motions that open a form of their own before they are made */
type FormMotion = 'amendAgenda' | 'bylawAmendment';

const MAX_MOTION_LENGTH = 500;

/**
 * Make a motion, in the member's name, in plain words: a box for a main motion and Move, and
 * the other motions in order now under "Other motions", each with a line on what it does
 */
export function MotionPanel({ state, dispatch, me, othersOnly = false }: MotionPanelProps) {
  const headingId = useId();
  const mainId = useId();
  const [mainText, setMainText] = useState('');
  const [form, setForm] = useState<FormMotion | null>(null);
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState(false);

  const validMotions = useMemo(() => {
    const valid = getValidMotions(state, me.id);
    // An election holds the floor: only a privileged or incidental motion may interrupt it (the
    // server refuses the rest)
    if (!electionUnderway(state)) return valid;
    return valid.filter((m) => m.category === 'privileged' || m.category === 'incidental');
  }, [state, me.id]);
  const mainInOrder = !othersOnly && validMotions.some((m) => m.key === 'mainMotion');
  const others = validMotions.map((m) => m.key).filter((key) => key !== 'mainMotion');

  // True once the server has the motion; refused, whatever was typed stays for another try
  const move = async (
    motionType: string,
    text: string,
    details: MotionDetails = {},
  ): Promise<boolean> => {
    if (sending) return false;
    setSending(true);
    setRefused(false);
    const made = await dispatch({
      type: 'MAKE_MOTION',
      motionType,
      text,
      mover: me.name,
      moverId: me.id,
      motionId: generateId(),
      timestamp: generateTimestamp(),
      ...details,
    });
    setSending(false);
    if (made) setForm(null);
    else setRefused(true);
    return made;
  };

  const moveMain = async (e: FormEvent) => {
    e.preventDefault();
    if (!mainText.trim()) return;
    if (await move('mainMotion', mainText.trim())) setMainText('');
  };

  const cancel = () => setForm(null);

  const problem = refused && <Refused />;

  if (form) {
    return (
      <section aria-label="Make a motion" className="space-y-3">
        {problem}
        {form === 'amendAgenda' ? (
          <AgendaAmendmentForm
            agenda={state.agenda}
            onSubmit={(text, agendaAmendment) => move('amendAgenda', text, { agendaAmendment })}
            onCancel={cancel}
          />
        ) : (
          <BylawAmendmentForm
            meetingCode={state.meetingCode || ''}
            onSubmit={(text, bylawAmendment) => move('bylawAmendment', text, { bylawAmendment })}
            onCancel={cancel}
          />
        )}
      </section>
    );
  }

  const list = (
    <OtherMotions
      state={state}
      motions={others}
      sending={sending}
      onMove={async (key, text, details) => {
        if (!FORM_MOTIONS.includes(key)) return move(key, text, details);
        setRefused(false);
        setForm(key as FormMotion);
        return true;
      }}
    />
  );
  if (othersOnly) {
    return (
      <div className="space-y-3">
        {problem}
        {list}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h3 id={headingId} className="label-caps">
        Make a motion
      </h3>
      {problem}
      {mainInOrder && (
        <form onSubmit={moveMain} className="space-y-2">
          <label htmlFor={mainId} className="sr-only">
            Motion text
          </label>
          <textarea
            id={mainId}
            className="textarea text-base"
            rows={3}
            maxLength={MAX_MOTION_LENGTH}
            placeholder="I move that..."
            value={mainText}
            onChange={(e) => setMainText(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary btn-lg w-full"
            disabled={!mainText.trim() || sending}
          >
            Move
          </button>
        </form>
      )}
      {others.length > 0 &&
        (mainInOrder ? (
          <details className="rounded-lg border border-rule">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
              Other motions
            </summary>
            <div className="border-t border-rule p-3">{list}</div>
          </details>
        ) : (
          list
        ))}
    </section>
  );
}

/**
 * The other motions in order, each with a line on what it does. Choosing one opens what it needs:
 * its words (its standard phrase if left empty), what an amendment changes, when a postponement
 * is to, who a referral goes to, and Move; a motion with a form of its own opens that form.
 */
function OtherMotions({
  state,
  motions,
  sending,
  onMove,
}: {
  state: MeetingState;
  motions: string[];
  sending: boolean;
  /** True once the motion is made (or its form opened): the choice is cleared then */
  onMove: (key: string, text: string, details?: MotionDetails) => Promise<boolean>;
}) {
  const groupId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const [draft, setDraft] = useState<MotionDraft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<string | null>(null);
  if (motions.length === 0) {
    return <p className="text-sm text-ink-muted">No other motion is in order now.</p>;
  }

  return (
    <fieldset className="space-y-1">
      <legend className="sr-only">Other motions</legend>
      {motions.map((key) => {
        const words = motionWords(key);
        const selected = chosen === key;
        const ownForm = FORM_MOTIONS.includes(key);
        return (
          <div
            key={key}
            className={`rounded-lg ${selected ? 'border border-gavel bg-gavel-tint' : 'border border-transparent'}`}
          >
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2">
              <input
                type="radio"
                name={groupId}
                value={key}
                checked={selected}
                onChange={() => {
                  setChosen(key);
                  setDraft(EMPTY_DRAFT);
                  setProblem(null);
                }}
                className="mt-1 accent-gavel"
              />
              <span>
                <span className="block font-medium text-ink">{words.name}</span>
                <span className="block text-sm text-ink-muted">{words.explanation}</span>
              </span>
            </label>
            {selected && (
              <form
                aria-label={words.name}
                className="space-y-3 px-3 pb-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (ownForm) {
                    await onMove(key, '');
                    return;
                  }
                  const made = motionFromDraft(key, draft, state);
                  if ('problem' in made) {
                    setProblem(made.problem);
                    return;
                  }
                  setProblem(null);
                  if (await onMove(key, made.text, made.details)) {
                    setChosen(null);
                    setDraft(EMPTY_DRAFT);
                  }
                }}
              >
                {!ownForm && (
                  <MotionWordsFields type={key} state={state} draft={draft} onChange={setDraft} />
                )}
                {problem && (
                  <p role="alert" className="text-sm text-gavel">
                    {problem}
                  </p>
                )}
                <button type="submit" className="btn-primary w-full" disabled={sending}>
                  Move
                </button>
              </form>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

/** What the server said when it refused the motion, while it says it */
function Refused() {
  const { error } = useSocket();
  return (
    <p role="alert" className="text-sm text-gavel">
      {error ?? 'The motion was not made. Try again.'}
    </p>
  );
}
