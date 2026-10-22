// tests/visualizer-edge-profile.test.js
//
// The stone solid with its real edge profile (visualizer/edge-profile.js):
// exact plan size, the profile only on open edges, a closed surface (its
// volume is the same from any origin) wound outward, and the volume the
// profile's cross-section says it removes.
const test = require('node:test');
const assert = require('node:assert/strict');
const EdgeProfile = require('../visualizer/edge-profile.js');

// Ear clipping for a simple polygon without holes ({x, y} points).
function triangulate(contour) {
  const pts = contour;
  const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y; }, 0);
  const idx = pts.map((_, i) => i);
  if (area < 0) idx.reverse();
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inside = (p, a, b, c) => cross(a, b, p) > 1e-12 && cross(b, c, p) > 1e-12 && cross(c, a, p) > 1e-12;
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i - 1 + idx.length) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(pts[a], pts[b], pts[c]) <= 1e-15) continue;
      if (idx.some(k => k !== a && k !== b && k !== c && inside(pts[k], pts[a], pts[b], pts[c]))) continue;
      tris.push([a, b, c]);
      idx.splice(i, 1);
      break;
    }
  }
  if (idx.length === 3) tris.push(idx.slice());
  return tris;
}

function solid(part) {
  return EdgeProfile.buildSolid(part, { triangulate });
}

function volume({ positions }, origin) {
  let v = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const a = [positions[i] - origin[0], positions[i + 1] - origin[1], positions[i + 2] - origin[2]];
    const b = [positions[i + 3] - origin[0], positions[i + 4] - origin[1], positions[i + 5] - origin[2]];
    const c = [positions[i + 6] - origin[0], positions[i + 7] - origin[1], positions[i + 8] - origin[2]];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}

function closedVolume(mesh) {
  const v1 = volume(mesh, [0, 0, 0]), v2 = volume(mesh, [3, -2, 5]);
  assert.ok(Math.abs(v1 - v2) < 1e-7, 'closed surface: ' + v1 + ' vs ' + v2);
  return v1;
}

// Cross-section the profile removes at one edge: integral of s dy, and of s^2 dy.
function removed(prof) {
  let a = 0, a2 = 0;
  for (let j = 0; j + 1 < prof.points.length; j++) {
    const p = prof.points[j], q = prof.points[j + 1], dy = p.y - q.y;
    a += dy * (p.s + q.s) / 2;
    a2 += dy * (p.s * p.s + p.s * q.s + q.s * q.s) / 3;
  }
  return { a, a2 };
}

const W = 0.6, L = 2, T = 0.04;
const rect = [[-W / 2, -L / 2], [W / 2, -L / 2], [W / 2, L / 2], [-W / 2, L / 2]];
const base = { outline: rect, holes: [], y0: -T / 2, y1: T / 2 };

test('every edge a straight cut: exactly the plan box', () => {
  const mesh = solid(Object.assign({}, base, { edge: 'rounding', closed: [0, 1, 2, 3] }));
  assert.ok(Math.abs(closedVolume(mesh) - W * L * T) < 1e-7);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    assert.ok(Math.abs(mesh.positions[i]) <= W / 2 + 1e-6 && Math.abs(mesh.positions[i + 2]) <= L / 2 + 1e-6);
  }
});

test('the profile goes into the stone: the slab is never bigger than its plan', () => {
  ['straight', 'rounding', 'bevel', 'figured', 'stone-wrap', 'apron', null].forEach(edge => {
    const mesh = solid(Object.assign({}, base, { edge }));
    let maxX = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) maxX = Math.max(maxX, mesh.positions[i]);
    assert.ok(Math.abs(maxX - W / 2) < 1e-6, String(edge) + ': ' + maxX);
  });
});

test('normals are unit length and the surface is wound outward', () => {
  ['rounding', 'figured'].forEach(edge => {
    const mesh = solid(Object.assign({}, base, { edge, closed: [3] }));
    for (let i = 0; i < mesh.normals.length; i += 3) {
      assert.ok(Math.abs(Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]) - 1) < 1e-6);
    }
    assert.ok(closedVolume(mesh) > 0, edge);
  });
});

