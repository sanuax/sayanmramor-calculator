# Design: procedural 3D product preview (Three.js)

## Goal

Add an interactive 3D preview of the product being configured, built
procedurally from the constructor's own parameters, so a client can see
roughly what they're ordering (dimensions, material, edge, cutouts) before
requesting a manager's exact quote. Desktop: form left / 3D right. Mobile:
3D near the top, then the form. The preview is part of the constructor, not
a separate page, and updates live as any parameter changes.

This is explicitly a sales visual, not a CAD system: approximate geometry
and approximate material rendering are acceptable; committing to a
placement, a measurement, or a texture the underlying data doesn't actually
have is not.

## Non-goals (out of scope for this design)

- Full 3D room/kitchen scene, cabinets, appliances, walls.
- Physically exact engineering geometry or production drawings.
- Real per-side edge assignment, real cutout coordinates, real bookmatch
  rendering — all three are architecturally reserved (see below) but not
  implemented now, because the underlying data to drive them doesn't exist
  yet anywhere in the calculator.
- Any change to how price is calculated, or to `rate-catalog.js`'s data.

## Guiding principle: one state, four consumers

The calculator currently has no centralized state — `calculate()` reads
every `<input>` from the DOM directly, ad hoc, each time it runs. This
design introduces exactly one shared state object, `ConstructorState`, read
once per `calculate()` call and consumed by everything downstream:

```
DOM inputs
   │
   ▼
readConstructorState()  (constructor-state.js)
   │
   ▼
ConstructorState
   ├──► Pricing.calculatePrice()   (existing, untouched)
   ├──► buildGeometryModel()       (visualizer/geometry-model.js)
   │        │
   │        ▼
   │    ProductGeometryModel ──────► ThreeScene.update(...)
   └──► resolveMaterial()          (visualizer/material-adapter.js)
            │
            ▼
        MaterialDescriptor ────────► ThreeScene.update(...)
```

The 3D layer never reads the DOM, never reads `stone` records directly, and
never computes price. It only ever sees `ConstructorState`,
`ProductGeometryModel`, and `MaterialDescriptor`.

## `ConstructorState` shape

Built once per `calculate()` call by `readConstructorState()`. Fields are
grouped by what they describe, not by which DOM input produced them.

```js
{
  product: { key, label, type, capabilities: {...} }, // from PRODUCTS[key]
  stone: { id, category, colors, image, slabs } | null, // STONES_BY_ID[selectedStoneId]

  dimensions: {
    widthM, lengthM,     // real, from the width/length inputs (mm → m)
    thicknessM: null      // real product thickness — NOT modeled anywhere
                           // today (no input field, no data on the stone
                           // record). Stays null until such a field exists.
                           // Never populated with a guessed number.
  },

  edge: {
    type: 'straight' | 'rounding' | 'bevel' | 'figured' | 'stone-wrap' | null,
    lengthMm: number | null
  },

  additionalWorks: {
    sink:    { type: 'overlay' | 'undermount' | 'integrated' | null, count: 0, position: null },
    cooktop: { count: 0, position: null },
    holes:   { mixer: 0, socket: 0, dispenser: 0 }, // no position concept proposed yet; not in the vertical slice
    curb:    { lengthM: 0 },
    backsplash: { widthM: 0, lengthM: 0 },
    wallPanel:  { widthM: 0, lengthM: 0 },
    island:     { standard: { widthM, lengthM }, figured: { widthM, lengthM } },
    barCounter: { standard: { widthM, lengthM }, complex: { widthM, lengthM } }
  },

  bookmatchMode: 'none', // no UI yet; reserved

  options: { complexEnabled, polishEnabled, installEnabled }
}
```

`position: { xMm, yMm } | null` is the reserved shape for sink/cooktop
placement. There is no coordinate input anywhere in the calculator today,
so `position` is always `null` for now — see "Fallback placement" below for
how the 3D layer is allowed to handle that without pretending it's real.

### Edge: adapting the old 5-field DOM to the new single-edge model

