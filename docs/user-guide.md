# User guide

## Edit a world

Open the app and choose **New world** or continue the local world shown at startup. The viewport is the 3D work area. Drag to orbit, scroll to zoom and right-drag to pan. Use the perspective/top buttons for the two camera presets.

Choose **Assets** to add a cube, sphere, cylinder, cone, tree or simple cabin. Select an object in the viewport or scene list. Use the toolbar to move, rotate or scale it, or edit numeric position, rotation and scale in the inspector. The inspector also edits its name, display color and provisional collision behavior. Press Ctrl+D to duplicate, Delete to remove, and Ctrl+Z/Ctrl+Y to undo or redo.

Choose **Terrain** to select raise, lower, flatten, smooth or material paint. Set brush size and strength, then click the terrain once for each stroke. Material paint offers grass, soil, rock and sand. Width, depth, sample resolution and seed are editable. **Regenerate** creates a new seeded base surface; terrain edits are saved with the samples.

Choose **World settings** to edit the description, spawn X/Z, sun angle and fog. Project state saves automatically in IndexedDB. The header shows whether a save has completed or failed.

## Import and export

Choose **Assets → Import GLB** to add one validated binary `.glb` asset up to 15 MiB. External `.gltf` files and sidecar resources are not accepted. Imported asset bytes remain embedded in the editable `.emw` project file and in local IndexedDB.

**Open** accepts a valid project JSON or `.emw` file. **Save project** downloads the editable authoring document. **Export world** downloads the current provisional JSON projection. That package is not yet loadable by the existing ElseMesh player.

## First-person preview

Select **Enter preview**, click the viewport for mouse look, and use WASD, Shift and Space. Press Escape or select **Exit preview** to return. This is the editor's provisional local walker; movement and collision behavior have not been qualified against the real ElseMesh player.

## Native sky, clouds and moving mist

Click **ElseMesh graphics** in the viewport toolbar to open the separate native WebGPU preview. Adjust **Time of day**, **Cloud coverage**, **Drifting mist**, **Mist wind speed**, and **Mist vertical reach**. Drag to look; WASD moves the preview camera, Q/E moves down/up. Choose **Back to editor** to continue authoring.

Environment controls are saved with the editable project. The native preview uses a builder-owned copy of ElseMesh's engine, atmosphere, default SkyPro clouds, environment lighting and post processing from pinned source `95719848d5ffa4428b57c75c272483e1c2113a72`. The regular editing viewport remains Three.js. Static GLB geometry/base colors are previewed, with no claim of identical animated or textured asset rendering. Drifting mist is a new builder effect and is not present in the referenced game's stationary haze implementation. Game compatibility for those mist settings is unproven.

## Terrain vertices and rock hills

Choose **Terrain → Vertices** to show the terrain grid points. Drag a point vertically to raise or lower it and its neighbours. **Brush radius** sets the width of the deformation. Release to commit one Undo step; Escape cancels the current drag. This edits terrain height, not arbitrary mesh topology.

In **Paint → Rock**, each click adds height with smooth falloff and applies rock material. Repeated clicks build a rocky hill; **Strength** sets the added height and **Brush radius** controls its width.

## Trees, pen features and weather

Assets →Tree starts click placement on terrain; choose Broadleaf, Palm or Pine. These are deterministic procedural meshes with moving foliage, inspired by the game geometry; they do not reproduce the game's complete vegetation/material/LOD system.

Open **Pen & water** (✎). Choose River, Lake, Pathway, Bridge, Shape or Waterfall. Click terrain for control points, then **Finish** or Enter; Escape cancels. Lakes/shapes require at least3 points, line features2. A waterfall places on one click. Completed features appear in the list; select one to edit pointX/Y/Z, width, level or drop. One finished drawing is one Undo step. Paths follow terrain; bridges have explicit deck level and are visual only in first-person preview. Shapes are flat filled outlines, not arbitrary solid mesh modelling.

For lakes, draw the basin boundary and adjust **Lake water level**. Water appears only inside that outline where terrain lies below the surface. A dry outline needs a higher level. Draw river points from high to low. Select a river's **Flows out of lake** or **Flows into lake** connection to snap that endpoint to wet lake geometry at its level. Moving endpoints or changing levels can produce downhill/connection warnings; these guide authored water networks. No volume conservation, erosion, automatic outlet discovery or terrain carving is simulated. Connect a descending river to a waterfall top by editing its final point and waterfall point coordinates. Falling water and foam animate in both views.

