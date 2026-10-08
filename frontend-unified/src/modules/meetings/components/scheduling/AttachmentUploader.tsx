/**
 * Attachment Uploader Component
 *
 * Handles file uploads and Bylawyer document linking
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, File, X, Link, Loader2, FileText, Download, Trash2 } from 'lucide-react';
import type { Attachment, BylawyerDocument } from './types';
import {
  uploadAttachment,
  linkDocument,
  deleteAttachment,
  getAttachmentDownloadUrl,
  listDocuments,
} from './api';

interface AttachmentUploaderProps {
  robbieCode: string;
  /** The packet's organization: only its documents can be linked */
  organizationId: string;
  attachments: Attachment[];
  target: { packetId?: string; agendaItemId?: string };
  /** What the files are attached to, for the controls' names ("the meeting", an item's title) */
  targetName: string;
  onAttachmentAdded: (attachment: Attachment) => void;
  onAttachmentRemoved: (attachmentId: string) => void;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/rtf',
  'application/rtf',
];

const TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT',
  'text/rtf': 'RTF',
  'application/rtf': 'RTF',
};

export function AttachmentUploader({
  robbieCode,
  organizationId,
  attachments,
  target,
  targetName,
  onAttachmentAdded,
  onAttachmentRemoved,
}: AttachmentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  async function uploadFiles(files: File[]) {
    setError(null);

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`File type not allowed: ${file.name}. Allowed: PDF, DOC, DOCX, TXT, RTF`);
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError(`File too large: ${file.name}. Maximum: 10MB`);
        continue;
      }

      setIsUploading(true);
      try {
        const attachment = await uploadAttachment(robbieCode, file, target);
        onAttachmentAdded(attachment);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    }
  }

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files);
    },
    [robbieCode, target],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      await uploadFiles(files);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [robbieCode, target],
  );

  const handleDelete = async (attachmentId: string) => {
    try {
      await deleteAttachment(attachmentId);
      onAttachmentRemoved(attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          isDragging ? 'border-gavel bg-gavel-tint' : 'border-rule hover:border-ink-muted'
        }`}
      >
        {isUploading ? (
          <div className="flex items-center justify-center gap-2 text-ink-muted">
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            <span role="status">Uploading...</span>
          </div>
        ) : (
          <>
            <Upload size={24} className="mx-auto text-ink-muted mb-2" aria-hidden="true" />
            <p className="text-sm text-ink-muted">
              Drag files here or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-gavel hover:underline"
              >
                choose files
              </button>
            </p>
            <p className="text-xs text-ink-muted mt-1">PDF, DOC, DOCX, TXT, RTF (max 10MB)</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          multiple
          aria-label={`Attach files to ${targetName}`}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Link document button */}
      <button
        type="button"
        onClick={() => setShowDocPicker(true)}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-rule rounded-lg text-sm text-ink hover:bg-surface-2"
      >
        <Link size={16} aria-hidden="true" />
        Link a document
      </button>

      {/* Error message */}
      {error && (
        <div className="bg-gavel-tint border border-gavel/30 text-ink px-3 py-2 rounded-sm text-sm flex items-center justify-between">
          <span role="alert">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              attachment={attachment}
              onDelete={() => handleDelete(attachment.id)}
            />
          ))}
        </div>
      )}

      {/* Document picker modal */}
      {showDocPicker && (
        <DocumentPicker
          organizationId={organizationId}
          onSelect={async (doc) => {
            try {
              const attachment = await linkDocument(doc.id, target);
              onAttachmentAdded(attachment);
              setShowDocPicker(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to link document');
            }
          }}
          onClose={() => setShowDocPicker(false)}
        />
      )}
    </div>
  );
}

function AttachmentItem({
  attachment,
  onDelete,
}: {
  attachment: Attachment;
  onDelete: () => void;
}) {
  const isFile = attachment.type === 'uploaded_file';

  return (
    <div className="flex items-center gap-3 p-2 bg-surface-2 rounded-lg">
      <div className="bg-surface p-2 rounded-sm">
        {isFile ? (
          <File size={20} className="text-ink-muted" aria-hidden="true" />
        ) : (
          <FileText size={20} className="text-gavel" aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{attachment.displayName}</p>
        <p className="text-xs text-ink-muted">
          {isFile ? (
            <>
              {TYPE_LABELS[attachment.mimeType || ''] || 'File'}
              {attachment.sizeBytes && ` - ${formatSize(attachment.sizeBytes)}`}
            </>
          ) : (
            'Linked document'
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {isFile && (
          <a
            href={getAttachmentDownloadUrl(attachment.id)}
            className="p-1 text-ink-muted hover:text-ink"
            aria-label={`Download ${attachment.displayName}`}
          >
            <Download size={16} aria-hidden="true" />
          </a>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-ink-muted hover:text-gavel"
          aria-label={`Remove ${attachment.displayName}`}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Picks a document of the packet's organization (the server accepts no other) */
function DocumentPicker({
  organizationId,
  onSelect,
  onClose,
}: {
  organizationId: string;
  onSelect: (doc: BylawyerDocument) => void;
  onClose: () => void;
}) {
  const [documents, setDocuments] = useState<BylawyerDocument[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    let cancelled = false;
    listDocuments(organizationId)
      .then((docs) => {
        if (!cancelled) setDocuments(docs);
      })
      .catch((err) => console.error('Failed to load documents:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return (
    <div className="fixed inset-0 bg-ink-900/50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-document-heading"
        className="bg-surface rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-rule">
          <h3 id="link-document-heading" className="font-semibold text-ink">
            Link a document
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-ink-muted" />
            </div>
          ) : (
            <div className="space-y-2">
              {documents.length === 0 ? (
                <p className="text-center text-ink-muted py-4">
                  No documents in this organization.
                </p>
              ) : (
                documents.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onSelect(doc)}
                    className="w-full text-left p-3 bg-surface-2 rounded-lg hover:bg-gavel-tint hover:border-rule border border-transparent transition-colors"
                  >
                    <p className="font-medium text-ink">{doc.title}</p>
                    <p className="text-xs text-ink-muted capitalize">
                      {doc.docType.replace('_', ' ')}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
