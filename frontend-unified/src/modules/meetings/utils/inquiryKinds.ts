import type { InquiryType } from '@robbie-bylawyer/shared/types';

/** A question for the chair, by its kind, in the words members choose it by */
export const INQUIRY_KINDS: Record<InquiryType, { label: string; hint: string }> = {
  parliamentary: { label: 'About the rules', hint: 'How the meeting works, or what is in order' },
  information: { label: 'For information', hint: 'A fact about the business at hand' },
};
