import { Link } from 'react-router-dom';
import { ATTENDANCE_SETTINGS } from '../../utils/quorum';

/**
 * In place of Start or Join while the organization hasn't set its voting members and quorum:
 * the server won't open the meeting, so say why, with the way to set them for an admin
 */
export function QuorumNotSet({
  canSet,
  className = '',
}: {
  /** An admin, who sets them in Settings */
  canSet: boolean;
  className?: string;
}) {
  return (
    <p className={`text-sm text-caution-ink ${className}`}>
      This meeting can&apos;t open until the voting members and quorum are set.{' '}
      {canSet ? (
        <Link to={ATTENDANCE_SETTINGS} className="font-medium text-gavel hover:underline">
          Set them in Settings
        </Link>
      ) : (
        'An admin sets them in Settings.'
      )}
    </p>
  );
}
