/**
 * API functions for Meeting Packet and Scheduling
 */

import type { MeetingPacket, AgendaItem, Attachment, Organization, BylawyerDocument } from './types';

const API_BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

/**
 * Get or create a meeting packet for a meeting code
 */
export async function getOrCreatePacket(robbieCode: string): Promise<MeetingPacket> {
  const response = await fetch(`${API_BASE}/api/packets/${robbieCode}`);
  if (!response.ok) {
    throw new Error('Failed to get meeting packet');
  }
  return response.json();
}

/**
 * Update packet metadata
 */
export async function updatePacket(
  packetId: string,
  data: { title?: string; description?: string; scheduledFor?: string }
): Promise<MeetingPacket> {
  const response = await fetch(`${API_BASE}/api/packets/${packetId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('Failed to update packet');
  }
  return response.json();
}

/**
 * Create a new agenda item
 */
export async function createAgendaItem(
  packetId: string,
  data: { title: string; description?: string; estimatedMinutes?: number; presenter?: string }
): Promise<AgendaItem> {
  const response = await fetch(`${API_BASE}/api/packets/${packetId}/agenda`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('Failed to create agenda item');
  }
  return response.json();
}

/**
 * Update an agenda item
 */
export async function updateAgendaItem(
  itemId: string,
  data: { title?: string; description?: string; estimatedMinutes?: number; presenter?: string }
): Promise<AgendaItem> {
  const response = await fetch(`${API_BASE}/api/agenda-items/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error('Failed to update agenda item');
  }
  return response.json();
}

/**
 * Delete an agenda item
 */
export async function deleteAgendaItem(itemId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agenda-items/${itemId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to delete agenda item');
  }
}

/**
 * Reorder agenda items
 */
export async function reorderAgendaItems(itemIds: string[]): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agenda-items/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemIds })
  });
  if (!response.ok) {
    throw new Error('Failed to reorder agenda items');
  }
}

/**
 * Upload a file attachment
 */
export async function uploadAttachment(
  robbieCode: string,
  file: File,
  target: { packetId?: string; agendaItemId?: string },
  metadata?: { displayName?: string; description?: string }
): Promise<Attachment> {
  const params = new URLSearchParams();
  if (target.packetId) params.set('packetId', target.packetId);
  if (target.agendaItemId) params.set('agendaItemId', target.agendaItemId);
  if (metadata?.displayName) params.set('displayName', metadata.displayName);
  if (metadata?.description) params.set('description', metadata.description);

  const response = await fetch(`${API_BASE}/api/attachments/upload?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': file.name,
      'X-Robbie-Code': robbieCode
    },
    body: file
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
  metadata?: { displayName?: string; description?: string; versionId?: string }
): Promise<Attachment> {
  const response = await fetch(`${API_BASE}/api/attachments/link-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId,
      ...target,
      ...metadata
    })
  });
  if (!response.ok) {
    throw new Error('Failed to link document');
  }
  return response.json();
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(attachmentId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/attachments/${attachmentId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to delete attachment');
  }
}

/**
 * Get download URL for an attachment
 */
export function getAttachmentDownloadUrl(attachmentId: string): string {
  return `${API_BASE}/api/attachments/${attachmentId}/download`;
}

/**
 * List organizations (for linking documents)
 */
export async function listOrganizations(): Promise<Organization[]> {
  const response = await fetch(`${API_BASE}/api/organizations`);
  if (!response.ok) {
    throw new Error('Failed to list organizations');
  }
  return response.json();
}

/**
 * List documents for an organization
 */
export async function listDocuments(organizationId: string): Promise<BylawyerDocument[]> {
  const response = await fetch(`${API_BASE}/api/organizations/${organizationId}/documents`);
  if (!response.ok) {
    throw new Error('Failed to list documents');
  }
  return response.json();
}
