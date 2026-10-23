// tests/visualizer-ar.test.js
//
// AR «Поставить у себя в комнате» (the owner, 2026-10-22): the button only
// where AR works, and while it is not pressed AR costs nothing -- no AR
// script, exporter or library is loaded with the page; everything comes in
// by import() on the tap. Plus the pure geometry the AR model is built
// with (visualizer/ar-geometry.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { arMode } = require('../visualizer/webgl-support.js');
const ArGeometry = require('../visualizer/ar-geometry.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('sayanmramor-calculator.html');
const AR_FILES = ['ar-view.js', 'ar-geometry.js', 'USDZExporter.js', 'fflate.module.js', 'TextureUtils.js'];

// ---- nothing of AR loads with the page ------------------------------------

const staticImports = src => [...src.matchAll(/^\s*import\s[^;]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1] || m[2]);

test('the page loads no AR file: no script, preload or link to one', () => {
  AR_FILES.forEach(f => assert.ok(!html.includes(f), f + ' is named in the page'));
});

test('three-scene.js imports AR only on demand (import()), never statically', () => {
  const src = read('visualizer/three-scene.js');
  staticImports(src).forEach(spec => AR_FILES.forEach(f => assert.ok(!spec.endsWith(f), 'static import of ' + spec)));
  assert.match(src, /import\(\s*'\.\/ar-view\.js'\s*\)/);
});

test('the AR view loads the USDZ exporter only for Quick Look, by import()', () => {
  const src = read('visualizer/ar-view.js');
  staticImports(src).forEach(spec => {
    ['USDZExporter.js', 'fflate.module.js', 'TextureUtils.js'].forEach(f => assert.ok(!spec.endsWith(f), 'static import of ' + spec));
  });
  assert.match(src, /import\(\s*'\.\.\/vendor\/three\/USDZExporter\.js'\s*\)/);
});

test('the render loop has no AR in it', () => {
  const src = read('visualizer/three-scene.js');
  const loop = src.slice(src.indexOf('function animate('), src.indexOf('animate();', src.indexOf('function animate(')));
  assert.ok(loop.length > 0);
  assert.doesNotMatch(loop, /ar|xr/i);
});

test('the AR button is hidden in the markup until AR is found', () => {
  const tag = html.match(/<button[^>]*id="viewerAr"[^>]*>/);
  assert.ok(tag, 'button #viewerAr');
  assert.match(tag[0], /\shidden[\s>]/);
});

test('in another browser on iPhone the button opens this product, every choice, in Safari; a note if it did not open', () => {
  assert.match(html, /'x-safari-' \+ productLink\(\)/);
  assert.match(html, /function productLink\(\) \{\s*return location\.origin \+ location\.pathname \+ '\?' \+ currentPassportQuery\(\);/);
  const note = html.match(/<div[^>]*id="viewerArNote"[^>]*>/);
  assert.ok(note && /\shidden[\s>]/.test(note[0]), 'the note is hidden until Safari did not open');
  assert.match(html, /id="viewerArCopy"/);
});

test('the AR texts use a plain dash, never the long one', () => {
  const ar = read('visualizer/ar-view.js');
  const strings = [...ar.matchAll(/'([^'\n]*[А-яЁё][^'\n]*)'/g)].map(m => m[1]);
  assert.ok(strings.length > 0);
  strings.forEach(s => assert.ok(!s.includes('—'), s));
  const block = html.slice(html.indexOf('id="viewerAr"'), html.indexOf('</div>', html.indexOf('id="viewerArNote"')));
  assert.ok(!block.includes('—'));
});

// ---- where AR is offered --------------------------------------------------

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

function fakeWin({ ua, platform = '', touch = 0, quickLook = false, xr, webkit }) {
  const calls = [];
  const nav = { userAgent: ua, platform, maxTouchPoints: touch };
  if (xr !== undefined) nav.xr = { isSessionSupported: mode => { calls.push(mode); return xr instanceof Error ? Promise.reject(xr) : Promise.resolve(xr); } };
  const document = { createElement: () => ({ relList: { supports: token => quickLook && token === 'ar' } }) };
  return { win: { navigator: nav, document, webkit }, calls };
}

test('iPhone Safari with AR Quick Look: quicklook', async () => {
  assert.equal(await arMode(fakeWin({ ua: IPHONE, quickLook: true }).win), 'quicklook');
});

test('iPad (desktop-class Safari, a touch screen): quicklook', async () => {
  assert.equal(await arMode(fakeWin({ ua: IPAD_DESKTOP, platform: 'MacIntel', touch: 5, quickLook: true }).win), 'quicklook');
});

test('a Mac, even if Safari says rel="ar" is supported: no AR', async () => {
  assert.equal(await arMode(fakeWin({ ua: IPAD_DESKTOP, platform: 'MacIntel', touch: 0, quickLook: true }).win), null);
});

// Quick Look opens a model made on the page only from Safari (the owner's
// iPhone, 2026-10-23: Chrome showed the button and nothing opened); in any
// other browser the button opens the same product in Safari.
test('another browser on iPhone (Chrome, Яндекс, Firefox, Edge, the Google app): open in Safari', async () => {
  const webkit = { messageHandlers: {} };
  const uas = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 YaBrowser/24.10.0.123 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/129.0 Mobile/15E148 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/335.0 Mobile/15E148 Safari/604.1',
  ];
  for (const ua of uas) {
    assert.equal(await arMode(fakeWin({ ua, quickLook: true, webkit }).win), 'safari', ua);
    assert.equal(await arMode(fakeWin({ ua, quickLook: true }).win), 'safari', ua);
  }
});

test('a web view inside an app on iPhone (Telegram...): open in Safari', async () => {
  const webkit = { messageHandlers: {} };
  assert.equal(await arMode(fakeWin({ ua: IPHONE.replace(' Safari/604.1', ''), quickLook: true, webkit }).win), 'safari');
  assert.equal(await arMode(fakeWin({ ua: IPHONE.replace(' Safari/604.1', ''), quickLook: false, webkit }).win), 'safari');
});

test('Safari itself without Quick Look (an old iOS): no AR', async () => {
  assert.equal(await arMode(fakeWin({ ua: IPHONE, quickLook: false }).win), null);
});

test('Android with WebXR immersive-ar: webxr', async () => {
  const { win, calls } = fakeWin({ ua: ANDROID, xr: true });
  assert.equal(await arMode(win), 'webxr');
  assert.deepEqual(calls, ['immersive-ar']);
});

test('Android without AR, without WebXR, or when the check fails: no AR', async () => {
  assert.equal(await arMode(fakeWin({ ua: ANDROID, xr: false }).win), null);
  assert.equal(await arMode(fakeWin({ ua: ANDROID }).win), null);
  assert.equal(await arMode(fakeWin({ ua: ANDROID, xr: new Error('blocked') }).win), null);
});

test('a desktop: no AR, and WebXR is not even asked', async () => {
  const { win, calls } = fakeWin({ ua: DESKTOP, xr: true });
  assert.equal(await arMode(win), null);
  assert.deepEqual(calls, []);
});

// ---- the AR model -----------------------------------------------------------

test('walls, panels and facade pieces hang on a wall; the rest stands on the floor or a surface', () => {
  assert.equal(ArGeometry.anchorFor('stena'), 'wall');
  assert.equal(ArGeometry.anchorFor('panno'), 'wall');
  ['stoleshnitsa_kuhnya', 'stoleshnitsa_vannaya', 'podokonnik', 'pol', 'lestnitsa', 'stupeni', 'kaminy'].forEach(k => assert.equal(ArGeometry.anchorFor(k), 'floor', k));
  // Every facade type: a column stands, the rest is on the wall.
  const FacadeModel = require('../facade-model.js');
  FacadeModel.FACADE_TYPES.forEach(t => {
    assert.equal(ArGeometry.anchorFor('fasad', { facade: { type: t.key } }), t.key === 'column' ? 'floor' : 'wall', t.key);
  });
});

test('Quick Look: a wall piece goes in face up (the wall anchor has Y out of the wall), the rest as it stands', () => {
  assert.equal(ArGeometry.quickLookTurnX('floor'), 0);
  const a = ArGeometry.quickLookTurnX('wall'), c = Math.cos(a), s = Math.sin(a);
  const turn = ([x, y, z]) => [x, y * c - z * s, y * s + z * c];   // about X, as three.js
  near(turn([0, 0, 1]), [0, 1, 0]);    // the front (+Z after placeFor) out of the wall
  near(turn([0, 1, 0]), [0, 0, -1]);   // the top
});

// The layout's front (the room side) is +X; in AR the front faces the
// viewer, +Z. A point of the layout, turned and moved as placeFor says.
function place(p, pl) {
  const c = Math.cos(pl.rotationY), s = Math.sin(pl.rotationY);
  return [p[0] * c + p[2] * s + pl.position[0], p[1] + pl.position[1], -p[0] * s + p[2] * c + pl.position[2]];
}
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, a + ' vs ' + b));

