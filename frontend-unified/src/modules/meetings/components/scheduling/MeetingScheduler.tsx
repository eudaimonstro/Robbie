/**
 * Meeting Scheduler Component
 *
 * Main component for scheduling a meeting with agenda and attachments
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, ArrowLeft, ArrowRight, Loader2, Check, Copy } from 'lucide-react';
import type { MeetingPacket } from './types';
import { PacketBuilder } from './PacketBuilder';
import { getOrCreatePacket, updatePacket } from './api';

interface MeetingSchedulerProps {
  meetingCode?: string;
  onBack: () => void;
  onJoinMeeting: (code: string) => void;
}

type Step = 'details' | 'agenda';

export function MeetingScheduler({
  meetingCode: initialCode,
  onBack,
  onJoinMeeting,
}: MeetingSchedulerProps) {
  const [step, setStep] = useState<Step>('details');
  const [meetingCode, setMeetingCode] = useState(initialCode || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [packet, setPacket] = useState<MeetingPacket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function generateMeetingCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Generate a meeting code if not provided
  useEffect(() => {
    if (!meetingCode) {
      const code = generateMeetingCode();
      setMeetingCode(code);
    }
  }, []);

  async function loadPacket() {
    setIsLoading(true);
    setError(null);
    try {
      const loadedPacket = await getOrCreatePacket(meetingCode);
      setPacket(loadedPacket);
      // Sync local state with packet
      if (loadedPacket.title) setTitle(loadedPacket.title);
      if (loadedPacket.description) setDescription(loadedPacket.description);
      if (loadedPacket.scheduledFor) {
        setScheduledFor(loadedPacket.scheduledFor.slice(0, 16)); // Format for datetime-local
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meeting packet');
    } finally {
      setIsLoading(false);
    }
  }

  // Load or create packet when moving to agenda step
  useEffect(() => {
    if (step === 'agenda' && meetingCode && !packet) {
      loadPacket();
    }
  }, [step, meetingCode]);

  const handleSaveDetails = async () => {
    if (!packet) return;

    setIsSaving(true);
    try {
      const updated = await updatePacket(packet.id, {
        title: title || undefined,
        description: description || undefined,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      });
      setPacket(updated);
    } catch (err) {
      console.error('Failed to save details:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(meetingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProceedToAgenda = async () => {
    setStep('agenda');
    // Packet will be loaded by useEffect
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="card w-full max-w-2xl mx-auto overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-meeting-700 to-meeting-800 text-white p-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="bg-white/20 p-2 rounded-lg hover:bg-white/30 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Schedule Meeting</h1>
              <p className="text-meeting-200 text-sm">
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
            <div className="mb-4 bg-danger-50 dark:bg-danger-900/20 border border-danger-200 dark:border-danger-800 text-danger-700 dark:text-danger-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {step === 'details' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleProceedToAgenda();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Board Meeting - January 2025"
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional meeting description..."
                  rows={3}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
                  <Calendar size={16} className="inline mr-1" />
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full p-3 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 bg-meeting-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-meeting-700 transition-colors"
                >
                  Next: Build Agenda
                  <ArrowRight size={20} />
                </button>
              </div>
            </form>
          ) : (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={32} className="animate-spin text-meeting-600" />
                </div>
              ) : packet ? (
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
                      onClick={() => {
                        handleSaveDetails();
                        onJoinMeeting(meetingCode);
                      }}
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
              ) : (
                <div className="text-center py-8 text-secondary-500 dark:text-secondary-400">
                  Unable to load meeting packet.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
