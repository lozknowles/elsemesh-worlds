# Editable warehouse world

Choose **Load warehouse world** in the editor toolbar, then confirm replacing the
current world. **Save project** downloads an independent backup first if needed.
The load retains your previous world in **Undo** and refuses to apply a response
if you edited or changed worlds while it was loading. Loading uses the same
`validateWorld` admission as opening a project file.
Each toolbar load creates fresh world and region identities so separate warehouse
projects can coexist in world repositories. Opening a saved project preserves
its existing identities.

This is the warehouse with its portal ring, stairs, mezzanine and glass computer
room, including C64, BBC and Sun workstations. All 1,755 recipe components are
separate scene objects: select one in the outline or viewport to move, rotate,
scale, hide, duplicate, delete or change its material slot. Repeated shapes use
59 shared embedded GLB asset definitions. The roof starts hidden for an overhead
view of the interior. Runtime keyboard-legend overlay components also start
hidden so their opaque fallback does not cover the individual keys. Select **weathered roof** in the outline and use its eye
button to restore it. The roof is still present in the saved project.

The prepared file is [public/worlds/warehouse/warehouse.emw](../public/worlds/warehouse/warehouse.emw).
It uses the ordinary world project format and can be opened, saved, shared as a
file or exported through the existing world package workflow. It is a structural
scene for editing: computer interaction/emulation, portal teleportation, game
navigation and local runtime lights are not included. Static screen previews use
the recipe's period computer labels; Sun window artwork is an approximation.
PBR colors, roughness, metalness, emissive colors and transparent glass are kept.
Procedural brick, wood, fabric and other runtime surface patterns and game image
textures are omitted. The native preview currently omits emissive textures.

## Repeating preparation

From this editor checkout, run:

```sh
node scripts/prepare-warehouse-world.mjs ../elsemesh-weather
```

The script reads `src/world/PortalInteriorRecipe.js` and `LICENSE` from the given
source checkout without modifying it. It snapshots the deterministic recipe and
packs exact source primitive dimensions in standard self-contained GLBs. It
does not load the game or bundle the game's runtime into the editor. Its outputs
contain no machine paths. Generation stops if the editor's object, asset, total
asset byte or project byte limits are exceeded.

The adjacent `provenance.json` records the source commit, exact recipe SHA256,
component and asset counts, project size, screen definitions, zones, omitted
local light descriptions and fidelity limits. This makes source drift visible
without claiming that a recipe file is identical merely because HEAD matches.

The source recipe is licensed under MIT, Copyright (c) 2026 DRG Software
Solutions LLC. Its complete original license is distributed alongside the
world in `public/worlds/warehouse/LICENSE` and attribution is retained in world
metadata and every embedded asset.

## Reusable props and Blender models

The object library includes **Dining chair**, **Potted plant**, **C64 computer**,
**BBC computer** and **Sun workstation**. Each is one placeable model with a
named child hierarchy and independently editable material slots. A chair has six
components; a plant has ten; the computers have 84, 84 and 89 respectively.
Computer prefabs include their case, CRT, screen, keyboard, keys, vents,
cable; Sun also includes its mouse and accent. They exclude desks,
desk-mounted nameplates, runtime keyboard-legend overlays, chairs, lamps and desk
clutter. Individual key geometry remains present. Expected component counts and
chair/plant membership checks stop preparation if recipe membership changes.
The preparation script records exact membership
and source hashes in `public/assets/elsemesh/warehouse/provenance.json` and
ships the MIT license alongside the models. All models have a bottom-centre
pivot computed from their transformed geometry, keeping them easy to place on
terrain or a desktop. The warehouse starter still retains its individual parts.

To bring in an object authored in Blender, select the required static objects,
apply their scale, and export **glTF 2.0 → GLB (binary)** with materials and
textures embedded. Use **Import Blender / GLB model** in the object library.
The editor supports admitted static GLB meshes within its existing size and
geometry budgets, rather than direct `.blend` files. There is no Blender
installation or `.blend` conversion in this workflow. Screen artwork remains
static and imported internal components are manipulated together as one editor
object, with separate material slots; the original Blender file remains the
place to change their component structure.

**Reuse project models → Place again** creates another instance using the same
embedded asset bytes. It preserves the first existing instance's rotation,
scale and material overrides, gives the copy a new object ID, and grounds it at
the terrain origin. Move it to its desired location with the ordinary transform
controls. This section is collapsed initially for projects with more than twelve
embedded models, including the warehouse's shared component shapes.
