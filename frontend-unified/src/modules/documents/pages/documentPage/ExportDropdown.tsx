import { useRef, useEffect, useState } from 'react';
import { ChevronDown, Download, FileText, Printer } from 'lucide-react';
import { versions as versionsApi, type Version } from '../../../../api/client';
import { useToast } from '../../../../context/ToastContext';

interface ExportDropdownProps {
  documentId: string;
  selectedVersion: Version | null;
}

/**
 * The document's Export menu: print the version shown (the browser's print dialog saves the
 * PDF), or download it as Markdown
 */
export function ExportDropdown({ documentId, selectedVersion }: ExportDropdownProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const downloadMarkdown = async () => {
    if (!selectedVersion) return;
    setOpen(false);
    setExporting(true);
    try {
      await versionsApi.exportMarkdown(selectedVersion.id);
    } catch {
      showToast('error', "Couldn't download the Markdown");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="btn-secondary btn-sm"
        disabled={exporting || !selectedVersion}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        {exporting ? 'Exporting...' : 'Export'}
        <ChevronDown className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && selectedVersion && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-rule bg-surface shadow-lg"
        >
          <a
            role="menuitem"
            href={`/documents/${documentId}/print?version=${selectedVersion.id}&print=1`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm text-ink hover:bg-surface-2"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print or save as PDF
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => void downloadMarkdown()}
            className="flex w-full items-center gap-2 rounded-b-lg px-4 py-2 text-left text-sm text-ink hover:bg-surface-2"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Markdown
          </button>
        </div>
      )}
    </div>
  );
}
