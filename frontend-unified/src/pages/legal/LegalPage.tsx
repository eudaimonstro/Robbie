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
    <main className="min-h-screen bg-paper p-4 md:p-8">
      <article className="card max-w-2xl mx-auto p-6 md:p-8">
        <Link to="/" className="flex items-center gap-2 mb-6 text-gavel">
          <Scale className="w-6 h-6" aria-hidden="true" />
          <span className="font-heading font-bold">Robbie</span>
        </Link>
        <h1 className="page-title">{title}</h1>
        <p className="text-sm text-ink-muted mt-1">Version {TERMS_VERSION}</p>
        <p
          role="note"
          className="mt-4 rounded-md border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-caution-ink dark:border-accent-800 dark:bg-accent-900/20 dark:text-accent-400"
        >
          Draft, not yet reviewed by a lawyer.
        </p>
        <div className="mt-6 space-y-6 text-ink">{children}</div>
        <nav className="mt-8 pt-4 border-t border-rule flex gap-4 text-sm">
          <Link to="/terms" className="text-gavel hover:underline">
            Terms of Service
          </Link>
          <Link to="/privacy" className="text-gavel hover:underline">
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
      <h2 className="text-lg font-semibold text-ink">{heading}</h2>
      {children}
    </section>
  );
}

/** The contact address as a mail link */
export function ContactLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-gavel underline">
      {CONTACT_EMAIL}
    </a>
  );
}
