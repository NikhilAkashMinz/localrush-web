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
export function roadKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  return crow(aLat, aLng, bLat, bLng) * 1.3;
}

/** Offset of b from a in km: x is east, z is south (matches the 3D scene's axes). */
export function offsetKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const x = rad(bLng - aLng) * R * Math.cos(rad((aLat + bLat) / 2));
  const z = -rad(bLat - aLat) * R;
  return { x, z };
}

export const RADIUS_KM = 5;
