'use client';



import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';

export type Mood = 'idle' | 'watch' | 'hide' | 'sad' | 'happy';

type Vendor = {
  key: string;
  x: number;
  headY: number;
  skin: string;
  top: string;
  peek?: boolean;
};

const INK = '#17142B';
const COUNTER_Y = 352;
const HAND = 36;

const VENDORS: Vendor[] = [
  { key: 'kirana', x: 78, headY: 214, skin: '#C68642', top: '#F6F1E7' },
  { key: 'pharmacist', x: 178, headY: 178, skin: '#F1C9A5', top: '#FFFFFF' },
  { key: 'baker', x: 276, headY: 206, skin: '#8D5524', top: '#E86F8E' },
  { key: 'fruit', x: 372, headY: 246, skin: '#E0AC69', top: '#5DB843', peek: true },
];

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** What each vendor wears. Drawn around the head centre (x, y). */
function Outfit({ v }: { v: Vendor }) {
  const { x, headY: y } = v;
  switch (v.key) {
    case 'kirana':
      return (
        <>
          <path d={`M${x - 35} ${y - 8}A35 35 0 0 1 ${x + 35} ${y - 8}Z`} fill="#FFB627" />
          <rect x={x + 6} y={y - 16} width="44" height="9" rx="4.5" fill="#E89B0C" />
        </>
      );
    case 'pharmacist':
      return (
        <>
          <circle cx={x} cy={y - 42} r="14" fill="#2B2233" />
          <path d={`M${x - 35} ${y - 4}A35 35 0 0 1 ${x + 35} ${y - 4}Q${x} ${y - 30} ${x - 35} ${y - 4}Z`} fill="#2B2233" />
        </>
      );
    case 'baker':
      return (
        <>
          <circle cx={x - 18} cy={y - 52} r="16" fill="#FFFFFF" />
          <circle cx={x + 18} cy={y - 52} r="16" fill="#FFFFFF" />
          <circle cx={x} cy={y - 62} r="19" fill="#FFFFFF" />
          <rect x={x - 28} y={y - 46} width="56" height="22" rx="5" fill="#FFFFFF" />
          <rect x={x - 28} y={y - 30} width="56" height="5" fill="#E4E7EE" />
        </>
      );
    default:
      return (
        <>
          <path d={`M${x - 35} ${y - 6}A35 35 0 0 1 ${x + 35} ${y - 6}Q${x} ${y - 22} ${x - 35} ${y - 6}Z`} fill="#F2643D" />
          <circle cx={x + 34} cy={y - 10} r="7" fill="#F2643D" />
          <circle cx={x + 42} cy={y - 2} r="5" fill="#F2643D" />
        </>
      );
  }
}