The real calculator's DOM (`sayanmramor-calculator.html`) still has 5
independent length inputs (`edge-straight`, `edge-figured`, `edge-round`,
`edge-chamfer`, `edge-stonefold`) that can technically all be non-zero at
once — the single-select edge UX only exists so far as an approved *concept*
(the standalone V2 mockup), not as real markup in the calculator.

`readConstructorState()` bridges this gap with one explicit, disclosed rule:
**fixed priority order, not magnitude**. The 5 legacy DOM fields map to the
new `edge.type` enum as: `edge-straight`→`straight`, `edge-figured`→`figured`,
`edge-round`→`rounding`, `edge-chamfer`→`bevel`, `edge-stonefold`→`stone-wrap`.
Walk them in that same order and take the first field that is non-zero; its
own length becomes `edge.lengthMm`, its mapped name becomes `edge.type`. This is a
temporary adapter shim inside `readConstructorState()` only. It is not
"longest wins," it does not compare lengths against each other, and the 3D
layer never sees the 5 old fields — it only ever receives the resolved
`edge` object. This shim is removed once the real calculator UI migrates to
an actual single-select edge control (tracked as follow-up work, not part
of this design).

## `ProductGeometryModel` shape

Pure data, produced by `buildGeometryModel(state)` in
`visualizer/geometry-model.js`. No Three.js import in this file — it's
plain arithmetic on `ConstructorState`, which is what makes it unit
testable with `node:test` like the rest of the project's modules.

```js
{
  shape: 'straight',            // only value implemented now; 'lshape' reserved
  widthM, lengthM,               // copied from state.dimensions
  visualThicknessM: 0.04,        // see "Thickness" below — NEVER state.dimensions.thicknessM
  cameraPreset: 'top',           // see "Per-product-type default camera preset" below
  edge: { type, lengthMm },      // passed through from state.edge
  sink: null | { type, placement: { xMm, yMm, source: 'fallback' | 'real' } },
  cooktop: null | { placement: {...} },
  // curb/backsplash/island/barCounter/holes: not populated until their
  // own follow-up slice; the model's job right now is the vertical slice
  // (shape+edge) plus reserving the fields above for sink/cooktop.
}
```

### Thickness: real data vs. visual fallback

`state.dimensions.thicknessM` stays `null` — there is no real input for it
anywhere in the calculator, and this design does not invent one. When the
3D layer needs *some* thickness to render a box, `buildGeometryModel()`
falls back to a separate, clearly-named constant,
`visualizer/constants.js: VISUAL_FALLBACK_THICKNESS_M = 0.04`, exposed on
the geometry model as `visualThicknessM` — a different field name, never
merged into or aliased as the real `thicknessM`. The UI must not display
`visualThicknessM` anywhere as if it were the product's actual thickness
(no "толщина: 40 мм" label near the 3D view). It exists purely so the mesh
has a plausible slab-like proportion.

### Sink/cooktop: fallback placement is visually disclosed, not just undocumented

`state.additionalWorks.sink.position` and `.cooktop.position` are `null`
until a real coordinate input exists (out of scope here). When
`buildGeometryModel()` needs to draw a cutout marker for a non-zero count
with `position: null`, it computes one temporary, reasonable point (e.g.
centered along the front edge) and tags it `source: 'fallback'`.
`ThreeScene` uses that tag to render fallback placements with a visually
distinct treatment (planned: lower opacity / dashed outline — exact
treatment decided during implementation, not in this spec) rather than
rendering them identically to a real, confirmed position. The geometry
model must never claim precision the data doesn't have.

## `MaterialDescriptor` shape

Produced by `resolveMaterial(stone, bookmatchMode)` in
`visualizer/material-adapter.js` — the **only** file that knows about the
shape of a `stone` record. Everything downstream (`ThreeScene`) only ever
sees this descriptor, never `stone` itself.

