'use client';

import { PERIODS, type Period } from '@/lib/reports';

/** Today, last 7 days or all time, for the sales and earnings reports. */
export default function PeriodPicker({ value, onChange, label }: { value: Period; onChange: (p: Period) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          role="radio"
          aria-checked={value === p.key}
          className={value === p.key ? 'on' : ''}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
