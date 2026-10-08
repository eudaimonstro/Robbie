import { useEffect, useState } from 'react';
import type { MeetingState, SpeakerQueueEntry } from '@robbie-bylawyer/shared/types';
import type { AttendanceSummary } from '@robbie-bylawyer/shared/utils';
import { useSocket } from '../context/SocketContext';
import { useMeetingOrganization } from '../context/OrganizationBridge';
import { useRoster } from '../hooks/useRoster';
import { useVoteResults } from '../hooks/useVoteResults';
import { useSortedSpeakerQueue } from '../hooks/useSortedSpeakerQueue';
import { eligibleCount } from '../utils/attendance';
import { adjournedAt, currentResult, describeQuestion, itemsDecided } from '../utils/question';
import { stanceLabel } from '../utils/phoneMoment';
import {
  agendaNamesTheApproval,
  minutesHeading,
  minutesItemUnderWay,
  minutesLatestLine,
} from '../utils/minutesApproval';
import { latestDecision } from '../utils/decisions';
import { joinUrl } from '../utils/meetingLinks';
import { formatScheduledStart } from '../../../utils/dates';
import { AttendanceBlock } from '../components/attendance/AttendanceBlock';
import { QuestionCard } from '../components/QuestionCard';
import { Stamp } from '../components/Stamp';
import { TimerLine } from '../components/TimerLine';
import { QrCode } from '../components/QrCode';

/** The display's labels: 28px at 1080p, the label style */
const LABEL = 'text-display-label font-semibold uppercase tracking-[0.08em] text-ink-muted';

/**
 * The display view (docs/design-brief.md, "The three screens"), for a TV or projector: always the
 * evening palette, large type, nothing to click. Before the meeting it shows how to join; in
 * session, the question (or the result) and the room's attendance and vote; adjourned, when.
 */
export function DisplayView() {
  const { state, isConnected, hasJoined, joinError, canceled, meetingCode, attendance } =
    useSocket();
  const { availableOrganizations } = useMeetingOrganization();
  const organization = availableOrganizations.find((o) => o.id === state.organizationId) ?? null;
  const { roster } = useRoster(meetingCode, isConnected);
  const eligible = eligibleCount(organization, roster);
  const beforeMeeting = !state.meetingActive && state.meetingStage !== 'adjourned';
  // Once joined, a dropped connection keeps the last screen up while the socket reconnects
  // A meeting canceled while open is gone: the display says so (nothing on it is interactive)
  const showMeeting = !canceled && (isConnected || (hasJoined && !joinError));

  return (
    <div className="dark relative min-h-screen overflow-hidden bg-paper font-body text-ink">
      <Grain />
      {/* The screen's height and no more: nothing on a TV scrolls */}
      <main className="relative flex h-screen flex-col gap-10 px-16 py-12">
        {!showMeeting ? (
          <p className="m-auto text-display-line text-ink-muted">
            {canceled ?? joinError?.message ?? 'Connecting to the meeting...'}
          </p>
        ) : (
          <>
            <header className="shrink-0 space-y-1">
              {organization && <p className={LABEL}>{organization.name}</p>}
              <h1 className="font-serif-soft text-display-line font-semibold text-ink">
                {state.title || 'Meeting'}
              </h1>
              {beforeMeeting && state.scheduledFor && (
                <p className="text-display-line text-ink-muted">
                  {formatScheduledStart(state.scheduledFor)}
                </p>
              )}
            </header>
            {state.meetingStage === 'adjourned' ? (
              <Adjourned state={state} />
            ) : state.meetingActive ? (
              <InSession state={state} attendance={attendance} eligible={eligible} />
            ) : (
              <BeforeMeeting
                meetingCode={meetingCode}
                attendance={attendance}
                eligible={eligible}
              />
            )}
          </>
        )}
      </main>
      <FullscreenHint />
      {showMeeting && !isConnected && (
        <p role="status" className="absolute bottom-4 left-6 text-sm text-caution-ink">
          Reconnecting...
        </p>
      )}
    </div>
  );
}

interface AttendanceProps {
  attendance: AttendanceSummary;
  eligible: number | null;
}

