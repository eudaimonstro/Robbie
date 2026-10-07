import type { MeetingAction } from '@robbie-bylawyer/shared/types';
import type { ChairAction, FloorAction } from '../../utils/chairActions';

interface ActionToolbarProps {
  actions: ChairAction[];
  dispatch: React.Dispatch<MeetingAction>;
  /** Business from the floor, each opening a short form: placed before a secondary Adjourn */
  floor?: FloorAction[];
  onFloor?: (id: FloorAction['id']) => void;
  /** An action that asks first (Adjourn): the console confirms it, then dispatches */
  onConfirm?: (action: ChairAction) => void;
}

/** The chair's actions that are in order now, under the question card */
export function ActionToolbar({
  actions,
  dispatch,
  floor = [],
  onFloor,
  onConfirm,
}: ActionToolbarProps) {
  if (actions.length === 0 && floor.length === 0) return null;
  // Adjourn, as an alternative, comes last; as the expected next step it stays first
  const adjourn = actions.findIndex((a) => a.id === 'adjourn' && a.tone === 'secondary');
  const before = adjourn < 0 ? actions : actions.slice(0, adjourn);
  const after = adjourn < 0 ? [] : actions.slice(adjourn);

  const button = (action: ChairAction) => (
    <button
      key={action.id}
      type="button"
      className={action.tone === 'primary' ? 'btn-primary' : 'btn-secondary'}
      onClick={() => (action.confirm && onConfirm ? onConfirm(action) : dispatch(action.make()))}
    >
      {action.label}
    </button>
  );

  return (
    <div
      role="toolbar"
      aria-label="The chair's actions"
      className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4"
    >
      {before.map(button)}
      {floor.map((action) => (
        <button
          key={action.id}
          type="button"
          className="btn-secondary"
          onClick={() => onFloor?.(action.id)}
        >
          {action.label}
        </button>
      ))}
      {after.map(button)}
    </div>
  );
}
