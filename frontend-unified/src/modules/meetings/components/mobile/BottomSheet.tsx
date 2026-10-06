import { ReactNode, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Height of the sheet: 'auto' fits content, 'half' is 50vh, 'full' is 90vh */
  height?: 'auto' | 'half' | 'full';
  /** Show close button in header */
  showCloseButton?: boolean;
}

const heightClasses = {
  auto: 'max-h-[85vh]',
  half: 'h-[50vh]',
  full: 'h-[90vh]',
};

/**
 * Mobile-optimized bottom sheet component.
 * On mobile: slides up from bottom with backdrop
 * On tablet/desktop: renders as a centered modal
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  height = 'auto',
  showCloseButton = true,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Swipe down to close (mobile)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    // Only allow dragging down
    if (diff > 0) {
      sheetRef.current.style.transform = `translateY(${diff}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !sheetRef.current) return;

    const diff = currentY.current - startY.current;
    isDragging.current = false;

    // If dragged more than 100px, close the sheet
    if (diff > 100) {
      onClose();
    }

    // Reset transform
    sheetRef.current.style.transform = '';
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`
          fixed z-50
          bg-white shadow-2xl
          transition-transform duration-300 ease-out

          /* Mobile: bottom sheet */
          inset-x-0 bottom-0
          rounded-t-2xl
          ${heightClasses[height]}

          /* Tablet/Desktop: centered modal */
          sm:inset-auto sm:left-1/2 sm:top-1/2
          sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:rounded-2xl sm:max-w-lg sm:w-full
          sm:max-h-[85vh]
        `
          .trim()
          .replace(/\s+/g, ' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
      >
        {/* Drag handle (mobile only) */}
        <div
          className="sm:hidden w-full py-3 flex justify-center touch-manipulation cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            {title && (
              <h2 id="bottom-sheet-title" className="text-lg font-semibold text-gray-900">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 -m-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors touch-manipulation"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto p-4 pb-safe">{children}</div>
      </div>
    </>
  );
}

/**
 * Bottom sheet footer with action buttons.
 * Use inside BottomSheet for consistent button placement.
 */
interface BottomSheetFooterProps {
  children: ReactNode;
  className?: string;
}

export function BottomSheetFooter({ children, className = '' }: BottomSheetFooterProps) {
  return (
    <div
      className={`
        sticky bottom-0 left-0 right-0
        bg-white border-t border-gray-200
        p-4 pb-safe
        flex gap-3
        ${className}
      `
        .trim()
        .replace(/\s+/g, ' ')}
    >
      {children}
    </div>
  );
}
