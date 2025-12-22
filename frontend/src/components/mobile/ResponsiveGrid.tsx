import { ReactNode } from 'react';

interface ResponsiveGridProps {
  children: ReactNode;
  /** Number of columns on mobile (default 1) */
  cols?: 1 | 2;
  /** Number of columns on tablet sm breakpoint (default 2) */
  colsSm?: 1 | 2 | 3;
  /** Number of columns on desktop md breakpoint (default 2) */
  colsMd?: 1 | 2 | 3 | 4;
  /** Number of columns on large desktop lg breakpoint (default 3) */
  colsLg?: 1 | 2 | 3 | 4;
  /** Gap between items */
  gap?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

const colsClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const smColsClasses = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

const mdColsClasses = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
};

const lgColsClasses = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

const gapClasses = {
  none: 'gap-0',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

/**
 * Responsive grid component that adjusts columns based on breakpoint.
 * Stacks to single column on mobile by default.
 */
export function ResponsiveGrid({
  children,
  cols = 1,
  colsSm = 2,
  colsMd = 2,
  colsLg = 3,
  gap = 'md',
  className = '',
}: ResponsiveGridProps) {
  return (
    <div
      className={`
        grid
        ${colsClasses[cols]}
        ${smColsClasses[colsSm]}
        ${mdColsClasses[colsMd]}
        ${lgColsClasses[colsLg]}
        ${gapClasses[gap]}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </div>
  );
}

interface ResponsiveStackProps {
  children: ReactNode;
  /** Direction on mobile (default vertical) */
  direction?: 'vertical' | 'horizontal';
  /** Direction on tablet and up (default horizontal) */
  directionSm?: 'vertical' | 'horizontal';
  /** Gap between items */
  gap?: 'none' | 'sm' | 'md' | 'lg';
  /** Alignment */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Justify content */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  className?: string;
}

const directionClasses = {
  vertical: 'flex-col',
  horizontal: 'flex-row',
};

const smDirectionClasses = {
  vertical: 'sm:flex-col',
  horizontal: 'sm:flex-row',
};

const alignClasses = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const justifyClasses = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

/**
 * Responsive stack component that switches between vertical and horizontal layout.
 */
export function ResponsiveStack({
  children,
  direction = 'vertical',
  directionSm = 'horizontal',
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  className = '',
}: ResponsiveStackProps) {
  return (
    <div
      className={`
        flex
        ${directionClasses[direction]}
        ${smDirectionClasses[directionSm]}
        ${gapClasses[gap]}
        ${alignClasses[align]}
        ${justifyClasses[justify]}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </div>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  interactive?: boolean;
}

const paddingClasses = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/**
 * Card component with consistent styling and optional interactivity.
 */
export function Card({
  children,
  className = '',
  padding = 'md',
  onClick,
  interactive = false,
}: CardProps) {
  const isClickable = onClick || interactive;

  return (
    <div
      className={`
        bg-white rounded-xl shadow
        ${paddingClasses[padding]}
        ${isClickable ? 'cursor-pointer hover:shadow-md active:scale-[0.99] transition-all touch-manipulation' : ''}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