In **ElseMesh graphics**, choose Clear, Rain or Thunderstorm and adjust intensity/wind. Rain uses capped seeded streaks, lightning flashes and storm illumination. Thunder audio is synthesized and opt-in via its button; audio output has not been human listening qualified. Animation is a builder feature, not a change to the existing game.

The separately reviewed asset-library checkout is not integrated. Its review is saved in this task's outputs/asset-library-review.md.

## Unified asset library

The active Assets panel includes search, category filters, four prepared CC0 scanned debris models and labelled blockouts/procedural trees. Catalogue illustrations are schematic; placed models render their embedded images. All assets are embedded in saved projects. Imported GLB uses the same static geometry/resource checks as catalogue admission. External resources, skinning, morph targets, unsupported compression/extensions and excessive decoded geometry/images produce errors.

Material slots use stable source glTF indices, including shared materials across primitives. Overrides are cloned per instance and support colour, roughness, metalness and individual reset. Placement offsets transformed model bounds to the terrain. Grounding can be requested again after numeric rotations/scaling; snapping controls apply to numeric transforms and viewport gizmos. Import/placement is atomic and cancelled if the current project is replaced before loading finishes.

Native rendering supports embedded base-colour images with UV transforms and wrapping, plus source groups and supported material overrides. Normal, ORM/AO and emissive maps and animation are not reproduced. This is not full game-material fidelity. The donor checkout and existing game code remain unchanged.

## Geographic terrain and licensed imagery

The geographic importer uses EPSG:27700 British National Grid metres. Supply an unzipped OS ASCII grid (.asc), set centre easting/northing and radius, then preview the source coverage. Radius defines a square crop extending that distance in each direction, up to2048m wide. The circle is a selection guide; the terrain remains square. Sample centres and north-first rows are respected. Missing data and crops outside coverage are rejected. Heights retain the source vertical datum; easting maps tolocalX, northing to negativeZ. Upsampling OS Terrain50does not add detail beyond its approximately50m source spacing.

Licensed PNG/JPEG imagery requires British National Grid west/east/south/north bounds, source, licence and attribution. It is georeferenced onto terrain; palette colours remain outside partial coverage. An image is not automatically classified into trees, rocks, roads or water. Use the existing pens and asset placement for those editable features. No Google imagery is extracted. The first importer takes local source files; it does not download OS data or supply an online Google map. Existing objects/features retain their coordinates when terrain is replaced and may need repositioning.

OS Terrain50 technical reference: https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-terrain-50/os-terrain-50-technical-specification/grid-data . Google content extraction/derived-content restrictions: https://cloud.google.com/maps-platform/terms section3.2.3. The user selected OS terrain and licensed imagery import for reusable worlds.

## Flying through valleys

Open **ElseMesh graphics**. Drag the view to look; the mouse wheel moves smoothly forward/back along your look direction. **WASD** flies where you look, **Q/E** lowers/raises the camera, and **Shift** boosts speed. Arrow keys also move; **Space** rises. Speed adapts to height above the local terrain, with a visible multiplier for fine control or fast traversal.

**Overview** frames the terrain, **Return to spawn** returns above its saved spawn, and **Recenter** brings the camera back inside the landscape. The camera maintains clearance above the exact rendered terrain triangles, including ridges between movement endpoints. It does not collide with trees/buildings or certify walking routes. Releasing controls, losing focus or leaving the preview clears movement.

The hidden Three.js editor pauses during native preview. Native vegetation uses two shared rendering batches, inexpensive distant silhouettes and at most16 detailed nearby trees with cached crown variants. Source objects remain in the project unchanged; this is a labelled preview quality approximation. Geometry-construction reduction is measured separately from browser frame timing.

### Valley mist and cloud controls

Cloud coverage remains adjustable during thunderstorms. Selecting Thunderstorm initially raises coverage; subsequent slider changes are respected. Drifting mist is anchored at the lowest terrain elevation, including imported OS elevations. Mist vertical reach is its exponential density decay distance above that valley floor, not a hard ceiling. Low reach concentrates mist in dips; high hills can remain clear. Mist wind moves the density pattern. Settings persist in the project.

## World repository folders

Choose **World repository** in the top bar. Open repository folder loads a validated content snapshot; Save to repository writes the current world into a selected empty folder or the currently opened repository. Save repository as creates another checkout folder. Commit and publish with GitHub Desktop or Git. Folder access requires Edge/Chrome on localhost or HTTPS. Existing .emw Open/Save, browser autosave and Export world remain available. See docs/world-repositories.md for format and limits.
