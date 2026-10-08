import type { InquiryType } from '@robbie-bylawyer/shared/types';

/** A question for the chair, by its kind, in the words members choose it by */
export const INQUIRY_KINDS: Record<InquiryType, { label: string; hint: string }> = {
  parliamentary: { label: 'About the rules', hint: 'How the meeting works, or what is in order' },
  information: { label: 'For information', hint: 'A fact about the business at hand' },
  // A question of privilege (RONR 19): a request the chair answers, not a motion
  privilege: { label: 'A problem in the room', hint: "Can't hear, can't see, something urgent" },
};

/** An inquiry's kind from the meeting's state, looked up as an own key (anything else: information) */
export function inquiryKind(type: unknown): { label: string; hint: string } {
  return typeof type === 'string' && Object.hasOwn(INQUIRY_KINDS, type)
    ? INQUIRY_KINDS[type as InquiryType]
    : INQUIRY_KINDS.information;
}