```js
{
  fallbackColor: '#e8ddc7',   // approximate color from stone.category/colors
  roughness: 0.35,             // approximate, per category (marble vs granite etc.)
  metalness: 0.0,
  textureUrl: null,            // reserved: when a real seamless texture exists
                                // for this stone, this becomes a URL and
                                // ThreeScene loads it as a map. stone.image
                                // (a photo of one slab) is NOT used here —
                                // it isn't a tileable texture and would look
                                // wrong repeated across a surface.
  bookmatchMode: 'none'        // passed through, unused until bookmatch is implemented
}
```

`resolveMaterial()` is a pure function: `stone` in, `MaterialDescriptor`
out. `ThreeScene` builds a `THREE.MeshStandardMaterial` from
`fallbackColor`/`roughness`/`metalness` today, and — once `textureUrl` is
non-null in a future slice — loads and applies it as `map` without any
change to `ThreeScene`'s public contract.

## Bookmatch: reserved, not implemented

`bookmatchMode` lives in both `ConstructorState` and `MaterialDescriptor`
today, always `'none'`, with no UI control. The intent is that adding real
bookmatch later means: (a) a UI control that sets `bookmatchMode` in state,
(b) `geometry-model.js` segmenting the top's UVs per-half when the mode is
`'mirrored'`, (c) `material-adapter.js`/`ThreeScene` mirroring the texture
orientation per segment. None of that is built now, but no field is missing
that would force restructuring `ConstructorState` or `MaterialDescriptor`
later.

## New files

- **`constructor-state.js`** (UMD, same style as `pricing.js`) —
  `readConstructorState()`. Reads the same DOM fields `calculate()` already
  reads today; returns one `ConstructorState` object. `calculate()` is
  refactored to call this first and use its fields instead of its current
  scattered inline reads — mechanically equivalent, price output unchanged.
- **`visualizer/constants.js`** — `VISUAL_FALLBACK_THICKNESS_M` and any
  other visual-only constants (curb strip height, etc.), explicitly
  separated from anything price- or dimension-related.
- **`visualizer/geometry-model.js`** — `buildGeometryModel(state)`, pure,
  no Three.js import, unit-testable.
- **`visualizer/material-adapter.js`** — `resolveMaterial(stone, bookmatchMode)`,
  pure, no Three.js import, unit-testable.
- **`visualizer/webgl-support.js`** — `isWebglAvailable()`: attempts to
  create a WebGL context, no side effects, used to decide whether to mount
  the 3D panel at all.
- **`visualizer/three-scene.js`** — the only file that imports Three.js.
  `init(canvasEl)`, `update(geometryModel, materialDescriptor)`,
  `setView('top' | 'front' | 'side' | 'iso')`, `dispose()`. Owns
  renderer/camera/`OrbitControls`/scene graph; updates existing meshes
  in place where possible instead of rebuilding the scene on every call.
- **`visualizer/camera-preset-tracker.js`** — `createCameraPresetTracker()`,
  pure, no Three.js import, unit-testable. See "Per-product-type default
  camera preset" below.
- **`vendor/three/three.module.js`**, **`vendor/three/OrbitControls.js`** —
  Three.js vendored locally into the repo (confirmed: matches this
  project's existing convention of shipping all its own JS locally with no
  runtime CDN dependency). This is the one place in the project using
  `<script type="module">` / ES imports instead of the UMD
  `(function(root, factory){...})` pattern the rest of the project uses —
  Three's current distribution no longer ships a classic global/UMD build,
  so this is an unavoidable, deliberate deviation, called out here rather
  than silently introduced.

## Changed files

- **`sayanmramor-calculator.html`** — add the 3D panel markup (`<canvas>` +
  view-preset buttons), CSS for the desktop side-by-side / mobile stacked
  layout, `<script>` tags for the new modules, and the refactor of
  `calculate()`'s first lines to build state via `readConstructorState()`.
  At the end of `calculate()`, if `isWebglAvailable()`, call
  `ThreeScene.update(buildGeometryModel(state), resolveMaterial(state.stone, state.bookmatchMode))`.
  If WebGL isn't available, the panel is never mounted and the rest of the
  calculator behaves exactly as it does today.

