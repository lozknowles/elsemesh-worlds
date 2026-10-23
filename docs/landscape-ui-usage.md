# Landscape painting in the builder

Open **Terrain → Landscape painting**. The existing sculpt, legacy paint, and vertex tools remain below the landscape panel. Selecting a legacy sculpt tool stops landscape painting.

1. Add a **ground**, **vegetation**, or **water** layer. Select a layer to edit it; its eye, lock, and up buttons control visibility, editing, and composition order.
2. Ground offers grass, soil, rock, gravel, and sand. A custom definition adds a name, color, roughness, texture repeat in metres, and an optional embedded PNG/JPEG. Images are validated and hashed; the saved project and repository carry their bytes. A delayed import is cancelled when its world changes or another import supersedes it.
3. Vegetation offers trees, shrubs, grass, flowers, and rocks, with density, spacing, scale, variation, seed, elevation/slope limits, and path/building/water exclusions. Geometry variants are shared across spatially chunked instanced meshes.
4. Use a **brush stroke** for freehand paint or erase. Pointer release commits the entire stroke as one Undo entry. Escape, pointer cancellation, or losing window focus discards the draft.
5. For a **closed boundary**, click terrain points and use **Finish boundary** or Enter. Escape cancels. Choose Fill, Replace, or Erase before finishing. For water, the default **Organic pond · drag radius** gesture draws a rounded circle-based shoreline: drag from its centre to set its radius, and release for one undo step. **Shoreline irregularity** adds mild organic lobes; zero makes a circle. Set the water level above the depression it should cover. Water is a separate terrain-clipped surface, not blue ground paint. Use a separate water layer for each pond.
6. Choose **Stop painting** to orbit or select objects. Click a generated tree to promote it into an ordinary editable tree. Existing transform, edit, and Delete controls then apply. Its generated origin is tombstoned, so changing the scatter seed or repainting does not recreate the promoted/deleted instance. Original tree geometry and colors remain continuous through promotion.

Ground masks use a one-metre grid, rendered through one detailed terrain atlas over existing imagery. Water shoreline/mask clipping and wave samples are shared between editor, native preview, and game adapters. Budget rejection reports a useful error and retains the previous project; reduce the gesture, boundary complexity, or scatter density rather than assuming the declared caps are a device performance guarantee.

## Qualification and limits

Local, ignored evidence is in `.local-evidence/landscape-ui/qualification.json`. The actual UI-authored project is `demo.emw`; `demo-top.png` and `demo-perspective.png` show it. `e2e.log`, `texture-fence.log`, `promotion-result.json`, and `native-material.json` distinguish UI actions, persistence, and isolated actual GPU rendering. The portable `/editor/` build is `.local-evidence/editor-client-dist`.

The qualified demo has 63 generated trees, four shared variants, 32 scenery draws, and 249,984 instanced triangles using the full original tree art. HP software fixture cadence included a roughly two-second gap; it is not physical-device FPS evidence. Full native sky preview requires at least five storage textures per shader stage; the HP default software adapter exposes four and receives a capability message. The isolated native landscape raster passed. Native builder navigation remains flight; actual game and physical-client qualification are separate gates. Vite also reports large production chunks.


## Rounded pond shorelines

The pond gesture previews the same explicit boundary that is committed and saved. It freezes its shape settings when a drag starts. Escape, pointer cancellation, layer changes, or focus loss discard the draft. An outline beyond the terrain is rejected as a whole; individual vertices are not clamped into straight edges. New ponds default to this gesture. Previously saved custom polygon boundaries remain intact.

Full-strength isolated ponds render the exact curved outline clipped to terrain; partial boundary cells no longer cause square inward steps. The generated outline has 16–64 vertices, targeting .12m circle chord error; that target is not a strict curvature bound for the organic variant. The renderer and game share the authored boundary/mask pipeline.

Partial water masks and overlapping water retain the bounded cell-clipping fallback. Editing a larger pond into that path can exceed existing work limits and will be rejected with its previous state retained. Erasing water remains on the one-metre mask grid and can produce cell-shaped internal edges. The rounded outer-shoreline claim applies to complete new organic ponds; this change does not convert old water holes or custom polygons.


## Sloping pond banks and shallow beds

**Grade sloping banks** is enabled for new pond gestures. **Bank width** controls the outer transition into surrounding ground; **Bed depth** controls the submerged bowl. Both terrain and water are previewed from the terrain at drag start and committed together as one undo step. Disabling the checkbox places water without grading. Erase changes water coverage and leaves the earthworks intact. Replace grades the new pond location without restoring earlier earthworks.

The explicit boundary is a dry outer envelope. The terrain descends through the actual waterline slightly inside that envelope and continues into the shallow bed. The bank blends to original heights sampled at its outer anchors, so an old excavated basin does not leave the new water surface hanging over a cut edge. Explicit water levels incompatible with the surrounding dry bank are rejected rather than silently changed. The bank and inner shelf each need at least two terrain intervals; enlarge them or use a finer grid when rejected.

The whole bank must fit inside the terrain and leave space around other water bodies, including the supporting terrain triangles. Height samples outside the grading ring remain identical; interpolation can affect adjacent triangles within one cell. Existing sea bounds alone do not prohibit a high island pond: original and resulting supporting terrain must both remain above the sea's maximum wave height. Existing wet shores and beds are protected by atomic rejection.

The grade edits ordinary terrain heights. Project saves and independent repository snapshots preserve those heights, water boundary, level and waves together; normal terrain rendering, walking and collision consumers receive the same data.


Pond drags pick against a snapshot of the terrain at pointerdown. Graded bank and bed previews therefore cannot change the radius for the same pointer position, including perspective Top view. Releasing or cancelling discards that snapshot. Opening a project, undoing, or otherwise replacing the committed project cancels the active drag.
