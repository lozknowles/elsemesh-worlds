# World formats and runtime test package

## Editable project

Schema: `elsemesh.worlds.project/2`.

Terrain stores row-major samples from negative Z to positive Z. Vertices span `[-width/2,+width/2] × [-depth/2,+depth/2]`; units are metres, Y is up, and player-forward is negative Z. Each cell is rendered as `(a,c,b)` and `(b,c,d)`, sharing the diagonal from `b` to `c`. The CPU height query uses those same piecewise-linear triangles.

Dimensions are 16–2048 m and resolution is odd from 9–257. Brush radii and strengths are bounded in the domain functions. Projects are limited to 25 MiB, 2,000 scene objects and 15 MiB of embedded GLB assets. Imports require embedded `model/gltf-binary` data URLs; file paths and executable content are not accepted. A failed import leaves the current project active.

## Player package

Schema: `elsemesh.player-world/2`. The `.emw-world.json` file contains the validated editable project and the envelope fields `units: metres` and `axes: right-handed-y-up-minus-z-forward`. The package includes terrain height/material buffers, objects, embedded asset bytes, spawn, environment and metadata. It is a portable data package; it does not include JavaScript, remote asset paths, a federation owner signature or admission credentials.

The isolated test checkout at ElseMesh commit `95719848d5ffa4428b57c75c272483e1c2113a72` has a local-only importer at `world-test.html`. That historical harness targets the former player-world/1 envelope, not the new hierarchy envelope. It validates that legacy envelope before replacing the active world, builds terrain triangles with the same sample order and diagonal, feeds the same heights to the actual `Player` ground query, and registers supported primitive collision boxes in the actual `Colliders` implementation. The harness deliberately rejects GLB scene objects because that path has not been integrated yet. This local test importer is not part of the upstream game or a released runtime contract.

## Separate exchange formats

The experimental `elsemesh.region/1` federation descriptor is not an editable world or player package. The `elsemesh.landscape-world/v1` document is a constrained procedural landscape draft. The Blender terrain export is only an exchange format and is not imported by the ElseMesh player. None of these formats is silently substituted for `.emw-world.json`.

## Object hierarchy (project schema 2)

Schema 2 objects store local position, XYZ Euler rotation, and positive scale relative to an optional parentId referencing a group. Groups have stable IDs, no asset and no collision. Visibility and locking inherit through ancestors. The maximum hierarchy depth is 32. Schema 1 documents and repository manifests migrate explicitly on import; legacy documents cannot contain schema 2 groups or parent references. Export writes schema 2, including the player-world/2 data envelope. Original game runtime admission of schema 2 is unverified.

Group dimensions are measured in local group axes and include every descendant. Resizing scales the whole group and all its contents. Reparenting and ungrouping preserve world transforms, and reject the whole operation if the required local transform contains shear. The preview renders full composed matrices, including shear produced by valid nested local TRS. Collision uses conservative transformed world bounds.
