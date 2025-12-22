import { useState, useCallback } from 'react';
import { FlaskConical, X, User, Gavel, Settings, Loader2 } from 'lucide-react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface TestRoleSwitcherProps {
  meetingCode: string;
  email: string;
  currentRole: string;
}

type Role = 'member' | 'chair' | 'admin';

/**
 * A floating button/dialog for testing different roles in the DEMO meeting.
 * Only visible when meeting code is 'DEMO'.
 */
export function TestRoleSwitcher({ meetingCode, email, currentRole }: TestRoleSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show in DEMO meetings (case-insensitive check)
  if (!meetingCode || meetingCode.toUpperCase() !== 'DEMO') {
    return null;
  }

  const handleRoleChange = useCallback(async (newRole: Role) => {
    if (newRole === currentRole) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/test-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          meetingCode,
          role: newRole
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change role');
      }

      // Store new token if returned
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }

      // Reload page to apply new role
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
      setIsLoading(false);
    }
  }, [email, meetingCode, currentRole]);

  const roles: { id: Role; label: string; icon: typeof User; description: string }[] = [
    { id: 'member', label: 'Member', icon: User, description: 'Standard participant view' },
    { id: 'chair', label: 'Chair', icon: Gavel, description: 'Meeting chair controls' },
    { id: 'admin', label: 'Admin', icon: Settings, description: 'Full admin access' }
  ];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-full shadow-lg transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2"
        aria-label="Switch test role"
        title="Switch test role (DEMO mode)"
      >
        <FlaskConical size={24} />
      </button>

      {/* Dialog overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !isLoading && setIsOpen(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FlaskConical size={20} className="text-purple-600" />
                <h2 className="text-lg font-semibold text-gray-900">Test Mode</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                disabled={isLoading}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Switch your role to test different views. The page will reload after changing.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleRoleChange(role.id)}
                  disabled={isLoading}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                    currentRole === role.id
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`p-2 rounded-lg ${
                    currentRole === role.id ? 'bg-purple-200' : 'bg-gray-100'
                  }`}>
                    <role.icon size={18} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {role.label}
                      {currentRole === role.id && (
                        <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{role.description}</div>
                  </div>
                  {isLoading && (
                    <Loader2 size={18} className="animate-spin text-purple-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 text-center">
                This feature is only available in DEMO meetings with test auth enabled.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
