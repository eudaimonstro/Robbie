import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, UserCircle } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { useToast } from '../../context/ToastContext';

/** The signed-in user's name, with Settings and sign-out */
export function UserMenu() {
  const { user, signOut, signOutEverywhere } = useSession();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  // A failed sign-out leaves the user signed in, so say so rather than failing silently
  const run = (action: () => Promise<void>) => {
    action().catch((err: unknown) =>
      showToast('error', err instanceof Error ? err.message : "Couldn't sign out. Try again."),
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-secondary-50 dark:hover:bg-secondary-700"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserCircle className="w-5 h-5 text-secondary-500" aria-hidden="true" />
        <span className="hidden sm:inline text-secondary-700 dark:text-secondary-200">
          {user.name}
        </span>
        <ChevronDown className="w-4 h-4 text-secondary-400" aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-1 w-56 bg-white dark:bg-secondary-800 border border-secondary-200 dark:border-secondary-700 rounded-lg shadow-lg z-20 py-1"
          >
            <p className="px-4 py-2 text-xs text-secondary-500 truncate">{user.email}</p>
            <Link
              role="menuitem"
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary-50 dark:hover:bg-secondary-700"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Settings
            </Link>
            <button
              role="menuitem"
              onClick={() => run(signOut)}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-secondary-50 dark:hover:bg-secondary-700"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
            <button
              role="menuitem"
              onClick={() => run(signOutEverywhere)}
              className="w-full px-4 py-2 text-sm text-left text-secondary-600 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-700"
            >
              Sign out on all devices
            </button>
          </div>
        </>
      )}
    </div>
  );
}
