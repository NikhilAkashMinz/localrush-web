// Distances, the same way the LocalRush server works them out (lib/geo.ts on the website).

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Straight-line distance in km. */
export function crow(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough road distance: city streets add about 30% to the straight line. */
export const roadKm = (aLat: number, aLng: number, bLat: number, bLng: number) => crow(aLat, aLng, bLat, bLng) * 1.3;

/** Directions in Google Maps from wherever the phone is, by two-wheeler. Opens the Maps app if it is installed. */
export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=two-wheeler`;
