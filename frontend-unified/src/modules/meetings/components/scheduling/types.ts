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
  /** The organization the meeting belongs to */
  organizationId: string;
  robbieCode: string;
  title?: string;
  description?: string;
  /** Where the meeting is held */
  location?: string | null;
  scheduledFor?: string;
  /** The presiding officer, who chairs the live meeting; null when the admins run it */
  chairUserId?: number | null;
  /** When the meeting was called to order and adjourned */
  startedAt?: string | null;
  endedAt?: string | null;
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
