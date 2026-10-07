import { useMemo, useState } from 'react';
import { MOTIONS } from '@robbie-bylawyer/shared/constants';
import { generateId, generateTimestamp, getValidMotions } from '@robbie-bylawyer/shared/utils';
import type {
  MeetingAction,
  MeetingState,
  Member,
  MotionDefinition,
} from '@robbie-bylawyer/shared/types';
import { AgendaAmendmentForm } from '../AgendaAmendmentForm';
import { BylawAmendmentForm } from '../BylawAmendmentForm';
import { SuspendRulesForm } from '../SuspendRulesForm';
import { TakeFromTableForm } from '../TakeFromTableForm';
import { ReconsiderForm } from '../ReconsiderForm';
import { MotionSelector } from '../participant';

interface MotionPanelProps {
  state: MeetingState;
  dispatch: React.Dispatch<MeetingAction>;
  me: Member;
}

/** The motions that open a form of their own before they are made */
type FormMotion =
  'amendAgenda' | 'bylawAmendment' | 'suspendRules' | 'takeFromTable' | 'reconsider';
const FORM_MOTIONS: readonly string[] = [
  'amendAgenda',
  'bylawAmendment',
  'suspendRules',
  'takeFromTable',
  'reconsider',
];

type MotionDetails = Pick<
  Extract<MeetingAction, { type: 'MAKE_MOTION' }>,
  | 'agendaAmendment'
  | 'ruleSuspension'
  | 'bylawAmendment'
  | 'tabledMotionId'
  | 'reconsideredMotionId'
>;

/** Make a motion: the motions in order now, in the member's name */
export function MotionPanel({ state, dispatch, me }: MotionPanelProps) {
  const [motionText, setMotionText] = useState('');
  const [chosen, setChosen] = useState('mainMotion');
  const [form, setForm] = useState<FormMotion | null>(null);

  const validMotions = useMemo(() => getValidMotions(state, me.id), [state, me.id]);
  // The chosen motion while it is in order, else the first one that is
  const selectedMotion = validMotions.some((m) => m.key === chosen)
    ? chosen
    : (validMotions[0]?.key ?? chosen);
  const selectedMotionDef = MOTIONS[selectedMotion];
  const groupedMotions = useMemo(
    () =>
      validMotions.reduce<Record<string, Array<MotionDefinition & { key: string }>>>(
        (groups, motion) => {
          (groups[motion.category] ??= []).push(motion);
          return groups;
        },
        {},
      ),
    [validMotions],
  );
  // Every decided motion is recorded now; only some can be reconsidered (records from before the
  // flag existed were all of motions that can)
  const reconsiderable = useMemo(
    () => state.completedMotions.filter((m) => m.reconsiderable !== false),
    [state.completedMotions],
  );

  const move = (motionType: string, text: string, details: MotionDetails = {}) => {
    dispatch({
      type: 'MAKE_MOTION',
      motionType,
      text,
      mover: me.name,
      moverId: me.id,
      motionId: generateId(),
      timestamp: generateTimestamp(),
      ...details,
    });
    setForm(null);
  };

  const submit = () => {
    if (FORM_MOTIONS.includes(selectedMotion)) {
      setForm(selectedMotion as FormMotion);
      return;
    }
    move(selectedMotion, motionText || selectedMotionDef?.phrase || '');
    setMotionText('');
  };

  const cancel = () => setForm(null);

  return (
    <section aria-labelledby="motion-heading" className="space-y-3">
      <h3 id="motion-heading" className="label-caps">
        Make a motion
      </h3>
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
      ) : form === 'reconsider' ? (
        <ReconsiderForm
          completedMotions={reconsiderable}
          currentUserId={me.id}
          onSubmit={(text, reconsideredMotionId) =>
            move('reconsider', text, { reconsideredMotionId })
          }
          onCancel={cancel}
        />
      ) : (
        <MotionSelector
          selectedMotion={selectedMotion}
          setSelectedMotion={setChosen}
          selectedMotionDef={selectedMotionDef}
          motionText={motionText}
          setMotionText={setMotionText}
          groupedMotions={groupedMotions}
          onSubmit={submit}
        />
      )}
    </section>
  );
}
