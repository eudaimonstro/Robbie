import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="card p-12 text-center">
      <Icon className="w-12 h-12 text-ink-muted mx-auto mb-4" />
      <h3 className="text-lg font-medium text-ink mb-2">{title}</h3>
      <p className="text-ink-muted mb-4 max-w-md mx-auto">{description}</p>
      {action}
    </div>
  );
}
