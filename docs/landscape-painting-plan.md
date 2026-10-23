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