test('one open edge between two straight cuts: the profile runs the full length, nothing else is cut', () => {
  ['rounding', 'bevel', 'figured', 'stone-wrap'].forEach(edge => {
    const mesh = solid(Object.assign({}, base, { edge, closed: [0, 2, 3] }));
    const { a } = removed(mesh.profile);
    assert.ok(a > 0, edge);
    assert.ok(Math.abs(closedVolume(mesh) - (W * L * T - a * L)) < 1e-7, edge);
  });
});

test('rounding: the rim sits the radius inside an open edge and on the outline of a closed one', () => {
  const mesh = solid(Object.assign({}, base, { edge: 'rounding', closed: [3] }));
  const top = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (Math.abs(mesh.positions[i + 1] - T / 2) < 1e-6 && mesh.normals[i + 1] > 0.999) top.push(mesh.positions[i]);
  }
  assert.ok(Math.abs(Math.max(...top) - (W / 2 - 0.012)) < 1e-6, 'room side');
  assert.ok(Math.abs(Math.min(...top) + W / 2) < 1e-6, 'wall side');
});

test('the rounding is smooth: no crease where it meets the top or the face', () => {
  const prof = EdgeProfile.profile('rounding', -T / 2, T / 2);
  assert.deepEqual([prof.points[0].o, prof.points[0].u], [0, 1]);
  const last = prof.points.findIndex(p => p.s === 0);
  assert.ok(Math.abs(prof.points[last].o - 1) < 1e-12 && Math.abs(prof.points[last].u) < 1e-12);
  const figured = EdgeProfile.profile('figured', -T / 2, T / 2);
  assert.ok(figured.points[0].u < 0.99, 'the figured edge keeps its facets');
});

// An L countertop's main run: its room-side edge is open up to the wing and
// a joint behind the wing (two edges in line). The profile turns the inside
// corner along the wing's front and meets the joint.
test('inside corner at a wing: the profile turns along the wing front and closes on the joint', () => {
  const z0 = 0.4;
  const outline = [[-W / 2, -L / 2], [W / 2, -L / 2], [W / 2, z0], [W / 2, L / 2], [-W / 2, L / 2]];
  const mesh = solid({ outline, holes: [], y0: -T / 2, y1: T / 2, edge: 'rounding', closed: [0, 2, 3, 4] });
  const { a, a2 } = removed(mesh.profile);
  const expected = W * L * T - a * (z0 + L / 2) - a2;
  assert.ok(Math.abs(closedVolume(mesh) - expected) < 1e-7, closedVolume(mesh) + ' vs ' + expected);
  // The top rim turns at the mitre and meets the joint on the wing's rim line.
  const r = 0.012;
  const at = (x, z) => {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (Math.abs(mesh.positions[i] - x) < 1e-6 && Math.abs(mesh.positions[i + 1] - T / 2) < 1e-6 && Math.abs(mesh.positions[i + 2] - z) < 1e-6) return true;
    }
    return false;
  };
  assert.ok(at(W / 2 - r, z0 + r), 'mitre');
  assert.ok(at(W / 2, z0 + r), 'joint');
});

test('a gently turning outline is one smooth surface; a square corner stays crisp', () => {
  const pts = [];
  for (let i = 0; i < 16; i++) pts.push([Math.cos(i / 16 * Math.PI * 2) * 0.3, Math.sin(i / 16 * Math.PI * 2) * 0.3]);
  const disc = solid({ outline: pts, holes: [], y0: -T / 2, y1: T / 2, edge: 'rounding' });
  assert.ok(closedVolume(disc) > 0);
  // Every side vertex's normal points straight away from the centre.
  for (let i = 0; i < disc.positions.length; i += 3) {
    const x = disc.positions[i], z = disc.positions[i + 2], nx = disc.normals[i], nz = disc.normals[i + 2];
    const h = Math.hypot(nx, nz);
    if (h < 0.5) continue;
    assert.ok(Math.abs((x * nz - z * nx) / Math.hypot(x, z) / h) < 1e-5, 'radial normal');
  }
  // A rectangle's faces stay flat right up to their corners.
  const slab = solid(Object.assign({}, base, { edge: 'rounding' }));
  for (let i = 0; i < slab.normals.length; i += 3) {
    const nx = Math.abs(slab.normals[i]), nz = Math.abs(slab.normals[i + 2]);
    assert.ok(nx < 1e-6 || nz < 1e-6, 'square corner normal ' + nx + ', ' + nz);
  }
});