## Untouched

`pricing.js`, `rate-catalog.js`, `material-picker.js`, and all
pricing-relevant fields in `product-types.js` (`PRODUCTS`, `WORK_RATES`,
`COUNTERTOP_EXTRAS_RATES`, capability flags). No line of business/pricing
logic moves into the visualizer layer.

## Camera / interaction

`ThreeScene` wraps `THREE.OrbitControls` for rotate (drag) + zoom (wheel/
pinch) + pan (right-drag/two-finger), plus explicit buttons for reset and
for the four view presets (top/front/side/iso), which just animate the
camera to a fixed position looking at the model's bounding-box center.
Touch support comes from `OrbitControls` itself (it already handles
touch gestures).

## Per-product-type default camera preset (`cameraPreset`)

The four manual view-preset buttons (top/front/side/iso) stay exactly as
they are — this section is about what the camera shows **before** the
client touches anything, and what "Сбросить вид" returns to. Different
product types read best from different starting angles: a floor wants a
near-top-down view to read its layout, a windowsill wants a frontal view,
a staircase wants an angle that actually shows the steps. This must be
**configuration on the product type, not a chain of `if`s inside
`ThreeScene`** — the same declarative pattern already used for
`supportsEdgeWork`/`additionalWorks`.

**Where it lives:** a new, non-pricing field on each entry of
`PRODUCTS` in `product-types.js` — `cameraPreset: '<name>'`, naming one of
the entries in `visualizer/constants.js`'s `CAMERA_PRESETS` registry (the
same registry the four manual buttons already read from). This is
metadata about the product, exactly like `supportsEdgeWork`, so it belongs
where the rest of that metadata lives — a separate "3D-only product table"
would be exactly the kind of parallel product-definition system this
design already rules out. It is not a pricing field, so it does not
conflict with "pricing-relevant fields of `product-types.js` are
untouched."

`CAMERA_PRESETS` gains four new named directions alongside the existing
`top`/`front`/`side`/`iso` (all first-pass approximations of the
requested angles, expected to need visual tuning once seen rendered, not
final numbers):

| Name | Direction (first pass) | Used as default for |
|---|---|---|
| `top` (existing) | `[0, 1, 0.0001]` | Полы |
| `front` (existing) | `[0, 0.3, 1]` | Стены, Фасады, Панно |
| `iso-high` | `[1, 1.1, 1]` | Столешницы в ванную — isometric, a bit more top-down than plain `iso` |
| `iso-eye-level` | `[1, 0.6, 1]` | Столешницы на кухню — isometric, closer to a standing person's eye line |
| `front-high` | `[0, 0.6, 1]` | Подоконники — frontal, a bit more top-down than plain `front` |
| `iso-side-high` | `[1.3, 0.7, 0.4]` | Лестницы, Ступени — angled from the side to read step geometry |

**Data flow (declarative end to end):**
```
PRODUCTS[key].cameraPreset (product-types.js)
  → ConstructorState.product.cameraPreset (constructor-state.js, passthrough)
  → ProductGeometryModel.cameraPreset (geometry-model.js, defaults to 'iso' if the product defines none)
  → ThreeScene.update() applies it as the initial view on the first mesh, and
    records it as the "Reset View" default via camera-preset-tracker.js
```

**Reset View semantics — must be genuinely declarative, not "last viewed":**
"Сбросить вид" always returns to the *current product's* default
`cameraPreset`, never to whatever the user last manually navigated away
from. Concretely: Полы defaults to `top`; the client manually clicks
"Изометрия"; clicking "Сбросить вид" must go back to `top`, not stay on
`iso`. If the client then switches to a different product type, that
product's own `cameraPreset` immediately becomes the new Reset target.

This is implemented with `visualizer/camera-preset-tracker.js`, a tiny
module deliberately kept free of any Three.js import so it's unit-testable
without a WebGL context — the actual property being guaranteed (manual
view changes never affect what Reset returns to) is a pure state-machine
question, independent of how the camera itself is drawn:

