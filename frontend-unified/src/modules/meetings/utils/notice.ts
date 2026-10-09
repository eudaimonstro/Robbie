import { count as plural } from '../../../utils/plural';

/** What sending a meeting's notice came to, in a sentence */
export function sentMessage(sent: number, failed: number): string {
  const to = `The notice was sent to ${plural(sent, 'person', 'people')}.`;
  return failed > 0 ? `${to} ${plural(failed, 'email')} couldn't be delivered.` : to;
}
