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
const PRODUCT = q.get('product') || 'stoleshnitsa_kuhnya';
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
  stoneScale: 3.2,          // фото камня = целый слэб 3.2 м по длинной стороне (850×500 ≈ 3200×1880)
  stoneGrade: 'saturate(0.8) contrast(0.8) brightness(0.98)', // камень читается, но не шумит
};

// Подбор правил без правки файла: ?rules={"key":{"intensity":0}}
const CLI = q.get('rules') ? JSON.parse(q.get('rules')) : {};
for (const [k, v] of Object.entries(CLI)) RULES[k] = typeof v === 'object' ? { ...RULES[k], ...v } : v;

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
let STONE_MAT = null, STONE_ASPECT = 1.7;
M.soot = new THREE.MeshStandardMaterial({ color: 0x302e2c, roughness: 0.95 });
M.frame = new THREE.MeshStandardMaterial({ color: 0x3a3b3c, metalness: 0.6, roughness: 0.45, envMap: ENV, envMapIntensity: 0.5 });
// стекло как в архитектурном макете: светлое серо-зелёное, с отражением, без «чёрных дыр» в кадре
M.glass = new THREE.MeshPhysicalMaterial({ color: 0x9fadac, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, envMap: ENV, envMapIntensity: 0.8 });
M.ceramic = new THREE.MeshPhysicalMaterial({ color: 0xf2f1ee, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.1, envMap: ENV, envMapIntensity: 0.35, side: THREE.DoubleSide });

// ---- плита любой ориентации ----
// Плита строится в своей системе: план (x, z) с отверстиями, выдавленный по y на толщину, затем
// поворачивается лицом куда нужно. «Лицевые» координаты (h, v): up — (x, z), front/back — (x, y),
// right/left — (z, y). Отверстия и начало рисунка камня задаются в лицевых координатах.
const FACING = {
  up:    { rect: b => [b.x0, b.x1, b.z0, b.z1], t: b => b.y1 - b.y0, local: (h, v) => [h, v], face: (x, z) => [x, z], origin: b => [b.x0, b.z0],
           place: (m, b) => { m.position.y = b.y0; } },
  front: { rect: b => [b.x0, b.x1, -b.y1, -b.y0], t: b => b.z1 - b.z0, local: (h, v) => [h, -v], face: (x, z) => [x, -z], origin: b => [b.x0, b.y0],
           place: (m, b) => { m.rotation.x = Math.PI / 2; m.position.z = b.z0; } },
  back:  { rect: b => [b.x0, b.x1, b.y0, b.y1], t: b => b.z1 - b.z0, local: (h, v) => [h, v], face: (x, z) => [x, z], origin: b => [b.x0, b.y0],
           place: (m, b) => { m.rotation.x = -Math.PI / 2; m.position.z = b.z1; } },
  right: { rect: b => [-b.y1, -b.y0, b.z0, b.z1], t: b => b.x1 - b.x0, local: (h, v) => [-v, h], face: (x, z) => [z, -x], origin: b => [b.z0, b.y0],
           place: (m, b) => { m.rotation.z = -Math.PI / 2; m.position.x = b.x0; } },
  left:  { rect: b => [b.y0, b.y1, b.z0, b.z1], t: b => b.x1 - b.x0, local: (h, v) => [v, h], face: (x, z) => [z, x], origin: b => [b.z0, b.y0],
           place: (m, b) => { m.rotation.z = Math.PI / 2; m.position.x = b.x1; } },
};
const B = (x0, x1, y0, y1, z0, z1) => ({ x0, x1, y0, y1, z0, z1 });