```js
const tracker = createCameraPresetTracker();     // defaultPreset = 'iso'
tracker.setDefaultFromGeometryModel(geometryModel); // called ONLY from ThreeScene.update()
tracker.getDefaultPreset();                       // called ONLY from ThreeScene.resetView()
```

`ThreeScene.setView(name)` (driven by the four manual buttons) never calls
`setDefaultFromGeometryModel` — by construction, no code path lets a
manual click change the stored default. `update()` calls
`setDefaultFromGeometryModel(geometryModel)` on *every* call (not just the
first), so switching products mid-session correctly updates the Reset
target even without a page reload.

**Explicitly deferred (not part of this addition):** geometry orientation
per product type. Today `buildGeometryModel()` always produces the same
flat, horizontal box shape regardless of product — a "Стена"/"Фасад"/
"Панно" gets a front-facing camera, but the box itself isn't yet modeled
as a vertical surface. Making the geometry itself orientation-aware (and
eventually shape-aware, e.g. actual stair-step geometry for
Лестницы/Ступени) is separate, larger follow-up work, tracked in
"Explicitly out of scope" below.

## Resize / disposal / robustness

- `ThreeScene` listens for container resize (`ResizeObserver`) and updates
  the renderer size + camera aspect ratio.
- `dispose()` frees geometries/materials/textures and the renderer's WebGL
  context; called if the panel is ever torn down (not expected in the
  vertical slice, but the method exists from the start so it isn't bolted
  on later).
- If `isWebglAvailable()` is false, none of `visualizer/*` runs — the
  calculator's price flow is completely unaffected either way, since
  `constructor-state.js`/`readConstructorState()` has no dependency on
  Three.js or WebGL.

## Vertical slice (first implementation)

In scope:
- straight (rectangular) countertop only;
- real current `widthM`/`lengthM` from the constructor;
- visual thickness via `visualThicknessM` fallback (never shown as a real
  spec to the client);
- selected material via `resolveMaterial()` (fallback color, no texture yet);
- camera: rotate, zoom, pan, reset, and the 4 view presets;
- live update on dimension change and on material change.

Explicitly deferred to later slices (in this order): L-shape, sink,
cooktop, edge rendering, backsplash, curb, island, bar counter, bookmatch.

## Testing

- `visualizer/geometry-model.js` and `visualizer/material-adapter.js` are
  pure functions — unit tests via `node:test`, same pattern as
  `tests/pricing.test.js` / `tests/product-types.test.js`.
- `constructor-state.js`'s edge-adapter shim (priority-order resolution)
  gets its own test: given several of the 5 legacy fields non-zero at once,
  confirm the priority order is respected regardless of which field has the
  largest value.
- `visualizer/three-scene.js` is inherently browser/WebGL-only and is not
  unit tested in Node; it's verified manually (desktop + mobile viewport,
  WebGL-disabled browser profile, console-error check) per the project's
  existing practice for browser-only UI code (`material-picker.js` has no
  Node-side rendering tests either, only its pure filter/sort functions do).

## Explicitly out of scope (follow-up work)

- A real single-select edge-type control in the actual calculator UI
  (would let `constructor-state.js` drop its priority-order adapter shim).
- Real coordinate input for sink/cooktop placement.
- A real product thickness field.
- L-shape as an actual selectable, priced product shape (would also touch
  `pricing.js`'s slab-fitting geometry, which is explicitly out of scope
  here).
- Bookmatch UI and its actual UV/texture-mirroring implementation.
- Real seamless stone textures (`textureUrl` wiring is ready; sourcing/
  producing the actual tileable images is separate work).
- Geometry orientation/shape per product type (vertical-surface geometry
  for Стены/Фасады/Панно, actual stair-step geometry for Лестницы/Ступени).
  The per-product default camera angle is in place; the box shape itself
  is still the same flat horizontal slab for every product.
