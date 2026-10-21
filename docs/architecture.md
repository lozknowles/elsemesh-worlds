# Architecture and ElseMesh integration

## Project structure

- `src/domain/world.ts` owns the versioned project model, validation, height sampling, sculpting and painting. It is independent of rendering.
- `src/domain/persistence.ts` owns local IndexedDB saves. React state is transient; Three.js viewport objects are derived from the project.
- `src/ui/App.tsx` and `src/ui/styles.css` implement the editor. The viewport currently uses React Three Fiber and WebGL as a labelled editor-only preview adapter.
- `src/ui/App.tsx` emits the portable player package using the domain validator; it does not send projects to a service.
- `work/ElseMesh-player-harness` is a detached worktree at the pinned upstream SHA. Its local `world-test.html` loads the exact exported JSON package into ElseMesh's `Engine`, WebGPU `MeshRenderer`, `Player` and `Colliders` classes. These local harness changes are not upstream integration changes.

## Pinned runtime inspection

Reference: isolated read-only ElseMesh checkout, clean at `95719848d5ffa4428b57c75c272483e1c2113a72`.

1. **GPU and rendering:** `src/engine/gpu/GPU.js` obtains a browser WebGPU adapter/device and configures the canvas. `src/core/Engine.js` creates the custom `MeshRenderer`, `PerspectiveCamera` and `Scene`. `src/engine/render/SceneRenderer.js` handles the game's opaque/late passes; `src/world/TerrainGPU.js` owns terrain textures and WGSL terrain queries; `src/world/Terrain.js` creates the displaced CDLOD terrain mesh. There is no standalone reusable world viewport component.
2. **Movement and collision:** `src/player/Player.js` owns WASD acceleration, gravity, jump, grounded state, capsule stepping and camera pose. It expects game dependencies including terrain, query, boat and cave interfaces. `src/world/Colliders.js` supplies solid and walkable box/cylinder queries; `resolveCapsule` resolves player penetration. The harness uses the actual Player and Colliders classes, with narrow terrain/query stubs and no boat, water, network or cave systems.
3. **Terrain agreement:** upstream `TerrainData.heightAt` queries the game's procedural CPU heightmap, while `TerrainGPU` uploads a 2048² height texture for WGSL sampling and `Terrain` displaces CDLOD geometry. The pinned source contains no external heightmap injection path. The isolated loader supplies a bounded project-specific `heightAt` function and mesh derived from the same project arrays; both use the editor's documented triangulation. This proves the isolated path, not the production island's GPU terrain pipeline.
4. **World data and persistence:** the inspected main app constructs its world systems in `src/App.js`; the repo has procedural layout data and a custom binary glTF loader in `src/engine/loaders/GLTF.js`. `elsemesh.region/1` is federation metadata, not arbitrary world content. No general external editable-world load/save contract exists in this pinned runtime. The editor therefore owns its separate `elsemesh.worlds.project/1` schema and local IndexedDB save, with an explicit export envelope.
5. **Blender export:** `npm run world:export` calls `tools/blender/export-terrain.mjs` and emits geometry exchange data for Blender. It is not an ElseMesh player package and the main runtime does not import it.

## Integration boundary

The shared boundary is the validated world data and terrain sampler. The editor stays independent and derives its viewport from that data. The isolated harness consumes the package, then derives an ElseMesh geometry mesh, ground sampler and collision records from it. The loader rejects unsupported package versions and content before replacing the active world. An upstream integration would still need a reviewed world activation route in `src/App.js`, asset capability checks against the custom GLB parser, and explicit material/terrain GPU baking. The present test harness does not modify that upstream app entry point and is not evidence of a released compatibility contract.

## Gate records

### PLAN gate

- **Trigger:** substantial implementation, as required by the workspace `AGENTS.md`.
- **Evidence:** an existing uncommitted editor foundation was available; its package omitted asset bytes and was explicitly provisional. The clean pinned runtime had no generic package loader.
- **Architect finding:** prioritize a narrow exporter → package → isolated real-player importer path; retain the authoring/runtime/editor-state separation and bound data before broadening tools.
- **Decision:** copy the existing project into this task's own Git history; keep the clean reference clone and the dirty federation checkout untouched; make the runtime harness a separate detached worktree at the pinned SHA.

### COMPLETION gate

- **Trigger:** before declaring the functional milestone complete.
- **Evidence/findings/decision:** pending browser round-trip, exact artifact hash, movement/collision proof, regressions and architect review.

## Standalone graphics preview plan (19 October 2026)

The user corrected scope: all implementation belongs to the standalone builder; existing game source must not be changed. The previous player harness is not a completion gate for the editor.

PLAN gate: the architect reviewed the graphics integration. A separate iframe containing a builder-owned copy of the pristine pinned ElseMesh WebGPU engine avoids shared GPU singleton lifecycle issues. The preview must render terrain and objects in the same native scene as Atmosphere, Sky and the default SkyProClouds. Compositing a native sky behind the Three.js editor does not establish matching lighting. The primary accepted this architecture. All copied source and required cloud noise assets live inside this builder; game checkouts are read-only references.

