# Stellar Neighbourhood Map — Technical Project Plan

Nov 4, 2026 · @simon

## Overview

Build a static, local-first web app that renders every known star system within a configurable radius of the Sun (default 50 ly, data built to 100 ly) in true 3D positions, so the author can plan travel times and trade routes with real distances.

**Goals**

- Accurate heliocentric 3D positions in light-years, Sun at origin, galactic orientation (galactic plane horizontal, galactic centre along +X).
- Select, highlight and tag stars; draw lines (routes) between any two stars with live distance labels.
- Search by any name a star goes by: proper name, Bayer/Flamsteed, Gliese/GJ, HD, HIP, plus custom in-world names.
- Detail modal for the selected system: spectral type, distance, magnitude, luminosity, temperature, estimated mass, multiplicity (companions), and confirmed exoplanets.
- World-building tools: travel-time calculator under a configurable drive model, jump-range network (all pairs within N ly), shortest-path routing, and named regions/factions.
- Save, load and export the author's world (routes, tags, notes, custom names) as JSON.

**Non-goals (v1)**

- No backend, accounts or multi-user editing.
- No live API calls at runtime; all astronomy data is baked at build time.
- No orbital mechanics or planet-surface rendering.
- Proper-motion time travel (moving stars by epoch) is a v2 stretch goal, not v1.

## Tech stack

All TypeScript, front to back: a Vite + React SPA rendering with three.js through React Three Fiber, plus Node build scripts that bake the catalogue into static JSON.

| Layer | Choice | Why |
| --- | --- | --- |
| Build / dev server | Vite 6+, TypeScript strict | Fast HMR, static output deployable anywhere |
| UI | React 19 | Modal, panels, search box |
| 3D | three.js + @react-three/fiber + @react-three/drei | Declarative scene; drei gives OrbitControls/CameraControls, Html, Line |
| Star rendering | Custom `THREE.Points` with a shader material | One draw call for thousands of stars, per-star colour and size |
| Labels | troika-three-text (via drei `Text`) with LOD culling | Crisp SDF text; avoids thousands of DOM nodes |
| Routes | drei `Line` (Line2 / LineMaterial) | Screen-space line width, dashes, per-route colour |
| State | Zustand (+ `persist` middleware) | Small, no boilerplate, easy persistence |
| Search | MiniSearch | Fuzzy + prefix search across many alias fields, \~7 KB |
| Styling | Tailwind CSS + Radix UI Dialog/Popover | Accessible modal and popovers quickly |
| Persistence | IndexedDB via `idb-keyval`; JSON file import/export | Survives reloads; world file is portable and git-able |
| Data pipeline | Node 22 + `tsx` scripts, `csv-parse`, `zod` | Same language as the app; validated output |
| Testing | Vitest (unit), Playwright (e2e smoke) | Pipeline math and UI flows |
| Lint/format | ESLint (typescript-eslint) + Prettier | Standard |

## Data sources and build pipeline

Two public catalogues are merged once at build time into static JSON in `public/data/`; the app never calls an external API at runtime.

