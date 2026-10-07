import type {
  MeetingState,
  MeetingMinutes,
  AttendanceRecord,
  MinutesMotionRecord,
  MinutesElectionRecord,
} from '../types/index.js';
import { attendanceSummary } from './attendance.js';

/**
 * Generate structured meeting minutes from the current meeting state
 */
export function generateMeetingMinutes(state: MeetingState): MeetingMinutes {
  // Get meeting start time from first log entry
  const startTime = state.meetingLog[0]?.time ?? '';

  // Get meeting end time from last log entry if meeting is adjourned
  const endTime =
    state.meetingStage === 'adjourned'
      ? state.meetingLog[state.meetingLog.length - 1]?.time
      : undefined;

  // Find chair name
  const chair = state.members.find((m) => m.role === 'chair');
  const chairName = chair?.name;

  // Build attendance records
  const attendance: AttendanceRecord[] = state.members.map((member) => {
    // Look for arrival/departure in meeting log
    const joinedLog = state.meetingLog.find(
      (log) =>
        log.message.includes(`${member.name} has joined`) ||
        log.message.includes(`${member.name} is now present`) ||
        log.message.includes(`${member.name} marked present`),
    );
    const leftLog = state.meetingLog.find((log) => log.message.includes(`${member.name} has left`));

    let status: AttendanceRecord['status'] = member.present ? 'present' : 'absent';

    // Check if they arrived late (joined after meeting started)
    if (joinedLog && state.meetingLog.indexOf(joinedLog) > 0) {
      status = 'late';
    }

    // Check if they left early
    if (leftLog && state.meetingStage !== 'adjourned') {
      status = 'left-early';
    }

    return {
      memberId: member.id,
      name: member.name,
      role: member.role,
      status,
      arrivedAt: joinedLog?.time,
      departedAt: leftLog?.time,
    };
  });

  // Quorum as the meeting counts it: members on a device or marked present, the headcount,
  // and proxies when they count
  const quorumPresent = attendanceSummary(state).hasQuorum;

  // Build agenda items
  const agendaItems = state.agenda.map((item) => ({
    title: item.title,
    status: item.status,
  }));

  // Build motion records from completed motions
  const motions: MinutesMotionRecord[] = state.completedMotions.map((motion) => ({
    id: motion.id,
    type: motion.type,
    name: motion.name,
    text: motion.text,
    mover: '', // Not stored in completedMotions, would need to track this
    moverId: 0,
    outcome: motion.passed ? 'passed' : 'failed',
    voteCount: calculateVoteCount(motion.voterChoices),
    voterChoices: motion.voterChoices,
    timestamp: motion.timestamp,
  }));

  // Add tabled motions
  state.tabledMotions.forEach((motion) => {
    motions.push({
      id: motion.id,
      type: motion.type,
      name: motion.name,
      text: motion.text,
      mover: motion.mover,
      moverId: motion.moverId,
      outcome: 'tabled',
      timestamp: '', // Would need timestamp from when it was tabled
    });
  });

  // Build election records from elected officers
  const elections: MinutesElectionRecord[] = state.electedOfficers.map((officer) => ({
    position: officer.position,
    candidates: [], // Would need to track this during election
    winner: officer.name,
    ballotResults: {},
    wasRunoff: false,
    timestamp: officer.electedAt,
  }));

  // Extract announcements from meeting log (messages during announcements stage)
  const announcements: string[] = [];
  let inAnnouncementsStage = false;
  for (const log of state.meetingLog) {
    if (log.message.includes('Announcements')) {
      inAnnouncementsStage = true;
    } else if (log.message.includes('adjourned')) {
      inAnnouncementsStage = false;
    } else if (inAnnouncementsStage && !log.message.startsWith('Chair')) {
      announcements.push(log.message);
    }
  }

  return {
    meetingCode: state.meetingCode,
    startTime,
    endTime,
    chairName,
    attendance,
    headcount: state.headcount ?? 0,
    headcountNames: state.headcountNames ?? [],
    quorumPresent,
    agendaItems,
    motions,
    elections,
    electedOfficers: state.electedOfficers,
    announcements,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate vote counts from voter choices
 */
function calculateVoteCount(voterChoices: Record<number, 'yea' | 'nay' | 'abstain'>): {
  yea: number;
  nay: number;
  abstain: number;
} {
  const counts = { yea: 0, nay: 0, abstain: 0 };
  for (const vote of Object.values(voterChoices)) {
    counts[vote]++;
  }
  return counts;
}

/**
 * Format meeting minutes as Markdown
 */
export function formatMinutesAsMarkdown(minutes: MeetingMinutes): string {
  const lines: string[] = [];

  lines.push(`# Meeting Minutes`);
  lines.push(`**Meeting Code:** ${minutes.meetingCode}`);
  lines.push(
    `**Date:** ${minutes.startTime ? new Date(minutes.startTime).toLocaleDateString() : 'N/A'}`,
  );
  if (minutes.chairName) {
    lines.push(`**Chair:** ${minutes.chairName}`);
  }
  lines.push('');

  // Attendance
  lines.push('## Attendance');
  lines.push(`**Quorum:** ${minutes.quorumPresent ? 'Present' : 'Not Present'}`);
  lines.push('');

  const voting = minutes.attendance.filter((a) => a.role !== 'guest');
  const present = voting.filter((a) => a.status === 'present' || a.status === 'late');
  const absent = voting.filter((a) => a.status === 'absent' || a.status === 'excused');
  const guests = minutes.attendance.filter((a) => a.role === 'guest');

  if (present.length > 0) {
    lines.push('**Present:**');
    present.forEach((a) => {
      const note = a.status === 'late' ? ' (arrived late)' : '';
      lines.push(`- ${a.name}${a.role === 'chair' ? ' (Chair)' : ''}${note}`);
    });
    lines.push('');
  }

  if (minutes.headcount > 0) {
    const names = minutes.headcountNames.length > 0 ? `: ${minutes.headcountNames.join(', ')}` : '';
    lines.push(`**Also present without an account:** ${minutes.headcount}${names}`);
    lines.push('');
  }

  if (absent.length > 0) {
    lines.push('**Absent:**');
    absent.forEach((a) => {
      const note = a.status === 'excused' ? ' (excused)' : '';
      lines.push(`- ${a.name}${note}`);
    });
    lines.push('');
  }

  if (guests.length > 0) {
    lines.push('**Guests:**');
    guests.forEach((a) => lines.push(`- ${a.name}`));
    lines.push('');
  }

  // Agenda
  if (minutes.agendaItems.length > 0) {
    lines.push('## Agenda');
    minutes.agendaItems.forEach((item, i) => {
      const status = item.status === 'completed' ? '✓' : item.status === 'active' ? '→' : '○';
      lines.push(`${i + 1}. ${status} ${item.title}`);
    });
    lines.push('');
  }

  // Motions
  if (minutes.motions.length > 0) {
    lines.push('## Motions');
    minutes.motions.forEach((motion) => {
      lines.push(`### ${motion.name}`);
      lines.push(`**Motion:** "${motion.text}"`);
      if (motion.mover) {
        lines.push(`**Moved by:** ${motion.mover}`);
      }
      lines.push(`**Outcome:** ${motion.outcome.toUpperCase()}`);
      if (motion.voteCount) {
        lines.push(
          `**Vote:** Yea: ${motion.voteCount.yea}, Nay: ${motion.voteCount.nay}, Abstain: ${motion.voteCount.abstain}`,
        );
      }
      lines.push('');
    });
  }

  // Elections
  if (minutes.elections.length > 0) {
    lines.push('## Elections');
    minutes.elections.forEach((election) => {
      lines.push(`### ${election.position}`);
      if (election.winner) {
        lines.push(`**Elected:** ${election.winner}`);
      } else {
        lines.push('**Result:** No candidate elected');
      }
      if (Object.keys(election.ballotResults).length > 0) {
        lines.push('**Ballot Results:**');
        Object.entries(election.ballotResults).forEach(([name, votes]) => {
          lines.push(`- ${name}: ${votes} vote(s)`);
        });
      }
      lines.push('');
    });
  }

  // Elected Officers
  if (minutes.electedOfficers.length > 0) {
    lines.push('## Officers Elected');
    minutes.electedOfficers.forEach((officer) => {
      lines.push(`- **${officer.position}:** ${officer.name}`);
    });
    lines.push('');
  }

  // Announcements
  if (minutes.announcements.length > 0) {
    lines.push('## Announcements');
    minutes.announcements.forEach((announcement) => {
      lines.push(`- ${announcement}`);
    });
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Minutes generated: ${new Date(minutes.generatedAt).toLocaleString()}*`);

  return lines.join('\n');
}

/**
 * Format meeting minutes as JSON (for export/API)
 */
export function formatMinutesAsJSON(minutes: MeetingMinutes): string {
  return JSON.stringify(minutes, null, 2);
}
