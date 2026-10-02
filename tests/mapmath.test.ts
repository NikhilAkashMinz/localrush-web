// Unit tests for the street map maths. Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { metresPerPixel, project, tilesFor, unproject, worldSize } from '../lib/mapmath';

const near = (a: number, b: number, tolerance: number) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is within ${tolerance} of ${b}`);

test('the middle of the world is the middle of the map', () => {
  const p = project(0, 0, 0);
  near(p.x, 128, 1e-9);
  near(p.y, 128, 1e-9);
  assert.equal(worldSize(3), 2048);
});

test('PES University falls on the expected map tile at zoom 14', () => {
  const p = project(12.9345, 77.5345, 14);
  assert.equal(Math.floor(p.x / 256), 11720);
  assert.equal(Math.floor(p.y / 256), 7598);
});

test('projecting and unprojecting returns the same place', () => {
  for (const zoom of [11, 13, 16]) {
    const p = project(12.9345, 77.5345, zoom);
    const back = unproject(p.x, p.y, zoom);
    near(back.lat, 12.9345, 1e-9);
    near(back.lng, 77.5345, 1e-9);
  }
});

test('north is up and east is right', () => {
  const here = project(12.9345, 77.5345, 13);
  assert.ok(project(13.0, 77.5345, 13).y < here.y);
  assert.ok(project(12.9345, 77.6, 13).x > here.x);
});

test('each zoom level halves the ground covered by a pixel', () => {
  near(metresPerPixel(12.9345, 13) / metresPerPixel(12.9345, 14), 2, 1e-9);
  // About 18.6 m per pixel in Bengaluru at zoom 13.
  near(metresPerPixel(12.9345, 13), 18.6, 0.2);
});

test('the tiles returned cover the whole viewport without gaps', () => {
  const centre = project(12.9345, 77.5345, 13);
  const width = 700;
  const height = 500;
  const tiles = tilesFor(centre.x - width / 2, centre.y - height / 2, width, height, 13);
  assert.ok(Math.min(...tiles.map((t) => t.left)) <= 0);
  assert.ok(Math.min(...tiles.map((t) => t.top)) <= 0);
  assert.ok(Math.max(...tiles.map((t) => t.left + 256)) >= width);
  assert.ok(Math.max(...tiles.map((t) => t.top + 256)) >= height);
  assert.equal(new Set(tiles.map((t) => t.key)).size, tiles.length);
});
