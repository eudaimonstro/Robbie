import { useState, memo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Plus, Edit2, Trash2, GripVertical } from 'lucide-react';
import { SectionTree as SectionTreeType } from '../../../api/client';
import ReactMarkdown from 'react-markdown';

interface SectionTreeProps {
  sections: SectionTreeType[];
  selectedSectionId?: string;
  onSelectSection?: (section: SectionTreeType) => void;
  onEditSection?: (section: SectionTreeType) => void;
  onDeleteSection?: (section: SectionTreeType) => void;
  onAddChild?: (parentSection: SectionTreeType) => void;
  onReorder?: (updates: Array<{ id: string; position: number }>) => Promise<void>;
  editable?: boolean;
}

const SectionTree = memo(function SectionTree({
  sections,
  selectedSectionId,
  onSelectSection,
  onEditSection,
  onDeleteSection,
  onAddChild,
  onReorder,
  editable = false,
}: SectionTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id || !onReorder) return;

      // Find which sibling array contains both items
      const findSiblings = (
        items: SectionTreeType[],
        activeId: string,
        overId: string,
      ): SectionTreeType[] | null => {
        // Check if both are in current level
        const activeIdx = items.findIndex((s) => s.id === activeId);
        const overIdx = items.findIndex((s) => s.id === overId);
        if (activeIdx !== -1 && overIdx !== -1) {
          return items;
        }
        // Recurse into children
        for (const item of items) {
          if (item.children && item.children.length > 0) {
            const found = findSiblings(item.children, activeId, overId);
            if (found) return found;
          }
        }
        return null;
      };

      const siblings = findSiblings(sections, active.id as string, over.id as string);
      if (!siblings) return;

      const oldIndex = siblings.findIndex((s) => s.id === active.id);
      const newIndex = siblings.findIndex((s) => s.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(siblings, oldIndex, newIndex);
      const updates = reordered.map((section, index) => ({
        id: section.id,
        position: index,
      }));

      await onReorder(updates);
    },
    [sections, onReorder],
  );

  // Find the active section for the drag overlay
  const findSection = (items: SectionTreeType[], id: string): SectionTreeType | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children && item.children.length > 0) {
        const found = findSection(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const activeSection = activeId ? findSection(sections, activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {sections.map((section) => (
            <SortableSectionNode
              key={section.id}
              section={section}
              depth={0}
              selectedSectionId={selectedSectionId}
              onSelectSection={onSelectSection}
              onEditSection={onEditSection}
              onDeleteSection={onDeleteSection}
              onAddChild={onAddChild}
              editable={editable}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeSection ? (
          <div className="bg-surface shadow-xl ring-2 ring-gavel rounded-lg p-3 opacity-90">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-ink-muted" />
              {activeSection.numberLabel && (
                <span className="font-bold text-gavel">{activeSection.numberLabel}</span>
              )}
              {activeSection.title && (
                <span className="font-document text-ink">{activeSection.title}</span>
              )}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
});

export default SectionTree;

interface SectionNodeProps {
  section: SectionTreeType;
  depth: number;
  selectedSectionId?: string;
  onSelectSection?: (section: SectionTreeType) => void;
  onEditSection?: (section: SectionTreeType) => void;
  onDeleteSection?: (section: SectionTreeType) => void;
  onAddChild?: (parentSection: SectionTreeType) => void;
  editable?: boolean;
}

const SortableSectionNode = memo(function SortableSectionNode({
  section,
  depth,
  selectedSectionId,
  onSelectSection,
  onEditSection,
  onDeleteSection,
  onAddChild,
  editable,
}: SectionNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = section.children && section.children.length > 0;
  const isSelected = selectedSectionId === section.id;
  // How the section is named to screen readers, by its number and title
  const name = [section.numberLabel, section.title].filter(Boolean).join(' ') || 'this section';

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = useCallback(() => {
    onSelectSection?.(section);
  }, [onSelectSection, section]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  }, []);

  const handleAddChild = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onAddChild?.(section);
    },
    [onAddChild, section],
  );

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onEditSection?.(section);
    },
    [onEditSection, section],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDeleteSection?.(section);
    },
    [onDeleteSection, section],
  );

  return (
    <div
      ref={setNodeRef}
      id={`section-${section.id}`}
      style={style}
      className={`scroll-mt-4 ${depth > 0 ? 'sm:ml-6' : ''}`}
    >
      <div
        className={`group flex items-start gap-2 p-2 sm:p-3 rounded-lg transition-colors cursor-pointer ${
          isSelected
            ? 'bg-gavel-tint border-l-4 border-gavel'
            : 'hover:bg-surface-2 border-l-4 border-transparent'
        } ${isDragging ? 'ring-2 ring-gavel' : ''}`}
        onClick={handleClick}
      >
        {/* Drag handle */}
        {editable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-1 p-0.5 cursor-grab active:cursor-grabbing text-ink-muted hover:text-ink rounded-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity max-md:hidden"
            title="Drag to reorder"
            aria-label={`Move ${name}`}
          >
            <GripVertical className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        {/* Expand/collapse button */}
        {/* 20px wide in the row, and a 44px target on phones (the margin gives back the rest) */}
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${name}`}
          className={`mt-1 p-0.5 max-md:-m-3 max-md:p-3.5 shrink-0 rounded hover:bg-rule transition-colors ${
            !hasChildren && 'invisible'
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-ink-muted" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 text-ink-muted" aria-hidden="true" />
          )}
        </button>

        {/* Section content */}
        <div className="flex-1 min-w-0">
          {/* On phones the section's buttons go under its heading, always shown: nothing hovers */}
          <div className="flex items-start justify-between gap-2 max-md:flex-col max-md:gap-1">
            <div className="min-w-0">
              {section.numberLabel && (
                <span className="font-bold text-gavel">{section.numberLabel}</span>
              )}
              {section.title && (
                <span
                  className={`ml-2 font-document ${depth === 0 ? 'text-lg font-semibold' : ''} text-ink`}
                >
                  {section.title}
                </span>
              )}
            </div>

            {/* Action buttons */}
            {editable && (
              <div
                className="flex shrink-0 items-center gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity max-md:-ml-3"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="p-1 max-md:p-3.5 text-ink-muted hover:text-gavel rounded-sm"
                  title="Add a section under it"
                  aria-label={`Add a section under ${name}`}
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="p-1 max-md:p-3.5 text-ink-muted hover:text-gavel rounded-sm"
                  title="Edit"
                  aria-label={`Edit ${name}`}
                >
                  <Edit2 className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="p-1 max-md:p-3.5 text-ink-muted hover:text-gavel rounded-sm"
                  title="Delete"
                  aria-label={`Delete ${name}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {section.content && (
            <div className="mt-2 text-ink document-content prose prose-sm max-w-none">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          )}

          {section.annotation && (
            <div className="mt-2 text-sm text-ink-muted italic border-l-2 border-rule pl-3">
              {section.annotation}
            </div>
          )}
        </div>
      </div>

      {/* Children with their own SortableContext */}
      {hasChildren && isExpanded && (
        <SortableContext
          items={section.children.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-1">
            {section.children.map((child) => (
              <SortableSectionNode
                key={child.id}
                section={child}
                depth={depth + 1}
                selectedSectionId={selectedSectionId}
                onSelectSection={onSelectSection}
                onEditSection={onEditSection}
                onDeleteSection={onDeleteSection}
                onAddChild={onAddChild}
                editable={editable}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
});
