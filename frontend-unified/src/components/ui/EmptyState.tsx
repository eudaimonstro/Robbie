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
      <Icon className="w-12 h-12 text-secondary-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-secondary-900 dark:text-white mb-2">{title}</h3>
      <p className="text-secondary-600 dark:text-secondary-400 mb-4 max-w-md mx-auto">
        {description}
      </p>
      {action}
    </div>
  );
}
