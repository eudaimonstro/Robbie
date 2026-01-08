import { Link } from 'react-router-dom'
import { ChevronRight, Edit, GitCompare, Share2, Users } from 'lucide-react'
import { Document, Version } from '../../../../api/client'
import { DocumentTypeBadge } from '../../../../components/ui/Badge'
import { ExportDropdown } from './ExportDropdown'

interface DocumentHeaderProps {
  doc: Document
  versions: Version[]
  selectedVersion: Version | null
  organizationName?: string
  onVersionChange: (versionId: string) => void
  onProposeAmendment: () => void
  onShare: () => void
}

export function DocumentHeader({
  doc,
  versions,
  selectedVersion,
  organizationName,
  onVersionChange,
  onProposeAmendment,
  onShare,
}: DocumentHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-secondary-500 mb-1">
          <Link to="/" className="hover:text-primary-600">
            {organizationName}
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span>{doc.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
            {doc.title}
          </h2>
          <DocumentTypeBadge type={doc.doc_type} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Version selector */}
        <select
          value={selectedVersion?.id || ''}
          onChange={(e) => onVersionChange(e.target.value)}
          className="select text-sm py-1.5"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              Version {v.version_number}
              {v.id === doc.current_version_id ? ' (Current)' : ''}
              {v.effective_date && ` - ${new Date(v.effective_date).toLocaleDateString()}`}
            </option>
          ))}
        </select>

        <ExportDropdown selectedVersion={selectedVersion} />

        <Link
          to={`/documents/${doc.id}/diff`}
          className="btn-secondary btn-sm"
        >
          <GitCompare className="w-4 h-4 mr-2" />
          Compare
        </Link>

        <button onClick={onShare} className="btn-secondary btn-sm">
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </button>

        <Link to="/meetings" className="btn-secondary btn-sm">
          <Users className="w-4 h-4 mr-2" />
          Meetings
        </Link>

        <button onClick={onProposeAmendment} className="btn-primary btn-sm">
          <Edit className="w-4 h-4 mr-2" />
          Propose Amendment
        </button>
      </div>
    </div>
  )
}