/** What each vendor's clothes look like below the head. */
function Clothes({ v }: { v: Vendor }) {
  const { x, headY: y } = v;
  switch (v.key) {
    case 'kirana':
      return (
        <>
          <rect x={x - 30} y={y + 62} width="60" height="120" rx="10" fill="#FFB627" />
          <path d={`M${x - 22} ${y + 64}L${x - 30} ${y + 34}M${x + 22} ${y + 64}L${x + 30} ${y + 34}`} stroke="#FFB627" strokeWidth="7" strokeLinecap="round" />
          <rect x={x - 14} y={y + 84} width="28" height="20" rx="5" fill="#E89B0C" />
        </>
      );
    case 'pharmacist':
      return (
        <>
          <path d={`M${x - 16} ${y + 32}L${x} ${y + 70}L${x + 16} ${y + 32}Z`} fill="#0B7A75" />
          <line x1={x} y1={y + 70} x2={x} y2={y + 190} stroke="#D9DEE8" strokeWidth="2" />
          <rect x={x + 16} y={y + 78} width="20" height="20" rx="5" fill="#0B7A75" />
          <path d={`M${x + 26} ${y + 82}v12M${x + 20} ${y + 88}h12`} stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case 'baker':
      return (
        <>
          <circle cx={x} cy={y + 62} r="4" fill="#FFFFFF" />
          <circle cx={x} cy={y + 84} r="4" fill="#FFFFFF" />
          <circle cx={x} cy={y + 106} r="4" fill="#FFFFFF" />
        </>
      );
    default:
      return (
        <>
          <rect x={x - 26} y={y + 60} width="52" height="100" rx="10" fill="#FFB627" />
          <rect x={x - 14} y={y + 74} width="28" height="16" rx="5" fill="#E89B0C" />
        </>
      );
  }
}

export default function Vendors({ mood, form }: { mood: Mood; form: RefObject<HTMLElement | null> }) {
  const svg = useRef<SVGSVGElement>(null);
  const moodRef = useRef(mood);
  const aimRef = useRef<() => void>(() => {});

  // Move every pupil towards the pointer, or towards the field being typed in.
  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const eyes = Array.from(root.querySelectorAll<SVGGElement>('.lg-eye'));
    let pointer: { x: number; y: number } | null = null;
    let raf = 0;

    const aim = () => {
      raf = 0;
      let target = pointer;
      if (moodRef.current !== 'idle') {
        const active = document.activeElement;
        const el = active instanceof HTMLElement && form.current?.contains(active) ? active : form.current;
        if (el) {
          const r = el.getBoundingClientRect();
          target = { x: r.left + Math.min(80, r.width / 2), y: r.top + r.height / 2 };
        }
      }
      const box = root.getBoundingClientRect();
      const scale = box.width / 440;
      for (const eye of eyes) {
        if (!target || !scale) {
          eye.style.transform = '';
          continue;
        }
        const cx = box.left + Number(eye.dataset.cx) * scale;
        const cy = box.top + Number(eye.dataset.cy) * scale;
        const dx = target.x - cx;
        const dy = target.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(4.5, dist / 50);
        eye.style.transform = `translate(${((dx / dist) * reach).toFixed(2)}px, ${((dy / dist) * reach).toFixed(2)}px)`;
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(aim);
    };
    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      schedule();
    };
    aimRef.current = schedule;
    window.addEventListener('pointermove', onMove);
    document.addEventListener('focusin', schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('focusin', schedule);
    };
  }, [form]);

  useEffect(() => {
    moodRef.current = mood;
    aimRef.current();
  }, [mood]);

  return (
    <svg ref={svg} className="lg-svg" viewBox="0 0 440 520" data-mood={mood} role="img" aria-label="Four shop vendors standing behind a market stall">
      {/* Awning */}
      <rect x="-4" y="30" width="448" height="18" rx="6" fill="#073F3D" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} fill={i % 2 ? '#FFFFFF' : '#0B7A75'}>
          <rect x={i * 55} y="48" width="55" height="46" />
          <circle cx={i * 55 + 27.5} cy="94" r="27.5" />
        </g>
      ))}

      {/* Vendors: drawn before the counter so they rise from behind it */}
      {VENDORS.map((v, i) => (
        <g key={v.key} className={`lg-v ${v.peek ? 'lg-peek' : ''}`} style={vars({ '--i': i })}>
          <g className="lg-body">
            <rect x={v.x - 48} y={v.headY + 24} width="96" height="230" rx="30" fill={v.top} />
            <Clothes v={v} />
            <g className="lg-head">
              <circle cx={v.x} cy={v.headY} r="35" fill={v.skin} />
              <Outfit v={v} />
              <circle cx={v.x - 20} cy={v.headY + 12} r="6" fill="#E23D3D" opacity="0.22" />
              <circle cx={v.x + 20} cy={v.headY + 12} r="6" fill="#E23D3D" opacity="0.22" />
              {[-12, 12].map((dx) => (
                <g key={dx} transform={`translate(${v.x + dx} ${v.headY + 2})`} className={dx > 0 ? 'lg-right' : 'lg-left'}>
                  <g className="lg-eye" data-cx={v.x + dx} data-cy={v.headY + 2}>
                    <circle className="lg-dot" r="4.4" fill={INK} />
                  </g>
                  <path className="lg-lid" d="M-6 2Q0 -6 6 2" fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round" />
                </g>
              ))}
              <g transform={`translate(${v.x} ${v.headY + 17})`} fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round">
                <path className="lg-mouth lg-smile" d="M-8 0Q0 8 8 0" />
                <path className="lg-mouth lg-frown" d="M-7 6Q0 -2 7 6" />
                <path className="lg-mouth lg-grin" d="M-10 -2Q0 13 10 -2Z" fill={INK} strokeLinejoin="round" />
                <circle className="lg-mouth lg-oh" r="3.6" fill={INK} stroke="none" />
              </g>
            </g>
          </g>
        </g>
      ))}

      {/* Counter */}
      <rect x="0" y={COUNTER_Y + 8} width="440" height="170" fill="#073F3D" />
      <rect x="-4" y={COUNTER_Y} width="448" height="16" rx="5" fill="#0B7A75" />
      {[88, 176, 264, 352].map((x) => (
        <line key={x} x1={x} y1={COUNTER_Y + 16} x2={x} y2="520" stroke="#0B5552" strokeWidth="2" />
      ))}
      <g transform="translate(132 412)">
        <rect width="176" height="56" rx="14" fill="#0B5552" />
        <circle cx="32" cy="28" r="15" fill="none" stroke="#FFB627" strokeWidth="3" strokeDasharray="6 4.6" strokeLinecap="round" />
        <circle cx="32" cy="28" r="6" fill="#FFFFFF" />
        <text x="58" y="35" fill="#FFFFFF" fontSize="21" fontWeight="800" style={{ fontFamily: 'var(--display)' }}>
          LocalRush
        </text>
      </g>

      {/* Hands rest on the counter, so they are drawn in front of it */}
      {VENDORS.map((v, i) =>
        [-1, 1].map((side) => {
          const eyeX = v.x + side * 12;
          const startX = v.x + side * HAND;
          const half = v.peek && side > 0;
          return (
            <circle
              key={v.key + side}
              className="lg-hand"
              cx={startX}
              cy={COUNTER_Y - 2}
              r="11.5"
              fill={v.skin}
              stroke="rgba(23,20,43,0.28)"
              strokeWidth="1.5"
              style={vars({
                '--i': i,
                '--hx': `${eyeX - startX}px`,
                '--hy': `${v.headY + (half ? 22 : 2) - (COUNTER_Y - 2)}px`,
                '--ux': `${side * 18}px`,
                '--uy': `${v.headY - 34 - (COUNTER_Y - 2)}px`,
              })}
            />
          );
        }),
      )}
    </svg>
  );
}
