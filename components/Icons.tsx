import { useId, type SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = (p: P) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const PinIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const CartIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 4h2.2l2.3 11h10.2l2-8H6.5" />
    <circle cx="9" cy="19" r="1.4" />
    <circle cx="17" cy="19" r="1.4" />
  </svg>
);
export const UserIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" />
  </svg>
);
export const ChevronIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const ArrowIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const MinusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const TargetIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);
export const BagIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 8h14l-1 12H6L5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);

/**
 * The LocalRush mark: the orange map pin with a shop in it, the logo without its words
 * (the whole logo is public/brand/localrush-logo-*.png). `size` is its height.
 */
export function Mark({ size = 34 }: { size?: number }) {
  // Each mark on a page needs its own ids for its colours and cut-out.
  const id = 'lr' + useId().replace(/[^\w-]/g, '');
  return (
    <svg className="mark" width={(size * 128) / 160} height={size} viewBox="0 0 128 160" aria-hidden>
      <defs>
        <linearGradient id={id + 'g'} x1="0.3" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#FF7B0A" />
          <stop offset="0.6" stopColor="#EE6C06" />
          <stop offset="1" stopColor="#C85B05" />
        </linearGradient>
        <mask id={id + 'm'}>
          <rect width="128" height="160" fill="#fff" />
          {[33, 49, 65, 81, 97].map((x) => (
            <circle key={x} cx={x} cy="49" r="14.5" fill="#000" />
          ))}
        </mask>
      </defs>
      <path d="M64 157.5Q62.2 157.5 61 155.4L17.3 101.2A61 61 0 1 1 110.7 101.2L67 155.4Q65.8 157.5 64 157.5Z" fill={`url(#${id}g)`} />
      <circle cx="64.5" cy="61" r="45" fill="#000" />
      <path
        d="M47.5 33H81.5Q85 33 86.6 36L97 55A10 10 0 0 1 81 55A10 10 0 0 1 65 55A10 10 0 0 1 49 55A10 10 0 0 1 33 55L42.4 36Q44 33 47.5 33Z"
        fill="#fff"
      />
      <path d="M41 60H89V87Q89 91 85 91H45Q41 91 41 87Z" fill="#fff" mask={`url(#${id}m)`} />
      <path d="M58 91V79Q58 76 61 76H69Q72 76 72 79V91Z" fill="#000" />
    </svg>
  );
}