| Source | What it gives | Access | Licence |
| --- | --- | --- | --- |
| [HYG Database v4.2](https://astronexus.com/hyg) (Hipparcos + Yale + Gliese) | Positions, distance, magnitude, spectral type, colour index, luminosity, proper names, catalogue IDs, multiple-star links | CSV download (Codeberg / astronexus.com); pin version + SHA-256 | CC BY-SA 4.0 — attribute in-app |
| [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html) `pscomppars` table | One row per confirmed planet: host name, HIP/HD IDs, distance, orbit, radius, mass, discovery method/year | TAP sync query, CSV | Public; acknowledge archive |
| `data/overrides/*.json` (hand-maintained) | Corrections and nearby objects HYG lacks (late M, L/T/Y brown dwarfs, e.g. Luhman 16, WISE 0855−0714) | Committed to repo | Own |

HYG `x, y, z` are equatorial and in parsecs; `dist` of 100000 means unknown and must be dropped. See [HYG field details](https://astronexus.com/projects/hyg-details).

Pipeline (`scripts/build-data.ts`, run with `npm run data`):

1. **Fetch** — download HYG CSV to `data/raw/` (skip if checksum matches); run the TAP query below to `data/raw/exoplanets.csv`.
2. **Filter** — keep the Sun plus stars with `0 < dist < 30.66 pc` (100 ly).
3. **Transform** — rotate equatorial to galactic coordinates, convert pc to ly (× 3.261564).
4. **Classify** — parse `spect` into class (O B A F G K M L T Y, D for white dwarfs), subclass and luminosity class; derive display colour from colour index (B−V → temperature → RGB), falling back to class colour.
5. **Derive** — estimated mass from luminosity for main-sequence stars (flag `massEstimated: true`); habitable-zone inner/outer edge in AU from luminosity.
6. **Group systems** — build systems from HYG `comp` / `comp_primary` / `base`, then merge any unlinked stars closer than 0.25 ly to each other.
7. **Cross-match planets** — match host by HIP → HD → normalised Gliese/GJ name → position (< 60 arcsec and < 10% distance). Unmatched hosts within 100 ly become new star records from archive coordinates (catches hosts like Teegarden's Star that Hipparcos misses).
8. **Apply overrides**, then build the alias list per star for search.
9. **Validate** with zod schemas; write `stars.json`, `systems.json`, `planets.json`, `meta.json` (source versions, build date, counts, attribution text). Fail the build on schema errors.

Exoplanet query (URL-encode in the script):

```sql
select pl_name, pl_letter, hostname, hd_name, hip_name, gaia_id, ra, dec, sy_dist,
       sy_snum, sy_pnum, discoverymethod, disc_year, pl_orbper, pl_orbsmax,
       pl_orbeccen, pl_rade, pl_bmasse, pl_eqt, pl_insol, st_spectype, st_teff
from pscomppars where sy_dist < 30.7
```

Equatorial (ICRS) to galactic rotation, applied to HYG `x, y, z` then scaled to light-years:

```latex
\begin{pmatrix} x_g \\ y_g \\ z_g \end{pmatrix} = 3.261564 \begin{pmatrix} -0.0548755604 & -0.8734370902 & -0.4838350155 \\ 0.4941094279 & -0.4448296300 & 0.7469822445 \\ -0.8676661490 & -0.1980763734 & 0.4559837762 \end{pmatrix} \begin{pmatrix} x_{eq} \\ y_{eq} \\ z_{eq} \end{pmatrix}
```

In the scene, map galactic (x, y, z) to three.js (x, z, −y) so the galactic plane is horizontal and galactic north is up.

## Data model

Two layers that never mix: the read-only **catalogue** baked by the pipeline, and the editable **world** the author creates, which references catalogue IDs only.

```typescript
// src/types/catalogue.ts — generated by the pipeline, read-only
export type SpectralClass = 'O'|'B'|'A'|'F'|'G'|'K'|'M'|'L'|'T'|'Y'|'D'|'unknown';

export interface Star {
  id: string;              // stable: 'hyg:<id>' or 'ovr:<slug>' or 'exo:<hostname>'
  systemId: string;
  names: { proper?: string; bayer?: string; flamsteed?: string; gliese?: string;
           hd?: string; hip?: string; hr?: string; other: string[] };
  displayName: string;     // best available: proper > bayer > gliese > HD > HIP
  pos: [number, number, number]; // galactic, light-years, Sun at origin
  distLy: number;
  mag?: number; absMag?: number;
  spectral: { raw?: string; cls: SpectralClass; sub?: number; lumClass?: string };
  tempK?: number; lumSolar?: number;
  massSolar?: number; massEstimated: boolean;
  hzAu?: [number, number]; // habitable-zone inner, outer
  colorHex: string;
  isPrimary: boolean;
  planetIds: string[];
  source: 'hyg' | 'exoplanet-archive' | 'override';
}

export interface StarSystem {
  id: string;
  name: string;            // e.g. 'Alpha Centauri'
  starIds: string[];       // primary first
  pos: [number, number, number]; // primary's position
  distLy: number;
  planetCount: number;
}

export interface Planet {
  id: string; name: string; letter: string; hostStarId: string;
  periodDays?: number; semiMajorAu?: number; eccentricity?: number;
  radiusEarth?: number; massEarth?: number; eqTempK?: number; insolEarth?: number;
  discoveryMethod: string; discoveryYear: number;
  inHabitableZone?: boolean; // derived from host hzAu
}
```

```typescript
// src/types/world.ts — user-authored, persisted and exported
export interface World {
  schemaVersion: 1;
  name: string;
  drive: DriveModel;
  tags: Tag[];               // e.g. 'Colonised', 'Core world', faction names
  starMeta: Record<string, { tagIds: string[]; customName?: string; notes?: string }>;
  routes: Route[];
  regions: Region[];
  view?: { camera: [number, number, number]; target: [number, number, number] };
}

export interface Tag { id: string; label: string; color: string; }

export interface Route {
  id: string;
  name?: string;
  waypoints: string[];       // system IDs, length >= 2
  kind: 'trade' | 'military' | 'exploration' | 'custom';
  color: string; dashed: boolean; width: number;
  notes?: string;
}

export interface Region { id: string; name: string; color: string; systemIds: string[]; }

export type DriveModel =
  | { type: 'sublight'; fractionC: number; accelG?: number }          // relativistic option
  | { type: 'ftl-speed'; multipleOfC: number }                        // e.g. 50c
  | { type: 'jump'; maxJumpLy: number; daysPerJump: number };          // Traveller-style
```

Catalogue IDs must stay stable across data rebuilds so saved worlds keep working; the pipeline writes `meta.json.idMap` for any ID that changes.

## Architecture and project structure

A static SPA: build scripts produce JSON, the app loads it once into an in-memory catalogue store, and a separate world store holds everything the author edits. Rendering, UI and graph logic all read from those two stores.

&#91;embedded content: app architecture · build time to runtime\]

Only the world store is written back to disk; the catalogue is rebuilt by rerunning the pipeline, never edited in the app.

```text
stellar-atlas/
├─ scripts/
│  ├─ build-data.ts          # pipeline entry (steps 1–9)
│  ├─ lib/coords.ts          # equatorial→galactic, pc→ly
│  ├─ lib/spectral.ts        # spectral-type parser, B−V→temp→RGB
│  ├─ lib/crossmatch.ts      # planet host matching
│  └─ lib/systems.ts         # multiple-star grouping
├─ data/
│  ├─ raw/                   # gitignored downloads
│  └─ overrides/             # hand-curated JSON
├─ public/data/              # generated: stars, systems, planets, meta
├─ src/
│  ├─ types/                 # catalogue.ts, world.ts
│  ├─ store/
│  │  ├─ catalogue.ts        # loaded data + lookup maps (by id, by system)
│  │  ├─ world.ts            # routes, tags, notes, drive model (persisted)
│  │  └─ ui.ts               # selection, hover, filters, modes, camera target
│  ├─ lib/
│  │  ├─ search.ts           # MiniSearch index build + query
│  │  ├─ graph.ts            # jump network, Dijkstra, k-nearest
│  │  ├─ travel.ts           # travel time per DriveModel
│  │  └─ io.ts               # world import/export, schema migration
│  ├─ scene/
│  │  ├─ StarField.tsx       # Points + shader, picking
│  │  ├─ Labels.tsx          # LOD labels
│  │  ├─ Routes.tsx          # route lines + distance labels
│  │  ├─ Grid.tsx            # galactic-plane grid, range rings, drop lines
│  │  ├─ Highlights.tsx      # selection ring, tag halos
│  │  └─ CameraRig.tsx       # controls, fly-to
│  ├─ ui/
│  │  ├─ SearchBar.tsx  StarModal.tsx  RoutePanel.tsx
│  │  ├─ FilterPanel.tsx  TagManager.tsx  Toolbar.tsx
│  │  └─ TravelCalculator.tsx
│  ├─ App.tsx
│  └─ main.tsx
└─ tests/  (unit/, e2e/)
```

## Feature specs

Seven feature areas; the first five are the brief, the last two serve world-building.

### 1. 3D map

- Sun at origin, marked distinctly. Stars as points coloured by spectral class, sized by absolute magnitude (clamped so dim M dwarfs stay visible).
- Galactic-plane grid with rings every 5 ly, plus **drop lines** from each star to the plane so height above/below is readable. Both toggleable.
- Camera: orbit, pan, zoom (CameraControls). Double-click a star to fly to it and make it the orbit target; `H` returns to Sol.
- Radius slider 5–100 ly (default 50). Filters: spectral class, has planets, multiple systems only, tagged only.
- **Reference star**: any star can be set as the reference; all distances in the UI are then measured from it instead of Sol.
- Hover tooltip: name, class, distance from reference. Touch: tap selects, long-press shows the tooltip, one-finger orbit, pinch zoom, two-finger pan; UI panels collapse into a bottom sheet below 768 px.

### 2. Selection and highlighting

- Click selects a system (raycast on Points with a screen-space threshold); shift-click adds to a multi-selection.
- Selected system: pulsing ring, forced label, opens the detail modal.
- Tags: user-defined label + colour (e.g. "Colonised", "Hegemony", "Off-limits"). Tagged stars get a halo in the tag colour; a star with several tags shows the first and a count badge.
- Custom in-world names display alongside the real name and are searchable.
- Range sphere: translucent sphere of N ly around the selection, with a list of systems inside.

### 3. Routes and lines

- **Route mode** (`R`): click systems in order to add waypoints; `Enter` saves, `Backspace` removes the last, `Esc` cancels.
- Each leg labelled with distance (ly, 2 dp) and travel time under the active drive model; route total shown in the panel.
- Route panel: list, rename, set kind (trade / military / exploration / custom), colour, dashed, width, notes; reorder and delete waypoints; show/hide; delete route.
- **Ruler** (`M`): temporary measure between two stars, not saved.
- **Auto-route**: pick start and end; shortest path through the jump network (max jump length from drive model); preview, then save as a route.

### 4. Search

- Index: display name, every catalogue designation, custom names, tag labels. Prefix + fuzzy (MiniSearch, fuzzy 0.2), top 10 results showing name, class, distance.
- Normalise queries and aliases: Greek letters ↔ names ↔ 3-letter abbreviations (`α Cen` = `alpha cen` = `alp cen`); constellation full names ↔ abbreviations; catalogue IDs ignore spaces and prefixes (`GJ 699` = `Gliese 699` = `gl699`).
- `/` focuses search; arrow keys move; `Enter` selects, flies to the system and opens the modal.

### 5. Detail modal

Non-blocking dialog docked right on desktop (map stays interactive), full-screen sheet below 768 px.

- **Header**: display name, custom name, all designations, system name.
- **Star facts**: raw spectral type + plain reading ("K1 V — orange main-sequence dwarf"), temperature, luminosity, mass (marked "est." when derived), apparent/absolute magnitude, distance from Sol and from reference star, galactic x/y/z.
- **Companions**: tabs per star in the system.
- **Planets**: table of name, mass (M⊕), radius (R⊕), period, semi-major axis, equilibrium temp, discovery method/year, habitable-zone flag; a small HZ strip drawing the zone and planet positions; link to the archive's overview page; clear "No confirmed exoplanets" empty state.
- **Nearest neighbours**: 8 closest systems with distance and travel time; click to select.
- **World**: tags, custom name, notes (plain text/markdown); actions: start route here, set as reference, show range sphere.

### 6. World-building tools

- **Drive model** setting (one per world) drives every travel-time figure. Default is the jump drive (the book's FTL model): max jump length and days per jump are the key world parameters, and the jump network below is the primary planning view. Formulas below.
- **Jump network** overlay: faint lines between every pair of visible systems within the max jump length; colour connected components so isolated clusters and gaps stand out.
- **Hub finder**: betweenness centrality on the jump graph ranks chokepoint systems — natural trade hubs and contested borders.
- **Regions**: assign systems to named, coloured regions (factions, sectors); shown as halos + legend.

Travel time for distance d at light speed c (the calculator shows both ship and Earth time for sublight):

```latex
\text{Coasting at } \beta: \quad t = \frac{d}{\beta c}, \qquad \tau = t\sqrt{1-\beta^2}
```

```latex
\text{Constant } a \text{, flip at midpoint:} \quad \tau = \frac{2c}{a}\,\mathrm{arcosh}\!\left(1+\frac{a d}{2c^2}\right), \qquad t = \frac{2c}{a}\sqrt{\left(1+\frac{a d}{2c^2}\right)^2-1}
```

FTL multiple k: t = d / (k × c). Jump drive: legs = hops on the shortest path with every hop ≤ max jump; time = legs × days per jump.

### 7. Probe trajectory overlay

- Probes: Voyager 1, Voyager 2, Pioneer 10, Pioneer 11, New Horizons.
- Data: heliocentric position and velocity at a reference epoch from [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), fetched by the pipeline into `probes.json`; extrapolate in a straight line (solar gravity is negligible at these distances).
- Render: a ray from Sol along each heading, plus a marker at the probe's position for a chosen year. Year slider from today to +100,000 years shows distance travelled in ly.
- Closest-approach table per probe: stars within a set distance of the path, with closest distance (ly) and year. v1 holds star positions fixed; flag this in the UI since proper motion matters over tens of millennia.
- Pulsar-map layer: the 14 pulsars from the Voyager Golden Record plaque as direction arrows at the map edge (they lie far beyond 100 ly), each labelled with its plaque period. Source the directions from published catalogue positions, not hand-typed values.

## Rendering and performance

Target 60 fps on a 2020-era laptop GPU with every star within 100 ly loaded (a few thousand points) and 50 saved routes.

- **Stars**: one `THREE.Points` with a `BufferGeometry` (position, colour, size, flags attributes) and a custom shader: soft round sprite, additive glow, size attenuation with min/max pixel clamp. Filters and highlights update a `flags` attribute, never rebuild geometry.
- **Picking**: raycaster `params.Points.threshold` scaled to camera distance; on hover throttle to 30 Hz. Keep a spatial index (simple uniform grid or `kd-tree`) for nearest-neighbour and range queries in `lib/graph.ts`.
- **Labels**: cap \~150 visible. Priority: selected > route endpoints > tagged > proper-named > nearest to camera. Recompute on camera-change end, not every frame.
- **Drop lines**: one `LineSegments` geometry for all stars.
- **Routes**: one Line2 per route (fine at < 200 routes); leg labels via the same LOD label system.
- **Jump network**: precompute pairs with the spatial index (O(n·k)); render as one `LineSegments`; recompute only when max jump or visible set changes. Run centrality in a Web Worker (Brandes, O(V·E)).
- **Scale cues**: logarithmic zoom speed; optional distance fog toggle; 1 ly scale bar in the corner.
- **Load**: `stars.json` gzip target < 1 MB; show a loading state; build search index after first render (idle callback).

## Persistence, import and export

The world autosaves to IndexedDB and exports as a single human-readable JSON file the author can version in git alongside the manuscript.

- Autosave the world store (debounced 1 s) via Zustand `persist` + `idb-keyval`. Support multiple named worlds with a switcher.
- **Export**: `world-<name>-<date>.json` (the `World` type, pretty-printed, keys sorted for clean diffs).
- **Import**: validate with zod; run `migrate(schemaVersion)`; report unknown star IDs rather than failing; offer merge or replace.
- **Snapshot export**: PNG of the current view (`gl.domElement.toDataURL` with `preserveDrawingBuffer`) for notes and the manuscript.
- **CSV export** of routes (route, leg, from, to, ly, travel time) for spreadsheets.
- Undo/redo (`Ctrl/Cmd+Z`) on world edits via a small command history in the world store, 100 steps.

## Milestones and acceptance criteria

Eight milestones in strict order; M3 is the first point the map is useful for the novel, M6 completes the world-building toolset.

&#91;embedded content: build order · 8 milestones, MVP at M3\]

Each milestone is done when every box below is ticked, tests pass and lint is clean.

**M0 — Scaffold**

- [x] Vite + React + TS strict app runs with an empty R3F canvas
- [x] ESLint, Prettier, Vitest, Playwright configured; `npm test` passes
- [x] `CLAUDE.md` lists commands and conventions

**M1 — Data pipeline**

- [ ] `npm run data` produces `stars.json`, `systems.json`, `planets.json`, `meta.json` that pass zod validation
- [ ] Coordinate, spectral and cross-match unit tests pass
- [ ] Build log reports star, system and planet counts plus unmatched hosts

**M2 — 3D map**

- [ ] All stars within the radius render as coloured points at 60 fps
- [ ] Galactic grid, range rings and drop lines toggle
- [ ] Orbit/pan/zoom, double-click fly-to, `H` returns to Sol; radius slider and class filters work

**M3 — Selection and modal (MVP)**

- [ ] Hover tooltip; click selects with ring and forced label; shift-click multi-select
- [ ] Modal shows star facts, companions, planets table, HZ strip and nearest neighbours
- [ ] LOD labels capped at \~150 with the priority order

**M4 — Search**

- [ ] `/` focuses; alias normalisation cases pass; `Enter` selects, flies to and opens the modal

**M5 — Routes and world**

- [ ] Route mode creates multi-leg routes with per-leg distance labels; route panel edits all fields
- [ ] Ruler tool; tags with halos; custom names and notes
- [ ] Autosave survives reload; JSON export/import round-trips; undo/redo works

**M6 — World-building tools**

- [ ] Drive model setting updates every travel time; travel unit tests pass
- [ ] Jump-network overlay with connected-component colours
- [ ] Auto-route via shortest path; hub ranking computed in a Web Worker
- [ ] Reference-star mode, range sphere and probe trajectory overlay with closest-approach table

**M7 — Polish**

- [ ] Regions with legend; PNG snapshot and routes CSV export
- [ ] About panel with HYG and NASA Exoplanet Archive attribution and data build date
- [ ] Full Playwright suite passes (desktop, 768 px tablet and 390 px phone viewports); performance target met with 50 routes

## Testing, risks and handoff notes

### Tests

- **Coordinates** (Vitest): Sun at (0,0,0); Alpha Centauri A ≈ 4.37 ly and Sirius A ≈ 8.6 ly (± 0.05); the galactic-centre direction (RA 266.405°, Dec −28.936°) maps to +X within 0.1°.
- **Spectral parser**: `G2V`, `M5.5Ve`, `K0III`, `DA2`, `sdM1`, `L8`, `T7.5`, empty string.
- **Cross-match**: Proxima Cen b → Proxima Centauri; Tau Ceti, Epsilon Eridani, Barnard's Star and Teegarden's Star hosts resolve; build log lists unmatched hosts and the build fails if any host < 30 ly is unmatched.
- **Travel**: 1 g flip-and-burn over 4.37 ly gives ship time ≈ 3.6 yr and Earth time ≈ 6.0 yr.
- **Graph**: Dijkstra and jump limits on a hand-built 6-node graph; centrality on a star graph puts the hub first.
- **Search**: alias normalisation cases from Feature 4.
- **E2E** (Playwright): load → search "tau ceti" → modal lists its planets; build a 3-stop route → reload → route persists; export then import round-trips identically.

### Risks

| Risk | Mitigation |
| --- | --- |
| HYG misses faint nearby objects found after Hipparcos (brown dwarfs, faint M dwarfs) | Planet-host injection + overrides file now; Gaia nearby-star catalogue merge as v2 |
| Wrong planet–host matches | Ordered ID matching, positional fallback with tight tolerance, tests on known hosts, build log of every positional match |
| Exoplanet data goes stale | `npm run data` re-fetches; `meta.json` build date shown in the About panel |
| Catalogue IDs change on rebuild, breaking saved worlds | IDs keyed on HIP/Gliese where present; `idMap` migration |
| 3D clutter makes depth hard to read | Drop lines, plane grid, filters, label LOD, reference-star mode |
| CC BY-SA share-alike on derived data | Credit HYG in-app; ship generated JSON under CC BY-SA if the site is public |

### Decisions

- Radius: default 50 ly, data built to 100 ly.
- Drive model: FTL jump drive is the default world setting.
- Platform: desktop-first; must stay usable on tablet and phone (touch controls, responsive panels).
- Hosting: GitHub Pages and Vercel (see Deployment).
- Probe trajectory overlay: in scope, Feature 7, milestone M6.

### Notes for Claude Code

- Create `CLAUDE.md` first with commands (`npm run data`, `dev`, `test`, `e2e`, `lint`) and these conventions.
- Units: light-years everywhere in `src/`; parsecs only inside `scripts/`.
- No runtime network calls to external services. Commit generated `public/data/`; gitignore `data/raw/`.
- TypeScript strict, no `any`; catalogue types are read-only.
- Build milestone by milestone; a milestone is done when its acceptance boxes are ticked, tests pass and lint is clean. Stop and summarise after each.
- Ask before changing the `World` schema; any change bumps `schemaVersion` and adds a migration.

### Deployment

- Static build only (`vite build` → `dist/`); no server code, so both hosts serve the same output.
- **GitHub Pages**: GitHub Actions workflow builds on push to `main` and deploys with `actions/deploy-pages`. Set Vite `base` from an env var (`/<repo-name>/` for Pages, `/` elsewhere) and load data via `import.meta.env.BASE_URL`.
- **Vercel**: import the repo, framework preset Vite, output `dist`; preview deploys per PR, production on `main`.
- Add both to M0 so every milestone ships to a live URL.
