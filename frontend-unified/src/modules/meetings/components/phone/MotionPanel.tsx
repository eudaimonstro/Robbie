import { useId, useMemo, useState, type FormEvent } from 'react';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { generateId, generateTimestamp, getValidMotions } from '@robbie-bylawyer/shared/utils';
import type { MeetingAction, MeetingState, Member } from '@robbie-bylawyer/shared/types';
import { AgendaAmendmentForm } from '../AgendaAmendmentForm';
import { BylawAmendmentForm } from '../BylawAmendmentForm';
import { SuspendRulesForm } from '../SuspendRulesForm';
import { TakeFromTableForm } from '../TakeFromTableForm';
import { ReconsiderForm } from '../ReconsiderForm';
import { FORM_MOTIONS, motionWords } from '../../utils/motionWords';
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
type FormMotion =
  'amendAgenda' | 'bylawAmendment' | 'suspendRules' | 'takeFromTable' | 'reconsider';

type MotionDetails = Pick<
  Extract<MeetingAction, { type: 'MAKE_MOTION' }>,
  | 'agendaAmendment'
  | 'ruleSuspension'
  | 'bylawAmendment'
  | 'tabledMotionId'
  | 'reconsideredMotionId'
>;

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
  // Every decided motion is recorded now; only some can be reconsidered (records from before the
  // flag existed were all of motions that can)
  const reconsiderable = useMemo(
    () => state.completedMotions.filter((m) => m.reconsiderable !== false),
    [state.completedMotions],
  );

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
        ) : form === 'bylawAmendment' ? (
          <BylawAmendmentForm
            meetingCode={state.meetingCode || ''}
            onSubmit={(text, bylawAmendment) => move('bylawAmendment', text, { bylawAmendment })}
            onCancel={cancel}
          />
        ) : form === 'suspendRules' ? (
          <SuspendRulesForm
            onSubmit={(purpose, specificAction, scope, rule) =>
              move(
                'suspendRules',
                `I move to suspend the rules (${rule}) for the following purpose: ${purpose}. Specific action: ${specificAction}`,
                { ruleSuspension: { rule, purpose, specificAction, scope } },
              )
            }
            onCancel={cancel}
          />
        ) : form === 'takeFromTable' ? (
          <TakeFromTableForm
            tabledMotions={state.tabledMotions}
            onSubmit={(text, tabledMotionId) => move('takeFromTable', text, { tabledMotionId })}
            onCancel={cancel}
          />
        ) : (
          <ReconsiderForm
            completedMotions={reconsiderable}
            currentUserId={me.id}
            onSubmit={(text, reconsideredMotionId) =>
              move('reconsider', text, { reconsideredMotionId })
            }
            onCancel={cancel}
          />
        )}
      </section>
    );
  }

  const list = (
    <OtherMotions
      motions={others}
      sending={sending}
      onMove={async (key, text) => {
        if (!FORM_MOTIONS.includes(key)) return move(key, text);
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
 * The other motions in order, each with a line on what it does. Choosing one opens its words
 * (its standard phrase if left empty) and Move; a motion with details of its own opens its form.
 */
function OtherMotions({
  motions,
  sending,
  onMove,
}: {
  motions: string[];
  sending: boolean;
  /** True once the motion is made (or its form opened): the choice is cleared then */
  onMove: (key: string, text: string) => Promise<boolean>;
}) {
  const groupId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useState('');
  if (motions.length === 0) {
    return <p className="text-sm text-ink-muted">No other motion is in order now.</p>;
  }

  return (
    <fieldset className="space-y-1">
      <legend className="sr-only">Other motions</legend>
      {motions.map((key) => {
        const words = motionWords(key);
        const selected = chosen === key;
        const phrase = MOTIONS[key]?.phrase ?? '';
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
                  setText('');
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
                className="space-y-2 px-3 pb-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await onMove(key, text.trim() || phrase)) {
                    setChosen(null);
                    setText('');
                  }
                }}
              >
                {!FORM_MOTIONS.includes(key) && (
                  <>
                    <label htmlFor={`${groupId}-text`} className="sr-only">
                      {`Words for ${words.name.toLowerCase()}`}
                    </label>
                    <input
                      id={`${groupId}-text`}
                      className="input"
                      maxLength={MAX_MOTION_LENGTH}
                      placeholder={phrase}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </>
                )}
                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={sending || (!FORM_MOTIONS.includes(key) && !text.trim() && !phrase)}
                >
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