test('on a surface: the front faces the viewer, the bottom on the surface, centred', () => {
  const bounds = { min: [-0.3, 0.86, -1.2], max: [0.3, 0.9, 1.2] };   // a 2.4 m countertop at its height
  const pl = ArGeometry.placeFor(bounds, 'floor');
  near(place([1, 0, 0], { rotationY: pl.rotationY, position: [0, 0, 0] }), [0, 0, 1]);   // +X (front) -> +Z
  near(place([0.3, 0.86, 0], pl), [0, 0, 0.3]);       // bottom of the front edge: on the surface, in front
  near(place([0, 0.86, -1.2], pl), [1.2, 0, 0]);      // the viewer's right stays on the right
  near(place([0, 0.88, 0], pl), [0, 0.02, 0]);
});

test('on a wall: the back on the wall, centred on the point tapped', () => {
  const bounds = { min: [-0.02, 0, -1.2], max: [0, 2.7, 1.2] };   // a 2.4 x 2.7 m cladding, 20 mm thick
  const pl = ArGeometry.placeFor(bounds, 'wall');
  near(place([-0.02, 1.35, 0], pl), [0, 0, 0]);       // back face, centre -> the wall point
  near(place([0, 2.7, 1.2], pl), [-1.2, 1.35, 0.02]); // front face, the top corner on the viewer's left
});

