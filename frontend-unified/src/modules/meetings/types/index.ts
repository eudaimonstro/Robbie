// Frontend-specific types (React component props)
// These types depend on React and are not suitable for the shared package

import type {
  MeetingAction,
  Motion,
  AgendaItem,
  AgendaAmendment,
  MotionDefinition,
  BylawAmendment,
} from '@robbie-bylawyer/shared/types';

// Component prop types
export interface HelpTooltipProps {
  readonly motion: MotionDefinition | Motion;
}

export interface CountdownTimerProps {
  readonly endTime: number | null;
  readonly label: string;
  readonly onExpired?: () => void;
}

export interface DraggableAgendaListProps {
  readonly agenda: AgendaItem[];
  readonly dispatch: React.Dispatch<MeetingAction>;
  readonly disabled: boolean;
  readonly showStatus?: boolean;
}

export interface AgendaAmendmentFormProps {
  readonly agenda: AgendaItem[];
  readonly onSubmit: (text: string, agendaAmendment: AgendaAmendment) => void;
  readonly onCancel: () => void;
}

export interface BylawAmendmentFormProps {
  readonly meetingCode: string;
  readonly onSubmit: (text: string, bylawAmendment: BylawAmendment) => void;
  readonly onCancel: () => void;
}

// Re-export shared types for convenience
export * from '@robbie-bylawyer/shared/types';
