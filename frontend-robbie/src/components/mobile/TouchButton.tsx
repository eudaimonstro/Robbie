import { ButtonHTMLAttributes, forwardRef } from 'react';

type TouchButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
type TouchButtonSize = 'sm' | 'md' | 'lg';

interface TouchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TouchButtonVariant;
  size?: TouchButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const variantStyles: Record<TouchButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 focus:ring-indigo-500',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 focus:ring-gray-400',
  success: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800 focus:ring-green-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200 focus:ring-gray-400',
};

const sizeStyles: Record<TouchButtonSize, string> = {
  sm: 'min-h-[40px] px-3 py-2 text-sm',
  md: 'min-h-[48px] px-4 py-3 text-base',
  lg: 'min-h-[56px] px-6 py-4 text-lg',
};

/**
 * Touch-optimized button with minimum 48px touch target.
 * Includes scale animation on press and proper focus states.
 */
export const TouchButton = forwardRef<HTMLButtonElement, TouchButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      icon,
      iconPosition = 'left',
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-2
      font-medium rounded-xl
      transition-all duration-150 ease-out
      focus:outline-none focus:ring-2 focus:ring-offset-2
      active:scale-[0.98]
      disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
      touch-manipulation
    `.trim().replace(/\s+/g, ' ');

    return (
      <button
        ref={ref}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `.trim().replace(/\s+/g, ' ')}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <LoadingSpinner />
            <span>Loading...</span>
          </>
        ) : (
          <>
            {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
            {children}
            {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
          </>
        )}
      </button>
    );
  }
);

TouchButton.displayName = 'TouchButton';

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
