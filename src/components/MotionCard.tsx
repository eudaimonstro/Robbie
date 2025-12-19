import React from 'react';
import { HelpTooltip } from './HelpTooltip';
import { CATEGORY_INFO } from '../constants/motions';
import type { MotionCardProps } from '../types';

export const MotionCard = React.memo(function MotionCard({ motion, showHelp = true }: MotionCardProps) {
  const cat = CATEGORY_INFO[motion.category];
  const colors = {
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700"
  };

  return (
    <article
      className={`p-3 rounded-lg border ${colors[cat.color]?.split(' ').slice(0,2).join(' ')}`}
      aria-label={`${motion.name} motion: ${motion.text}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`font-medium ${colors[cat.color]?.split(' ')[2]}`}>{motion.name}</span>
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