test('a texture transform is baked into the UVs', () => {
  // three.js Matrix3 elements, column-major: repeat 2 x 3, offset 0.5, 0.25.
  const m = [2, 0, 0, 0, 3, 0, 0.5, 0.25, 1];
  assert.deepEqual([...ArGeometry.transformUvs(new Float32Array([0, 0, 1, 1]), m)], [0.5, 0.25, 2.5, 3.25]);
});

const NO = -1e5;
function triangles(positions) { return positions.length / 9; }
function area2d(pts) {   // pts: flat [x, y, ...] of one triangle
  return Math.abs((pts[2] - pts[0]) * (pts[5] - pts[1]) - (pts[4] - pts[0]) * (pts[3] - pts[1])) / 2;
}

test('tiles: a triangle across tile joints is cut so each piece lies in one tile', () => {
  // One triangle on the floor (y = 0) whose tile coordinates run over 0..2.5 x 0..2.5.
  const positions = new Float32Array([0, 0, 0, 2.5, 0, 0, 0, 0, 2.5]);
  const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const uvs = new Float32Array(6);
  const tiles = new Float32Array([0, 0, 2.5, 0, 0, 2.5]);
  const params = { cell: [0.4, 0.3], room: [0.6, 0.7], split: [1, 1] };
  const out = ArGeometry.cutByTiles(positions, normals, uvs, tiles, params);
  assert.ok(triangles(out.positions) > 1);
  assert.equal(out.uvs.length, out.positions.length / 3 * 2);
  assert.equal(out.normals.length, out.positions.length);
  let area = 0;
  for (let t = 0; t < triangles(out.positions); t++) {
    const p = out.positions.slice(t * 9, t * 9 + 9);
    // In this setup tile = (x, z): one cell per triangle.
    const xs = [p[0], p[3], p[6]], zs = [p[2], p[5], p[8]];
    const cell = [Math.floor((xs[0] + xs[1] + xs[2]) / 3), Math.floor((zs[0] + zs[1] + zs[2]) / 3)];
    xs.forEach(x => assert.ok(x >= cell[0] - 1e-6 && x <= cell[0] + 1 + 1e-6));
    zs.forEach(z => assert.ok(z >= cell[1] - 1e-6 && z <= cell[1] + 1 + 1e-6));
    // The shader's sampling: inside the tile, from its own region of the photo.
    const pick = ArGeometry.tilePick(cell);
    for (let v = 0; v < 3; v++) {
      const u = out.uvs.slice((t * 3 + v) * 2, (t * 3 + v) * 2 + 2);
      near([u[0], u[1]], [(xs[v] - cell[0]) * 0.4 + pick[0] * 0.6, (zs[v] - cell[1]) * 0.3 + pick[1] * 0.7]);
    }
    area += area2d([p[0], p[2], p[3], p[5], p[6], p[8]]);
    for (let v = 0; v < 3; v++) assert.deepEqual([...out.normals.slice(t * 9 + v * 3, t * 9 + v * 3 + 3)], [0, 1, 0]);
  }
  assert.ok(Math.abs(area - 2.5 * 2.5 / 2) < 1e-6, 'area ' + area);
});

