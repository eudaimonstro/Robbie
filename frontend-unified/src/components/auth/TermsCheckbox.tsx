/** The agreement to the current terms. The links open the documents in a new tab. */
export function TermsCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I'm 13 or older and I agree to the{' '}
        <a href="/terms" target="_blank" rel="noreferrer" className="text-gavel underline">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="/privacy" target="_blank" rel="noreferrer" className="text-gavel underline">
          Privacy Policy
        </a>
      </span>
    </label>
  );
}
