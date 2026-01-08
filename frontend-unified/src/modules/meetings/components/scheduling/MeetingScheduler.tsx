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

export function MeetingScheduler({ meetingCode: initialCode, onBack, onJoinMeeting }: MeetingSchedulerProps) {
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

  // Generate a meeting code if not provided
  useEffect(() => {
    if (!meetingCode) {
      const code = generateMeetingCode();
      setMeetingCode(code);
    }
  }, []);

  // Load or create packet when moving to agenda step
  useEffect(() => {
    if (step === 'agenda' && meetingCode && !packet) {
      loadPacket();
    }
  }, [step, meetingCode]);

  const generateMeetingCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const loadPacket = async () => {
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
  };

  const handleSaveDetails = async () => {
    if (!packet) return;

    setIsSaving(true);
    try {
      const updated = await updatePacket(packet.id, {
        title: title || undefined,
        description: description || undefined,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 to-indigo-800 text-white p-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="bg-white/20 p-2 rounded-lg hover:bg-white/30"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Schedule Meeting</h1>
              <p className="text-indigo-200 text-sm">
                {step === 'details' ? 'Step 1: Meeting Details' : 'Step 2: Build Agenda'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Meeting code display */}
          <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-indigo-600 font-medium">Meeting Code</p>
                <p className="text-2xl font-mono font-bold text-indigo-800">{meetingCode}</p>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-indigo-600 mt-2">
              Share this code with participants to join your meeting
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Board Meeting - January 2025"
                  className="w-full p-3 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional meeting description..."
                  rows={3}
                  className="w-full p-3 border rounded-lg resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar size={16} className="inline mr-1" />
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full p-3 border rounded-lg"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700"
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
                  <Loader2 size={32} className="animate-spin text-indigo-600" />
                </div>
              ) : packet ? (
                <>
                  {/* Editable details summary */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-800">
                        {title || 'Untitled Meeting'}
                      </h3>
                      <button
                        onClick={() => setStep('details')}
                        className="text-sm text-indigo-600 hover:underline"
                      >
                        Edit Details
                      </button>
                    </div>
                    {scheduledFor && (
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Clock size={14} />
                        {new Date(scheduledFor).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <PacketBuilder
                    packet={packet}
                    onPacketUpdate={setPacket}
                  />

                  <div className="flex gap-3 pt-6 mt-6 border-t">
                    <button
                      onClick={() => setStep('details')}
                      className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        handleSaveDetails();
                        onJoinMeeting(meetingCode);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700"
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
                <div className="text-center py-8 text-gray-500">
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
