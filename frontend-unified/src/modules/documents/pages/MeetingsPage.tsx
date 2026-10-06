import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Plus, Clock, MapPin, ChevronRight } from 'lucide-react';
import { useOrganization } from '../../../context/OrganizationContext';
import { meetings as meetingsApi, Meeting, MeetingCreate } from '../../../api/client';
import { LoadingPage } from '../../../components/ui/LoadingSpinner';
import EmptyState from '../../../components/ui/EmptyState';
import { MeetingTypeBadge } from '../../../components/ui/Badge';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../context/ToastContext';
import { fromLocalDateTimeInput } from '../../../utils/dates';

export default function MeetingsPage() {
  const { currentOrganization } = useOrganization();
  const { showToast } = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create meeting modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<MeetingCreate['meetingType']>('regular');
  const [newDate, setNewDate] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchMeetings = async () => {
      if (!currentOrganization) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await meetingsApi.list(currentOrganization.id);
        setMeetings(
          data.sort(
            (a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
          ),
        );
      } catch {
        showToast('error', 'Failed to load meetings');
      } finally {
        setLoading(false);
      }
    };

    fetchMeetings();
  }, [currentOrganization, showToast]);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization || !newTitle.trim() || !newDate) return;

    try {
      setCreating(true);
      const data: MeetingCreate = {
        title: newTitle.trim(),
        meetingType: newType,
        scheduledDate: fromLocalDateTimeInput(newDate),
        location: newLocation.trim() || undefined,
      };
      const meeting = await meetingsApi.create(currentOrganization.id, data);
      setMeetings([meeting, ...meetings]);
      setCreateModalOpen(false);
      resetForm();
      showToast('success', 'Meeting created');
    } catch {
      showToast('error', 'Failed to create meeting');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewType('regular');
    setNewDate('');
    setNewLocation('');
  };

  const filteredMeetings =
    statusFilter === 'all' ? meetings : meetings.filter((m) => m.status === statusFilter);

  const statusLabels: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'text-primary-600';
      case 'in_progress':
        return 'text-accent-600';
      case 'completed':
        return 'text-success-600';
      case 'cancelled':
        return 'text-secondary-500';
      default:
        return 'text-secondary-600';
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (!currentOrganization) {
    return (
      <EmptyState
        icon={Calendar}
        title="No organization selected"
        description="Select an organization to view and manage meetings."
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
            Meeting Records
          </h2>
          <p className="text-secondary-600 dark:text-secondary-400 mt-1">
            Schedule and manage organization meetings
          </p>
        </div>
        <button onClick={() => setCreateModalOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Schedule Meeting
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-48">
            <label className="label">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Meetings list */}
      <div className="card">
        {filteredMeetings.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="w-10 h-10 text-secondary-400 mx-auto mb-3" />
            <p className="text-secondary-600 dark:text-secondary-400 mb-4">
              {meetings.length === 0
                ? 'No meetings scheduled yet'
                : 'No meetings match the selected filter'}
            </p>
            {meetings.length === 0 && (
              <button onClick={() => setCreateModalOpen(true)} className="btn-primary btn-sm">
                <Plus className="w-4 h-4 mr-1" />
                Schedule First Meeting
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-secondary-100 dark:divide-secondary-700">
            {filteredMeetings.map((meeting) => (
              <Link
                key={meeting.id}
                to={`/bylawyer-meetings/${meeting.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-medium text-secondary-900 dark:text-white">
                      {meeting.title}
                    </h4>
                    <MeetingTypeBadge type={meeting.meetingType} />
                    <span className={`text-sm font-medium ${getStatusColor(meeting.status)}`}>
                      {statusLabels[meeting.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-secondary-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(meeting.scheduledDate).toLocaleString()}
                    </span>
                    {meeting.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {meeting.location}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-secondary-400 group-hover:text-primary-600 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Meeting Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          resetForm();
        }}
        title="Schedule Meeting"
      >
        <form onSubmit={handleCreateMeeting}>
          <div className="mb-4">
            <label htmlFor="meetingTitle" className="label">
              Meeting Title
            </label>
            <input
              type="text"
              id="meetingTitle"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="input"
              placeholder="e.g., Regular Board Meeting"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="meetingType" className="label">
                Meeting Type
              </label>
              <select
                id="meetingType"
                value={newType}
                onChange={(e) => setNewType(e.target.value as MeetingCreate['meetingType'])}
                className="select"
              >
                <option value="regular">Regular</option>
                <option value="special">Special</option>
                <option value="annual">Annual</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div>
              <label htmlFor="meetingDate" className="label">
                Date & Time
              </label>
              <input
                type="datetime-local"
                id="meetingDate"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="meetingLocation" className="label">
              Location (optional)
            </label>
            <input
              type="text"
              id="meetingLocation"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              className="input"
              placeholder="e.g., Community Center Room 101"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setCreateModalOpen(false);
                resetForm();
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!newTitle.trim() || !newDate || creating}
            >
              {creating ? 'Creating...' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
