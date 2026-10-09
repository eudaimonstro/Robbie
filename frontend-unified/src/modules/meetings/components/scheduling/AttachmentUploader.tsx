/**
 * Attachment Uploader Component
 *
 * Handles file uploads and Bylawyer document linking
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, File, X, Link, Loader2, FileText, Download, Trash2 } from 'lucide-react';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@robbie-bylawyer/shared/constants';
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

const TYPES = Object.values(ATTACHMENT_TYPES);
/** "PDF, DOC, DOCX, TXT, RTF" */
const TYPE_NAMES = [...new Set(TYPES.map((t) => t.label))].join(', ');
/** The file picker's filter: ".pdf,.doc,.docx,.txt,.rtf" */
const ACCEPT = [...new Set(TYPES.map((t) => t.extension))].join(',');
const MAX_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);

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
      if (!Object.hasOwn(ATTACHMENT_TYPES, file.type)) {
        setError(`File type not allowed: ${file.name}. Allowed: ${TYPE_NAMES}`);
        continue;
      }

      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`File too large: ${file.name}. Maximum: ${MAX_MB}MB`);
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

  // Plain functions, not memoized: they call this render's uploadFiles, so a new target or
  // onAttachmentAdded from the parent is the one an upload reports to
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    await uploadFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
          accept={ACCEPT}
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
              {(attachment.mimeType && ATTACHMENT_TYPES[attachment.mimeType]?.label) || 'File'}
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
export function DocumentPicker({
  organizationId,
  onSelect,
  onClose,
}: {
  organizationId: string;
  onSelect: (doc: BylawyerDocument) => void;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  // The answer to one load (this organization, this attempt); anything else is still loading
  const [loaded, setLoaded] = useState<{
    key: string;
    documents: BylawyerDocument[];
    failed: boolean;
  } | null>(null);
  const loadKey = `${organizationId}#${attempt}`;
  const loading = loaded?.key !== loadKey;
  const documents = loaded?.documents ?? [];
  // The list couldn't be loaded: said, with Try again, rather than "No documents"
  const failed = !loading && loaded?.failed === true;

  React.useEffect(() => {
    let cancelled = false;
    listDocuments(organizationId)
      .then((docs) => {
        if (!cancelled) setLoaded({ key: loadKey, documents: docs, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: loadKey, documents: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, loadKey]);

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
            <div role="status" className="flex items-center justify-center gap-2 py-8">
              <Loader2 size={24} className="animate-spin text-ink-muted" aria-hidden="true" />
              <span className="text-sm text-ink-muted">Loading the documents...</span>
            </div>
          ) : failed ? (
            <div role="alert" className="py-6 text-center">
              <p className="text-ink">Couldn&apos;t load the documents.</p>
              <button
                type="button"
                className="btn-secondary btn-sm mt-3"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try again
              </button>
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
