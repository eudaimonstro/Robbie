import type { MeetingAction, Inquiry, InquiryType } from '../../types/index.js';
import type { ActionHandler } from './types.js';

/** A question to the chair, by its kind, as the log names it */
const INQUIRY_LABELS: Record<InquiryType, string> = {
  parliamentary: 'Parliamentary Inquiry',
  information: 'Request for Information',
  privilege: 'Question of Privilege',
};

function inquiryLabel(type: InquiryType | undefined): string {
  return type && Object.hasOwn(INQUIRY_LABELS, type)
    ? INQUIRY_LABELS[type]
    : INQUIRY_LABELS.information;
}

export const inquiryHandler: ActionHandler = (state, action, log) => {
  switch (action.type) {
    case 'ASK_INQUIRY': {
      const typedAction = action as Extract<MeetingAction, { type: 'ASK_INQUIRY' }>;
      const newInquiry: Inquiry = {
        id: typedAction.inquiryId,
        type: typedAction.inquiryType,
        question: typedAction.question,
        askedBy: typedAction.askedBy,
        askerId: typedAction.askerId,
        timestamp: typedAction.timestamp,
      };

      const inquiryTypeLabel = inquiryLabel(typedAction.inquiryType);

      return {
        ...state,
        inquiries: [...state.inquiries, newInquiry],
        meetingLog: log(
          typedAction.timestamp,
          `${typedAction.askedBy} raises ${inquiryTypeLabel}: "${typedAction.question}"`,
        ),
      };
    }

    case 'ANSWER_INQUIRY': {
      const typedAction = action as Extract<MeetingAction, { type: 'ANSWER_INQUIRY' }>;
      const updatedInquiries = state.inquiries.map((inq) =>
        inq.id === typedAction.inquiryId
          ? {
              ...inq,
              answer: typedAction.answer,
              answeredBy: typedAction.answeredBy,
              answeredAt: typedAction.timestamp,
            }
          : inq,
      );

      const inquiry = state.inquiries.find((inq) => inq.id === typedAction.inquiryId);
      const inquiryTypeLabel = inquiryLabel(inquiry?.type);

      return {
        ...state,
        inquiries: updatedInquiries,
        meetingLog: log(
          typedAction.timestamp,
          `Chair answers ${inquiryTypeLabel}: "${typedAction.answer}"`,
        ),
      };
    }

    default:
      // This handler only receives its specific actions from the main reducer
      return state;
  }
};
