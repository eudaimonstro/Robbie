import { useRef, useEffect, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { versions as versionsApi, Version } from '../../../../api/client';
import { useToast } from '../../../../context/ToastContext';

interface ExportDropdownProps {
  selectedVersion: Version | null;
}

export function ExportDropdown({ selectedVersion }: ExportDropdownProps) {
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

  const handleExport = async (format: 'pdf' | 'markdown' | 'html') => {
    if (!selectedVersion) return;

    try {
      setExporting(true);
      setOpen(false);

      switch (format) {
        case 'pdf':
          await versionsApi.exportPdf(selectedVersion.id);
          break;
        case 'markdown':
          await versionsApi.exportMarkdown(selectedVersion.id);
          break;
        case 'html':
          await versionsApi.exportHtml(selectedVersion.id);
          break;
      }

      showToast('success', `Exported as ${format.toUpperCase()}`);
    } catch {
      showToast('error', `Failed to export as ${format.toUpperCase()}`);
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
      >
        <Download className="w-4 h-4 mr-2" />
        {exporting ? 'Exporting...' : 'Export'}
        <ChevronDown className="w-4 h-4 ml-1" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-surface rounded-lg shadow-lg border border-rule z-10">
          <button
            onClick={() => handleExport('pdf')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-surface-2 first:rounded-t-lg"
          >
            PDF Document
          </button>
          <button
            onClick={() => handleExport('markdown')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-surface-2"
          >
            Markdown
          </button>
          <button
            onClick={() => handleExport('html')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-surface-2 last:rounded-b-lg"
          >
            HTML
          </button>
        </div>
      )}
    </div>
  );
}
