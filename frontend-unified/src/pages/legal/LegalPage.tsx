import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { TERMS_VERSION } from '@robbie-bylawyer/shared/constants';

/** Where to write about an account or its data. The owner confirms the mailbox before launch. */
export const CONTACT_EMAIL = 'privacy@robbie.scouch.dev';

/**
 * A public page for one of the documents users accept. Each change to either document replaces
 * this draft and bumps TERMS_VERSION, so everyone accepts again.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-secondary-50 dark:bg-secondary-900 p-4 md:p-8">
      <article className="card max-w-2xl mx-auto p-6 md:p-8">
        <Link to="/" className="flex items-center gap-2 mb-6 text-primary-600">
          <Scale className="w-6 h-6" aria-hidden="true" />
          <span className="font-heading font-bold">Robbie</span>
        </Link>
        <h1 className="text-2xl font-heading font-bold text-secondary-900 dark:text-white">
          {title}
        </h1>
        <p className="text-sm text-secondary-500 mt-1">Version {TERMS_VERSION}</p>
        <p
          role="note"
          className="mt-4 rounded-md border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700 dark:border-accent-800 dark:bg-accent-900/20 dark:text-accent-400"
        >
          Draft, not yet reviewed by a lawyer.
        </p>
        <div className="mt-6 space-y-6 text-secondary-700 dark:text-secondary-300">{children}</div>
        <nav className="mt-8 pt-4 border-t border-secondary-200 dark:border-secondary-700 flex gap-4 text-sm">
          <Link to="/terms" className="text-primary-600 hover:underline">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-primary-600 hover:underline">
            Privacy Policy
          </Link>
        </nav>
      </article>
    </main>
  );
}

/** One titled part of a legal page */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">{heading}</h2>
      {children}
    </section>
  );
}

/** The contact address as a mail link */
export function ContactLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary-600 underline">
      {CONTACT_EMAIL}
    </a>
  );
}
