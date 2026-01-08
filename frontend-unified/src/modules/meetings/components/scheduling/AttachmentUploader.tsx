/**
 * Attachment Uploader Component
 *
 * Handles file uploads and Bylawyer document linking
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, File, X, Link, Loader2, FileText, Download, Trash2 } from 'lucide-react';
import type { Attachment, BylawyerDocument, Organization } from './types';
import { uploadAttachment, linkDocument, deleteAttachment, getAttachmentDownloadUrl, listOrganizations, listDocuments } from './api';

interface AttachmentUploaderProps {
  robbieCode: string;
  attachments: Attachment[];
  target: { packetId?: string; agendaItemId?: string };
  onAttachmentAdded: (attachment: Attachment) => void;
  onAttachmentRemoved: (attachmentId: string) => void;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/rtf',
  'application/rtf'
];

const TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'TXT',
  'text/rtf': 'RTF',
  'application/rtf': 'RTF'
};

export function AttachmentUploader({
  robbieCode,
  attachments,
  target,
  onAttachmentAdded,
  onAttachmentRemoved
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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  }, [robbieCode, target]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    await uploadFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [robbieCode, target]);

  const uploadFiles = async (files: File[]) => {
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
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await deleteAttachment(attachmentId);
      onAttachmentRemoved(attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        {isUploading ? (
          <div className="flex items-center justify-center gap-2 text-gray-600">
            <Loader2 size={20} className="animate-spin" />
            <span>Uploading...</span>
          </div>
        ) : (
          <>
            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">
              Drag files here or{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-indigo-600 hover:underline"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDF, DOC, DOCX, TXT, RTF (max 10MB)
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Link document button */}
      <button
        type="button"
        onClick={() => setShowDocPicker(true)}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
      >
        <Link size={16} />
        Link Bylawyer Document
      </button>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map(attachment => (
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
          target={target}
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

function AttachmentItem({ attachment, onDelete }: { attachment: Attachment; onDelete: () => void }) {
  const isFile = attachment.type === 'uploaded_file';

  return (
    <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
      <div className="bg-white p-2 rounded">
        {isFile ? (
          <File size={20} className="text-gray-500" />
        ) : (
          <FileText size={20} className="text-indigo-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">
          {attachment.displayName}
        </p>
        <p className="text-xs text-gray-500">
          {isFile ? (
            <>
              {TYPE_LABELS[attachment.mimeType || ''] || 'File'}
              {attachment.sizeBytes && ` - ${formatSize(attachment.sizeBytes)}`}
            </>
          ) : (
            `Bylawyer: ${attachment.document?.title || 'Document'}`
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {isFile && (
          <a
            href={getAttachmentDownloadUrl(attachment.id)}
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Download"
          >
            <Download size={16} />
          </a>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-600"
          title="Remove"
        >
          <Trash2 size={16} />
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

function DocumentPicker({
  target,
  onSelect,
  onClose
}: {
  target: { packetId?: string; agendaItemId?: string };
  onSelect: (doc: BylawyerDocument) => void;
  onClose: () => void;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [documents, setDocuments] = useState<BylawyerDocument[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const orgs = await listOrganizations();
      setOrganizations(orgs);
      if (orgs.length === 1) {
        setSelectedOrg(orgs[0].id);
        loadDocuments(orgs[0].id);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (orgId: string) => {
    setLoading(true);
    try {
      const docs = await listDocuments(orgId);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-800">Link Document</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : organizations.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No organizations found. Create an organization in Bylawyer first.
            </p>
          ) : (
            <>
              {organizations.length > 1 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization
                  </label>
                  <select
                    value={selectedOrg || ''}
                    onChange={(e) => {
                      setSelectedOrg(e.target.value);
                      loadDocuments(e.target.value);
                    }}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="">Select organization...</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedOrg && (
                <div className="space-y-2">
                  {documents.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">
                      No documents in this organization.
                    </p>
                  ) : (
                    documents.map(doc => (
                      <button
                        key={doc.id}
                        onClick={() => onSelect(doc)}
                        className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 border border-transparent transition-colors"
                      >
                        <p className="font-medium text-gray-800">{doc.title}</p>
                        <p className="text-xs text-gray-500 capitalize">
                          {doc.docType.replace('_', ' ')}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