// UV камня: лицо плиты — в лицевых координатах; боковые грани «откидываются» наружу от ребра, поэтому
// рисунок непрерывно переходит на кромку и в вырезы. Масштаб: фото = целый слэб RULES.stoneScale по длинной
// стороне. along: вдоль какой оси лица идёт длинная сторона слэба. Отражение на краях фото (MirroredRepeat)
// работает как раскладка «книжкой»: точка origin — линия симметрии.
function stoneUVs(geo, F, { origin, along = 'h' }, yTop) {
  const S = RULES.stoneScale, SV = S / STONE_ASPECT;
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    if (Math.abs(n.getY(i)) < 0.5) {
      const d = yTop - p.getY(i), nx = n.getX(i), nz = n.getZ(i), l = Math.hypot(nx, nz) || 1;
      x += nx / l * d; z += nz / l * d;
    }
    const [h, v] = F.face(x, z), dh = h - origin[0], dv = v - origin[1];
    uv[i * 2] = along === 'h' ? dh / S : dv / S;
    uv[i * 2 + 1] = along === 'h' ? dv / SV : dh / SV;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function rectPts([h0, h1, v0, v1], r = 0) {
  if (r > 0) return roundedRect((h0 + h1) / 2, (v0 + v1) / 2, h1 - h0, v1 - v0, r);
  return [[h0, v0], [h1, v0], [h1, v1], [h0, v1]];
}

// Камень (по умолчанию) или гипс: фаска 1.5 мм у камня — как у плиты с ЧПУ, у гипса без фаски.
function panel(b, facing, { mat = STONE_MAT, holes = [], uv = {}, bevel = mat === STONE_MAT ? 0.0015 : 0 } = {}) {
  const F = FACING[facing], [a0, a1, c0, c1] = F.rect(b), t = F.t(b);
  const P = (x, z) => new THREE.Vector2(x, -z);
  const shape = new THREE.Shape([P(a0, c0), P(a1, c0), P(a1, c1), P(a0, c1)]);
  for (const h of holes) {
    const pts = h.pts || rectPts(h.rect, h.r);
    shape.holes.push(new THREE.Path(pts.map(([hh, vv]) => P(...F.local(hh, vv)))));
  }
  const geo = new THREE.ExtrudeGeometry(shape, bevel > 0
    ? { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 24 }
    : { depth: t, bevelEnabled: false, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  geo.computeVertexNormals();
  if (mat === STONE_MAT) {
    let origin = uv.origin || F.origin(b);
    if (uv.spot !== undefined) { // свой участок слэба, целиком внутри фото (без отражения на краях)
      const [p0, p1] = [F.face(a0, c0), F.face(a1, c1)], w = Math.abs(p1[0] - p0[0]), hgt = Math.abs(p1[1] - p0[1]);
      const S = RULES.stoneScale, SV = S / STONE_ASPECT, [lu, lv] = uv.along === 'v' ? [hgt, w] : [w, hgt];
      const du = halton(uv.spot + 1, 2) * Math.max(0, S - lu - 0.02), dv = halton(uv.spot + 1, 3) * Math.max(0, SV - lv - 0.02);
      const o = F.origin(b);
      origin = uv.along === 'v' ? [o[0] - dv - 0.01, o[1] - du - 0.01] : [o[0] - du - 0.01, o[1] - dv - 0.01];
    }
    stoneUVs(geo, F, { origin, along: uv.along }, t);
  }
  const m = new THREE.Mesh(geo, mat);
  F.place(m, b);
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
  return pts;
}

function box(x0, x1, y0, y1, z0, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const cylinder = (r, h, mat, segs = 64) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat); m.castShadow = m.receiveShadow = true; return m; };

// ---- 1. Столешницы на кухню: отдельно стоящий остров ----
// Плита 2400×1000×30, верх на 900; опора 2340×670, вынос 300 сзади под сиденья; тёмный цоколь 100 мм,
// утоплен на 70 мм. Индукция 590×520 (стекло 5 мм поверх камня), мойка под столешницу 500×400
// с радиусом 15 мм в вырезе, смеситель за мойкой.
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

function kitchenIsland() {
  const g = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x4a4946, transparent: true, opacity: 0.85 });
  const top = 0.90, t = 0.03, under = top - t;
  const sink = { cx: 0.56, cz: 0.08, w: 0.50, d: 0.40 };
  const hob = { cx: -0.56, cz: 0.06, w: 0.59, d: 0.52 };

  g.add(panel(B(-1.2, 1.2, under, top, -0.5, 0.5), 'up', {
    holes: [{ rect: [sink.cx - sink.w / 2, sink.cx + sink.w / 2, sink.cz - sink.d / 2, sink.cz + sink.d / 2], r: 0.015 }],
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
  const drain = cylinder(0.042, 0.003, M.drain, 48);
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
  const cyl = (r, h, y, mat = M.steel) => { const m = cylinder(r, h, mat); m.position.y = y; return m; };
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
  const hub = cylinder(0.019, 0.03, M.steel, 48);
  hub.rotation.z = Math.PI / 2; hub.position.set(0.03, top + 0.20, 0); tap.add(hub);
  const lever = cylinder(0.0055, 0.075, M.steel, 32);
  lever.rotation.z = Math.PI / 2 - rad(14); lever.position.set(0.075, top + 0.21, 0); tap.add(lever);
  tap.position.set(tx, 0, tz);
  g.add(tap);

  return { group: g, camera: {} };
}

// ---- 2. Столешницы в ванную: подвесная тумба, накладная раковина, настенный излив ----
// Фрагмент стены 1600×1550×120; тумба 1160×400×460 без фасадов (гипс); плита 1200×500×30, верх на 850;
// чаша ⌀400×130; излив из стены на 1120.
function bathVanity() {
  const g = new THREE.Group();
  const top = 0.85;
  g.add(panel(B(-0.8, 0.8, 0, 1.55, -0.12, 0), 'front', { mat: M.plaster }));
  g.add(box(-0.58, 0.58, 0.42, top - 0.03, 0, 0.46, M.plaster));
  g.add(panel(B(-0.6, 0.6, top - 0.03, top, 0, 0.5), 'up'));
  const prof = [[0, 0], [0.11, 0], [0.155, 0.035], [0.188, 0.095], [0.2, 0.13], [0.193, 0.13], [0.181, 0.097], [0.148, 0.042], [0.104, 0.011], [0, 0.011]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 128), M.ceramic);
  bowl.position.set(0, top, 0.25); bowl.castShadow = bowl.receiveShadow = true; g.add(bowl);
  const drain = cylinder(0.02, 0.002, M.steel, 48); drain.position.set(0, top + 0.012, 0.25); g.add(drain);
  const sy = top + 0.27;
  const plate = cylinder(0.032, 0.012, M.steel); plate.rotation.x = Math.PI / 2; plate.position.set(0, sy, 0.006); g.add(plate);
  const spout = cylinder(0.011, 0.2, M.steel); spout.rotation.x = Math.PI / 2; spout.position.set(0, sy, 0.112); g.add(spout);
  const plate2 = cylinder(0.028, 0.012, M.steel); plate2.rotation.x = Math.PI / 2; plate2.position.set(0, sy + 0.13, 0.006); g.add(plate2);
  const lever = cylinder(0.005, 0.06, M.steel, 32); lever.rotation.x = Math.PI / 2; lever.position.set(0, sy + 0.13, 0.04); g.add(lever);
  return { group: g, camera: { azimuthDeg: 24, elevationDeg: 26 } };
}

// ---- 3. Подоконники: фрагмент стены 1900×2100×550 с проёмом 1200×1030, подоконник 1300×450×30 ----
// с «ушами» по 50 мм в откосы и свесом 60 мм; графитовая рама 60 мм с импостом, стекло.
function windowSill() {
  const g = new THREE.Group();
  const [a, b, c, d] = [-0.6, 0.6, 0.85, 1.88], f = 0.06, fz0 = -0.45, fz1 = -0.39;
  g.add(panel(B(-0.95, 0.95, 0, 2.1, -0.55, 0), 'front', { mat: M.plaster, holes: [{ rect: [a, b, c, d] }] }));
  g.add(panel(B(a - 0.05, b + 0.05, c, c + 0.03, fz1, 0.06), 'up'));
  g.add(box(a, b, c, c + 0.03 + f, fz0, fz1, M.frame));
  g.add(box(a, b, d - f, d, fz0, fz1, M.frame));
  g.add(box(a, a + f, c, d, fz0, fz1, M.frame));
  g.add(box(b - f, b, c, d, fz0, fz1, M.frame));
  g.add(box(-0.03, 0.03, c, d, fz0, fz1, M.frame));
  g.add(box(a, b, c, d, fz0 + 0.025, fz0 + 0.035, M.glass));
  return { group: g, camera: { azimuthDeg: 20, elevationDeg: 28 } };
}

// ---- 4. Полы: образец пола 2400×2400 — плиты 800×800×20 в раскладку со швом 3 мм на гипсовой стяжке 80 ----
function floorTiles() {
  const g = new THREE.Group();
  const n = 3, a = 0.8, x0 = -1.2, gap = 0.003, base = 0.08;
  g.add(panel(B(x0, -x0, 0, base, x0, -x0), 'up', { mat: M.plaster }));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    g.add(panel(B(x0 + i * a + gap / 2, x0 + (i + 1) * a - gap / 2, base, base + 0.02, x0 + j * a + gap / 2, x0 + (j + 1) * a - gap / 2), 'up',
      { uv: { origin: [x0, x0] } }));
  return { group: g, camera: { azimuthDeg: 25, elevationDeg: 30 } };
}

// ---- 5. Стены: внутренний угол комнаты, высота 2400; задняя стена — 4 плиты 600×2400 «книжкой» от оси,
// боковая — 2 плиты 800×2400; плиты 20 мм на гипсовых стенах 140 мм, шов 3 мм.
// Камера слева: так свет сверху-слева падает в угол, а не из-за стены.
function wallCorner() {
  const g = new THREE.Group();
  const H = 2.4, t = 0.02, gap = 0.003, X1 = 1.2, Z1 = 1.6;
  g.add(box(-1.2, X1 + 0.16, 0, H, -0.16, -t, M.plaster));
  g.add(box(X1 + t, X1 + 0.16, 0, H, -t, Z1, M.plaster));
  for (let i = 0; i < 4; i++) {
    const xa = -1.2 + i * 0.6, xb = xa + 0.6;
    g.add(panel(B(xa + (i ? gap / 2 : 0), xb - (i < 3 ? gap / 2 : 0), 0, H, -t, 0), 'front', { uv: { origin: [0, 0], along: 'v' } }));
  }
  for (let i = 0; i < 2; i++) {
    const za = i * 0.8, zb = za + 0.8;
    g.add(panel(B(X1, X1 + t, 0, H, za + gap / 2, zb - (i < 1 ? gap / 2 : 0)), 'left', { uv: { origin: [0, 0], along: 'v' } }));
  }
  return { group: g, camera: { azimuthDeg: -28, elevationDeg: 18 } };
}

// ---- 6. Панно: две плиты 750×1900×20 «книжкой» на стене 2600×2500, отнесены от стены на 12 мм (скрытый крепёж) ----
function panno() {
  const g = new THREE.Group();
  const y0 = 0.35, y1 = 2.25, z0 = 0.012, z1 = 0.032, gap = 0.002;
  g.add(box(-1.3, 1.3, 0, 2.5, -0.12, 0, M.plaster));
  g.add(panel(B(-0.75, -gap / 2, y0, y1, z0, z1), 'front', { uv: { origin: [0, y0], along: 'v' } }));
  g.add(panel(B(gap / 2, 0.75, y0, y1, z0, z1), 'front', { uv: { origin: [0, y0], along: 'v' } }));
  return { group: g, camera: { azimuthDeg: 18, elevationDeg: 12 } };
}

// ---- 7. Фасады: угол двухэтажного объёма 6000×3600×6100 в навесном фасаде — плиты 1200×600×30,
// открытый шов 8 мм; окна 1200×1800 в откосах из камня глубиной 250, каменные отливы со свесом 40,
// парапет с каменной крышкой, тёмный цоколь 100.
function facade() {
  const g = new THREE.Group();
  const W0 = -3, W1 = 3, D0 = -3.6, Y0 = 0.1, ROW = 0.6, ROWS = 10, COL = 1.2, T = 0.03, gp = 0.008, DEP = 0.25, f = 0.06;
  const Ytop = Y0 + ROW * ROWS;
  const floors = [[1, 3], [6, 8]];
  const winRow = r => floors.some(([p, q]) => r >= p && r <= q);
  let k = 0;
  const spot = () => ({ spot: k++ });
  for (let c = 0; c < 5; c++) for (let r = 0; r < ROWS; r++) {
    if ((c === 1 || c === 3) && winRow(r)) continue;
    const x0 = W0 + c * COL + (c ? gp / 2 : 0), x1 = W0 + (c + 1) * COL - (c < 4 ? gp / 2 : 0);
    const y0 = Y0 + r * ROW + gp / 2, y1 = Y0 + (r + 1) * ROW - gp / 2;
    g.add(panel(B(x0, x1, y0, y1, -T, 0), 'front', { uv: spot() }));
  }
  for (let c = 0; c < 3; c++) for (let r = 0; r < ROWS; r++) {
    if (c === 1 && winRow(r)) continue;
    const z1 = -c * COL - (c ? gp / 2 : T + gp / 2), z0 = -(c + 1) * COL + gp / 2;
    const y0 = Y0 + r * ROW + gp / 2, y1 = Y0 + (r + 1) * ROW - gp / 2;
    g.add(panel(B(W1 - T, W1, y0, y1, z0, z1), 'right', { uv: spot() }));
  }
  for (const [p, q] of floors) {
    const c = Y0 + p * ROW, d = Y0 + (q + 1) * ROW;
    for (const [a, b] of [[-1.8, -0.6], [0.6, 1.8]]) {           // окна фасада
      g.add(panel(B(a - 0.04, b + 0.04, c - 0.04, c, -DEP, 0.04), 'up'));
      g.add(panel(B(a - 0.03, a, c, d, -DEP, -T), 'right'));
      g.add(panel(B(b, b + 0.03, c, d, -DEP, -T), 'left'));
      const z0 = -DEP, z1 = -DEP + 0.07;
      g.add(box(a, b, c, c + f, z0, z1, M.frame), box(a, b, d - f, d, z0, z1, M.frame),
        box(a, a + f, c, d, z0, z1, M.frame), box(b - f, b, c, d, z0, z1, M.frame),
        box((a + b) / 2 - 0.03, (a + b) / 2 + 0.03, c, d, z0, z1, M.frame),
        box(a, b, c, d, z0 + 0.02, z0 + 0.03, M.glass));
    }
    const [a, b] = [-2.4, -1.2];                                   // окно торца
    g.add(panel(B(W1 - DEP, W1 + 0.04, c - 0.04, c, a - 0.04, b + 0.04), 'up'));
    g.add(panel(B(W1 - DEP, W1 - T, c, d, a - 0.03, a), 'front'));
    g.add(panel(B(W1 - DEP, W1 - T, c, d, b, b + 0.03), 'back'));
    const x1 = W1 - DEP + 0.07, x0 = W1 - DEP;
    g.add(box(x0, x1, c, c + f, a, b, M.frame), box(x0, x1, d - f, d, a, b, M.frame),
      box(x0, x1, c, d, a, a + f, M.frame), box(x0, x1, c, d, b - f, b, M.frame),
      box(x0, x1, c, d, (a + b) / 2 - 0.03, (a + b) / 2 + 0.03, M.frame),
      box(x0 + 0.02, x0 + 0.03, c, d, a, b, M.glass));
  }
  // замкнутый объём: крыша, глухие тыльная и левая стороны (их не видно), тёмный цоколь, каменная крышка парапета
  g.add(box(W0, W1 - T, Ytop - 0.2, Ytop, D0, -T, M.plaster));
  g.add(box(W0, W1, 0, Ytop, D0 - 0.02, D0, M.plaster), box(W0 - 0.02, W0, 0, Ytop, D0, 0, M.plaster));
  g.add(box(W0 + 0.05, W1 - 0.05, 0, Y0, D0, -0.05, M.shadowGap));
  g.add(panel(B(W0, W1 + 0.02, Ytop, Ytop + 0.04, -0.32, 0.02), 'up'));
  g.add(panel(B(W1 - 0.32, W1 + 0.02, Ytop, Ytop + 0.04, D0, -0.32), 'up'));
  return { group: g, camera: { azimuthDeg: 25, elevationDeg: 16 } };
}

// ---- лестничный марш: гипсовое основание + каменные проступи (40 мм, свес 25) и подступенки (20 мм) ----
function flight(g, { x0, x1, zFront, n, rise, going, landing, nosing = 0.025, tT = 0.04, rT = 0.02 }) {
  const zr = k => zFront - (k - 1) * going;   // лицо подступенка k
  const y = k => k * rise;
  const backOf = k => (k < n ? zr(k + 1) - rT : zr(n) - landing);
  const pts = [[zr(1) - rT, 0]];
  for (let k = 1; k <= n; k++) pts.push([zr(k) - rT, y(k) - tT], [backOf(k), y(k) - tT]);
  pts.push([backOf(n), 0]);
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, yy]) => new THREE.Vector2(-z, yy))), { depth: x1 - x0, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); geo.translate(x0, 0, 0); geo.computeVertexNormals();
  const mass = new THREE.Mesh(geo, M.plaster); mass.castShadow = mass.receiveShadow = true; g.add(mass);
  for (let k = 1; k <= n; k++) {
    g.add(panel(B(x0, x1, y(k) - tT, y(k), backOf(k), zr(k) + nosing), 'up', { uv: { spot: k } }));
    g.add(panel(B(x0, x1, k === 1 ? 0 : y(k - 1), y(k) - tT, zr(k) - rT, zr(k)), 'front', { uv: { spot: k + 40 } }));
  }
}

