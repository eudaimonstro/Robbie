import { Link } from 'react-router-dom';
import { ChevronRight, Edit, GitCompare, Share2, Users } from 'lucide-react';
import { Document, Version } from '../../../../api/client';
import { DocumentTypeBadge } from '../../../../components/ui/Badge';
import { ExportDropdown } from './ExportDropdown';
import { formatCalendarDate } from '../../../../utils/dates';

interface DocumentHeaderProps {
  doc: Document;
  versions: Version[];
  selectedVersion: Version | null;
  organizationName?: string;
  /** Whether the user may draft an amendment (member and above) */
  canDraft: boolean;
  /** Whether the user may turn share links on and off (admin and above) */
  canShare: boolean;
  onVersionChange: (versionId: string) => void;
  onProposeAmendment: () => void;
  onShare: () => void;
}

export function DocumentHeader({
  doc,
  versions,
  selectedVersion,
  organizationName,
  canDraft,
  canShare,
  onVersionChange,
  onProposeAmendment,
  onShare,
}: DocumentHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-sm text-ink-muted mb-1">
          <Link to="/" className="shrink-0 inline-flex items-center max-md:min-h-11 hover:text-gavel">
            {organizationName}
          </Link>
          <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{doc.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="page-title">{doc.title}</h2>
          <DocumentTypeBadge type={doc.docType} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* The version picker, export and compare wait for the first version */}
        {versions.length > 0 && (
          <>
            <select
              aria-label="Version"
              value={selectedVersion?.id || ''}
              onChange={(e) => onVersionChange(e.target.value)}
              className="select w-full sm:w-auto text-sm py-1.5"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.versionNumber}
                  {v.id === doc.currentVersionId ? ' (current)' : ''}
                  {v.effectiveDate && ` - ${formatCalendarDate(v.effectiveDate)}`}
                </option>
              ))}
            </select>

            <ExportDropdown documentId={doc.id} selectedVersion={selectedVersion} />

            <Link to={`/documents/${doc.id}/diff`} className="btn-secondary btn-sm">
              <GitCompare className="w-4 h-4" aria-hidden="true" />
              Compare
            </Link>
          </>
        )}

        {canShare && (
          <button onClick={onShare} className="btn-secondary btn-sm">
            <Share2 className="w-4 h-4" aria-hidden="true" />
            Share
          </button>
        )}

        <Link to="/meetings" className="btn-secondary btn-sm">
          <Users className="w-4 h-4" aria-hidden="true" />
          Meetings
        </Link>

        {canDraft && (
          <button onClick={onProposeAmendment} className="btn-primary btn-sm">
            <Edit className="w-4 h-4" aria-hidden="true" />
            Propose amendment
          </button>
        )}
      </div>
    </div>
  );
}
