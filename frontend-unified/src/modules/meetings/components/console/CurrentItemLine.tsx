import { Paperclip } from 'lucide-react';
import type { AgendaItem } from '@robbie-bylawyer/shared/types';
import type { MeetingPacket } from '../scheduling/types';
import { getAttachmentDownloadUrl } from '../scheduling/api';

interface CurrentItemLineProps {
  item: AgendaItem | null;
  packet: MeetingPacket | null;
}

/** The agenda item before the meeting, on one line, with its attachments from the schedule */
export function CurrentItemLine({ item, packet }: CurrentItemLineProps) {
  if (!item) return null;
  const scheduled = packet?.agendaItems.find((i) => i.id === item.packetItemId);
  const attachments = scheduled?.attachments ?? [];
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="label-caps">Now</span>
      <span className="font-medium text-ink">{item.title}</span>
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={
            attachment.type === 'uploaded_file'
              ? getAttachmentDownloadUrl(attachment.id)
              : `/documents/${attachment.documentId}`
          }
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-sm text-gavel hover:underline"
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {attachment.displayName}
        </a>
      ))}
    </div>
  );
}
