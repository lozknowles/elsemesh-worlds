# ElseMesh Worlds

Standalone local browser world builder. Run `npm ci` then `npm run dev`; open http://127.0.0.1:5190/ in Edge. `npm run build`, `npm run lint`, `npm test`, and `npm run test:ui` provide build and checks.

## Authoring

- Sculpt, paint and drag terrain vertices; Rock painting builds hills.
- Place seeded broadleaf, palm and pine trees with wind animation.
- Draw rivers, clipped lakes, paths, bridges, shapes and animated waterfalls using Pen & water.
- Import OS-compatible EPSG:27700 ASCII terrain with centre/radius crop; drape licensed, bounded PNG/JPEG imagery.
- Search the unified asset catalogue: four prepared CC0 scanned debris models plus clearly labelled primitives and blockouts. Static GLB import, source material slots, overrides, transforms, snapping and grounded placement.
- Save/open embedded .emw project documents, browser autosave, Undo/Redo and JSON world export.

## Views

Three.js supplies the editing viewport. ElseMesh graphics opens a separate native WebGPU preview using pristine pinned engine/sky/cloud/lighting/post components. It supports day/night, clouds, drifting mist, rain/lightning and optional synthesized thunder audio. Both views consume shared feature/tree geometry. Native imported models support embedded base-colour maps and source material groups/overrides; normal/ORM/AO/emissive maps and animation are omitted.

## Limits

This is a local authoring tool, not a released game-world importer. Water is authored surface animation, not volume/erosion simulation. Bridges are visual without walking collision. Trees/materials do not reproduce the complete game's vegetation or terrain shaders. Geo import uses supplied local files and a source-grid picker, not Google Maps imagery extraction; geographic tests use known fixtures until a real OS dataset is exercised. Imagery drapes onto terrain but does not automatically classify editable roads/vegetation/water. Existing objects retain coordinates when terrain changes. Maximum aggregate resource responsiveness is unqualified.

Game and donor checkouts are read-only references. No deployment or game source changes are part of this project.

See docs/user-guide.md, docs/world-format.md, docs/asset-inventory.md, docs/tree-geometry-provenance.md and docs/architecture.md. Vendor hashes and MIT notice accompany the pinned engine snapshot; catalogue CC0 attribution and derivative preparation notes accompany the assets.

## World repositories

Choose **World repository** to open or save a separate content folder in Edge or Chrome. Each player can maintain that folder in their own GitHub repository. Models and imagery are separate binary files, settings are JSON, and the root manifest selects an immutable snapshot. The builder needs no GitHub credentials. Commit/push with GitHub Desktop or Git. See [world repository guide](docs/world-repositories.md) for workflow, conflict handling and compatibility limits.

CI runs dependency audit, lint, build and the existing domain checks. Native browser scenarios are local headed Edge qualification and some require the separately supplied Hope Valley data; they are not claimed by Linux CI. World repository folder-picker and interrupted-write acceptance have not yet been independently exercised.
