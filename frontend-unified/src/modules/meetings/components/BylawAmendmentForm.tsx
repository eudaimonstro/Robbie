import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import type { BylawAmendmentFormProps, BylawChangeType, BylawAmendment } from '../types';
import { bylawSync, type Document, type SectionTree, type MeetingOrganizationResponse } from '../../../api/client';
import { useToast } from '../../../context/ToastContext';

// Extend SectionTree with depth for flattened display
interface FlatSection extends SectionTree {
  depth: number;
}

export function BylawAmendmentForm({ meetingCode, onSubmit, onCancel }: BylawAmendmentFormProps) {
  const { showToast } = useToast();
  const [linkedOrg, setLinkedOrg] = useState<MeetingOrganizationResponse | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sections, setSections] = useState<SectionTree[]>([]);
  const [flatSections, setFlatSections] = useState<FlatSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [changeType, setChangeType] = useState<BylawChangeType>('modify');
  const [targetSectionId, setTargetSectionId] = useState<string>('');
  const [parentSectionId, setParentSectionId] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newNumberLabel, setNewNumberLabel] = useState<string>('');

  // Flatten sections tree for dropdown
  const flattenSections = useCallback((sectionList: SectionTree[], depth = 0): FlatSection[] => {
    const result: FlatSection[] = [];
    for (const section of sectionList) {
      result.push({ ...section, depth });
      if (section.children && section.children.length > 0) {
        result.push(...flattenSections(section.children, depth + 1));
      }
    }
    return result;
  }, []);

  // Fetch linked organization
  useEffect(() => {
    async function fetchLinkedOrg() {
      try {
        const data = await bylawSync.getMeetingOrganization(meetingCode);
        setLinkedOrg(data);
      } catch (err) {
        console.error('Error fetching linked organization:', err);
        setError('Could not connect to server');
        showToast('error', 'Could not connect to server');
      } finally {
        setLoading(false);
      }
    }
    fetchLinkedOrg();
  }, [meetingCode, showToast]);

  // Fetch documents when org is linked
  useEffect(() => {
    if (!linkedOrg?.linked || !linkedOrg.organization) return;

    async function fetchDocuments() {
      try {
        const data = await bylawSync.getOrganizationDocuments(linkedOrg!.organization!.id);
        setDocuments(data);
        if (data.length > 0) {
          setSelectedDocumentId(data[0].id);
        }
      } catch (err) {
        console.error('Error fetching documents:', err);
        showToast('error', 'Failed to load documents');
      }
    }
    fetchDocuments();
  }, [linkedOrg, showToast]);

  // Fetch sections when document is selected
  useEffect(() => {
    if (!selectedDocumentId) {
      setSections([]);
      setFlatSections([]);
      return;
    }

    async function fetchSections() {
      setLoadingSections(true);
      try {
        // Fetch the latest version's section tree
        const data = await bylawSync.getDocumentSections(selectedDocumentId);
        setSections(data);
        setFlatSections(flattenSections(data));
        if (data.length > 0 && flattenSections(data).length > 0) {
          setTargetSectionId(flattenSections(data)[0].id);
        }
      } catch (err) {
        console.error('Error fetching sections:', err);
        showToast('error', 'Failed to load document sections');
      } finally {
        setLoadingSections(false);
      }
    }
    fetchSections();
  }, [selectedDocumentId, flattenSections, showToast]);

  const selectedDocument = documents.find(d => d.id === selectedDocumentId);
  const selectedSection = flatSections.find(s => s.id === targetSectionId);

  const handleSubmit = () => {
    if (!selectedDocumentId) return;

    const bylawAmendment: BylawAmendment = {
      documentId: selectedDocumentId,
      documentTitle: selectedDocument?.title,
      changeType,
    };

    let text = '';

    switch (changeType) {
      case 'add':
        bylawAmendment.parentSectionId = parentSectionId || undefined;
        bylawAmendment.newTitle = newTitle;
        bylawAmendment.newContent = newContent;
        bylawAmendment.newNumberLabel = newNumberLabel || undefined;
        const parentSection = flatSections.find(s => s.id === parentSectionId);
        text = `I move to amend the bylaws by adding a new section${parentSection ? ` under ${parentSection.number_label} "${parentSection.title}"` : ''}: "${newTitle}"`;
        break;

      case 'modify':
        if (!targetSectionId) return;
        bylawAmendment.targetSectionId = targetSectionId;
        bylawAmendment.targetSectionLabel = selectedSection ? `${selectedSection.number_label} "${selectedSection.title}"` : undefined;
        bylawAmendment.newContent = newContent;
        if (newTitle) bylawAmendment.newTitle = newTitle;
        text = `I move to amend the bylaws by modifying ${selectedSection?.number_label || 'section'} "${selectedSection?.title || 'selected section'}"`;
        break;

      case 'delete':
        if (!targetSectionId) return;
        bylawAmendment.targetSectionId = targetSectionId;
        bylawAmendment.targetSectionLabel = selectedSection ? `${selectedSection.number_label} "${selectedSection.title}"` : undefined;
        text = `I move to amend the bylaws by deleting ${selectedSection?.number_label || 'section'} "${selectedSection?.title || 'selected section'}"`;
        break;

      case 'renumber':
        if (!targetSectionId) return;
        bylawAmendment.targetSectionId = targetSectionId;
        bylawAmendment.targetSectionLabel = selectedSection ? `${selectedSection.number_label} "${selectedSection.title}"` : undefined;
        bylawAmendment.newNumberLabel = newNumberLabel;
        text = `I move to amend the bylaws by renumbering ${selectedSection?.number_label || 'section'} to ${newNumberLabel}`;
        break;
    }

    onSubmit(text, bylawAmendment);
  };

  const canSubmit = () => {
    if (!selectedDocumentId) return false;
    switch (changeType) {
      case 'add':
        return newTitle.trim() && newContent.trim();
      case 'modify':
        return targetSectionId && newContent.trim();
      case 'delete':
        return !!targetSectionId;
      case 'renumber':
        return targetSectionId && newNumberLabel.trim();
      default:
        return false;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-indigo-600" size={24} />
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </div>
        <button onClick={onCancel} className="w-full py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    );
  }

  if (!linkedOrg?.linked || !linkedOrg.organization) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <AlertCircle size={18} />
            <span className="font-medium">No Organization Linked</span>
          </div>
          <p className="text-amber-600 text-sm">
            This meeting must be linked to a Bylawyer organization to propose bylaw amendments.
            Ask the meeting administrator to link this meeting in the Admin panel.
          </p>
        </div>
        <button onClick={onCancel} className="w-full py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <FileText size={18} />
            <span className="font-medium">No Documents Found</span>
          </div>
          <p className="text-amber-600 text-sm">
            The linked organization "{linkedOrg.organization.name}" has no bylaw documents.
            Create a document in Bylawyer first.
          </p>
        </div>
        <button onClick={onCancel} className="w-full py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
        <p className="text-sm text-indigo-700">
          Proposing amendment for <span className="font-medium">{linkedOrg.organization.name}</span>
        </p>
      </div>

      {/* Document Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Document</label>
        <select
          value={selectedDocumentId}
          onChange={(e) => setSelectedDocumentId(e.target.value)}
          className="w-full p-3 border rounded-lg bg-white"
        >
          {documents.map(doc => (
            <option key={doc.id} value={doc.id}>{doc.title}</option>
          ))}
        </select>
      </div>

      {/* Change Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Amendment Type</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { value: 'add' as const, label: 'Add', icon: '+' },
            { value: 'modify' as const, label: 'Modify', icon: '✎' },
            { value: 'delete' as const, label: 'Delete', icon: '−' },
            { value: 'renumber' as const, label: 'Renumber', icon: '#' }
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setChangeType(opt.value)}
              className={`p-3 rounded-lg border-2 text-center ${changeType === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}
            >
              <span className="text-xl block">{opt.icon}</span>
              <span className="text-xs">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {loadingSections ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="animate-spin text-gray-400" size={20} />
          <span className="ml-2 text-gray-500 text-sm">Loading sections...</span>
        </div>
      ) : (
        <>
          {/* Section Selection - for modify, delete, renumber */}
          {changeType !== 'add' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Section to {changeType === 'modify' ? 'Modify' : changeType === 'delete' ? 'Delete' : 'Renumber'}
              </label>
              <select
                value={targetSectionId}
                onChange={(e) => setTargetSectionId(e.target.value)}
                className="w-full p-3 border rounded-lg bg-white"
              >
                <option value="">Select a section...</option>
                {flatSections.map(section => (
                  <option key={section.id} value={section.id}>
                    {'  '.repeat(section.depth)}{section.number_label} {section.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Parent Section - for add */}
          {changeType === 'add' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Section (optional)</label>
              <select
                value={parentSectionId}
                onChange={(e) => setParentSectionId(e.target.value)}
                className="w-full p-3 border rounded-lg bg-white"
              >
                <option value="">Top level (no parent)</option>
                {flatSections.map(section => (
                  <option key={section.id} value={section.id}>
                    {'  '.repeat(section.depth)}{section.number_label} {section.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* New Number Label - for add or renumber */}
          {(changeType === 'add' || changeType === 'renumber') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {changeType === 'add' ? 'Section Number (optional)' : 'New Section Number'}
              </label>
              <input
                type="text"
                value={newNumberLabel}
                onChange={(e) => setNewNumberLabel(e.target.value)}
                placeholder={changeType === 'add' ? 'e.g., Article V, Section 3' : 'e.g., Article VI'}
                className="w-full p-3 border rounded-lg"
              />
            </div>
          )}

          {/* Title - for add or modify */}
          {(changeType === 'add' || changeType === 'modify') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {changeType === 'add' ? 'Section Title' : 'New Title (optional)'}
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={changeType === 'add' ? 'Enter section title...' : 'Leave blank to keep current title'}
                className="w-full p-3 border rounded-lg"
              />
            </div>
          )}

          {/* Content - for add or modify */}
          {(changeType === 'add' || changeType === 'modify') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {changeType === 'add' ? 'Section Content' : 'New Content'}
              </label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Enter the section content..."
                rows={4}
                className="w-full p-3 border rounded-lg resize-y"
              />
            </div>
          )}

          {/* Preview for delete */}
          {changeType === 'delete' && selectedSection && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800 mb-1">Section to be deleted:</p>
              <p className="text-sm text-red-700">
                <strong>{selectedSection.number_label}</strong> {selectedSection.title}
              </p>
              {selectedSection.content && (
                <p className="text-xs text-red-600 mt-1 line-clamp-2">{selectedSection.content}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit()}
          className="flex-1 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300 font-medium"
        >
          Submit Motion
        </button>
      </div>
    </div>
  );
}
