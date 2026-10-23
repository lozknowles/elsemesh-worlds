# Landscape painting and bounded fills: implementation plan

## PLAN gate, 23 October 2026

The user requests terrain material and scenery brushes, closed-boundary fill/replace/erase, separate editable ground/vegetation/water layers, brush controls and constraints, exclusions, undo/reopen, real bounded water and deterministic independent-world persistence. Individually edited generated trees must survive regeneration. Portal performance, complete electricity and avatar materialisation remain a separate active task.

Read-only inspection found categorical four-material terrain painting and raise/lower/flatten/smooth in App TerrainMesh; explicit deterministic tree objects; native forest merged bark/foliage batches capped at 2,000; existing simple lake polygons clipped to level/terrain with animated visuals; strict content-addressed repository roles, 25 MiB project limit and project/2 format. Existing tools and worlds must be preserved.

Architect approved an additive landscape component and derived instanced rendering with two required corrections: every import path, including standalone project JSON/player packages, must fail closed for unsupported landscape capabilities; promote an individually edited generated tree into an ordinary explicit EditorObject plus a tombstone/origin link in one undo command, reusing current transforms/collision/save semantics. Old projects retain old export formats until landscape content is authored.

Primary decision: implement landscape-bearing project/3 and repository/4 with a required landscape/1 capability, preserving project/1,/2 and repository/1,/2,/3 reads. Landscape is included in canonical hashes, validated byte budgets, strict component/asset paths, migration and shared runtime contract. No executable material/behaviour content or arbitrary remote texture URLs.

Persist stable layer/material IDs, sparse quantized mask tiles, versioned spatial-cell scattering rules, deterministic seeds, closed boundaries and generated-ID tombstones. Density selects stable candidate positions rather than reshuffling; edited explicit objects remain independent of regeneration/seed changes and retain provenance. Material erasing reveals lower layers/base. Vegetation erasing suppresses generated items only; exclusions do not silently remove explicit placements. Water extends bounded lake geometry with authored level/waves and shoreline-safe displacement, keeping heightfield collisions unchanged.

Use the same pure generator in editor/native/WebGL. Apply deterministic polygon/mask membership, slope/elevation and path/building/water exclusions with a documented spacing halo. Chunk instances by shared bounded variants, support instance picking/promotion, and index collidable tree/rock transforms spatially. Decorative ground cover is non-solid. Enforce explicit finite caps and report candidate/texture/mask limits. Revision tokens prevent stale preview publication.

Implementation slices: (1) contract/persistence/strict assets and pure operations; (2) editor controls/gesture command path and instanced picking; (3) both runtime renderers/collision/water, shared vendor regeneration; (4) actual editor demonstration of grassy hill, woodland fill, clearing erase and pond; individually edit/remove a tree, regenerate, save an independent repository and reopen, then verify actual first-person collision/water. Measure responsive painting and bounded large-population rendering rather than equating maximum accepted counts with qualified performance. Completion architect gate is required.


## Completion gate findings and decisions, 23 October 2026

Architect review found unbounded derived water/collision work, generated-tree model changes on promotion, an asynchronous texture import crossing world boundaries, incomplete runtime tint propagation, and a hosted-loader content-path omission. Primary required all to be resolved before release. Shared conservative water/scenery estimates and collision extents/bin limits now run before expensive expansion; operation bounding boxes and evaluation counts are capped before mask copying. Texture import is fenced by world generation, world identity, request token and material existence. Promotion preserves the exact original procedural seed/geometry and foliage colour; runtime and builder fixtures compare before/after Float32 geometry and material tint. Hosted HTTP and folder tests load the hashed landscape/image components through the real validated pipeline.

A second review identified that editor preflight cached generated instances before the aggregate collision budget was checked. Primary required preflight to use the complete admitted result before state publication and to test rejection without changing the existing world. Bounded ground/vegetation replacement must preserve coverage outside the requested footprint. Water remains one bounded body per water layer; multiple water layers support separate ponds.

Physical MSI evidence loaded the independent exported snapshot in the WebGPU game, walked uphill, entered/swum/dived in its bounded pond and returned to dry walking. The same snapshot was reopened in the editor on MSI. HP browser UI tests cover gestures, single-step undo/redo, closed-boundary Enter completion, save/reopen, instance promotion/movement/regeneration/deletion and delayed texture decode across world switches. Real isolated Git tests cover historical snapshots, cloning and unchanged independent world repositories. Software-GPU rendering/cadence and schema caps are documented separately from physical-client proof and supported performance claims.


Final architect COMPLETION review passed the implementation after full editor admission/collision preflight and rejection-cache regression were added. No material code finding remained. Release remains conditional on final whole-suite/lint/UI/build results, clean source provenance, final physical sanity and verified remote pushes; source review alone is not publication proof.


## PLAN gate: rounded ponds and cursor-visible landscape recording, 23 October

