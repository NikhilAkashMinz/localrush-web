const inr = new Intl.NumberFormat('en-IN');
export const rupee = (n: number) => '₹' + inr.format(Math.round(n));
export const km = (n: number) => (n < 1 ? `${Math.round(n * 100) * 10} m` : `${n.toFixed(1)} km`);
export const mins = (n: number) => `${Math.max(1, Math.round(n))} min`;

export function hourLabel(h: number) {
  const hh = ((h + 11) % 12) + 1;
  return `${hh} ${h % 24 < 12 ? 'am' : 'pm'}`;
}

export function when(ts: number) {
  const d = new Date(ts);
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}
