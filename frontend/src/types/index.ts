// Frontend-specific types (React component props)
// These types depend on React and are not suitable for the shared package

import type { MeetingState, MeetingAction, Member, Motion, AgendaItem, AgendaAmendment, MotionDefinition } from '@eudaimonstro/robbie-shared/types';

// Component prop types
export interface ParticipantViewProps {
  readonly state: MeetingState;
  readonly dispatch: React.Dispatch<MeetingAction>;
  readonly currentUser: Member;
}

export interface ChairViewProps {
  readonly state: MeetingState;
  readonly dispatch: React.Dispatch<MeetingAction>;
}

export interface AdminViewProps {
  readonly state: MeetingState;
  readonly dispatch: React.Dispatch<MeetingAction>;
}

export interface MotionCardProps {
  readonly motion: Motion;
  readonly showHelp?: boolean;
}

export interface HelpTooltipProps {
  readonly motion: MotionDefinition | Motion;
}

export interface CountdownTimerProps {
  readonly endTime: number | null;
  readonly label: string;
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

// Re-export shared types for convenience
export * from '@eudaimonstro/robbie-shared/types';