User requests an actual editor recording of hill/grass painting, woodland bounded fill, clearing erasure and pond creation, saved in D Downloads, with a visible cursor. Ponds should use organic circle-based outlines without unintended square outer edges. Architect inspected the current source and found centre-only area masks dropping partially intersected cells before the exact polygon renderer, causing staircased shores.

Primary accepted a water-only centre/radius gesture storing its explicit deterministic boundary in the existing schema. Zero irregularity makes a circle; frozen settings ensure preview and commit agree; outline clipping at the world edge is rejected rather than clamping vertices. Water paint/replace conservatively covers polygon-intersecting cells; erase keeps its previous semantics. Existing authored polygons and independent repositories are preserved.

Architect challenged a proposed complete-mask fast path: it must require255 coverage in every intersecting cell, reject touching/overlapping visible water bounding boxes, charge classification before nested scans, and retain exact terrain clipping. Existing work/vertex caps remain. Targeted acceptance includes sub-cell/off-grid ponds, terrain intersection, circle/organic generation, exact geometry area, partial/overlap rejection, atomic edits, one-step undo, cancellation and save/reopen.

The recording uses genuine browser mouse/key actions and an event-driven visible pointer indicator. It is an automated UI demonstration, not a recording of a native operating-system pointer. Record the entire visible workflow, a close shoreline view and actual save/reopen. Verify final MP4 decoding and the delivered D Downloads bytes before completion. Partial-mask water erasure and large overlap fallback limits are disclosed separately from rounded new outer shorelines.


## PLAN follow-up: grade the actual shoreline

New user steering requires a bank tapering into water and a submerged shelf. Architect required one atomic terrain-and-water command, a dry outer envelope on the actual triangulated terrain, an inward bed profile, outer anchors sampled from the original terrain, and resolution/budget checks before mesh or height allocation. Water coverage strength is separate from full terrain grading. Every preview is computed from frozen original terrain; release commits once. Erase retains terrain and Replace retains previous earthworks.

Source review also found stale valid water previews surviving an invalid radius, and off-terrain release committing an earlier radius. The gesture now clears rejected previews, marks off-terrain drafts invalid, recovers on terrain re-entry, and rejects an off-terrain release. Browser acceptance checks valid-invalid-valid preview geometry, cancellation and both terrain/water undo/reopen.

Architect challenged unconditional legacy-sea overlap rejection, because a dry island can sit within sea bounds. A conservative one-cell support-halo proof requires both original and graded heights above sea level plus maximum wave amplitude. Other water protection includes terrain support. The actual piecewise-linear dry envelope is checked at boundary/terrain triangle crossing points; an unresolved high-depth/coarse-grid shoreline rejects atomically.

Primary decision: organic pond is the new water tool's only drawing gesture, while imported historical polygons remain readable and unmodified. Smoothness is claimed for complete new outer shorelines and admitted graded banks; partial-mask water erasure remains cell-based and larger partial/overlap operations can reject under unchanged safety budgets.


## Source completion gate: bank interpolation and sea integration

Architect reviewed the final source and found the previous material issues resolved. The dry-envelope proof samples every horizontal, vertical and terrain-diagonal crossing, so the piecewise-linear shoreline minimum is checked. Original and resulting support vertices must exceed the legacy sea's verified level-plus-amplitude maximum; other water bodies have a supporting-cell guard. Work is reserved before classification, cloning or grading. The final focused domain/render run passes54 tests, TypeScript passes, and the preview-safety and graded-pond UI checks pass.

The added guard exposed a real unsupported combination: a coarse two-metre grid with a six-metre-deep bowl could interpolate the nominal dry outline below the water. That example is now an atomic rejection test. The same physical island pond on a one-metre grid passes. Typical off-centre seven-metre organic ponds with six-metre banks and two-metre beds remain admitted; their measured dry-envelope margin exceeds0.21m. No profile tuning was used to hide the failing case.

Primary accepted source completion with remaining delivery conditions: full six-test UI regression against the frozen source, a clean contract export into ElseMesh and local runtime checks, visible descending banks/clearing/pointer in the final recording, exact final Save/Open, verified D Downloads files, and authorized ordinary GitHub pushes with CI skipped. The initial ungraded recording is supplementary first-draft footage; the final refinement must demonstrate the graded bank.


## Pond picking completion follow-up

Trigger: the architect completion gate found graded preview terrain feeding back into raycast-derived pond radius, including perspective Top view. Architect PLAN gate approved detached immutable terrain picking over a fixed plane, requiring capture before preview, fail-closed missing terrain, partial-construction cleanup, no live fallback, and cancellation on committed project replacement. Primary decision: fix this defect before completion.

Pond pointerdown snapshots terrain geometry and world transforms for CPU raycasting; movement and release use that snapshot while graded drafts render independently. Release, cancel, layer/shape/tool changes, committed project replacement, blur and unmount dispose cloned geometry without disposing borrowed scene materials. A second pointer cannot replace the active stroke, and the final commit checks captured base identity against the latest project.

