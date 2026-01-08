import React from 'react';
import { HelpTooltip } from './HelpTooltip';
import { CATEGORY_INFO, type CategoryColor } from '@robbie-bylawyer/shared/constants';
import type { MotionCardProps } from '../types';

// Map category colors to semantic color classes with dark mode support
const containerColors: Record<CategoryColor, string> = {
  purple: "bg-meeting-50 dark:bg-meeting-900/20 border-meeting-200 dark:border-meeting-800",
  amber: "bg-accent-50 dark:bg-accent-900/20 border-accent-200 dark:border-accent-800",
  blue: "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800",
  emerald: "bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800"
};

const textColors: Record<CategoryColor, string> = {
  purple: "text-meeting-700 dark:text-meeting-400",
  amber: "text-accent-700 dark:text-accent-400",
  blue: "text-primary-700 dark:text-primary-400",
  emerald: "text-success-700 dark:text-success-400"
};

export const MotionCard = React.memo(function MotionCard({ motion, showHelp = true }: MotionCardProps) {
  const cat = CATEGORY_INFO[motion.category];

  return (
    <article
      className={`p-3 rounded-lg border ${containerColors[cat.color]}`}
      aria-label={`${motion.name} motion: ${motion.text}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`font-medium ${textColors[cat.color]}`}>{motion.name}</span>
        {showHelp && <HelpTooltip motion={motion}/>}
      </div>
      <p className="text-secondary-700 dark:text-secondary-300">"{motion.text}"</p>
      {motion.agendaAmendment && (
        <div className="mt-2 p-2 bg-white dark:bg-secondary-800 rounded text-sm text-secondary-600 dark:text-secondary-400">
          {motion.agendaAmendment.action === 'add' && `Adding: "${motion.agendaAmendment.title}"`}
          {motion.agendaAmendment.action === 'remove' && `Removing item`}
          {motion.agendaAmendment.action === 'reorder' && `Reordering`}
        </div>
      )}
      <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
        Moved by {motion.mover}{motion.secondedBy && `, seconded by ${motion.secondedBy}`}
      </p>
    </article>
  );
});
