import { count as plural } from '../../../utils/plural';

/** What sending a meeting's notice came to, in a sentence */
export function sentMessage(sent: number, failed: number): string {
  if (sent === 0 && failed > 0) {
    return "The notice couldn't be delivered to anyone, so it wasn't sent. Try again later.";
  }
  const to = `The notice was sent to ${plural(sent, 'person', 'people')}.`;
  return failed > 0 ? `${to} ${plural(failed, 'email')} couldn't be delivered.` : to;
}