Acceptance requires actual raycast checks of an off-centre depressed basin with raised graded banks, Top and oblique perspectives, immediate/delayed previews, immutable geometry/transforms and idempotent disposal; existing invalid-preview/off-terrain/undo/reopen regression checks remain required. Preparation occurred only under ignored evidence during frozen-source recording. The primary explicitly unfroze source after recording closed and authorized application. Five focused picking checks, lint and TypeScript/production build passed; full unit/browser acceptance is tracked below.

## Camera demonstration no-progress gate

Trigger: two actual Top-view orbit attempts did not show bank descent. Architect source review confirmed that Top view sets camera up to -Z and OrbitControls follows that polar frame; Frame world preserves the viewing direction. The static PERSPECTIVE toolbar label is not proof of camera orientation.

Primary decision: use a camera-only checkpoint through the Perspective button, restoring Y-up, then verify vertical trunks, foreshortening and visibly descending ground before any further long recording. No additional terrain-grading edits follow from the camera evidence. Camera acceptance remains pending the later video check.

## Unit-suite timeout no-progress gate

The first full unit run and a subsequent isolated build-complete run with two workers both passed the five new picking checks and 190 tests overall, but the unchanged weather finite-drop geometry test exceeded its default five-second timeout. Both original logs are preserved as `unit-all.log` and `unit-all-bounded.log` under the ignored picking-fix preparation evidence directory. No weather source or test timeout was changed. This repeated signature was reported to the primary before any further unit attempt, requesting the architect no-progress gate. Lint and the TypeScript/production build passed; independent browser regression proceeds while that gate is reviewed.

Architect findings: the unchanged weather-only test executes 410,400 matcher assertions across 24 configurations. The repeated observed durations were 8.698 seconds with parallel work and 5.510 seconds with two workers, both exceeding the default 5-second budget without an assertion failure. Primary decision: after browser regression, run one isolated diagnostic with one worker and a 15,000 ms CLI test timeout. If it passes, run the final full suite with two workers and the same 15,000 ms CLI timeout. This changes no weather implementation, test source, or timeout configuration; retain both earlier failures and disclose the time-budget correction.

The isolated unchanged weather diagnostic passed in 4,403 ms (Vitest 4.68 s; process wall time 5.83 s). The final full suite passed all 191 tests with two workers and the explicitly documented 15,000 ms CLI timeout. The two original five-second failures remain preserved.

## Browser coordinate comparison gate

The first eight-test browser run passed all six existing scenarios. Both new perspective timing comparisons reached exact boundary equality but differed by approximately 0.0000004 to 0.0000017 metres. The architect approved one test-only correction: normalize projected screen coordinates to shared integer CSS pixels before both input paths, including pointerdown, retain exact boundary and terrain equality, and observe actual delivered client coordinates. Native coordinate quantization is a hypothesis until those observations agree. Primary decision: make that bounded harness correction, run the two new cases, then all eight if they pass. If equality still fails, compare canvas bounds and camera matrices before any further correction; no production picking changes are justified by this evidence.

The delivered-coordinate observer directly proved native Y-coordinate quantization: requested 576.3354378670166 became 576.33544921875, and requested 583.0619618087153 became 583.0619506835938. The initial harness normalization edit rounded X but accidentally left Y fractional, which the observer rejected before boundary comparison. Completing the already approved shared X/Y normalization retains all exact equality assertions.

## Immutable pond picking qualification

The final serial browser run passed all eight scenarios: the six existing regression cases and both new Top/oblique timing cases. The new checks wait for changed rendered terrain geometry before each delayed move, compare actual delivered pointerdown/final-move coordinates, and require exact saved boundary and terrain-height equality. They also preserve the active stroke against another pointer and prevent an old drag from overwriting a newly opened project. No geometric tolerance was introduced. The focused normalized run passed both cases before the complete final rerun.

The five CPU picking tests passed, including real raycasts against an off-centre depressed basin whose banks are raised by the actual grading command, live geometry/world-transform independence, one-time clone disposal without material disposal, construction-failure cleanup and absent-terrain rejection. The 257-grid snapshot took 3.670 ms in the focused HP run, 6.600 ms during the first concurrent run, 4.181 ms in the bounded run, and 4.053 ms in the final full run. These are CPU snapshot observations on HP, not physical-client responsiveness or a frame-rate claim. Full final unit acceptance is 191/191 with the documented 15,000 ms CLI timeout; lint and TypeScript/production build passed. Vite retains its existing large-chunk warning.

Exact logs are retained under ignored .local-evidence/landscape-video-20261023/picking-fix-prep: unit-focused.log, unit-all.log, unit-all-bounded.log, weather-diagnostic.log, unit-all-final.log, lint.log, lint-final.log, build.log, e2e-all.log, e2e-timing-normalized.log, e2e-timing-normalized-xy.log and e2e-all-final.log. Earlier timeout and test-harness failures are preserved. The primary owns the final architect completion gate, final client build/export, camera demonstration acceptance and release; this worker made no commit or push.
