# Landscape painting in the builder

Open **Terrain → Landscape painting**. The existing sculpt, legacy paint, and vertex tools remain below the landscape panel. Selecting a legacy sculpt tool stops landscape painting.

1. Add a **ground**, **vegetation**, or **water** layer. Select a layer to edit it; its eye, lock, and up buttons control visibility, editing, and composition order.
2. Ground offers grass, soil, rock, gravel, and sand. A custom definition adds a name, color, roughness, texture repeat in metres, and an optional embedded PNG/JPEG. Images are validated and hashed; the saved project and repository carry their bytes. A delayed import is cancelled when its world changes or another import supersedes it.
3. Vegetation offers trees, shrubs, grass, flowers, and rocks, with density, spacing, scale, variation, seed, elevation/slope limits, and path/building/water exclusions. Geometry variants are shared across spatially chunked instanced meshes.
4. Use a **brush stroke** for freehand paint or erase. Pointer release commits the entire stroke as one Undo entry. Escape, pointer cancellation, or losing window focus discards the draft.
5. For a **closed boundary**, click terrain points and use **Finish boundary** or Enter. Escape cancels. Choose Fill, Replace, or Erase before finishing. Water needs a closed boundary and a level above the terrain it should cover; it is a separate clipped surface, not blue ground paint. Use a separate water layer for each pond.
6. Choose **Stop painting** to orbit or select objects. Click a generated tree to promote it into an ordinary editable tree. Existing transform, edit, and Delete controls then apply. Its generated origin is tombstoned, so changing the scatter seed or repainting does not recreate the promoted/deleted instance. Original tree geometry and colors remain continuous through promotion.

Ground masks use a one-metre grid, rendered through one detailed terrain atlas over existing imagery. Water shoreline/mask clipping and wave samples are shared between editor, native preview, and game adapters. Budget rejection reports a useful error and retains the previous project; reduce the gesture, boundary complexity, or scatter density rather than assuming the declared caps are a device performance guarantee.

## Qualification and limits

Local, ignored evidence is in `.local-evidence/landscape-ui/qualification.json`. The actual UI-authored project is `demo.emw`; `demo-top.png` and `demo-perspective.png` show it. `e2e.log`, `texture-fence.log`, `promotion-result.json`, and `native-material.json` distinguish UI actions, persistence, and isolated actual GPU rendering. The portable `/editor/` build is `.local-evidence/editor-client-dist`.

The qualified demo has 63 generated trees, four shared variants, 32 scenery draws, and 249,984 instanced triangles using the full original tree art. HP software fixture cadence included a roughly two-second gap; it is not physical-device FPS evidence. Full native sky preview requires at least five storage textures per shader stage; the HP default software adapter exposes four and receives a capability message. The isolated native landscape raster passed. Native builder navigation remains flight; actual game and physical-client qualification are separate gates. Vite also reports large production chunks.
