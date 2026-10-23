# ElseMesh Worlds 1.0

Standalone local browser world builder. Run `npm ci` then `npm run dev`; open http://127.0.0.1:5190/ in Edge. `npm run build`, `npm run lint`, `npm test`, and `npm run test:ui` provide build and checks.

## Authoring

- Sculpt, paint and drag terrain vertices; Rock painting builds hills.
- Place seeded broadleaf, palm and pine trees with wind animation.
- Draw rivers, clipped lakes, paths, bridges, shapes and animated waterfalls using Pen & water.
- Import OS-compatible EPSG:27700 ASCII terrain with centre/radius crop; drape licensed, bounded PNG/JPEG imagery.
- Browse 1,775 verified static Kenney models across 19 source packs, alongside four prepared ElseMesh debris models and clearly labelled primitives/blockouts. Static GLB import, source material slots, overrides, transforms, snapping and grounded placement.
- Group objects in a hierarchical Scene explorer; Shift-select, resize complete assemblies, copy subtrees and inherit visibility/locks.
- Create procedural 3D neon signs with two bundled fonts, editable presets, eight lighting effects and local first-person power interaction. Save reusable single-sign presets.
- Place an interactive desktop computer with Home, World Info and Linked Neon Control in local first-person preview.
- Save/open schema 2 embedded .emw projects, explicitly migrate legacy flat projects, use browser autosave and Undo/Redo, and export repository snapshots.

## Views

Three.js supplies the editing viewport. ElseMesh graphics opens a separate native WebGPU preview using pristine pinned engine/sky/cloud/lighting/post components. It supports day/night, clouds, drifting mist, rain/lightning and optional synthesized thunder audio. Both views consume shared feature/tree geometry. Native imported models support embedded base-colour maps and source material groups/overrides; normal/ORM/AO/emissive maps and animation are omitted.

## Limits

This is a local authoring tool, not a released game-world importer. Water is authored surface animation, not volume/erosion simulation. Bridges are visual without walking collision. Trees/materials do not reproduce the complete game's vegetation or terrain shaders. Geo import uses supplied local files and a source-grid picker, not Google Maps imagery extraction; geographic tests use known fixtures until a real OS dataset is exercised. Imagery drapes onto terrain but does not automatically classify editable roads/vegetation/water. Existing objects retain coordinates when terrain changes. Maximum aggregate resource responsiveness is unqualified.

Game and donor checkouts are read-only references. No deployment or game source changes are part of this project.

See docs/user-guide.md, docs/world-format.md, docs/asset-inventory.md, docs/tree-geometry-provenance.md and docs/architecture.md. Vendor hashes and MIT notice accompany the pinned engine snapshot; catalogue CC0 attribution and derivative preparation notes accompany the assets.

## World repositories

Open **World repository** for independent content folders, commit-pinned public GitHub sources, explicit update checks, copies and forks. World identity, local workspace, repository location, content digest and runtime session are separate. Local drafts save before deliberate repository snapshots; Git checkpoints and pushes are explicit operations. The source loader never runs world scripts or repository hooks.

See [portal authoring and connection declarations](docs/portal-world-format.md), [format and compatibility](docs/world-repository-format.md), [Git checkpoint workflow](docs/world-repository-git.md), [runtime adapter](docs/world-runtime-adapter.md), and [shared engine contract](docs/world-engine-contract.md). The original folder format remains readable; migration writes a separate repository without replacing the source project. Ordinary Git is supported within the bounded asset budget; LFS pointer files must be hydrated before loading.

The actual ElseMesh repository has a separate repository-world entry using its installed native engine and player. The shared validated contract is generated from an exact editor revision; world content contains no engine implementation. Existing island initialization remains available as the legacy game route. Full extraction of every procedural legacy-island system into editable data is outside this increment.


## Experimental private sign world

An explicitly enrolled, single-authority private test server and fixed loopback client proxy are included. Owner/member permissions, challenge authentication, versioned snapshots and durable updates have focused tests. This is not federation between independent servers; actual multi-device acceptance remains outstanding. See [private world](docs/private-neon-world.md) and [client setup](docs/private-neon-client.md).

## Release scope

Version 1.0.0 is an editor source release. It does not deploy or modify the live ElseMesh game. Player-world/2 admission, general behaviour graphs, movement-path simulation, shell-only resizing, full programmable prefabs and production federation remain unqualified or unimplemented. Group dimensions and first-person object contact use conservative bounds. See [object manager](docs/object-manager.md), [neon signs](docs/neon-signs.md), [computer](docs/computer.md), and [release notes](CHANGELOG.md).
