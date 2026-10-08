import { useId } from 'react';
import { MAX_MOTION_TEXT_LENGTH, MOTIONS } from '@robbie-bylawyer/shared/constants';
import { applyTextAmendment, textAmendmentProblem } from '@robbie-bylawyer/shared/utils';
import type { MeetingState, TextAmendment } from '@robbie-bylawyer/shared/types';
import { amendedWords, textAmendmentOf, type MotionDraft } from '../utils/motionDraft';

interface MotionWordsFieldsProps {
  type: string;
  state: MeetingState;
  draft: MotionDraft;
  onChange: (draft: MotionDraft) => void;
}

const AMEND_FORMS: Array<{ form: TextAmendment['form']; label: string }> = [
  { form: 'strikeInsert', label: 'Strike and insert' },
  { form: 'insert', label: 'Add words' },
  { form: 'strike', label: 'Strike words' },
  { form: 'substitute', label: 'Replace the whole text' },
];

/**
 * The words of a motion and the details it needs, in plain words: what an amendment strikes or
 * inserts (with the motion as it would read), when a postponement is to, who a referral goes to,
 * when a recess ends, or what a point of order is about
 */
export function MotionWordsFields({ type, state, draft, onChange }: MotionWordsFieldsProps) {
  const id = useId();
  const set = (fields: Partial<MotionDraft>) => onChange({ ...draft, ...fields });
  const phrase = MOTIONS[type]?.phrase ?? '';

  if (type === 'amend' || type === 'amendAmendment') {
    const words = amendedWords(state, type) ?? '';
    const change = textAmendmentOf(draft);
    const reads = textAmendmentProblem(words, change) ? null : applyTextAmendment(words, change);
    const field = (name: 'strike' | 'insert' | 'after', label: string, hint?: string) => (
      <div>
        <label htmlFor={`${id}-${name}`} className="label">
          {label}
        </label>
        <input
          id={`${id}-${name}`}
          className="input"
          maxLength={MAX_MOTION_TEXT_LENGTH}
          value={draft[name]}
          placeholder={hint}
          onChange={(e) => set({ [name]: e.target.value })}
        />
      </div>
    );
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {type === 'amend' ? 'The motion reads: ' : 'The amendment inserts: '}
          <span className="text-ink">&ldquo;{words}&rdquo;</span>
        </p>
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">How it changes the words</legend>
          {AMEND_FORMS.map((option) => (
            <label
              key={option.form}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gavel ${draft.form === option.form ? 'border-gavel bg-gavel-tint text-ink' : 'border-rule text-ink'}`}
            >
              <input
                type="radio"
                name={`${id}-form`}
                className="sr-only"
                checked={draft.form === option.form}
                onChange={() => set({ form: option.form })}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        {(draft.form === 'strike' || draft.form === 'strikeInsert') &&
          field('strike', 'Words to strike', 'Exactly as they are written')}
        {draft.form === 'strikeInsert' && field('insert', 'Words to insert in their place')}
        {draft.form === 'insert' && (
          <>
            {field('insert', 'Words to add')}
            {field('after', 'After the words (leave empty to add at the end)')}
          </>
        )}
        {draft.form === 'substitute' && field('insert', 'The new text')}
        {reads !== null && (
          <p className="rounded-lg bg-surface-2 p-3 text-sm text-ink" aria-live="polite">
            <span className="label-caps block">
              {type === 'amend' ? 'The motion would read' : 'The amendment would insert'}
            </span>
            <span className="block">{reads}</span>
          </p>
        )}
      </div>
    );
  }

  if (type === 'postponeDefinite') {
    return (
      <div className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="label">Postpone it to</legend>
          {(
            [
              ['next-meeting', 'The next meeting'],
              ['later', 'Later in this meeting'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name={`${id}-postpone`}
                className="accent-gavel"
                checked={draft.postpone === value}
                onChange={() => set({ postpone: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {draft.postpone === 'later' && (
          <div>
            <label htmlFor={`${id}-when`} className="label">
              When
            </label>
            <input
              id={`${id}-when`}
              className="input"
              maxLength={100}
              placeholder="8:30 PM, or after the treasurer's report"
              value={draft.when}
              onChange={(e) => set({ when: e.target.value })}
            />
          </div>
        )}
      </div>
    );
  }

  if (type === 'referCommittee') {
    return (
      <div>
        <label htmlFor={`${id}-refer`} className="label">
          Refer it to
        </label>
        <input
          id={`${id}-refer`}
          className="input"
          maxLength={100}
          placeholder="the board, or the landscaping committee"
          value={draft.referTo}
          onChange={(e) => set({ referTo: e.target.value })}
        />
      </div>
    );
  }

  if (type === 'recess') {
    return (
      <div>
        <label htmlFor={`${id}-until`} className="label">
          Until (optional)
        </label>
        <input
          id={`${id}-until`}
          type="time"
          className="input"
          value={draft.recessUntil}
          onChange={(e) => set({ recessUntil: e.target.value })}
        />
      </div>
    );
  }

  const main = type === 'mainMotion';
  const point = type === 'pointOrder';
  return (
    <div>
      <label htmlFor={`${id}-text`} className={main || point ? 'label' : 'sr-only'}>
        {main ? 'The motion' : point ? 'What is out of order' : 'Words'}
      </label>
      {main || point ? (
        <textarea
          id={`${id}-text`}
          className="textarea"
          rows={3}
          maxLength={MAX_MOTION_TEXT_LENGTH}
          placeholder={main ? 'I move that...' : 'The rule that is not being followed'}
          value={draft.text}
          onChange={(e) => set({ text: e.target.value })}
        />
      ) : (
        <input
          id={`${id}-text`}
          className="input"
          maxLength={MAX_MOTION_TEXT_LENGTH}
          placeholder={phrase}
          value={draft.text}
          onChange={(e) => set({ text: e.target.value })}
        />
      )}
    </div>
  );
}
