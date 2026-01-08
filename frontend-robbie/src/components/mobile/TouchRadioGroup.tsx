import { useState, useCallback, KeyboardEvent } from 'react';

interface TouchRadioOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

interface TouchRadioGroupProps<T extends string> {
  options: TouchRadioOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  name: string;
  label?: string;
  layout?: 'horizontal' | 'vertical' | 'grid';
  disabled?: boolean;
  required?: boolean;
}

const variantStyles = {
  default: {
    selected: 'bg-indigo-600 border-indigo-600 text-white',
    unselected: 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50',
  },
  success: {
    selected: 'bg-green-600 border-green-600 text-white',
    unselected: 'bg-white border-gray-300 text-gray-700 hover:border-green-400 hover:bg-green-50',
  },
  danger: {
    selected: 'bg-red-600 border-red-600 text-white',
    unselected: 'bg-white border-gray-300 text-gray-700 hover:border-red-400 hover:bg-red-50',
  },
  warning: {
    selected: 'bg-amber-500 border-amber-500 text-white',
    unselected: 'bg-white border-gray-300 text-gray-700 hover:border-amber-400 hover:bg-amber-50',
  },
};

const layoutStyles = {
  horizontal: 'flex flex-row flex-wrap gap-2',
  vertical: 'flex flex-col gap-2',
  grid: 'grid grid-cols-2 sm:grid-cols-3 gap-2',
};

/**
 * Touch-optimized radio button group with large touch targets.
 * Supports icons, descriptions, and color variants.
 */
export function TouchRadioGroup<T extends string>({
  options,
  value,
  onChange,
  name,
  label,
  layout = 'horizontal',
  disabled = false,
  required = false,
}: TouchRadioGroupProps<T>) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, index: number) => {
      const enabledOptions = options.filter((_, i) => !disabled);
      const currentIndex = index;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % options.length;
          setFocusedIndex(nextIndex);
          if (!disabled) {
            onChange(options[nextIndex].value);
          }
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = (currentIndex - 1 + options.length) % options.length;
          setFocusedIndex(prevIndex);
          if (!disabled) {
            onChange(options[prevIndex].value);
          }
          break;
        }
        case ' ':
        case 'Enter':
          e.preventDefault();
          if (!disabled) {
            onChange(options[index].value);
          }
          break;
      }
    },
    [options, onChange, disabled]
  );

  return (
    <div role="radiogroup" aria-label={label} aria-required={required}>
      {label && (
        <div className="text-sm font-medium text-gray-700 mb-2">{label}</div>
      )}
      <div className={layoutStyles[layout]}>
        {options.map((option, index) => {
          const isSelected = value === option.value;
          const variant = option.variant ?? 'default';
          const styles = variantStyles[variant];

          return (
            <label
              key={option.value}
              className={`
                relative flex items-center justify-center gap-2
                min-h-[56px] px-4 py-3
                rounded-xl border-2
                cursor-pointer
                transition-all duration-150 ease-out
                touch-manipulation
                active:scale-[0.98]
                focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500
                ${isSelected ? styles.selected : styles.unselected}
                ${disabled ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}
                ${layout === 'horizontal' ? 'flex-1 min-w-[100px]' : ''}
              `.trim().replace(/\s+/g, ' ')}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onFocus={() => setFocusedIndex(index)}
                onBlur={() => setFocusedIndex(-1)}
                disabled={disabled}
                className="sr-only"
                aria-describedby={option.description ? `${name}-${option.value}-desc` : undefined}
              />

              {option.icon && (
                <span className="flex-shrink-0" aria-hidden="true">
                  {option.icon}
                </span>
              )}

              <div className="flex flex-col items-center">
                <span className="font-medium text-center">{option.label}</span>
                {option.description && (
                  <span
                    id={`${name}-${option.value}-desc`}
                    className={`text-xs ${isSelected ? 'text-white/80' : 'text-gray-500'}`}
                  >
                    {option.description}
                  </span>
                )}
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <span className="absolute top-2 right-2" aria-hidden="true">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
