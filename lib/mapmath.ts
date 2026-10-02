// Web Mercator maths for the street map: the same projection every online map uses.
// "World pixels" are positions on one huge square image of the whole world at a zoom level.

export const TILE = 256;

const rad = (d: number) => (d * Math.PI) / 180;

/** Width of the whole world in pixels at this zoom. */
export const worldSize = (zoom: number) => TILE * 2 ** zoom;

/** Latitude and longitude to world pixels. */
export function project(lat: number, lng: number, zoom: number) {
  const size = worldSize(zoom);
  const phi = rad(Math.max(-85.0511, Math.min(85.0511, lat)));
  return {
    x: ((lng + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * size,
  };
}

/** World pixels back to latitude and longitude. */
export function unproject(x: number, y: number, zoom: number) {
  const size = worldSize(zoom);
  const n = Math.PI - (2 * Math.PI * y) / size;
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lng: (x / size) * 360 - 180,
  };
}

/** How many metres one screen pixel covers at this latitude and zoom. */
export const metresPerPixel = (lat: number, zoom: number) => (156543.03392 * Math.cos(rad(lat))) / 2 ** zoom;

export type TileRef = { key: string; z: number; x: number; y: number; left: number; top: number };

/** The map tiles needed to cover a viewport whose top-left corner is at (left, top) in world pixels. */
export function tilesFor(left: number, top: number, width: number, height: number, zoom: number): TileRef[] {
  const count = 2 ** zoom;
  const out: TileRef[] = [];
  const x0 = Math.floor(left / TILE);
  const x1 = Math.floor((left + width) / TILE);
  const y0 = Math.max(0, Math.floor(top / TILE));
  const y1 = Math.min(count - 1, Math.floor((top + height) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const x = ((tx % count) + count) % count; // wrap around the date line
      out.push({ key: `${zoom}/${tx}/${ty}`, z: zoom, x, y: ty, left: tx * TILE - left, top: ty * TILE - top });
    }
  }
  return out;
}
