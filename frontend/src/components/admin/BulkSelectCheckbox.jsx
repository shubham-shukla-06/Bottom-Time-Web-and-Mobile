import { useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';

/**
 * Styled checkbox used for both row-level and header-level (select-all) selection.
 *
 * Props:
 *   checked: boolean
 *   indeterminate: boolean (header only — shows minus icon when partial selection)
 *   onChange: () => void
 *   disabled?: boolean
 *   testid?: string
 *   ariaLabel?: string
 */
export function BulkSelectCheckbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  testid,
  ariaLabel = 'Select row',
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <label className={`inline-flex items-center justify-center w-5 h-5 relative ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={ariaLabel}
        data-testid={testid}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`w-5 h-5 rounded border transition-colors flex items-center justify-center
          ${checked || indeterminate
            ? 'bg-cyan-500 border-cyan-500 text-white'
            : 'bg-white border-slate-300 hover:border-cyan-400 peer-focus:ring-2 peer-focus:ring-cyan-100'}
        `}
      >
        {indeterminate ? <Minus size={12} strokeWidth={3} /> : checked ? <Check size={12} strokeWidth={3} /> : null}
      </span>
    </label>
  );
}