// ---- 8. Ступени: широкое крыльцо — 3 ступени 2400×360, подъём 150, и площадка 1200 ----
function steps() {
  const g = new THREE.Group();
  flight(g, { x0: -1.2, x1: 1.2, zFront: 0.9, n: 4, rise: 0.15, going: 0.36, landing: 1.2 });
  return { group: g, camera: { azimuthDeg: 28, elevationDeg: 26 } };
}

// ---- 9. Лестницы: прямой марш шириной 1000, 11 подъёмов по 170, проступь 280, верхняя площадка 900 ----
function stair() {
  const g = new THREE.Group();
  flight(g, { x0: -0.5, x1: 0.5, zFront: 1.6, n: 11, rise: 0.17, going: 0.28, landing: 0.9 });
  return { group: g, camera: { azimuthDeg: 32, elevationDeg: 20 } };
}

// ---- 10. Камины: каменный портал на камине-«груди» 2200×1950×450: стойки 350, ригель 300, плиты 50 мм,
// полка 1800×200×50 на 1150, очаг-подиум 1900×500×40; топка 900×810 глубиной 420 в тёмной облицовке.
function fireplace() {
  const g = new THREE.Group();
  const [a, b, c, d] = [-0.45, 0.45, 0.04, 0.85], D = 0.42, s = 0.005;
  g.add(panel(B(-1.1, 1.1, 0, 1.95, -0.45, 0), 'front', { mat: M.plaster, holes: [{ rect: [a, b, c, d] }] }));
  g.add(box(a, b, c, d, -0.45, -D, M.soot), box(a, a + s, c, d, -D, 0, M.soot), box(b - s, b, c, d, -D, 0, M.soot),
    box(a, b, d - s, d, -D, 0, M.soot), box(a, b, c, c + s, -D, 0, M.soot));
  const uv = { uv: { origin: [-0.8, 0.04] } };
  g.add(panel(B(-0.8, a, c, d, 0, 0.05), 'front', uv));
  g.add(panel(B(b, 0.8, c, d, 0, 0.05), 'front', uv));
  g.add(panel(B(-0.8, 0.8, d, 1.15, 0, 0.05), 'front', uv));
  g.add(panel(B(-0.9, 0.9, 1.15, 1.2, 0, 0.2), 'up'));
  g.add(panel(B(-0.95, 0.95, 0, c, 0, 0.5), 'up'));
  return { group: g, camera: { azimuthDeg: 22, elevationDeg: 14 } };
}

