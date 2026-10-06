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
          <div className="bg-white dark:bg-secondary-800 shadow-xl ring-2 ring-primary-500 rounded-lg p-3 opacity-90">
            <div className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-secondary-400" />
              {activeSection.number_label && (
                <span className="font-bold text-primary-600 dark:text-primary-400">
                  {activeSection.number_label}
                </span>
              )}
              {activeSection.title && (
                <span className="font-document text-secondary-900 dark:text-white">
                  {activeSection.title}
                </span>
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
    <div ref={setNodeRef} style={style} className={depth > 0 ? 'ml-6' : ''}>
      <div
        className={`group flex items-start gap-2 p-3 rounded-lg transition-colors cursor-pointer ${
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-primary-500'
            : 'hover:bg-secondary-50 dark:hover:bg-secondary-800/50 border-l-4 border-transparent'
        } ${isDragging ? 'ring-2 ring-primary-500' : ''}`}
        onClick={handleClick}
      >
        {/* Drag handle */}
        {editable && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="mt-1 p-0.5 cursor-grab active:cursor-grabbing text-secondary-400 hover:text-secondary-600 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}

        {/* Expand/collapse button */}
        <button
          type="button"
          onClick={handleToggle}
          className={`mt-1 p-0.5 rounded hover:bg-secondary-200 dark:hover:bg-secondary-700 transition-colors ${
            !hasChildren && 'invisible'
          }`}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-secondary-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-secondary-500" />
          )}
        </button>

        {/* Section content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              {section.number_label && (
                <span className="font-bold text-primary-600 dark:text-primary-400">
                  {section.number_label}
                </span>
              )}
              {section.title && (
                <span
                  className={`ml-2 font-document ${depth === 0 ? 'text-lg font-semibold' : ''} text-secondary-900 dark:text-white`}
                >
                  {section.title}
                </span>
              )}
            </div>

            {/* Action buttons */}
            {editable && (
              <div
                className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="p-1 text-secondary-400 hover:text-primary-600 rounded-sm"
                  title="Add child section"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="p-1 text-secondary-400 hover:text-primary-600 rounded-sm"
                  title="Edit section"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="p-1 text-secondary-400 hover:text-danger-600 rounded-sm"
                  title="Delete section"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {section.content && (
            <div className="mt-2 text-secondary-700 dark:text-secondary-300 document-content prose prose-sm max-w-none">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          )}

          {section.annotation && (
            <div className="mt-2 text-sm text-secondary-500 italic border-l-2 border-secondary-200 dark:border-secondary-700 pl-3">
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
