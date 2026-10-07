import React from 'react';
import { HelpTooltip } from './HelpTooltip';
import { CATEGORY_INFO, type CategoryColor } from '@robbie-bylawyer/shared/constants';
import type { MotionCardProps } from '../types';

// Map category colors to the design tokens (they flip with the theme)
const containerColors: Record<CategoryColor, string> = {
  purple: 'bg-gavel-tint border-gavel/30',
  amber: 'bg-caution-tint border-caution/40',
  blue: 'bg-gavel-tint border-gavel/30',
  emerald: 'bg-carried-tint border-carried/40',
};

const textColors: Record<CategoryColor, string> = {
  purple: 'text-ink',
  amber: 'text-caution-ink',
  blue: 'text-ink',
  emerald: 'text-carried',
};

export const MotionCard = React.memo(function MotionCard({
  motion,
  showHelp = true,
}: MotionCardProps) {
  const cat = CATEGORY_INFO[motion.category];

  return (
    <article
      className={`p-3 rounded-lg border ${containerColors[cat.color]}`}
      aria-label={`${motion.name} motion: ${motion.text}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`font-medium ${textColors[cat.color]}`}>{motion.name}</span>
        {showHelp && <HelpTooltip motion={motion} />}
      </div>
      <p className="text-ink">"{motion.text}"</p>
      {motion.agendaAmendment && (
        <div className="mt-2 p-2 bg-surface rounded-sm text-sm text-ink-muted">
          {motion.agendaAmendment.action === 'add' && `Adding: "${motion.agendaAmendment.title}"`}
          {motion.agendaAmendment.action === 'remove' && `Removing item`}
          {motion.agendaAmendment.action === 'reorder' && `Reordering`}
        </div>
      )}
      <p className="text-sm text-ink-muted mt-1">
        Moved by {motion.mover}
        {motion.secondedBy && `, seconded by ${motion.secondedBy}`}
      </p>
    </article>
  );
});