The requested moving mist is an additional effect. Upstream AirHaze provides atmospheric and marine haze; any added drifting spatial density must be identified as a builder effect until the game supports it. Matching source does not alone prove identical output: render settings, materials, postprocessing and browser/device must also agree. Browser evidence and completion review remain pending.

### Graphics and vertex COMPLETION gate (19 October 2026)

Architect bounded source review found no blocking defect for local builder scope. Evidence: production build and lint pass; ten domain tests pass; native Edge run 680 frames with no console/GPU errors, day/night/mist screenshots and saved settings; terrain vertex drag and Undo at65/257 grids, reload persistence and duplicate history fix verified in browser. Primary accepts this bounded local feature delivery.

Limitations: native preview uses timeOfDay and sunAzimuth, not editor fog/skyColor/sunElevation. Mist is a separate builder effect. Terrain palette materials and static untextured GLBs do not establish exact game scene parity. Subpath deployment, ocean rendering, missing-device/asset failure UI, and exhaustive preview lifecycle/performance acceptance remain unqualified. Clean reference checkout status was verified empty; only standalone project changed in this phase.

## Landscape and weather PLAN gate (19 October 2026)

Architect approved one shared drawn-feature model and geometry generator, consumed by editor and native adapters. Optional features normalize to an empty list for older projects. Paths follow terrain; bridge decks and river surfaces have explicit heights; waterfalls have explicit drop. Pen gestures use finish/cancel and one Undo commit. New effects must not imply existing game simulation or automatically carve terrain. Trees reuse bounded procedural geometry with accurate parity limits. Weather stores settings, not particles/timers. Acceptance includes each feature, point edits, Undo, save/reload/export, both renderers and visible rain/water animation. Primary accepted this plan and assigned independent feature, native weather, and tree work; game source remains read-only.

Landscape plan amendment: add closed lake outlines and adjustable water level with terrain clipping. Authored rivers connect inlets/outlets across descending levels to waterfalls. Show elevation/flow warnings rather than claiming a hydrological volume solver or erosion. Lake surface and river centreline remain editable project data.

### Landscape/weather COMPLETION gate

Architect conditionally passed bounded source review. Primary resolved wording: lake connections snap to nearest wet surface point, not necessarily shoreline. Pen E2E passed all6 features, level edits, Undo/Redo, cancel, reload and downloaded-project reopening.24 domain tests pass. Native Edge weather test passed with all3 species and7 features, rain and lightning,0 GPU/console errors; visual lake clipping checked separately. Build and lint pass. Primary accepts local feature delivery with authored water/no fluid solver, numeric feature vertices, visual bridges/no bridge collision, approximate tree/material parity and unqualified maximum-size performance. Separate asset-library source reviewed read-only and not merged; review defects recorded in outputs.

## Unified asset-library PLAN gate

Architect approved selective integration into the active builder. Authoritative App/domain retains landscape pens, vertex tools, tree species and weather. Shared admission checks GLB structure, self-contained resources, supported content and decoded usable geometry; metadata defines stable source material slots/bounds. Slot overrides validate on presence includingfalse/null, duplicates and range. Ground placement offsets transformed bounds; bytes+object insert atomically with generation token and limits checked after async admission. Native preserves groups/source slots and supported overrides with explicit texture limits. Primary accepted; independent admission/schema, libraryUI and native adapter owners assigned. Donor/game checkouts are read-only.

### Unified assets/geography COMPLETION gate

Architect reviewed source and passed bounded standalone integration conditional on final lint/build and geographic browser evidence. Primary resolved the imagery dependency warning; final lint has0errors/warnings and build passes (bundle size and mixed dynamic/static import notices remain).39domain tests pass. AssetUI2tests/nativeassets2tests cover all4models, stablematerialslots/overrides, groundedtransforms, independentinstances, reset, dedup, staleNew/Open cancellation and persistence. GeoUIfixture and nativepixel tests pass orientation, partialcoverage,100m elevations,spawn,retainedobjects,UndoRedo,export/reopen and corruptimagefallback. Existingeditor/landscape3tests and nativeweather/daynight2tests pass. Primary accepts bounded delivery.

Geographic proof uses controlledASCII/image fixtures, not a realOSsurvey. Native normal/ORM/AO/emissive maps remain omitted. Aggregate maximumresource performance is unqualified. Bridges visual and authoredwater limitations unchanged. CleanElseMeshreference status verifiedempty; donor andCollinghamcheckouts inspectedread-only. No game changes,push,deployment.

## Real-time valley navigation PLAN gate

Architect approved a builder-owned native camera controller, pitch-aware smoothed flight/wheel dolly, adaptive speed based on terrain-relative clearance, swept terrain clearance, overview/spawn/recenter controls and blur/reentry cleanup. Quality policy must bound tree construction, not merely hide expensive allocated geometry, and retain authored objects. Primary assigned isolated navigation and performance work; vendor/game code remains read-only. Acceptance uses actual Hope60tree scene and reports load/frame times with active movement, settings and counts. Higher detail is qualified separately; repeated stalls trigger architect no-progress review.

