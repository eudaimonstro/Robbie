import { ReactNode } from 'react';
import type { MeetingRole } from '@robbie-bylawyer/shared/types';

type BadgeVariant =
  | 'draft'
  | 'proposed'
  | 'passed'
  | 'failed'
  | 'tabled'
  | 'withdrawn'
  | MeetingRole
  | Presence
  | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

// The badge utilities in styles/index.css: the label style in a tint
const variantClasses: Record<BadgeVariant, string> = {
  draft: 'badge-draft',
  proposed: 'badge-proposed',
  passed: 'badge-passed',
  failed: 'badge-failed',
  tabled: 'badge-tabled',
  withdrawn: 'badge-withdrawn',
  chair: 'badge-chair',
  admin: 'badge-admin',
  member: 'badge-member',
  guest: 'badge-guest',
  present: 'badge-present',
  marked: 'badge-marked',
  absent: 'badge-absent',
  default: 'badge',
};

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return <span className={`${variantClasses[variant]} ${className}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant = ['draft', 'proposed', 'passed', 'failed', 'tabled', 'withdrawn'].includes(status)
    ? (status as BadgeVariant)
    : 'default';

  return <Badge variant={variant}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

export function DocumentTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    bylaws: 'Bylaws',
    standing_rules: 'Standing rules',
    policy: 'Policy',
  };

  return <Badge variant="default">{labels[type] || type}</Badge>;
}

export function MeetingTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    regular: 'Regular',
    special: 'Special',
    annual: 'Annual',
    emergency: 'Emergency',
  };
  const variants: Record<string, BadgeVariant> = {
    regular: 'default',
    special: 'proposed',
    annual: 'tabled',
    emergency: 'chair',
  };

  return <Badge variant={variants[type] ?? 'default'}>{labels[type] || type}</Badge>;
}

const ROLE_LABELS: Record<MeetingRole, string> = {
  chair: 'Chair',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
};

/** A person's role in a live meeting */
export function RoleBadge({ role }: { role: MeetingRole }) {
  return <Badge variant={role}>{ROLE_LABELS[role]}</Badge>;
}

/** How someone is in the room: on a device, marked present by the chair, or absent */
export type Presence = 'present' | 'marked' | 'absent';

const PRESENCE_LABELS: Record<Presence, string> = {
  present: 'Present',
  marked: 'Marked present',
  absent: 'Absent',
};

export function PresenceBadge({ presence }: { presence: Presence }) {
  return <Badge variant={presence}>{PRESENCE_LABELS[presence]}</Badge>;
}

const MINUTES_STATUS: Record<'draft' | 'published' | 'approved', [string, string]> = {
  draft: ['badge-draft', 'Draft'],
  published: ['badge-proposed', 'Published'],
  approved: ['badge-passed', 'Approved'],
};

/** A meeting's minutes: the secretary's draft, published for the members, or approved */
export function MinutesStatusBadge({ status }: { status: 'draft' | 'published' | 'approved' }) {
  const [className, label] = MINUTES_STATUS[status];
  return <span className={className}>{label}</span>;
}
