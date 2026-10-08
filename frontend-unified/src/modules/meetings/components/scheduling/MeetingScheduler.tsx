/**
 * Meeting Scheduler Component
 *
 * Schedules a meeting in the current organization. Its details create the meeting's packet, which
 * claims the meeting code for the organization and names the presiding officer; the agenda and
 * attachments are then added to the packet, and the join card shows how people get in.
 *
 * Given a meeting code, it changes that scheduled meeting instead: the same two steps, filled in
 * from its packet, and Cancel the meeting. A meeting called to order is changed in the meeting.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Calendar, Check, Clock, Loader2, MapPin } from 'lucide-react';
import type { MeetingPacket } from './types';
import { PacketBuilder } from './PacketBuilder';
import { createPacket, deletePacket, getPacket, updatePacket } from './api';
import {
  HttpError,
  meetingPackets,
  members as membersApi,
  type OrgMember,
} from '../../../../api/client';
import { formatMeetingTime, toLocalDateTimeInput } from '../../../../utils/dates';
import { useSession } from '../../../../context/SessionContext';
import { useMeetingOrganization } from '../../context/OrganizationBridge';
import { atLeast } from '../../../../utils/roles';
import { JoinInfoCard } from '../console/JoinInfoCard';

interface MeetingSchedulerProps {
  /** Closes the scheduler; after a change or a cancellation, with what to tell the person */
  onBack: (status?: string) => void;
  onJoinMeeting: (code: string) => void;
  /** The scheduled meeting to change; without one, a new meeting is scheduled */
  meetingCode?: string;
}

type Step = 'details' | 'agenda';

/** How many generated codes to try when one is already taken */
const CODE_ATTEMPTS = 3;

/** A random 6-character meeting code, without characters that look alike (0 and O, 1 and I) */
function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** What the open meeting takes from the packet's agenda: its items' ids and titles, in order */
const agendaKey = (packet: MeetingPacket) =>
  JSON.stringify(packet.agendaItems.map((item) => [item.id, item.title]));

/** A scheduled meeting being changed, as loaded */
type Existing = 'loading' | 'ready' | 'gone' | 'called to order' | { error: string };

