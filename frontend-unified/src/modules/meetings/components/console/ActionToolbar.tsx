import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import type { ChairAction } from '../../utils/chairActions';

interface ActionToolbarProps {
  actions: ChairAction[];
  dispatch: React.Dispatch<MeetingAction>;
}

/** The chair's actions that are in order now, under the question card */
export function ActionToolbar({ actions, dispatch }: ActionToolbarProps) {
  if (actions.length === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="The chair's actions"
      className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={action.tone === 'primary' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => dispatch(action.make())}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
