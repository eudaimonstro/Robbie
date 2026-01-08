import { ReactNode } from 'react'

type BadgeVariant = 'draft' | 'proposed' | 'passed' | 'failed' | 'tabled' | 'withdrawn' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  draft: 'badge-draft',
  proposed: 'badge-proposed',
  passed: 'badge-passed',
  failed: 'badge-failed',
  tabled: 'badge-tabled',
  withdrawn: 'badge-withdrawn',
  default: 'badge bg-secondary-100 text-secondary-700 dark:bg-secondary-700 dark:text-secondary-200',
}

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const variant = ['draft', 'proposed', 'passed', 'failed', 'tabled', 'withdrawn'].includes(status)
    ? (status as BadgeVariant)
    : 'default'

  return (
    <Badge variant={variant}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

export function DocumentTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    bylaws: 'Bylaws',
    standing_rules: 'Standing Rules',
    policy: 'Policy',
  }

  return (
    <Badge variant="default">
      {labels[type] || type}
    </Badge>
  )
}

export function MeetingTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    regular: 'Regular',
    special: 'Special',
    annual: 'Annual',
    emergency: 'Emergency',
  }

  const colors: Record<string, string> = {
    regular: 'bg-secondary-100 text-secondary-700',
    special: 'bg-accent-100 text-accent-700',
    annual: 'bg-primary-100 text-primary-700',
    emergency: 'bg-danger-100 text-danger-700',
  }

  return (
    <span className={`badge ${colors[type] || colors.regular}`}>
      {labels[type] || type}
    </span>
  )
}
