/**
 * Types for Meeting Packet and Scheduling
 */

export interface Attachment {
  id: string;
  type: 'uploaded_file' | 'bylawyer_document';
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
  documentId?: string;
  versionId?: string;
  displayName: string;
  description?: string;
  position: number;
  uploadedAt: string;
  document?: {
    id: string;
    title: string;
    docType: string;
  };
}

export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  presenter?: string;
  position: number;
  attachments: Attachment[];
}

export interface MeetingPacket {
  id: string;
  robbieCode: string;
  title?: string;
  description?: string;
  scheduledFor?: string;
  createdAt: string;
  attachments: Attachment[];
  agendaItems: AgendaItem[];
}

export interface BylawyerDocument {
  id: string;
  title: string;
  docType: string;
  organizationId: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}