// Ключи — те же, что у карточек калькулятора (product-icons.js).
const PRODUCTS = {
  stoleshnitsa_kuhnya: kitchenIsland, kitchen: kitchenIsland,
  stoleshnitsa_vannaya: bathVanity, podokonnik: windowSill, pol: floorTiles, stena: wallCorner,
  panno, fasad: facade, stupeni: steps, lestnitsa: stair, kaminy: fireplace,
};

// ---- сборка ----
const stone = await stoneTexture();
STONE_ASPECT = stone.aspect;
STONE_MAT = stoneMaterial(stone.tex);
if (!PRODUCTS[PRODUCT]) throw new Error('нет изделия ' + PRODUCT);
const product = PRODUCTS[PRODUCT]();
const group = product.group;
// у каждого изделия свой ракурс в пределах правила; --rules сильнее
Object.assign(RULES.camera, product.camera, CLI.camera || {});
scene.add(group);
const bounds = new THREE.Box3().setFromObject(group);
const focus = bounds.getCenter(new THREE.Vector3());
const center = focus.clone();
const radius = bounds.getSize(new THREE.Vector3()).length() / 2;

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
  const s = radius * 1.05; Object.assign(l.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: radius * 6 });
  l.shadow.bias = -0.00015; l.shadow.normalBias = 0.004 * Math.max(1, radius / 1.6);
  l.target.position.copy(center);
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
const place = (l, dir) => l.position.copy(l.target.position).addScaledVector(dir, radius * 3);
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
