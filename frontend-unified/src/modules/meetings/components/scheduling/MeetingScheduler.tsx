/**
 * Meeting Scheduler Component
 *
 * Schedules a meeting in the current organization. Its details create the meeting's packet,
 * which claims the meeting code for the organization; the agenda and attachments are then added
 * to the packet.
 */

import { useState } from 'react';
import { Calendar, Clock, ArrowLeft, ArrowRight, Loader2, Check, Copy } from 'lucide-react';
import type { MeetingPacket } from './types';
import { PacketBuilder } from './PacketBuilder';
import { createPacket, updatePacket } from './api';
import { HttpError } from '../../../../api/client';
import { useMeetingOrganization } from '../../context/OrganizationBridge';
import { atLeast } from '../../../../utils/roles';

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
  const { currentOrganization } = useMeetingOrganization();
  const [step, setStep] = useState<Step>('details');
  const [meetingCode, setMeetingCode] = useState(generateMeetingCode);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [packet, setPacket] = useState<MeetingPacket | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Meetings are scheduled in the organization selected in the header, by its secretaries and
  // above
  const organization =
    currentOrganization && atLeast(currentOrganization.role, 'secretary')
      ? currentOrganization
      : null;

  const details = () => ({
    title: title || undefined,
    description: description || undefined,
    scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
  });

  /** Create the packet, with a fresh code if a generated one is already taken */
  const create = async (organizationId: string): Promise<MeetingPacket> => {
    let code = meetingCode;
    for (let attempt = 1; ; attempt++) {
      try {
        return await createPacket(organizationId, { robbieCode: code, ...details() });
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
      // The first time, creating the packet claims the code; after Edit Details, save them
      setPacket(packet ? await updatePacket(packet.id, details()) : await create(organization.id));
      setStep('agenda');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule the meeting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndJoin = async () => {
    if (packet) {
      setIsSaving(true);
      try {
        await updatePacket(packet.id, details());
      } catch (err) {
        console.error('Failed to save details:', err);
      } finally {
        setIsSaving(false);
      }
    }
    onJoinMeeting(meetingCode);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(meetingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!organization) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="card p-6 text-center">
          <p className="text-secondary-600 dark:text-secondary-400 mb-4">
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
    <div className="max-w-7xl mx-auto">
      <div className="card w-full max-w-2xl mx-auto overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-r from-meeting-700 to-meeting-800 text-white p-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              aria-label="Back"
              className="bg-white/20 p-2 rounded-lg hover:bg-white/30 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Schedule Meeting</h1>
              <p className="text-meeting-200 text-sm">
                {organization.name}:{' '}
                {step === 'details' ? 'Step 1: Meeting Details' : 'Step 2: Build Agenda'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Meeting code display */}
          <div className="mb-6 bg-meeting-50 dark:bg-meeting-900/20 border border-meeting-200 dark:border-meeting-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-meeting-600 dark:text-meeting-400 font-medium">
                  Meeting Code
                </p>
                <p className="text-2xl font-mono font-bold text-meeting-800 dark:text-meeting-300">
                  {meetingCode}
                </p>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-2 px-3 py-2 bg-meeting-600 text-white rounded-lg hover:bg-meeting-700 text-sm transition-colors"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-meeting-600 dark:text-meeting-400 mt-2">
              Share this code with participants to join your meeting
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-400 px-4 py-3 rounded-lg"
            >
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
              <div>
                <label
                  htmlFor="meetingTitle"
                  className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
                >
                  Meeting Title
                </label>
                <input
                  id="meetingTitle"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Board Meeting - January 2025"
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="meetingDescription"
                  className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
                >
                  Description
                </label>
                <textarea
                  id="meetingDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional meeting description..."
                  rows={3}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white resize-none"
                />
              </div>

              <div>
                <label
                  htmlFor="meetingDate"
                  className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1"
                >
                  <Calendar size={16} className="inline mr-1" />
                  Date & Time
                </label>
                <input
                  id="meetingDate"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 bg-meeting-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-meeting-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      Next: Build Agenda
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            packet && (
              <>
                {/* Editable details summary */}
                <div className="mb-6 p-4 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-secondary-800 dark:text-white">
                      {title || 'Untitled Meeting'}
                    </h3>
                    <button
                      onClick={() => setStep('details')}
                      className="text-sm text-meeting-600 dark:text-meeting-400 hover:underline"
                    >
                      Edit Details
                    </button>
                  </div>
                  {scheduledFor && (
                    <p className="text-sm text-secondary-600 dark:text-secondary-400 flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(scheduledFor).toLocaleString()}
                    </p>
                  )}
                </div>

                <PacketBuilder packet={packet} onPacketUpdate={setPacket} />

                <div className="flex gap-3 pt-6 mt-6 border-t border-secondary-200 dark:border-secondary-700">
                  <button
                    onClick={() => setStep('details')}
                    className="flex-1 py-3 px-4 border border-secondary-300 dark:border-secondary-600 text-secondary-700 dark:text-secondary-300 rounded-lg font-medium hover:bg-secondary-50 dark:hover:bg-secondary-800 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void handleSaveAndJoin()}
                    className="flex-1 flex items-center justify-center gap-2 bg-success-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-success-700 transition-colors"
                  >
                    {isSaving ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Check size={20} />
                        Save & Join Meeting
                      </>
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
