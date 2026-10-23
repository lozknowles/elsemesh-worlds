# Object catalogue

Open **Objects** in the left rail to browse the admitted Kenney catalogue. Search
matches model names, descriptions, pack names, categories and tags. Use the pack
and category menus, or **Interiors** for the furniture, food and building models
tagged for indoor scenes. Grid and list views display at most 24 models per page;
**Previous** and **Next** browse the remainder.

Click a card to see its dimensions, triangle count and source attribution.
**3D preview** opens one rotatable model preview. Selecting another card or closing
the preview disposes its loaded geometry, materials and textures.

## Place a model

1. Select a card and choose **Add _model name_**.
2. Move the pointer over terrain or an existing visible object's surface. A
   translucent preview shows the placement. The status identifies whether the
   current hit is terrain or an object.
3. Press **R** or **Rotate 15°** to turn it around its upright axis.
4. Click the surface to confirm. **Enter** or **Confirm placement** also confirms
   a current valid surface hit. **Escape** or **Cancel placement** discards it.

The model's transformed bottom centre is placed on the actual raycast triangle
hit. Its orientation stays upright; placement does not tilt it to the surface
normal or provide collision/physics simulation. It can be positioned on a
desktop, floor, shelf or other model surface. Use the ordinary transform controls
and material inspector after placement.

Loading, previewing or cancelling a pending placement adds no assets or objects
to the saved world. Changing worlds invalidates a pending placement. Confirmation
commits one object with a fresh object ID, validates the whole project and retains
the change in Undo. Repeated placements share embedded model bytes while keeping
independent transforms and material overrides. **Save project** preserves those
embedded assets in the portable project file. Ordinary saved project reopening
does not require the catalogue distribution to remain online.

## Source and limits

Only admitted static binary GLB models appear. The separately versioned manifest
records the immutable source commit, pack licence, controlled local model and
thumbnail paths, SHA256 hashes, geometry counts, bounds and default scale. Runtime
downloads verify model size and SHA256 before passing bytes through the existing
strict GLB admission and project budget checks. A missing or corrupt download
reports an error and leaves the world intact.

The current local distribution indexes 1,775 admitted models from 19 model packs,
including 359 tagged **Interiors**. The source also contains models excluded for
unsupported animation, skins or required extensions, plus image-only packs; these
are recorded by the preparation inventory and are not presented as usable 3D
models. Interiors is a derived browse category, not a dedicated cottage or pub
asset pack. Kenney and the converted models/thumbnails are CC0; the selected
card records the pack attribution.

The project retains its existing 2,000 object, 128 embedded asset, 15 MiB total
embedded asset and 25 MiB project budgets. Catalogue availability does not
increase these limits. Imported objects provide transforms, rendered geometry,
materials and existing collision classifications. They do not acquire movement,
vehicle controls, executable behaviours, physics or networking from their names
or tags.

The existing **Assets** panel remains available for procedural trees, prepared
warehouse props, prior editor assets and **Import Blender / GLB model**. Export
selected static Blender objects as binary glTF with embedded resources first;
direct Blender project files are not imported.