test('tiles: panels split one way only; the other axis runs on', () => {
  const positions = new Float32Array([0, 0, 0, 0.5, 0, 0, 0, 0, 2.5]);
  const out = ArGeometry.cutByTiles(positions, new Float32Array(9), new Float32Array(6), new Float32Array([0, 0, 0.5, 0, 0, 2.5]),
    { cell: [0.5, 0.25], room: [1, 0.75], split: [0, 1] });
  assert.ok(triangles(out.positions) >= 3);
  for (let t = 0; t < triangles(out.positions); t++) {
    const p = out.positions.slice(t * 9, t * 9 + 9);
    const row = Math.floor((p[2] + p[5] + p[8]) / 3);
    const pick = ArGeometry.tilePick([0, row]);
    for (let v = 0; v < 3; v++) {
      // s (= x here) is not split: it runs on through every panel.
      const x = p[v * 3], z = p[v * 3 + 2];
      near([...out.uvs.slice((t * 3 + v) * 2, (t * 3 + v) * 2 + 2)], [x * 0.5 + pick[0], (z - row) * 0.25 + pick[1] * 0.75]);
    }
  }
});

test('faces outside the tiling keep their UVs and are not cut', () => {
  const positions = new Float32Array([0, 0, 0, 2.5, 0, 0, 0, 0, 2.5]);
  const uvs = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  const out = ArGeometry.cutByTiles(positions, new Float32Array(9), uvs, new Float32Array([NO, NO, NO, NO, NO, NO]), { cell: [1, 1], room: [0, 0], split: [1, 1] });
  assert.deepEqual([...out.positions], [...positions]);
  assert.deepEqual([...out.uvs], [...uvs]);
});

test('seams: each line becomes a thin bar around it, every side facing out', () => {
  const out = ArGeometry.seamBars(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]), 0.002);
  assert.equal(out.positions.length, 4 * 6 * 3, 'four sides of one bar; the zero-length segment is skipped');
  for (let i = 0; i < out.positions.length / 3; i++) {
    const [x, y, z] = out.positions.slice(i * 3, i * 3 + 3);
    const [nx, ny, nz] = out.normals.slice(i * 3, i * 3 + 3);
    assert.ok(x >= -1e-9 && x <= 1 + 1e-9);
    assert.ok(Math.hypot(y, z) <= 0.001 * Math.SQRT2 + 1e-9, 'within the bar');
    assert.ok(Math.abs(nx) < 1e-9, 'normal across the line');
    assert.ok(y * ny + z * nz > 0, 'faces out');
  }
  for (let t = 0; t < out.positions.length / 9; t++) {
    const p = out.positions.slice(t * 9, t * 9 + 9), n = out.normals.slice(t * 9, t * 9 + 3);
    const e1 = [p[3] - p[0], p[4] - p[1], p[5] - p[2]], e2 = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    assert.ok(c[0] * n[0] + c[1] * n[1] + c[2] * n[2] > 0, 'front face outward (counter-clockwise)');
  }
});
