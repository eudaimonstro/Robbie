import type { Inquiry } from '../types/index.js';

/** A question for the chair still waiting: neither answered in writing nor settled aloud or dismissed */
export function awaitingAnswer(inquiry: Inquiry): boolean {
  return !inquiry.answer && !inquiry.closed;
}
