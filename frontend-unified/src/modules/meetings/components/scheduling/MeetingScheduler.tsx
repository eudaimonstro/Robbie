/**
 * Meeting Scheduler Component
 *
 * Schedules a meeting in the current organization. Its details create the meeting's packet, which
 * claims the meeting code for the organization and names the presiding officer; the agenda and
 * attachments are then added to the packet, and the join card shows how people get in.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Calendar, Check, Clock, Loader2, MapPin } from 'lucide-react';
import type { MeetingPacket } from './types';
import { PacketBuilder } from './PacketBuilder';
import { createPacket, updatePacket } from './api';
import { HttpError, members as membersApi, type OrgMember } from '../../../../api/client';
import { useSession } from '../../../../context/SessionContext';
import { useMeetingOrganization } from '../../context/OrganizationBridge';
import { atLeast } from '../../../../utils/roles';
import { JoinInfoCard } from '../console/JoinInfoCard';

interface MeetingSchedulerProps {
  onBack: () => void;
  onJoinMeeting: (code: string) => void;
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

export function MeetingScheduler({ onBack, onJoinMeeting }: MeetingSchedulerProps) {
  const { user } = useSession();
  const { currentOrganization, availableOrganizations } = useMeetingOrganization();
  const [step, setStep] = useState<Step>('details');
  const [meetingCode, setMeetingCode] = useState(generateMeetingCode);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  // The presiding officer: undefined until the members load, then the scheduler when they may
  // preside; null for nobody (the admins run the meeting)
  const [chairUserId, setChairUserId] = useState<number | null | undefined>(undefined);
  const [presiders, setPresiders] = useState<OrgMember[] | null>(null);
  const [packet, setPacket] = useState<MeetingPacket | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    title: title || undefined,
    description: description || undefined,
    location: location.trim() || undefined,
    scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
    ...(chairUserId === undefined ? {} : { chairUserId }),
  });

  /** The details for an update: a place or description emptied after Edit the details clears it */
  const changedDetails = () => ({
    ...details(),
    description: description || null,
    location: location.trim() || null,
  });

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
    setIsSaving(true);
    setError(null);
    try {
      // The first time, creating the packet claims the code; after Edit the details, save them
      setPacket(
        packet ? await updatePacket(packet.id, changedDetails()) : await create(organization.id),
      );
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
    chairUserId == null ? null : (presiders?.find((m) => m.userId === chairUserId)?.name ?? null);

  const handleFinish = async () => {
    if (packet) {
      setIsSaving(true);
      try {
        await updatePacket(packet.id, changedDetails());
      } catch (err) {
        console.error('Failed to save details:', err);
      } finally {
        setIsSaving(false);
      }
    }
    if (presiding) onJoinMeeting(meetingCode);
    else onBack();
  };

  if (!organization) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="card p-6 text-center">
          <p className="text-ink-muted mb-4">
            Meetings are scheduled in an organization, by its secretaries and admins. Choose an
            organization where you have one of those roles.
          </p>
          <button onClick={onBack} className="btn-secondary">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-rule px-6 py-4">
          <button type="button" onClick={onBack} aria-label="Back" className="btn-ghost btn-sm">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="card-title">Schedule a meeting</h2>
            <p className="text-sm text-ink-muted">
              {organization.name}:{' '}
              {step === 'details' ? 'step 1 of 2, the details' : 'step 2 of 2, the agenda'}
            </p>
          </div>
        </div>

        <div className="space-y-6 p-6">
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
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="2026 Annual Meeting"
                />
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
                    Next: build the agenda
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          ) : (
            packet && (
              <>
                <JoinInfoCard code={meetingCode} />

                <div className="rounded-lg bg-surface-2 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-medium text-ink">{title || 'Untitled meeting'}</h3>
                    <button
                      type="button"
                      onClick={() => setStep('details')}
                      className="btn-ghost btn-sm"
                    >
                      Edit the details
                    </button>
                  </div>
                  {scheduledFor && (
                    <p className="flex items-center gap-1 text-sm text-ink-muted">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {new Date(scheduledFor).toLocaleString()}
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

                <PacketBuilder packet={packet} onPacketUpdate={setPacket} />

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
                    ) : presiding ? (
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
