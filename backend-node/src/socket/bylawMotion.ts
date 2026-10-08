import type { BylawAmendment, MeetingAction, MeetingState } from '@robbie-bylawyer/shared/types';
import type { ActionErrorCode } from '@robbie-bylawyer/shared/types/socket';
import { MAX_BYLAW_TEXT_LENGTH } from '@robbie-bylawyer/shared/constants';
import { bylawMotionText, sectionLabel, thresholdFromSetting } from '@robbie-bylawyer/shared/utils';
import { prisma } from '../db/prisma.js';
import { countRosterVoters } from './meetingPacket.js';

type Prepared = { action: MeetingAction } | { error: string; errorCode: ActionErrorCode };

const refuse = (error: string): Prepared => ({ error, errorCode: 'INVALID_ACTION' });

/** A section's text as the motion shows it: the whole of it, or cut where it is too long */
function shown(text: string | null): string | undefined {
  if (!text) return undefined;
  return text.length <= MAX_BYLAW_TEXT_LENGTH
    ? text
    : `${text.slice(0, MAX_BYLAW_TEXT_LENGTH - 1).trimEnd()}…`;
}

const orUndefined = (value: string | null | undefined) => value ?? undefined;

/** The change a proposed amendment makes, as a motion carries it (one change only) */
async function proposedChange(
  amendmentId: string,
  documentId: string,
): Promise<{ change: BylawAmendment } | { error: string }> {
  const amendment = await prisma.amendment.findUnique({
    where: { id: amendmentId },
    include: { changes: { orderBy: { position: 'asc' } } },
  });
  if (!amendment || amendment.documentId !== documentId) {
    return { error: "That amendment is not one of this document's" };
  }
  if (amendment.status !== 'proposed') {
    return { error: 'Only a proposed amendment can be moved' };
  }
  if (amendment.changes.length !== 1) {
    return {
      error:
        amendment.changes.length === 0
          ? 'That amendment has no change to move'
          : "An amendment with more than one change can't be moved in a meeting yet",
    };
  }
  const [change] = amendment.changes;
  if ((change.newContent?.length ?? 0) > MAX_BYLAW_TEXT_LENGTH) {
    return { error: "That amendment's text is too long to move in a meeting" };
  }
  return {
    change: {
      documentId,
      amendmentId: amendment.id,
      amendmentTitle: amendment.title,
      changeType: change.changeType,
      // For an added section, the change's target is the section it goes under
      ...(change.changeType === 'add'
        ? { parentSectionId: orUndefined(change.targetSectionId) }
        : { targetSectionId: orUndefined(change.targetSectionId) }),
      newContent: orUndefined(change.newContent),
      newTitle: orUndefined(change.newTitle),
      newNumberLabel: orUndefined(change.newNumberLabel),
    },
  };
}

/** What the change needs besides its section: new text for a change or an addition, and so on */
function missingText(change: BylawAmendment): string | null {
  const has = (text?: string) => !!text?.trim();
  switch (change.changeType) {
    case 'add':
      return has(change.newTitle) || has(change.newContent)
        ? null
        : 'Give the new section a title or text';
    case 'modify':
      return has(change.newContent) || has(change.newTitle) || has(change.newNumberLabel)
        ? null
        : 'Give the section its new text';
    case 'renumber':
      return has(change.newNumberLabel) ? null : 'Give the section its new number';
    case 'delete':
      return null;
  }
}

/**
 * A bylaw amendment motion as the meeting will see it. The mover names the document and the
 * change, or a proposed amendment to move; the server checks them against the bylaws and fills
 * in everything the room reads:
 * - the document must be the meeting's organization's, with a current version;
 * - a proposed amendment must be that document's and still proposed, and its change replaces
 *   whatever the client sent;
 * - the section changed (or the one an added section goes under) must be in the current
 *   version, and its label, title and text come from it;
 * - the motion's words come from the change (bylawMotionText), never from the client;
 * - the vote it needs comes from the organization's setting (bylawAmendmentVote).
 * Any other motion carries no bylaw change.
 */