### Navigation NO-PROGRESS and COMPLETION gates

Repeated headless RAF pauses occurred even without trees; architect advised separating browser scheduling from CPU/GPU rendering using foreground headed heartbeats. No FPS conclusion admitted from those runs. A later headed UI test initially waited on a wrong exact button selector, so its wait was not a renderer failure; corrected before product decisions.

Architect source review found an on-screen movement focus-release issue; buttons and parent blur now stop movement with child-iframe focus handled. LOD hysteresis (enter200m/exit230m) verified. Final headed60treeHope navigation E2E passed in36.5s: wheel descent/stopping/reversal, savedspawn, W/S reversal, >2km travel in4.107s, overview reset, untrustedmessage rejection, editor state equality and reentry. NoGPUerrors. Build/lint and48tests pass. Primary accepts bounded navigation completion.

Nativeforest construction60trees overview4,440vertices vs276,120previous;250trees18,500overview;2batches/sharedmaterials; detailedtreecap16; fourcachedvariants/species. This is construction/quality evidence, not an FPSguarantee. FullbufferLODrebuild canhitch; largerfullscenes andsustainedsmoothness remain separatelyqualified. Terrainclearance stops at ridges; it doesnotautofollow slopes. No game/vendorcode edited.

## Cloud/mist control correction PLAN gate

User screenshot showed Thunderstorm coverage .66 and mist .039/reach38 on Hope OS terrain. Source diagnosis: a per-frame .88 storm coverage floor ignored slider values; mist base remained absolute0 while terrain elevations are155–298m. Architect approved direct cloud coverage and terrain-minimum valley mist base, deferring heightfield resources for this bounded correction. UI names the exponential decay parameter Mist vertical reach and explains valley-floor anchoring. Selecting Storm initializes coverage once. Primary accepts; GPU visual acceptance pending. Game and vendor sources stay read-only.

### Cloud/mist correction evidence

Build and lint pass. Headed native GPU comparisons captured nine views with no errors (outputs/native-slider-proof.json). Cloud0/.5/1 changes rendered sky; mist0/.04 with low/high vertical reach changes valley haze. Hope minimum154.877m and terrain translated4000m produce mist bases154.877/4154.877m. Root visually inspected cloud0/1 and mist0/high comparisons. Native temporal rendering was active; comparisons are evidence of visible response, not exact deterministic pixel tests. Faint cloud contours at coverage0 remain possible from upstream horizon boost/temporal history; native sky code remains unchanged. Mist is a valley-floor layer, not hillside-following fog. Persistence acceptance pending.

Architect COMPLETION gate approved the bounded slider correction after inspecting source, proof JSON and screenshots. Primary accepts visible-control response. Save/reopen storm.2 remains separately pending. The +4000m translation is an injected renderer stress check beyond the supported project +/-2000m height validation range; it does not qualify a saved-project journey. Coverage0 residual contours have no proven cause. Animation times differed, so image differences are qualitative response evidence. Reference game checkout status remains clean.

Persistence follow-up passed: storm coverage.2 EMW imported through project file input, opened native preview, returned to editor and reopened twice. Actual UI slider and submitted renderer coverage stayed.2; no errors (outputs/native-storm-reopen-proof.json). Export download roundtrip was not repeated. This resolves the gate's reopen condition.

## World repository PLAN gate (2026-10-21)

User authorised implementing world repositories and pushing the standalone builder to GitHub. Architect approved content-only immutable snapshot directories plus a manifest written last, external content-addressed binaries, existing schema/admission checks, strict local paths and bounded reads. Native preview revision is distinct from game compatibility. Ordinary Git avoids requiring LFS hydration. Folder access is explicit, conflicts fail before selecting a new manifest, and old files are retained. Primary accepts; preserve existing editor features and known cloud/mist fixes. Builder publication uses a new private repository after authenticated lookup returned404; no force-push, game edits or deployment. Functional acceptance beyond build/lint remains to be reported explicitly.

World repository source review found two material issues before publication: duplicate binary references could exceed hydrated allocation limits before final validation, and edits during asynchronous Open could be replaced. Primary paused publication, assigned preflight asset/base64 budgets to the adapter owner and added active-project identity comparison before Open replaces state. Build/lint rerun after these corrections; behavioural qualification remains unperformed.

### World repository COMPLETION source gate

Architect re-reviewed both fixes and approved the authorised private implementation push after final build/lint and publication-tree audit. Final build and lint pass; npm audit reports0 vulnerabilities. No new tests were added or run this turn. Source blocking findings resolved. Actual folder-picker, save/open equivalence, corrupt-content interaction and interrupted-write acceptance remain unperformed; this is implementation publication, not functional qualification or game compatibility. Initial failed-save recovery guidance is documented.

Publication history audit found2trackedlocalPNG evidence files and historical absolute documentation paths in5localcommits. No credential-pattern matches or player-world documents were found in that audit. Evidence files are removed from the current index with local copies retained. A new source-only snapshot in an isolated release checkout will be pushed to the new private GitHub repository; prior local history is preserved and not published. Publication completion requires verifying remote privacy and exact SHA.