export function MeetingScheduler({
  onBack,
  onJoinMeeting,
  meetingCode: existingCode,
}: MeetingSchedulerProps) {
  const { user } = useSession();
  const { currentOrganization, availableOrganizations } = useMeetingOrganization();
  const changing = existingCode !== undefined;
  const [existing, setExisting] = useState<Existing>(changing ? 'loading' : 'ready');
  const [step, setStep] = useState<Step>('details');
  const [meetingCode, setMeetingCode] = useState(() => existingCode ?? generateMeetingCode());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  // The presiding officer: undefined until the members load, then the scheduler when they may
  // preside; null for nobody (the admins run the meeting)
  const [chairUserId, setChairUserId] = useState<number | null | undefined>(undefined);
  const [presiders, setPresiders] = useState<OrgMember[] | null>(null);
  // Everyone in the organization, to name a presiding officer who can no longer preside
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [packet, setPacket] = useState<MeetingPacket | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Next was pressed without a title: the meeting needs one, and a saved one is kept
  const [titleMissing, setTitleMissing] = useState(false);
  // Changing a meeting: something was saved (the details or the agenda), the details just were,
  // and Cancel the meeting is asking
  const [changed, setChanged] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // The agenda as loaded (its items' ids and titles, in order), the part the open meeting
  // copies: Done brings the open meeting's agenda up to date only when it differs
  const loadedAgenda = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // The form's heading takes focus when it opens (and once a meeting being changed has loaded),
  // so a screen reader starts there
  const opened = existing === 'ready';
  useEffect(() => {
    headingRef.current?.focus();
  }, [opened]);

  // Changing a meeting: its packet fills in the details, and holds the agenda and files
  useEffect(() => {
    if (!existingCode) return;
    let canceled = false;
    getPacket(existingCode)
      .then((loaded) => {
        if (canceled) return;
        if (!loaded) {
          setExisting('gone');
          return;
        }
        setPacket(loaded);
        loadedAgenda.current = agendaKey(loaded);
        setMeetingCode(loaded.robbieCode);
        setTitle(loaded.title ?? '');
        setDescription(loaded.description ?? '');
        setLocation(loaded.location ?? '');
        setScheduledFor(loaded.scheduledFor ? toLocalDateTimeInput(loaded.scheduledFor) : '');
        setChairUserId(loaded.chairUserId ?? null);
        setExisting(loaded.startedAt ? 'called to order' : 'ready');
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setExisting({ error: err instanceof Error ? err.message : "Couldn't load the meeting" });
        }
      });
    return () => {
      canceled = true;
    };
  }, [existingCode]);

  // Cancel the meeting asks first, with Keep it focused; answering returns focus to the button
  useEffect(() => {
    if (confirmingCancel) keepRef.current?.focus();
  }, [confirmingCancel]);

  // Meetings are scheduled in the organization selected in the header, by its secretaries and
  // above. Once the packet exists it belongs to that organization, whatever the header shows.
  const headerOrganization =
    currentOrganization && atLeast(currentOrganization.role, 'secretary')
      ? currentOrganization
      : null;
  const organization = packet
    ? (availableOrganizations.find((org) => org.id === packet.organizationId) ?? null)
    : headerOrganization;
  const organizationId = organization?.id ?? null;

  // Who may preside: the organization's members with the member role or above (the server's rule)
  useEffect(() => {
    if (!organizationId) return;
    let canceled = false;
    membersApi
      .list(organizationId)
      .then(({ members }) => {
        if (canceled) return;
        const eligible = members.filter((m) => atLeast(m.role, 'member'));
        setOrgMembers(members);
        setPresiders(eligible);
        setChairUserId((current) => {
          if (current !== undefined) return current;
          return eligible.some((m) => m.userId === user?.id) ? (user?.id ?? null) : null;
        });
      })
      .catch(() => {
        // Without the list the server's default stands: the person scheduling presides
        if (!canceled) setPresiders([]);
      });
    return () => {
      canceled = true;
    };
  }, [organizationId, user?.id]);

  const details = () => ({
    title: title.trim() || undefined,
    description: description.trim() || undefined,
    location: location.trim() || undefined,
    scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
    ...(chairUserId === undefined ? {} : { chairUserId }),
  });

  /**
   * The details that differ from the saved packet's, for an update: only those are sent, so a
   * change made elsewhere meanwhile (the chair handed over in the open meeting, say) isn't
   * undone. A place, description or date emptied is cleared (null). The title is never emptied
   * (Next asks for one), so a missing one keeps the saved.
   */
  const changedDetails = (saved: MeetingPacket) => {
    const changes: Parameters<typeof updatePacket>[1] = {};
    const newTitle = title.trim();
    if (newTitle && newTitle !== (saved.title ?? '')) changes.title = newTitle;
    const newDescription = description.trim() || null;
    if (newDescription !== (saved.description || null)) changes.description = newDescription;
    const newLocation = location.trim() || null;
    if (newLocation !== (saved.location || null)) changes.location = newLocation;
    const savedDate = saved.scheduledFor ? toLocalDateTimeInput(saved.scheduledFor) : '';
    if (scheduledFor !== savedDate) {
      changes.scheduledFor = scheduledFor ? new Date(scheduledFor).toISOString() : null;
    }
    if (chairUserId !== undefined && chairUserId !== (saved.chairUserId ?? null)) {
      changes.chairUserId = chairUserId;
    }
    return changes;
  };

  /** Create the packet, with a fresh code if a generated one is already taken */
  const create = async (orgId: string): Promise<MeetingPacket> => {
    let code = meetingCode;
    for (let attempt = 1; ; attempt++) {
      try {
        return await createPacket(orgId, { robbieCode: code, ...details() });
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 409) || attempt >= CODE_ATTEMPTS) {
          throw err;
        }
        code = generateMeetingCode();
        setMeetingCode(code);
      }
    }
  };

  const handleProceedToAgenda = async () => {
    if (!organization) return;
    if (!title.trim()) {
      setTitleMissing(true);
      return;
    }
    setIsSaving(true);
    setError(null);
    setDetailsSaved(false);
    try {
      // The first time, creating the packet claims the code; after Edit the details (or when
      // changing a meeting), save them. The answer to a save leaves out the linked documents'
      // titles, so the agenda and files already loaded are kept.
      if (packet) {
        const changes = changedDetails(packet);
        if (Object.keys(changes).length > 0) {
          const saved = await updatePacket(packet.id, changes);
          setPacket((prev) =>
            prev
              ? { ...saved, attachments: prev.attachments, agendaItems: prev.agendaItems }
              : prev,
          );
          setChanged(true);
          setDetailsSaved(changing);
        }
      } else {
        setPacket(await create(organization.id));
      }
      setStep('agenda');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule the meeting');
    } finally {
      setIsSaving(false);
    }
  };

  // The presiding officer goes straight into the meeting; anyone else is done
  const presiding = chairUserId != null && chairUserId === user?.id;
  const presidingName =
    chairUserId == null
      ? null
      : ((presiders ?? orgMembers).find((m) => m.userId === chairUserId)?.name ??
        orgMembers.find((m) => m.userId === chairUserId)?.name ??
        null);
  // The saved presiding officer, when they can no longer preside (now a viewer, or gone): kept
  // until another is chosen, and named as such
  const formerChairId = packet?.chairUserId ?? null;
  const formerChair =
    formerChairId !== null &&
    presiders !== null &&
    !presiders.some((m) => m.userId === formerChairId)
      ? {
          userId: formerChairId,
          name: orgMembers.find((m) => m.userId === formerChairId)?.name ?? 'The presiding officer',
        }
      : null;

  const meetingName = title.trim() || 'The meeting';

  /**
   * Close after changing a meeting. A meeting already open (before the call to order) gets the
   * schedule's agenda; the server refuses once it has been called to order, and says so.
   */
  const finishChange = async () => {
    if (!changed) {
      onBack(undefined);
      return;
    }
    let status = `${meetingName} is changed.`;
    // Only an agenda that differs from the one loaded is sent to the open meeting
    if (packet && agendaKey(packet) !== loadedAgenda.current) {
      setIsSaving(true);
      try {
        const { live } = await meetingPackets.reloadAgenda(meetingCode);
        if (live) status += " The open meeting's agenda now matches.";
      } catch (err) {
        if (err instanceof Error) status += ` ${err.message}`;
      } finally {
        setIsSaving(false);
      }
    }
    onBack(status);
  };

  const handleCancelMeeting = async () => {
    if (!packet) return;
    setIsSaving(true);
    setError(null);
    try {
      await deletePacket(packet.id);
      onBack(`${meetingName} is canceled.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel the meeting");
      setConfirmingCancel(false);
      setIsSaving(false);
    }
  };

  const handleFinish = async () => {
    if (changing) {
      await finishChange();
      return;
    }
    // The details were saved at Next (created, or changed after Edit the details), and each
    // agenda change as it was made: nothing is left to save
    if (presiding) onJoinMeeting(meetingCode);
    else onBack();
  };

  if (changing && existing !== 'ready') {
    const message =
      existing === 'loading'
        ? 'Loading the meeting...'
        : existing === 'gone'
          ? 'This meeting is no longer on the schedule.'
          : existing === 'called to order'
            ? `${meetingName} has been called to order. Its agenda is changed in the meeting.`
            : existing.error;
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="card p-6 text-center">
          <h2 ref={headingRef} tabIndex={-1} className="card-title mb-2 focus:outline-none">
            Change the meeting
          </h2>
          <p
            role={typeof existing === 'object' ? 'alert' : undefined}
            className="text-ink-muted mb-4"
          >
            {message}
          </p>
          <button type="button" onClick={() => onBack(undefined)} className="btn-secondary">
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="card p-6 text-center">
          <p className="text-ink-muted mb-4">
            Meetings are scheduled in an organization, by its secretaries and admins. Choose an
            organization where you have one of those roles.
          </p>
          <button type="button" onClick={() => onBack()} className="btn-secondary">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-rule px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => (changing ? void finishChange() : onBack())}
            aria-label="Back"
            className="btn-ghost btn-sm"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 ref={headingRef} tabIndex={-1} className="card-title focus:outline-none">
              {changing ? 'Change the meeting' : 'Schedule a meeting'}
            </h2>
            <p className="text-sm text-ink-muted">
              {organization.name}:{' '}
              {step === 'details' ? 'step 1 of 2, the details' : 'step 2 of 2, the agenda'}
            </p>
          </div>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          {error && (
            <div role="alert" className="rounded-lg bg-gavel-tint px-4 py-3 text-sm text-ink">
              {error}
            </div>
          )}

          {step === 'details' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleProceedToAgenda();
              }}
              className="space-y-4"
            >
              <p className="text-sm text-ink-muted">
                Meeting code <span className="meeting-code text-ink">{meetingCode}</span>
              </p>

              <div>
                <label htmlFor="meetingTitle" className="label">
                  Meeting title
                </label>
                <input
                  id="meetingTitle"
                  type="text"
                  className="input"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleMissing(false);
                  }}
                  placeholder="2026 Annual Meeting"
                  maxLength={500}
                  aria-invalid={titleMissing || undefined}
                  aria-describedby={titleMissing ? 'meetingTitleMissing' : undefined}
                />
                {titleMissing && (
                  <p id="meetingTitleMissing" role="alert" className="mt-1 text-sm text-gavel">
                    Give the meeting a title.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="meetingDate" className="label">
                  <Calendar className="mr-1 inline h-4 w-4" aria-hidden="true" />
                  Date and time
                </label>
                <input
                  id="meetingDate"
                  type="datetime-local"
                  className="input"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="meetingLocation" className="label">
                  <MapPin className="mr-1 inline h-4 w-4" aria-hidden="true" />
                  Place
                </label>
                <input
                  id="meetingLocation"
                  type="text"
                  className="input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Maple Grove Clubhouse"
                  maxLength={500}
                />
              </div>

              <div>
                <label htmlFor="meetingDescription" className="label">
                  Description
                </label>
                <textarea
                  id="meetingDescription"
                  className="textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Anything members should know"
                />
              </div>

              <div>
                <label htmlFor="presidingOfficer" className="label">
                  Presiding officer
                </label>
                <select
                  id="presidingOfficer"
                  className="select"
                  disabled={presiders === null}
                  value={chairUserId == null ? '' : String(chairUserId)}
                  onChange={(e) => setChairUserId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">
                    {presiders === null ? 'Loading the members...' : 'Nobody: the admins run it'}
                  </option>
                  {formerChair && (
                    <option value={String(formerChair.userId)}>
                      {`${formerChair.name} (can no longer preside)`}
                    </option>
                  )}
                  {(presiders ?? []).map((member) => (
                    <option key={member.userId} value={String(member.userId)}>
                      {member.name ?? member.email}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-ink-muted">
                  Chairs the live meeting. Members and above can preside.
                </p>
              </div>

              <button type="submit" disabled={isSaving} className="btn-primary w-full">
                {isSaving ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    {changing ? 'Next: the agenda' : 'Next: build the agenda'}
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </>
                )}
              </button>

              {changing && packet && (
                <div className="border-t border-rule pt-4">
                  {confirmingCancel ? (
                    <div role="group" aria-labelledby="cancelMeetingQuestion" className="space-y-3">
                      <p id="cancelMeetingQuestion" className="text-sm text-ink">
                        {`Cancel ${meetingName}? Its agenda and attached files are deleted.`}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handleCancelMeeting()}
                          disabled={isSaving}
                          className="btn-danger btn-sm"
                        >
                          Yes, cancel it
                        </button>
                        <button
                          ref={keepRef}
                          type="button"
                          onClick={() => {
                            setConfirmingCancel(false);
                            // Back to the button that asked
                            requestAnimationFrame(() => cancelRef.current?.focus());
                          }}
                          className="btn-secondary btn-sm"
                        >
                          Keep it
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      ref={cancelRef}
                      type="button"
                      onClick={() => setConfirmingCancel(true)}
                      className="btn-ghost btn-sm text-gavel"
                    >
                      Cancel the meeting
                    </button>
                  )}
                </div>
              )}
            </form>
          ) : (
            packet && (
              <>
                {detailsSaved && (
                  <p role="status" className="text-sm text-ink-muted">
                    The details are saved.
                  </p>
                )}
                {!changing && <JoinInfoCard code={meetingCode} />}

                <div className="rounded-lg bg-surface-2 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-medium text-ink">{title || 'Untitled meeting'}</h3>
                    <button
                      type="button"
                      onClick={() => setStep('details')}
                      className="btn-ghost btn-sm shrink-0"
                    >
                      Edit the details
                    </button>
                  </div>
                  {scheduledFor && (
                    <p className="flex items-center gap-1 text-sm text-ink-muted">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {formatMeetingTime(new Date(scheduledFor).toISOString())}
                    </p>
                  )}
                  {location.trim() && (
                    <p className="flex items-center gap-1 text-sm text-ink-muted">
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                      {location.trim()}
                    </p>
                  )}
                  <p className="text-sm text-ink-muted">
                    {presidingName ? `${presidingName} presides` : 'No presiding officer'}
                  </p>
                </div>

                <PacketBuilder
                  packet={packet}
                  onPacketUpdate={(update) => {
                    setPacket((prev) => (prev ? update(prev) : prev));
                    setChanged(true);
                  }}
                />

                <div className="flex gap-3 border-t border-rule pt-6">
                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className="btn-secondary flex-1"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFinish()}
                    disabled={isSaving}
                    className="btn-primary flex-1"
                  >
                    {isSaving ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : presiding && !changing ? (
                      <>
                        <Check className="h-5 w-5" aria-hidden="true" />
                        Start meeting
                      </>
                    ) : (
                      'Done'
                    )}
                  </button>
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
