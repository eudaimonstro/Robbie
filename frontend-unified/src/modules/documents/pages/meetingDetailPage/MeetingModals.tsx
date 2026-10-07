import { useState } from 'react';
import Modal from '../../../../components/ui/Modal';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog';
import { Meeting, Amendment, Document, VoteCreate } from '../../../../api/client';
import { fromLocalDateTimeInput, toLocalDateTimeInput } from '../../../../utils/dates';

interface EditMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    type: Meeting['meetingType'];
    date: string;
    location?: string;
    notes?: string;
  }) => Promise<void>;
  meeting: Meeting;
}

export function EditMeetingModal({ isOpen, onClose, onSubmit, meeting }: EditMeetingModalProps) {
  const [title, setTitle] = useState(meeting.title);
  const [type, setType] = useState<Meeting['meetingType']>(meeting.meetingType);
  const [date, setDate] = useState(toLocalDateTimeInput(meeting.scheduledDate));
  const [location, setLocation] = useState(meeting.location || '');
  const [notes, setNotes] = useState(meeting.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await onSubmit({
        title: title.trim(),
        type,
        date: fromLocalDateTimeInput(date),
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Meeting">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="label">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Meeting['meetingType'])}
              className="select"
            >
              <option value="regular">Regular</option>
              <option value="special">Special</option>
              <option value="annual">Annual</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <div>
            <label className="label">Date & Time</label>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
              required
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="label">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="input"
            placeholder="e.g., Conference Room A"
          />
        </div>
        <div className="mb-6">
          <label className="label">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="textarea h-24"
            placeholder="Meeting notes or agenda..."
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!title.trim() || saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface VoteRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: VoteCreate) => Promise<{ passed: boolean }>;
  amendments: Amendment[];
  documents: Document[];
  selectedAmendment: Amendment | null;
  onSelectAmendment: (amendment: Amendment | null) => void;
}

export function VoteRecordingModal({
  isOpen,
  onClose,
  onSubmit,
  amendments,
  documents,
  selectedAmendment,
  onSelectAmendment,
}: VoteRecordingModalProps) {
  const [yeaCount, setYeaCount] = useState(0);
  const [nayCount, setNayCount] = useState(0);
  const [abstainCount, setAbstainCount] = useState(0);
  const [recording, setRecording] = useState(false);

  const resetForm = () => {
    setYeaCount(0);
    setNayCount(0);
    setAbstainCount(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAmendment) return;

    try {
      setRecording(true);
      await onSubmit({
        amendmentId: selectedAmendment.id,
        yeaCount: yeaCount,
        nayCount: nayCount,
        abstainCount: abstainCount,
      });
      resetForm();
      onClose();
    } catch {
      // Error handled by parent
    } finally {
      setRecording(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onSelectAmendment(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Record Vote">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="label">Amendment</label>
          <select
            value={selectedAmendment?.id || ''}
            onChange={(e) => {
              const amend = amendments.find((a) => a.id === e.target.value);
              onSelectAmendment(amend || null);
            }}
            className="select"
            required
          >
            <option value="">Select amendment...</option>
            {amendments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>

        {selectedAmendment && (
          <div className="mb-4 p-3 bg-surface-2 rounded-lg">
            <p className="text-xs text-ink-muted mb-1">
              {documents.find((d) => d.id === selectedAmendment.documentId)?.title}
            </p>
            <p className="text-sm text-ink-muted">
              {selectedAmendment.description || 'No description'}
            </p>
            <p className="text-xs text-ink-muted mt-2">
              {selectedAmendment.changes?.length || 0} proposed change(s)
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="label text-carried">Yea</label>
            <input
              type="number"
              min="0"
              value={yeaCount}
              onChange={(e) => setYeaCount(parseInt(e.target.value) || 0)}
              className="input text-center text-lg font-bold"
            />
          </div>
          <div>
            <label className="label text-gavel">Nay</label>
            <input
              type="number"
              min="0"
              value={nayCount}
              onChange={(e) => setNayCount(parseInt(e.target.value) || 0)}
              className="input text-center text-lg font-bold"
            />
          </div>
          <div>
            <label className="label text-ink-muted">Abstain</label>
            <input
              type="number"
              min="0"
              value={abstainCount}
              onChange={(e) => setAbstainCount(parseInt(e.target.value) || 0)}
              className="input text-center text-lg font-bold"
            />
          </div>
        </div>

        <div className="mb-6 p-4 bg-surface-2 rounded-lg text-center">
          <p className="text-sm text-ink-muted mb-1">
            Total votes: {yeaCount + nayCount + abstainCount}
          </p>
          <p
            className={`text-2xl font-bold ${yeaCount > nayCount ? 'text-carried' : yeaCount < nayCount ? 'text-gavel' : 'text-ink-muted'}`}
          >
            {yeaCount > nayCount ? 'PASSING' : yeaCount < nayCount ? 'FAILING' : 'TIE'}
          </p>
          {yeaCount === nayCount && yeaCount > 0 && (
            <p className="text-xs text-ink-muted mt-1">
              Ties typically fail (simple majority required)
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!selectedAmendment || recording}>
            {recording ? 'Recording...' : 'Record Vote'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface MeetingStatusDialogsProps {
  startDialogOpen: boolean;
  completeDialogOpen: boolean;
  cancelDialogOpen: boolean;
  loading: boolean;
  onStartClose: () => void;
  onStartConfirm: () => void;
  onCompleteClose: () => void;
  onCompleteConfirm: () => void;
  onCancelClose: () => void;
  onCancelConfirm: () => void;
}

export function MeetingStatusDialogs({
  startDialogOpen,
  completeDialogOpen,
  cancelDialogOpen,
  loading,
  onStartClose,
  onStartConfirm,
  onCompleteClose,
  onCompleteConfirm,
  onCancelClose,
  onCancelConfirm,
}: MeetingStatusDialogsProps) {
  return (
    <>
      <ConfirmDialog
        isOpen={startDialogOpen}
        onClose={onStartClose}
        onConfirm={onStartConfirm}
        title="Start Meeting"
        message="Are you ready to start this meeting? You'll be able to record votes on proposed amendments."
        confirmText="Start Meeting"
        loading={loading}
      />

      <ConfirmDialog
        isOpen={completeDialogOpen}
        onClose={onCompleteClose}
        onConfirm={onCompleteConfirm}
        title="Complete Meeting"
        message="Are you sure you want to mark this meeting as completed? Make sure all votes have been recorded."
        confirmText="Complete Meeting"
        loading={loading}
      />

      <ConfirmDialog
        isOpen={cancelDialogOpen}
        onClose={onCancelClose}
        onConfirm={onCancelConfirm}
        title="Cancel Meeting"
        message="Are you sure you want to cancel this meeting? This action cannot be undone."
        confirmText="Cancel Meeting"
        variant="danger"
        loading={loading}
      />
    </>
  );
}
