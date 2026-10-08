import { MAX_MOTION_TEXT_LENGTH } from '../constants/limits.js';

/**
 * A motion's words built from a template around someone's text (an agenda item's title, a
 * motion's words, a purpose): the text is cut, with an ellipsis, so the whole stays within a
 * motion's length, and the server never refuses the motion for words the member didn't type
 */
export function fitMotionText(before: string, text: string, after = ''): string {
  const room = MAX_MOTION_TEXT_LENGTH - before.length - after.length;
  const fitted = text.length <= room ? text : `${text.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return `${before}${fitted}${after}`;
}
