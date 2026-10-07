import { useId } from 'react';
import { Gavel } from 'lucide-react';
import { PresenceBadge, RoleBadge, StatusBadge } from '../components/ui/Badge';

/** The design tokens (docs/design-brief.md), each as its background utility */
const TOKENS = [
  { name: 'paper', swatch: 'bg-paper', use: 'Page background' },
  { name: 'surface', swatch: 'bg-surface', use: 'Cards, panels' },
  { name: 'surface-2', swatch: 'bg-surface-2', use: 'Sidebar, inset areas' },
  { name: 'ink', swatch: 'bg-ink', use: 'Text' },
  { name: 'ink-muted', swatch: 'bg-ink-muted', use: 'Secondary text, labels' },
  { name: 'rule', swatch: 'bg-rule', use: 'Borders, dividers' },
  { name: 'gavel', swatch: 'bg-gavel', use: 'Actions, the current item, focus rings' },
  { name: 'gavel-tint', swatch: 'bg-gavel-tint', use: 'Selected and hover backgrounds' },
  { name: 'carried', swatch: 'bg-carried', use: 'Carried, elected, present, connected' },
  { name: 'carried-tint', swatch: 'bg-carried-tint', use: 'Behind carried' },
  { name: 'caution', swatch: 'bg-caution', use: 'No quorum, time running out' },
  { name: 'caution-tint', swatch: 'bg-caution-tint', use: 'Behind caution' },
  { name: 'caution-ink', swatch: 'bg-caution-ink', use: 'Caution as text' },
];

/** One full sample of the language: type, colors, buttons, badges, a form field */
function Specimen() {
  const headcountId = useId();
  return (
    <>
      <div className="space-y-2">
        <p className="label-caps">Type</p>
        <p className="font-serif-soft text-question font-semibold text-ink">Resurface the pool</p>
        <p className="card-title">Treasurer&apos;s report</p>
        <p className="text-ink">Public Sans for forms, tables, labels and everything else.</p>
        <p className="text-sm text-ink-muted">Moved by Alice Brennan, seconded by Ben Whitaker</p>
        <p className="meeting-code text-2xl text-ink">MAPLE1</p>
      </div>

      <div className="space-y-2">
        <p className="label-caps">Colors</p>
        <ul className="grid grid-cols-2 gap-3">
          {TOKENS.map((token) => (
            <li key={token.name} className="flex items-center gap-3">
              <span
                className={`h-10 w-10 shrink-0 rounded-lg border border-rule ${token.swatch}`}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{token.name}</span>
                <span className="block text-xs text-ink-muted">{token.use}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="label-caps">Buttons</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary">
            Call to order
          </button>
          <button type="button" className="btn-secondary">
            Open the vote
          </button>
          <button type="button" className="btn-ghost">
            Mark present
          </button>
          <button type="button" className="btn-primary" disabled>
            Second
          </button>
        </div>
        <button type="button" className="btn-primary btn-lg w-full">
          <Gavel className="w-5 h-5" aria-hidden="true" />
          Yea
        </button>
      </div>

      <div className="space-y-2">
        <p className="label-caps">Badges</p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="draft" />
          <StatusBadge status="proposed" />
          <StatusBadge status="passed" />
          <StatusBadge status="failed" />
          <RoleBadge role="chair" />
          <RoleBadge role="admin" />
          <RoleBadge role="member" />
          <RoleBadge role="guest" />
          <PresenceBadge presence="present" />
          <PresenceBadge presence="marked" />
          <PresenceBadge presence="absent" />
        </div>
      </div>

      <div>
        <label htmlFor={headcountId} className="label">
          Headcount
        </label>
        <input id={headcountId} className="input" inputMode="numeric" defaultValue="3" />
      </div>
    </>
  );
}

/**
 * The style guide: the tokens and components every screen is built from, in the palette the app
 * is in and in the evening palette (a .dark panel, as the display view is)
 */
export default function StyleGuidePage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="page-title">Style guide</h2>
        <p className="text-ink-muted mt-1">
          The clerk&apos;s ledger: paper, ink and the gavel (docs/design-brief.md).
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="this-palette" className="card p-6 space-y-6">
          <h3 id="this-palette" className="card-title">
            This palette
          </h3>
          <Specimen />
        </section>
        <section
          aria-labelledby="evening-session"
          className="dark card p-6 space-y-6 bg-surface text-ink"
        >
          <h3 id="evening-session" className="card-title">
            Evening session
          </h3>
          <Specimen />
        </section>
      </div>
    </div>
  );
}
