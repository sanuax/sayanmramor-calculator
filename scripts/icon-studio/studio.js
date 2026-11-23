// scripts/icon-studio/studio.js
//
// Офлайн-студия для картинок карточек «Тип изделия» (концепт, ветка icons-concept).
// Не подключена к калькулятору и к сайту: открывается только скриптом render.py.
//
// Как получается «студийный» свет без рендер-фермы: сцена рендерится сотни раз,
// и каждый кадр получает свои направления света, выбранные из трёх источников:
//   • ключевой софтбокс слева-спереди-сверху (диск углового радиуса ~20°): мягкая тень;
//   • небесный купол (косинусная выборка по полусфере): контактные тени и AO
//     во всех стыках, без отдельного SSAO;
//   • длинный стрип сзади-сверху: тихий блик на верхней плоскости и рёбрах.
// Кадры складываются в float-буфер, с субпиксельным сдвигом камеры (идеальное сглаживание),
// затем PBR Neutral тонмаппинг и sRGB. Результат детерминирован (последовательности Халтона).
//
// Правила серии (одни на все десять изделий) собраны в RULES ниже.
import * as THREE from '../../vendor/three/three.module.js';

const q = new URLSearchParams(location.search);
const W = +q.get('w') || 2400;
const H = +q.get('h') || 1600;
const FRAMES = +q.get('frames') || 512;
const PRODUCT = q.get('product') || 'kitchen';
const STONE = q.get('stone') || 'calacatta-aella';
// plaster = А «Камень на гипсе» (по умолчанию), drawing = В «Чертёж и материал» (контекст линиями); Б «Свет из проёма» — только правила света/камеры (--rules)
const CONCEPT = q.get('concept') || 'plaster';

// ---- правила серии ----
const RULES = {
  camera: { vfovDeg: 12, elevationDeg: 21, azimuthDeg: 22, fill: 0.70 }, // ≈ 115 мм экв., 3/4 справа
  key:    { azimuthDeg: -68, elevationDeg: 56, radiusDeg: 20, color: 0xfff8f1, intensity: 2.8 },
  fill:   { azimuthDeg: 30, elevationDeg: 22, radiusDeg: 30, color: 0xf6f7f8, intensity: 1.25 }, // «отражатель» со стороны камеры
  dome:   { color: 0xf3f4f6, intensity: 1.15 },
  rim:    { azimuthDeg: 180, elevationDeg: 28, spreadDeg: 50, color: 0xffffff, intensity: 0.3 },
  floor:  0xe9e9e7,          // бесшовный «циклорама»-пол; горизонт в кадр не попадает
  plaster: 0xf4f2ee,         // всё, что не изделие (опоры, стены), — матовый гипс без деталей
  exposure: 1.0,
  stoneGrade: 'saturate(0.8) contrast(0.8) brightness(0.98)', // камень читается, но не шумит
};

// Подбор правил без правки файла: ?rules={"key":{"intensity":0}}
if (q.get('rules')) for (const [k, v] of Object.entries(JSON.parse(q.get('rules')))) RULES[k] = typeof v === 'object' ? { ...RULES[k], ...v } : v;

const rad = THREE.MathUtils.degToRad;
const dirFrom = (azDeg, elDeg) => new THREE.Vector3(
  Math.sin(rad(azDeg)) * Math.cos(rad(elDeg)), Math.sin(rad(elDeg)), Math.cos(rad(azDeg)) * Math.cos(rad(elDeg)));

function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

// ---- renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // тонмаппинг и sRGB — в финальном проходе
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(RULES.floor);

