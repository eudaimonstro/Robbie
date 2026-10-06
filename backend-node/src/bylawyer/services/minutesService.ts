/**
 * Minutes Service
 *
 * Converts Robbie meeting minutes to Bylawyer documents.
 * Minutes are stored as versioned documents for historical record.
 */

import { prisma } from '../../db/prisma.js';
import type { MeetingMinutes } from '@robbie-bylawyer/shared/types';
import { logger } from '../../middleware/logger.js';

export type MinutesDocumentResult =
  | { success: true; documentId: string; versionId: string; documentTitle: string }
  | { success: false; error: string };

/**
 * Create or update a minutes document from meeting minutes
 *
 * @param minutes - Generated meeting minutes
 * @param organizationId - Optional organization to associate with
 * @returns Document and version IDs
 */
export async function createMinutesDocument(
  minutes: MeetingMinutes,
  organizationId?: string,
): Promise<MinutesDocumentResult> {
  try {
    // Format the date for the document title
    const meetingDate = minutes.startTime
      ? new Date(minutes.startTime).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Unknown Date';

    const documentTitle = `Meeting Minutes - ${meetingDate}`;

    // Try to find organization from meeting packet if not provided
    const orgId = organizationId;
    if (!orgId) {
      const packet = await prisma.meetingPacket.findUnique({
        where: { robbieCode: minutes.meetingCode },
      });

      // If packet exists, we could potentially link to an organization
      // For now, we'll require organizationId or skip org linking
      if (!packet) {
        // No packet, no org - create standalone document
        // This is allowed but the document won't be associated with an org
      }
    }

    // If we have an organization, verify it exists
    if (orgId) {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
      });
      if (!org) {
        return { success: false, error: 'Organization not found' };
      }
    }

    // Check if a minutes document already exists for this meeting
    const existingDoc = await prisma.document.findFirst({
      where: {
        docType: 'minutes',
        title: { contains: minutes.meetingCode },
      },
    });

    if (existingDoc) {
      // Add new version to existing document
      return await addVersionToMinutesDocument(existingDoc.id, minutes);
    }

    // Organization is required to create new minutes document
    if (!orgId) {
      return {
        success: false,
        error:
          'Organization ID is required to create minutes document. Link the meeting to an organization first.',
      };
    }

    // Create new document
    const document = await prisma.document.create({
      data: {
        title: documentTitle,
        docType: 'minutes',
        organizationId: orgId,
      },
    });

    // Create the first version
    const version = await prisma.version.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        effectiveDate: minutes.startTime ? new Date(minutes.startTime) : new Date(),
        notes: `Minutes for meeting ${minutes.meetingCode}`,
      },
    });

    // Create sections from minutes content
    await createMinutesSections(version.id, minutes);

    // Update document's current version
    await prisma.document.update({
      where: { id: document.id },
      data: { currentVersionId: version.id },
    });

    return {
      success: true,
      documentId: document.id,
      versionId: version.id,
      documentTitle,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error creating minutes document');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Add a new version to an existing minutes document
 */
async function addVersionToMinutesDocument(
  documentId: string,
  minutes: MeetingMinutes,
): Promise<MinutesDocumentResult> {
  // Get current version number
  const latestVersion = await prisma.version.findFirst({
    where: { documentId },
    orderBy: { versionNumber: 'desc' },
  });

  const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

  const version = await prisma.version.create({
    data: {
      documentId,
      versionNumber: nextVersionNumber,
      effectiveDate: minutes.startTime ? new Date(minutes.startTime) : new Date(),
      notes: `Updated minutes for meeting ${minutes.meetingCode}`,
    },
  });

  await createMinutesSections(version.id, minutes);

  await prisma.document.update({
    where: { id: documentId },
    data: { currentVersionId: version.id },
  });

  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  return {
    success: true,
    documentId,
    versionId: version.id,
    documentTitle: document?.title || 'Meeting Minutes',
  };
}

/**
 * Create hierarchical sections from meeting minutes
 */
async function createMinutesSections(versionId: string, minutes: MeetingMinutes): Promise<void> {
  let position = 0;

  // Header section
  await prisma.section.create({
    data: {
      versionId,
      position: position++,
      numberLabel: null,
      title: 'Meeting Information',
      content: buildHeaderContent(minutes),
    },
  });

  // Attendance section
  if (minutes.attendance.length > 0) {
    await prisma.section.create({
      data: {
        versionId,
        position: position++,
        numberLabel: 'I',
        title: 'Attendance',
        content: buildAttendanceContent(minutes),
      },
    });
  }

  // Agenda section
  if (minutes.agendaItems.length > 0) {
    await prisma.section.create({
      data: {
        versionId,
        position: position++,
        numberLabel: 'II',
        title: 'Agenda',
        content: buildAgendaContent(minutes),
      },
    });
  }

  // Motions section
  if (minutes.motions.length > 0) {
    const motionsSection = await prisma.section.create({
      data: {
        versionId,
        position: position++,
        numberLabel: 'III',
        title: 'Motions',
      },
    });

    // Create sub-sections for each motion
    for (let i = 0; i < minutes.motions.length; i++) {
      const motion = minutes.motions[i];
      await prisma.section.create({
        data: {
          versionId,
          parentId: motionsSection.id,
          position: i,
          numberLabel: `${i + 1}`,
          title: motion.name,
          content: buildMotionContent(motion),
        },
      });
    }
  }

  // Elections section
  if (minutes.elections.length > 0) {
    const electionsSection = await prisma.section.create({
      data: {
        versionId,
        position: position++,
        numberLabel: 'IV',
        title: 'Elections',
      },
    });

    for (let i = 0; i < minutes.elections.length; i++) {
      const election = minutes.elections[i];
      await prisma.section.create({
        data: {
          versionId,
          parentId: electionsSection.id,
          position: i,
          numberLabel: `${i + 1}`,
          title: election.position,
          content: buildElectionContent(election),
        },
      });
    }
  }

  // Elected Officers section
  if (minutes.electedOfficers.length > 0) {
    await prisma.section.create({
      data: {
        versionId,
        position: position++,
        numberLabel: 'V',
        title: 'Officers Elected',
        content: buildOfficersContent(minutes),
      },
    });
  }

  // Announcements section
  if (minutes.announcements.length > 0) {
    await prisma.section.create({
      data: {
        versionId,
        position,
        numberLabel: 'VI',
        title: 'Announcements',
        content: minutes.announcements.map((a) => `• ${a}`).join('\n'),
      },
    });
  }
}

function buildHeaderContent(minutes: MeetingMinutes): string {
  const lines: string[] = [];
  lines.push(`Meeting Code: ${minutes.meetingCode}`);
  if (minutes.startTime) {
    lines.push(`Date: ${new Date(minutes.startTime).toLocaleDateString()}`);
    lines.push(`Started: ${new Date(minutes.startTime).toLocaleTimeString()}`);
  }
  if (minutes.endTime) {
    lines.push(`Ended: ${new Date(minutes.endTime).toLocaleTimeString()}`);
  }
  if (minutes.chairName) {
    lines.push(`Chair: ${minutes.chairName}`);
  }
  lines.push(`Quorum: ${minutes.quorumPresent ? 'Present' : 'Not Present'}`);
  return lines.join('\n');
}

function buildAttendanceContent(minutes: MeetingMinutes): string {
  const lines: string[] = [];

  const present = minutes.attendance.filter((a) => a.status === 'present' || a.status === 'late');
  const absent = minutes.attendance.filter((a) => a.status === 'absent' || a.status === 'excused');

  if (present.length > 0) {
    lines.push('Present:');
    present.forEach((a) => {
      const notes: string[] = [];
      if (a.role === 'chair') notes.push('Chair');
      if (a.status === 'late') notes.push('arrived late');
      const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : '';
      lines.push(`• ${a.name}${noteStr}`);
    });
    lines.push('');
  }

  if (absent.length > 0) {
    lines.push('Absent:');
    absent.forEach((a) => {
      const note = a.status === 'excused' ? ' (excused)' : '';
      lines.push(`• ${a.name}${note}`);
    });
  }

  return lines.join('\n');
}

function buildAgendaContent(minutes: MeetingMinutes): string {
  return minutes.agendaItems
    .map((item, i) => {
      const status = item.status === 'completed' ? '✓' : item.status === 'active' ? '→' : '○';
      return `${i + 1}. ${status} ${item.title}`;
    })
    .join('\n');
}

function buildMotionContent(motion: {
  text: string;
  mover?: string;
  outcome: string;
  voteCount?: { yea: number; nay: number; abstain: number };
}): string {
  const lines: string[] = [];
  lines.push(`Motion: "${motion.text}"`);
  if (motion.mover) {
    lines.push(`Moved by: ${motion.mover}`);
  }
  lines.push(`Outcome: ${motion.outcome.toUpperCase()}`);
  if (motion.voteCount) {
    lines.push(
      `Vote: Yea ${motion.voteCount.yea}, Nay ${motion.voteCount.nay}, Abstain ${motion.voteCount.abstain}`,
    );
  }
  return lines.join('\n');
}

function buildElectionContent(election: {
  position: string;
  winner: string | null;
  ballotResults: Record<string, number>;
  wasRunoff: boolean;
}): string {
  const lines: string[] = [];
  if (election.winner) {
    lines.push(`Elected: ${election.winner}`);
  } else {
    lines.push('Result: No candidate elected');
  }
  if (election.wasRunoff) {
    lines.push('(Runoff election)');
  }
  if (Object.keys(election.ballotResults).length > 0) {
    lines.push('Ballot Results:');
    Object.entries(election.ballotResults).forEach(([name, votes]) => {
      lines.push(`• ${name}: ${votes} vote(s)`);
    });
  }
  return lines.join('\n');
}

function buildOfficersContent(minutes: MeetingMinutes): string {
  return minutes.electedOfficers
    .map((officer) => `• ${officer.position}: ${officer.name}`)
    .join('\n');
}

/**
 * Get minutes document for a meeting code
 */
export async function getMinutesDocument(meetingCode: string): Promise<{
  documentId: string;
  versionId: string | null;
  title: string;
} | null> {
  const document = await prisma.document.findFirst({
    where: {
      docType: 'minutes',
      title: { contains: meetingCode },
    },
    select: {
      id: true,
      title: true,
      currentVersionId: true,
    },
  });

  if (!document) {
    return null;
  }

  return {
    documentId: document.id,
    versionId: document.currentVersionId,
    title: document.title,
  };
}

/**
 * Automatically generate minutes document when a meeting ends
 * This is called from the socket handler when meeting is adjourned
 */
export async function autoGenerateMinutes(
  meetingCode: string,
  minutes: MeetingMinutes,
  organizationId?: string,
): Promise<MinutesDocumentResult> {
  // First, try to find if there's a linked organization via meeting packet
  const orgId = organizationId;

  // Future: look up the organization through the meeting packet once MeetingPacket links to one

  const result = await createMinutesDocument(minutes, orgId);

  if (result.success) {
    // Optionally link the minutes document to the meeting packet
    const packet = await prisma.meetingPacket.findUnique({
      where: { robbieCode: meetingCode },
    });

    if (packet) {
      // Create an attachment linking to the minutes document
      await prisma.attachment.create({
        data: {
          type: 'bylawyer_document',
          documentId: result.documentId,
          versionId: result.versionId,
          displayName: result.documentTitle,
          description: 'Auto-generated meeting minutes',
          meetingPacketId: packet.id,
          position: 999, // Add at end
        },
      });
    }
  }

  return result;
}