function BeforeMeeting({
  meetingCode,
  attendance,
  eligible,
}: AttendanceProps & { meetingCode: string }) {
  const link = joinUrl(meetingCode);
  return (
    <div className="flex flex-1 flex-col justify-center gap-16">
      <div className="grid grid-cols-[1fr_auto] items-center gap-16">
        <div className="space-y-10">
          <div className="space-y-2">
            <p className={LABEL}>Join at</p>
            <p className="break-all text-display-line text-ink">{link}</p>
          </div>
          <div className="space-y-2">
            <p className={LABEL}>Code</p>
            <p className="meeting-code text-display-number text-ink">{meetingCode}</p>
          </div>
        </div>
        <QrCode value={link} label="Scan to join" size={360} />
      </div>
      <AttendanceBlock summary={attendance} eligible={eligible} size="display" />
    </div>
  );
}

function InSession({ state, attendance, eligible }: AttendanceProps & { state: MeetingState }) {
  const voteResult = useVoteResults(state.meetingLog);
  const queue = useSortedSpeakerQueue(
    state.speakerQueue,
    state.currentMotion,
    state.lastSpeakerStance,
    state,
  );
  const question = describeQuestion(state);
  const result = currentResult(state, voteResult);
  // The previous minutes, while the room is asked to approve them, unless the room decided
  // something since they came up: a fresh result keeps its stamp
  const decidedSince = (latestDecision(state.meetingLog)?.index ?? -1) > minutesLatestLine(state);
  const minutes = minutesItemUnderWay(state) && !(result && decidedSince);
  const debate = !!state.recognizedSpeaker || queue.length > 0;
  // The chair's ruling, while it is the latest decision and no new motion has been made
  const ruling =
    latestDecision(state.meetingLog)?.kind === 'ruling' && !state.pendingSecond
      ? state.lastChairRuling
      : null;

  return (
    <>
      <div
        className={`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-12 ${debate ? 'grid-cols-[24rem_1fr]' : 'grid-cols-1'}`}
      >
        {debate && <SpeakerRail state={state} queue={queue} />}
        <div className="flex min-h-0 flex-col justify-center gap-6">
          {state.currentAgendaItem && (
            <p className="text-display-line text-ink-muted">{state.currentAgendaItem.title}</p>
          )}
          {state.recess ? (
            <div className="space-y-6">
              <p className="font-serif-soft text-display-question font-semibold text-ink">
                In recess
              </p>
              {state.recess.until && (
                <p className="text-display-line text-ink-muted">Until {state.recess.until}</p>
              )}
            </div>
          ) : state.adjournmentCarried ? (
            <p className="font-serif-soft text-display-question font-semibold text-ink">
              The meeting has voted to adjourn
            </p>
          ) : minutes ? (
            <MinutesOnDisplay state={state} />
          ) : result ? (
            <Stamp
              key={result.key}
              outcome={result.outcome}
              subject={result.subject}
              tally={result.tally}
              size="display"
            />
          ) : (
            <QuestionCard question={question} size="display" empty="The floor is open." />
          )}
          {state.unanimousConsentPending && (
            <p className="text-display-line text-ink">The chair asks: is there any objection?</p>
          )}
          {ruling && !result && (
            <p className="text-display-line text-ink-muted">The chair rules: {ruling.ruling}</p>
          )}
        </div>
      </div>
      <footer className="grid shrink-0 grid-cols-[1fr_auto] items-end gap-12 border-t border-rule pt-8">
        <AttendanceBlock summary={attendance} eligible={eligible} size="display" />
        <VoteBand state={state} />
      </footer>
    </>
  );
}

/**
 * The minutes put before the room: their title, and the chair's question or the approval. A
 * display is sent the minutes without their text (as guests are): then the item line names
 * them, and the question takes the large type.
 */
