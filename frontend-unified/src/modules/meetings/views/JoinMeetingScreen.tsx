import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash } from 'lucide-react';
import { MEETING_CODE_PATTERN } from '@robbie-bylawyer/shared/constants';
import { meetingPath, normalizeMeetingCode } from '../utils/meetingLinks';

interface JoinMeetingScreenProps {
  /** Why the visitor is here, such as a link to a meeting that doesn't exist */
  message?: string | null;
  /** The code to start with, such as the one that couldn't be joined */
  initialCode?: string;
}

/** The code box: join a live meeting by its code, as a guest or anyone without the schedule */
export function JoinMeetingScreen({ message = null, initialCode = '' }: JoinMeetingScreenProps) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [invalid, setInvalid] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeMeetingCode(code);
    if (!MEETING_CODE_PATTERN.test(normalized)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    navigate(meetingPath(normalized));
  };

  return (
    <section className="card p-6 self-start" aria-labelledby="join-heading">
      <h3 id="join-heading" className="card-title mb-1">
        Join with a code
      </h3>
      <p className="text-sm text-ink-muted mb-4">
        The code is on the screen in the room and in the meeting&apos;s link.
      </p>
      {message && (
        <p role="alert" className="mb-4 rounded-lg bg-caution-tint px-3 py-2 text-sm text-ink">
          {message}
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="meetingCode" className="label">
            Meeting code
          </label>
          <div className="relative">
            <Hash className="w-4 h-4 absolute left-3 top-3 text-ink-muted" aria-hidden="true" />
            <input
              id="meetingCode"
              className="input pl-9 uppercase meeting-code"
              autoComplete="off"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {invalid && (
            <p role="alert" className="mt-1 text-sm text-gavel">
              Meeting codes are 4 to 8 letters or digits
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary w-full">
          Join meeting
        </button>
      </form>
    </section>
  );
}
