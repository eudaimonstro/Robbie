import React from 'react';
import { HelpTooltip } from './HelpTooltip';
import { CATEGORY_INFO, type CategoryColor } from '@robbie/shared/constants';
import type { MotionCardProps } from '../types';

// Pre-computed color classes to avoid string operations on every render
const containerColors: Record<CategoryColor, string> = {
  purple: "bg-purple-50 border-purple-200",
  amber: "bg-amber-50 border-amber-200",
  blue: "bg-blue-50 border-blue-200",
  emerald: "bg-emerald-50 border-emerald-200"
};

const textColors: Record<CategoryColor, string> = {
  purple: "text-purple-700",
  amber: "text-amber-700",
  blue: "text-blue-700",
  emerald: "text-emerald-700"
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
      <p className="text-gray-700">"{motion.text}"</p>
      {motion.agendaAmendment && (
        <div className="mt-2 p-2 bg-white rounded text-sm text-gray-600">
          {motion.agendaAmendment.action === 'add' && `➕ Adding: "${motion.agendaAmendment.title}"`}
          {motion.agendaAmendment.action === 'remove' && `➖ Removing item`}
          {motion.agendaAmendment.action === 'reorder' && `↕️ Reordering`}
        </div>
      )}
      <p className="text-sm text-gray-500 mt-1">
        Moved by {motion.mover}{motion.secondedBy && `, seconded by ${motion.secondedBy}`}
      </p>
    </article>
  );
});