// ---- окружение только для отражений металла и стекла ----
function buildEnv() {
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 vP; void main(){
      float h = normalize(vP).y;
      vec3 floorC = vec3(0.30, 0.295, 0.29);
      vec3 skyC = mix(vec3(0.42, 0.42, 0.42), vec3(0.22, 0.22, 0.23), smoothstep(0.0, 0.8, h));
      gl_FragColor = vec4(h < 0.0 ? mix(floorC, vec3(0.14,0.14,0.14), smoothstep(0.0,-0.6,h)) : skyC, 1.); }`,
  }));
  s.add(sky);
  const panel = (az, el, w, h, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.copy(dirFrom(az, el).multiplyScalar(20)); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(RULES.key.azimuthDeg, RULES.key.elevationDeg, 14, 14, 6);
  panel(RULES.rim.azimuthDeg, RULES.rim.elevationDeg, 30, 4, 3);
  panel(0, 89, 18, 10, 1.4);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return tex;
}
const ENV = buildEnv();

// ---- материалы ----
function stoneTexture(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.filter = RULES.stoneGrade;
      g.drawImage(img, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      resolve({ tex: t, aspect: c.width / c.height });
    };
    img.src = `../../data/images/${STONE}.webp`;
  });
}

const M = {
  plaster: new THREE.MeshStandardMaterial({ color: RULES.plaster, roughness: 0.95 }),
  shadowGap: new THREE.MeshStandardMaterial({ color: 0x3a3938, roughness: 0.9 }), // теневой цоколь: опора «парит», изделие стоит на полу
  floor: new THREE.MeshLambertMaterial({ color: RULES.floor }),
  steel: new THREE.MeshStandardMaterial({ color: 0xd4d6d8, metalness: 1, roughness: 0.3, envMap: ENV, envMapIntensity: 1.0 }),
  steelBowl: new THREE.MeshStandardMaterial({ color: 0xcfd1d3, metalness: 1, roughness: 0.4, envMap: ENV, envMapIntensity: 0.5, side: THREE.DoubleSide }),
  drain: new THREE.MeshStandardMaterial({ color: 0x3a3b3c, metalness: 1, roughness: 0.35, envMap: ENV, envMapIntensity: 0.4 }),
  hidden: new THREE.MeshBasicMaterial({ visible: false }),
};

function stoneMaterial(tex) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.34, metalness: 0, envMap: ENV, envMapIntensity: 0.22 });
}

// UV камня из положения: верх — план плиты; боковые грани «откидываются» наружу от ребра,
// поэтому рисунок непрерывно переходит с плоскости на кромку и в вырезы (как у настоящей плиты).
function stoneUVs(geo, { x0, z0, scale, yTop }) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    const ny = n.getY(i);
    if (Math.abs(ny) < 0.5) {
      const d = yTop - p.getY(i), nx = n.getX(i), nz = n.getZ(i), l = Math.hypot(nx, nz) || 1;
      x += nx / l * d; z += nz / l * d;
    }
    uv[i * 2] = 0.03 + (x - x0) / scale;
    uv[i * 2 + 1] = 0.03 + (z - z0) / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// Плита: план (с отверстиями), выдавленный на толщину, фаска 1.5 мм — как у плиты с ЧПУ.
function slab({ outline, holes = [], y0, thickness, mat, uvFrame }) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const bevel = 0.0015;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 24,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0 + bevel, 0);
  geo.computeVertexNormals();
  stoneUVs(geo, { ...uvFrame, yTop: y0 + thickness });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function roundedRect(cx, cz, w, d, r, seg = 8) {
  const pts = [];
  const corners = [[cx + w / 2 - r, cz - d / 2 + r, -Math.PI / 2], [cx + w / 2 - r, cz + d / 2 - r, 0],
                   [cx - w / 2 + r, cz + d / 2 - r, Math.PI / 2], [cx - w / 2 + r, cz - d / 2 + r, Math.PI]];
  for (const [x, z, a0] of corners) for (let i = 0; i <= seg; i++) {
    const a = a0 + i / seg * Math.PI / 2; pts.push([x + r * Math.cos(a), z + r * Math.sin(a)]);
  }
  return pts.reverse(); // по часовой в плане -> отверстие
}

function box(x0, x1, y0, y1, z0, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---- изделие: отдельно стоящий кухонный остров ----
// Размеры реальные (метры): плита 2400×1000×30, верх на 900; опора 2340×670, вынос 300 сзади под сиденья;
// тёмный цоколь 100 мм, утоплен на 70 мм. Варочная — индукция 590×520 (стекло 5 мм поверх камня), мойка
// под столешницу 500×400 с радиусом 15 мм в вырезе, смеситель за мойкой.
function hobTexture() {
  const c = document.createElement('canvas'); c.width = 1180; c.height = 1040;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 4;
  const ring = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); };
  ring(300, 300, 190); ring(300, 760, 150); ring(860, 300, 150); ring(860, 760, 190);
  g.fillStyle = 'rgba(255,255,255,0.20)';
  for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(410 + i * 45, 990, 7, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function kitchenIsland(stone) {
  const g = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x4a4946, transparent: true, opacity: 0.85 });
  const top = 0.90, t = 0.03, under = top - t;
  const sink = { cx: 0.56, cz: 0.08, w: 0.50, d: 0.40 };
  const hob = { cx: -0.56, cz: 0.06, w: 0.59, d: 0.52 };

  g.add(slab({
    outline: [[-1.2, -0.5], [1.2, -0.5], [1.2, 0.5], [-1.2, 0.5]].reverse(),
    holes: [roundedRect(sink.cx, sink.cz, sink.w, sink.d, 0.015)],
    y0: under, thickness: t, mat: stoneMaterial(stone.tex),
    uvFrame: { x0: -1.2, z0: -0.5, scale: 2.4 * 1.06 },
  }));

  // Опора: гипсовый объём без фасадов (контекст, а не мебель); верхней грани нет — сверху камень.
  const body = box(-1.17, 1.17, 0.10, under, -0.20, 0.47, [M.plaster, M.plaster, M.hidden, M.plaster, M.plaster, M.plaster]);
  const plinth = box(-1.10, 1.10, 0, 0.10, -0.13, 0.40, M.shadowGap);
  g.add(body, plinth);
  if (CONCEPT === 'drawing') {
    // В: опора и цоколь не объёмы, а тонкие линии рёбер (в т.ч. задние), как на чертеже
    for (const m of [body, plinth]) {
      m.visible = false;
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), lineMat);
      l.position.copy(m.position); g.add(l);
    }
  }

  // Мойка: стальная чаша под камнем, чуть шире выреза, глубина 190 мм.
  const bw = sink.w + 0.02, bd = sink.d + 0.02, bh = 0.19, by = under - bh;
  const bowl = new THREE.Group();
  const plane = (w, h, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.receiveShadow = true; m.castShadow = true; return m; };
  const bottom = plane(bw, bd, M.steelBowl); bottom.rotation.x = -Math.PI / 2; bottom.position.set(0, by, 0); bowl.add(bottom);
  const back = plane(bw, bh, M.steelBowl); back.position.set(0, by + bh / 2, -bd / 2); bowl.add(back);
  const front = plane(bw, bh, M.steelBowl); front.position.set(0, by + bh / 2, bd / 2); bowl.add(front);
  const left = plane(bd, bh, M.steelBowl); left.rotation.y = Math.PI / 2; left.position.set(-bw / 2, by + bh / 2, 0); bowl.add(left);
  const right = plane(bd, bh, M.steelBowl); right.rotation.y = Math.PI / 2; right.position.set(bw / 2, by + bh / 2, 0); bowl.add(right);
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.003, 48), M.drain);
  drain.position.set(0, by + 0.0015, 0.05); bowl.add(drain);
  bowl.position.set(sink.cx, 0, sink.cz);
  g.add(bowl);
  if (CONCEPT === 'drawing') { // чаша тоже линией: в кадре в материале только камень, стекло и сталь смесителя
    bowl.visible = false;
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bw, bh, bd)), lineMat);
    l.position.set(sink.cx, by + bh / 2, sink.cz); g.add(l);
  }

  // Индукционная панель: чёрное стекло 5 мм поверх плиты, шлифованная кромка.
  const glassTop = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: hobTexture(), roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMap: ENV, envMapIntensity: 0.55 });
  const glassEdge = new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.35, envMap: ENV, envMapIntensity: 0.6 });
  g.add(box(hob.cx - hob.w / 2, hob.cx + hob.w / 2, top, top + 0.005, hob.cz - hob.d / 2, hob.cz + hob.d / 2,
    [glassEdge, glassEdge, glassTop, glassEdge, glassEdge, glassEdge]));

  // Смеситель за мойкой: гусак R110, излив над центром чаши, рычаг сбоку.
  const tz = sink.cz - sink.d / 2 - 0.075, tx = sink.cx;
  const tap = new THREE.Group();
  const cyl = (r, h, y, mat = M.steel) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64), mat); m.position.y = y; m.castShadow = m.receiveShadow = true; return m; };
  tap.add(cyl(0.027, 0.03, top + 0.015));
  tap.add(cyl(0.017, 0.27, top + 0.03 + 0.135));
  const R = 0.11, y0 = top + 0.30;
  class Neck extends THREE.Curve {
    getPoint(u, out = new THREE.Vector3()) {
      const L0 = 0.06, Larc = Math.PI * R, L1 = 0.05, s = u * (L0 + Larc + L1);
      if (s < L0) return out.set(0, y0 - L0 + s, 0);
      if (s < L0 + Larc) { const a = (s - L0) / R; return out.set(0, y0 + R * Math.sin(a), R - R * Math.cos(a)); }
      return out.set(0, y0 - (s - L0 - Larc), 2 * R);
    }
  }
  const neck = new THREE.Mesh(new THREE.TubeGeometry(new Neck(), 160, 0.0115, 48, false), M.steel);
  neck.castShadow = neck.receiveShadow = true; tap.add(neck);
  const aer = cyl(0.0125, 0.016, y0 - 0.05 - 0.006, M.steel); aer.position.z = 2 * R; tap.add(aer);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.03, 48), M.steel);
  hub.rotation.z = Math.PI / 2; hub.position.set(0.03, top + 0.20, 0); hub.castShadow = true; tap.add(hub);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.075, 32), M.steel);
  lever.rotation.z = Math.PI / 2 - rad(14); lever.position.set(0.075, top + 0.21, 0); lever.castShadow = true; tap.add(lever);
  tap.position.set(tx, 0, tz);
  g.add(tap);

  return { group: g, focus: new THREE.Vector3(0, 0.56, 0.0) };
}

const PRODUCTS = { kitchen: kitchenIsland };

// ---- сборка ----
const stone = await stoneTexture();
const { group, focus } = PRODUCTS[PRODUCT](stone);
scene.add(group);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), M.floor);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = CONCEPT !== 'drawing';
scene.add(floor);

// Камера: длинный фокус, без перспективных искажений; дистанция подбирается так,
// чтобы габарит изделия занимал RULES.camera.fill ширины кадра.
const cam = new THREE.PerspectiveCamera(RULES.camera.vfovDeg, W / H, 0.5, 400);
const viewDir = dirFrom(RULES.camera.azimuthDeg, RULES.camera.elevationDeg);
function frameCamera() {
  const bb = new THREE.Box3().setFromObject(group);
  const corners = [];
  for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push(new THREE.Vector3(x, y, z));
  let d = 10;
  for (let it = 0; it < 30; it++) {
    cam.position.copy(focus).addScaledVector(viewDir, d); cam.lookAt(focus); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    let minX = 1, maxX = -1, minY = 1, maxY = -1;
    for (const c of corners) { const p = c.clone().project(cam); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const span = Math.max((maxX - minX) / 2, (maxY - minY) / 2 * RULES.camera.fill / 0.8); // по высоте не больше 80%
    d *= span / RULES.camera.fill;
    // центрирование по силуэту
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const half = Math.tan(rad(RULES.camera.vfovDeg / 2)) * d;
    focus.addScaledVector(right, cx * half * (W / H) * 0.5).addScaledVector(up, cy * half * 0.5);
  }
}
frameCamera();

// ---- свет: три шейдер-группы, по одному сэмплу каждой за кадр ----
function shadowLight(color) {
  const l = new THREE.DirectionalLight(color, 1);
  l.castShadow = true;
  l.shadow.mapSize.set(4096, 4096);
  const s = 3.6; Object.assign(l.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 20 });
  l.shadow.bias = -0.00015; l.shadow.normalBias = 0.004;
  l.target.position.set(0, 0.45, 0);
  scene.add(l, l.target);
  return l;
}
const keyL = shadowLight(RULES.key.color);
const domeL = shadowLight(RULES.dome.color);
const rimL = shadowLight(RULES.rim.color);
const fillL = shadowLight(RULES.fill.color);

function tangentBasis(n) {
  const a = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t = new THREE.Vector3().crossVectors(a, n).normalize();
  return [t, new THREE.Vector3().crossVectors(n, t)];
}
const place = (l, dir) => l.position.copy(l.target.position).addScaledVector(dir, 8);
// Софтбокс: равномерная выборка по диску углового радиуса r вокруг центра.
function softbox(rule, h1, h2) {
  const c = dirFrom(rule.azimuthDeg, rule.elevationDeg), [t, b] = tangentBasis(c);
  const r = Math.tan(rad(rule.radiusDeg)) * Math.sqrt(h1), a = 2 * Math.PI * h2;
  return c.addScaledVector(t, r * Math.cos(a)).addScaledVector(b, r * Math.sin(a)).normalize();
}

function setLights(i) {
  // ключ: равномерно по диску софтбокса
  place(keyL, softbox(RULES.key, halton(i + 1, 2), halton(i + 1, 3))); keyL.intensity = RULES.key.intensity;
  place(fillL, softbox(RULES.fill, halton(i + 1, 23), halton(i + 1, 29))); fillL.intensity = RULES.fill.intensity;
  // купол: косинусная выборка -> интенсивность постоянна
  const u = halton(i + 1, 5), v = halton(i + 1, 7), sr = Math.sqrt(u), phi = 2 * Math.PI * v;
  const dd = new THREE.Vector3(sr * Math.cos(phi), Math.sqrt(Math.max(0, 1 - u)), sr * Math.sin(phi));
  place(domeL, dd); domeL.intensity = RULES.dome.intensity;
  // стрип сзади: широкая полоса по азимуту
  const az = RULES.rim.azimuthDeg + (halton(i + 1, 11) - 0.5) * RULES.rim.spreadDeg * 2;
  const el = RULES.rim.elevationDeg + (halton(i + 1, 13) - 0.5) * 10;
  place(rimL, dirFrom(az, el)); rimL.intensity = RULES.rim.intensity;
}

// ---- накопление ----
const rtOpts = { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false };
const frameRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
let acc = [new THREE.WebGLRenderTarget(W, H, rtOpts), new THREE.WebGLRenderTarget(W, H, rtOpts)];
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const accMat = new THREE.ShaderMaterial({
  uniforms: { prev: { value: null }, cur: { value: null }, first: { value: 1 } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D prev, cur; uniform float first; varying vec2 vUv;
    void main(){ gl_FragColor = texture2D(cur, vUv) + (first > 0.5 ? vec4(0.) : texture2D(prev, vUv)); }`,
  depthTest: false, depthWrite: false,
});
const outMat = new THREE.ShaderMaterial({
  uniforms: { acc: { value: null }, n: { value: 1 }, exposure: { value: RULES.exposure } },
  vertexShader: quadVS,
  fragmentShader: `uniform sampler2D acc; uniform float n, exposure; varying vec2 vUv;
    vec3 neutral(vec3 c){ // Khronos PBR Neutral
      float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off;
      float peak = max(c.r, max(c.g, c.b)); const float sc = 0.76; if (peak < sc) return c;
      const float d = 1. - sc; float np = 1. - d * d / (peak + d - sc); c *= np / peak;
      float g = 1. - 1. / (0.15 * (peak - np) + 1.); return mix(c, vec3(np), g); }
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){ vec3 c = texture2D(acc, vUv).rgb / n * exposure; gl_FragColor = vec4(srgb(clamp(neutral(c), 0., 1.)), 1.); }`,
  depthTest: false, depthWrite: false,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accMat);
const quadScene = new THREE.Scene(); quadScene.add(quad);

renderer.compile(scene, cam);
for (let i = 0; i < FRAMES; i++) {
  setLights(i);
  const jx = halton(i + 1, 17) - 0.5, jy = halton(i + 1, 19) - 0.5;
  cam.setViewOffset(W, H, jx, jy, W, H);
  renderer.setRenderTarget(frameRT);
  renderer.render(scene, cam);
  quad.material = accMat;
  accMat.uniforms.prev.value = acc[0].texture; accMat.uniforms.cur.value = frameRT.texture; accMat.uniforms.first.value = i === 0 ? 1 : 0;
  renderer.setRenderTarget(acc[1]);
  renderer.render(quadScene, quadCam);
  acc = [acc[1], acc[0]];
  if (i % 16 === 15) { document.title = `${i + 1}/${FRAMES}`; await new Promise(r => setTimeout(r, 0)); }
}
quad.material = outMat;
outMat.uniforms.acc.value = acc[0].texture; outMat.uniforms.n.value = FRAMES;
renderer.setRenderTarget(null);
renderer.render(quadScene, quadCam);
window.__done = true;
