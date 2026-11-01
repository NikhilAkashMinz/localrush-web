// Numbers, distances and times as the partner reads them. Written out by hand rather than with
// toLocaleString, so they look the same on every phone.

/** Indian digit grouping: 1,25,000. */
function grouped(n: number) {
  const s = String(Math.abs(n));
  if (s.length <= 3) return (n < 0 ? '-' : '') + s;
  const last = s.slice(-3);
  let rest = s.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return (n < 0 ? '-' : '') + parts.join(',') + ',' + last;
}

export const rupee = (n: number) => '₹' + grouped(Math.round(n));

/** 450 m, 1.2 km */
export const km = (n: number) => (n < 1 ? `${Math.max(10, Math.round(n * 100) * 10)} m` : `${n.toFixed(1)} km`);

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** 3:42 pm, in the phone's own time zone. */
export function clockTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "Today", "Yesterday" or "12 Oct". */
export function dayLabel(ts: number, now = Date.now()) {
  const days = Math.round((dayStart(now) - dayStart(ts)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Today, 3:42 pm" */
export const when = (ts: number, now = Date.now()) => `${dayLabel(ts, now)}, ${clockTime(ts)}`;

/** "just now", "40 s ago", "3 min ago", "2 h ago" */
export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}

/** +91 91000 00001 */
export const phoneText = (p: string) => (/^\d{10}$/.test(p) ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : p);

/** The part of an address before the area, for a short line: "Room 214, Boys Hostel Block B". */
export function streetPart(address: string) {
  const i = address.lastIndexOf(', ');
  return i > 0 ? address.slice(0, i) : address;
}

/** The area at the end of an address: "PES University". */
export function areaPart(address: string) {
  const i = address.lastIndexOf(', ');
  return i > 0 ? address.slice(i + 2) : address;
}

export const itemCount = (lines: { qty: number }[]) => lines.reduce((a, l) => a + l.qty, 0);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