function MinutesOnDisplay({ state }: { state: MeetingState }) {
  const made = state.minutesApproval?.corrections;
  const text = state.minutesFromPreviousMeeting;
  const verdict = state.minutesApproved
    ? made
      ? 'Approved with corrections'
      : 'Approved as read'
    : 'Any corrections?';
  const large = 'font-serif-soft text-display-question font-semibold text-ink';
  // Corrections run to 2,000 characters: the screen keeps the first lines
  const line = 'line-clamp-3 text-display-line text-ink-muted';
  return (
    <div className="space-y-6">
      {/* The agenda line above may say it already */}
      {!agendaNamesTheApproval(state) && <p className={LABEL}>Approval of the minutes</p>}
      {text ? (
        <>
          <p className={large}>{minutesHeading(text)}</p>
          <p className={line}>{made ? `${verdict}: ${made}` : verdict}</p>
        </>
      ) : (
        <>
          <p className={large}>{verdict}</p>
          {made && <p className={line}>{made}</p>}
        </>
      )}
    </div>
  );
}

function SpeakerRail({ state, queue }: { state: MeetingState; queue: SpeakerQueueEntry[] }) {
  return (
    <aside
      aria-label="Speakers"
      className="min-h-0 space-y-8 overflow-hidden border-r border-rule pr-10"
    >
      <div className="space-y-3">
        <p className={LABEL}>Speaking</p>
        {state.recognizedSpeaker ? (
          <>
            <p className="font-serif-soft text-display-line font-semibold text-ink">
              {state.recognizedSpeaker.name}
            </p>
            <TimerLine
              endTime={state.speakerTimerEnd}
              totalSeconds={state.speakerTimeLimit}
              label="Speaking time"
              size="display"
            />
          </>
        ) : (
          <p className="text-display-label text-ink-muted">Nobody has the floor</p>
        )}
      </div>
      {queue.length > 0 && (
        <div className="space-y-3">
          <p className={LABEL}>Waiting</p>
          <ol className="space-y-2">
            {queue.map((entry) => (
              <li key={entry.member.id} className="text-display-label text-ink">
                {entry.member.name}{' '}
                <span className="text-ink-muted">{stanceLabel(entry.stance)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}

/** The vote in progress: votes received, and the count in the room once the chair enters it */
function VoteBand({ state }: { state: MeetingState }) {
  const election = state.currentElection;
  if (state.votingOpen) {
    const floor = state.floorVotes;
    const floorEntered = floor.yea + floor.nay + floor.abstain > 0;
    const voice = state.votingMethod === 'voice';
    return (
      <div className="space-y-2 text-right">
        <p className={LABEL}>Voting now</p>
        {voice ? (
          <p className="text-display-line text-ink">Voice vote</p>
        ) : state.divisionCalled ? (
          <p className="text-display-line tabular-nums text-ink">
            Division: <span className="animate-count-pulse">{state.voters.length}</span> votes
            received
          </p>
        ) : (
          <p className="text-display-line tabular-nums text-ink">
            <span className="animate-count-pulse">{state.voters.length}</span> votes received
          </p>
        )}
        {/* A secret ballot's counts stay hidden until it closes */}
        {floorEntered && state.votingMethod !== 'ballot' && (
          <p className="text-display-line tabular-nums text-ink">
            In the room: {floor.yea} to {floor.nay}
          </p>
        )}
      </div>
    );
  }
  if (election?.votingInProgress) {
    return (
      <div className="space-y-2 text-right">
        <p className={LABEL}>Ballot</p>
        <p className="text-display-line tabular-nums text-ink">
          <span className="animate-count-pulse">{election.votersWhoVoted.length}</span> ballots
          received
        </p>
      </div>
    );
  }
  return null;
}

function Adjourned({ state }: { state: MeetingState }) {
  const time = adjournedAt(state);
  const decided = itemsDecided(state);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <p className="font-serif-soft text-display-question font-semibold text-ink">
        {time ? `Adjourned at ${time}` : 'Adjourned'}
      </p>
      <p className="text-display-line text-ink-muted">
        {decided === 1 ? '1 item decided' : `${decided} items decided`}
      </p>
      <p className="text-display-label text-ink-muted">
        The secretary publishes the minutes in Robbie, where members can read them.
      </p>
    </div>
  );
}

/** The brief's paper grain: an SVG noise at 4% opacity over the paper */
function Grain() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
    >
      <filter id="display-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#display-grain)" />
    </svg>
  );
}

/** A reminder about full screen, for the first ten seconds */
function FullscreenHint() {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(false), 10_000);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <p className="absolute bottom-4 right-6 text-sm text-ink-muted">
      Press F11 (Control Command F on a Mac) for full screen
    </p>
  );
}