export async function prepareBylawMotion(
  meetingCode: string,
  state: MeetingState,
  action: MeetingAction,
): Promise<Prepared> {
  if (action.type !== 'MAKE_MOTION' && action.type !== 'MAKE_FLOOR_MOTION') return { action };
  if (action.motionType !== 'bylawAmendment') {
    if (!action.bylawAmendment) return { action };
    const { bylawAmendment: _ignored, ...rest } = action;
    return { action: rest as MeetingAction };
  }
  // The validator refuses a bylaw amendment without its change
  const sent = action.bylawAmendment;
  if (!sent) return { action };

  const packet = await prisma.meetingPacket.findUnique({
    where: { robbieCode: meetingCode },
    select: {
      organizationId: true,
      organization: { select: { bylawAmendmentVote: true, eligibleVoters: true } },
    },
  });
  const document = await prisma.document.findUnique({
    where: { id: sent.documentId },
    select: { id: true, title: true, organizationId: true, currentVersionId: true },
  });
  if (!packet || !document || document.organizationId !== packet.organizationId) {
    return refuse("That document is not one of this organization's");
  }
  if (!document.currentVersionId) {
    return refuse('That document has no current version to amend');
  }

  let change: BylawAmendment = {
    documentId: document.id,
    changeType: sent.changeType,
    targetSectionId: sent.targetSectionId,
    parentSectionId: sent.parentSectionId,
    newContent: sent.newContent,
    newTitle: sent.newTitle,
    newNumberLabel: sent.newNumberLabel,
  };
  if (sent.amendmentId) {
    const proposed = await proposedChange(sent.amendmentId, document.id);
    if ('error' in proposed) return refuse(proposed.error);
    change = proposed.change;
    const pending = [...state.motionStack, state.pendingSecond].some(
      (m) => m?.bylawAmendment?.amendmentId === change.amendmentId,
    );
    if (pending) return refuse('That amendment is already before the meeting');
  }
  // Only the fields that apply to the change
  if (change.changeType === 'add') {
    delete change.targetSectionId;
  } else {
    delete change.parentSectionId;
    if (change.changeType !== 'modify') {
      delete change.newContent;
      delete change.newTitle;
    }
    if (change.changeType === 'delete') delete change.newNumberLabel;
  }

  const missing = missingText(change);
  if (missing) return refuse(missing);

  const sectionId = change.changeType === 'add' ? change.parentSectionId : change.targetSectionId;
  if (change.changeType !== 'add' && !sectionId) return refuse('Choose the section to amend');
  const section = sectionId
    ? await prisma.section.findFirst({
        where: { id: sectionId, versionId: document.currentVersionId },
        select: { numberLabel: true, title: true, content: true },
      })
    : null;
  if (sectionId && !section) {
    return refuse('That section is not in the current version of the bylaws');
  }

  // The vote it needs, as the organization's bylaws set it now: of all the voting members, they
  // are counted as it is moved (the organization's number, or else its voting members)
  const setting = packet.organization.bylawAmendmentVote;
  const members = setting.endsWith('Members')
    ? (packet.organization.eligibleVoters ?? (await countRosterVoters(packet.organizationId)))
    : 0;
  const bylawAmendment: BylawAmendment = {
    ...change,
    voteRequired: thresholdFromSetting(setting, members),
    documentTitle: document.title,
    ...(section &&
      (change.changeType === 'add'
        ? { parentSectionLabel: sectionLabel(section) }
        : {
            targetSectionLabel: sectionLabel(section),
            currentTitle: orUndefined(section.title),
            currentContent: shown(section.content),
          })),
  };
  // Leave out the fields with nothing in them, so the state carries only what the change has
  for (const key of Object.keys(bylawAmendment) as Array<keyof BylawAmendment>) {
    if (bylawAmendment[key] === undefined) delete bylawAmendment[key];
  }
  return { action: { ...action, bylawAmendment, text: bylawMotionText(bylawAmendment) } };
}
