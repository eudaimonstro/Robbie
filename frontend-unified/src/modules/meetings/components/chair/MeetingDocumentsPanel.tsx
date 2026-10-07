/**
 * Meeting Documents Panel
 *
 * Displays meeting packet documents and attachments during a meeting
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Paperclip,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import type { MeetingPacket, Attachment, AgendaItem } from '../scheduling/types';
import { getPacket, getAttachmentDownloadUrl } from '../scheduling/api';

interface MeetingDocumentsPanelProps {
  meetingCode: string;
}

export function MeetingDocumentsPanel({ meetingCode }: MeetingDocumentsPanelProps) {
  const [packet, setPacket] = useState<MeetingPacket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  async function loadPacket() {
    setIsLoading(true);
    setError(null);
    try {
      // A meeting that was never scheduled or linked has no packet (null): no documents
      const loadedPacket = await getPacket(meetingCode);
      setPacket(loadedPacket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPacket();
  }, [meetingCode]);

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const totalDocs = packet
    ? packet.attachments.length +
      packet.agendaItems.reduce((sum, item) => sum + item.attachments.length, 0)
    : 0;

  if (isLoading) {
    return (
      <section className="bg-surface rounded-lg p-4 shadow-sm">
        <h3 className="label-caps mb-3">Meeting documents</h3>
        <div className="flex items-center justify-center py-4">
          <Loader2 size={24} className="animate-spin text-ink-muted" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-surface rounded-lg p-4 shadow-sm">
        <h3 className="label-caps mb-3">Meeting documents</h3>
        <p className="text-sm text-ink-muted">{error}</p>
      </section>
    );
  }

  if (!packet || totalDocs === 0) {
    return (
      <section className="bg-surface rounded-lg p-4 shadow-sm">
        <h3 className="label-caps mb-3">Meeting documents</h3>
        <p className="text-sm text-ink-muted">No meeting documents.</p>
      </section>
    );
  }

  return (
    <section className="bg-surface rounded-lg p-4 shadow-sm">
      <h3 className="label-caps mb-3 flex items-center gap-2">
        Meeting documents
        <span className="rounded-full bg-surface-2 px-2 py-0.5 tabular-nums text-ink">
          {totalDocs}
        </span>
      </h3>

      {/* Meeting-level documents */}
      {packet.attachments.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-ink-muted mb-2">General Documents</h4>
          <div className="space-y-1">
            {packet.attachments.map((attachment) => (
              <AttachmentRow key={attachment.id} attachment={attachment} />
            ))}
          </div>
        </div>
      )}

      {/* Agenda item documents */}
      {packet.agendaItems.filter((item) => item.attachments.length > 0).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-ink-muted mb-2">Agenda Item Documents</h4>
          <div className="space-y-2">
            {packet.agendaItems
              .filter((item) => item.attachments.length > 0)
              .map((item, index) => (
                <AgendaItemDocuments
                  key={item.id}
                  item={item}
                  index={index}
                  isExpanded={expandedItems.has(item.id)}
                  onToggle={() => toggleItem(item.id)}
                />
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const isFile = attachment.type === 'uploaded_file';

  return (
    <div className="flex items-center gap-2 p-2 bg-surface-2 rounded-sm text-sm">
      {isFile ? (
        <FileText size={16} className="text-ink-muted shrink-0" />
      ) : (
        <Paperclip size={16} className="text-gavel shrink-0" />
      )}
      <span className="flex-1 truncate">{attachment.displayName}</span>
      {isFile ? (
        <a
          href={getAttachmentDownloadUrl(attachment.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-gavel hover:text-ink"
          title="Download"
        >
          <Download size={16} />
        </a>
      ) : (
        <a
          href={`/documents/${attachment.documentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-gavel hover:text-ink"
          title="View in Bylawyer"
        >
          <ExternalLink size={16} />
        </a>
      )}
    </div>
  );
}

function AgendaItemDocuments({
  item,
  index,
  isExpanded,
  onToggle,
}: {
  item: AgendaItem;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2 bg-surface-2 hover:bg-rule text-left"
      >
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        <span className="flex-1 text-sm font-medium truncate">
          {index + 1}. {item.title}
        </span>
        <span className="text-xs bg-rule px-2 py-0.5 rounded-full text-ink-muted">
          {item.attachments.length}
        </span>
      </button>
      {isExpanded && (
        <div className="p-2 space-y-1">
          {item.attachments.map((attachment) => (
            <AttachmentRow key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}
    </div>
  );
}
