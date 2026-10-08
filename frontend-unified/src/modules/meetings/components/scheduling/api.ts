/**
 * API functions for Meeting Packet and Scheduling
 */

import type {
  MeetingPacket,
  AgendaItem,
  AgendaItemChanges,
  Attachment,
  BylawyerDocument,
} from './types';
import { apiFetch, HttpError } from '../../../../api/client';

/** The server's { error } message from a failed response, or the fallback */
async function serverMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : fallback;
}

/** A failed response as an HttpError with the server's message (a refusal says why) */
async function failure(response: Response, fallback: string): Promise<HttpError> {
  return new HttpError(await serverMessage(response, fallback), response.status);
}

/**
 * The meeting packet for a meeting code, or null when the meeting has none (a packet is made
 * when a meeting is scheduled or linked, never by reading)
 */
export async function getPacket(robbieCode: string): Promise<MeetingPacket | null> {
  const response = await apiFetch(`/packets/${robbieCode}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error('Failed to get meeting packet');
  }
  return response.json();
}

/**
 * Create the packet for a new meeting code in an organization (secretary and above). A code
 * that already has a packet, in any organization, is an HttpError with status 409.
 */
export async function createPacket(
  organizationId: string,
  data: {
    robbieCode: string;
    title?: string;
    description?: string;
    location?: string;
    scheduledFor?: string;
    /** The presiding officer; the server defaults it to the creator, and null is nobody */
    chairUserId?: number | null;
  },
): Promise<MeetingPacket> {
  const response = await apiFetch(`/organizations/${organizationId}/packets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new HttpError(
      await serverMessage(response, 'Failed to schedule the meeting'),
      response.status,
    );
  }
  return response.json();
}

/**
 * Update packet metadata (secretary and above). A refusal is an HttpError with the server's
 * message.
 */
export async function updatePacket(
  packetId: string,
  data: {
    title?: string;
    /** null clears it */
    description?: string | null;
    /** null clears it */
    location?: string | null;
    /** null clears it */
    scheduledFor?: string | null;
    chairUserId?: number | null;
  },
): Promise<MeetingPacket> {
  const response = await apiFetch(`/packets/${packetId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw await failure(response, "Couldn't save the meeting");
  }
  return response.json();
}

/**
 * Cancel a scheduled meeting: delete its packet, agenda and files (secretary and above). The
 * server refuses (409) a meeting already called to order.
 */
export async function deletePacket(packetId: string): Promise<void> {
  const response = await apiFetch(`/packets/${packetId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw await failure(response, "Couldn't cancel the meeting");
  }
}

/**
 * Create a new agenda item
 */
export async function createAgendaItem(
  packetId: string,
  data: { title: string; description?: string; estimatedMinutes?: number; presenter?: string },
): Promise<AgendaItem> {
  const response = await apiFetch(`/packets/${packetId}/agenda`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw await failure(response, 'Failed to create agenda item');
  }
  return response.json();
}

/**
 * Update an agenda item; null clears its description, presenter or time
 */
export async function updateAgendaItem(
  itemId: string,
  data: AgendaItemChanges,
): Promise<AgendaItem> {
  const response = await apiFetch(`/agenda-items/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw await failure(response, 'Failed to update agenda item');
  }
  return response.json();
}

/**
 * Delete an agenda item
 */
export async function deleteAgendaItem(itemId: string): Promise<void> {
  const response = await apiFetch(`/agenda-items/${itemId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw await failure(response, 'Failed to delete agenda item');
  }
}

/**
 * Reorder agenda items
 */
export async function reorderAgendaItems(itemIds: string[]): Promise<void> {
  const response = await apiFetch('/agenda-items/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemIds }),
  });
  if (!response.ok) {
    throw await failure(response, 'Failed to reorder agenda items');
  }
}

/**
 * Upload a file attachment
 */
export async function uploadAttachment(
  robbieCode: string,
  file: File,
  target: { packetId?: string; agendaItemId?: string },
  metadata?: { displayName?: string; description?: string },
): Promise<Attachment> {
  const params = new URLSearchParams();
  if (target.packetId) params.set('packetId', target.packetId);
  if (target.agendaItemId) params.set('agendaItemId', target.agendaItemId);
  if (metadata?.displayName) params.set('displayName', metadata.displayName);
  if (metadata?.description) params.set('description', metadata.description);

  const response = await apiFetch(`/attachments/upload?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': file.name,
      'X-Robbie-Code': robbieCode,
    },
    body: file,
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload file');
  }
  return response.json();
}

/**
 * Link a Bylawyer document as an attachment
 */
export async function linkDocument(
  documentId: string,
  target: { packetId?: string; agendaItemId?: string },
  metadata?: { displayName?: string; description?: string; versionId?: string },
): Promise<Attachment> {
  const response = await apiFetch('/attachments/link-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId,
      ...target,
      ...metadata,
    }),
  });
  if (!response.ok) {
    throw await failure(response, 'Failed to link document');
  }
  return response.json();
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(attachmentId: string): Promise<void> {
  const response = await apiFetch(`/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw await failure(response, 'Failed to delete attachment');
  }
}

/**
 * Get download URL for an attachment
 */
export function getAttachmentDownloadUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}/download`;
}

/**
 * List documents for an organization
 */
export async function listDocuments(organizationId: string): Promise<BylawyerDocument[]> {
  const response = await apiFetch(`/organizations/${organizationId}/documents`);
  if (!response.ok) {
    throw new Error('Failed to list documents');
  }
  return response.json();
}
