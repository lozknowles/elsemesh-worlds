# World formats and runtime test package

## Editable project

Schema: `elsemesh.worlds.project/1`.

Terrain stores row-major samples from negative Z to positive Z. Vertices span `[-width/2,+width/2] × [-depth/2,+depth/2]`; units are metres, Y is up, and player-forward is negative Z. Each cell is rendered as `(a,c,b)` and `(b,c,d)`, sharing the diagonal from `b` to `c`. The CPU height query uses those same piecewise-linear triangles.

Dimensions are 16–2048 m and resolution is odd from 9–257. Brush radii and strengths are bounded in the domain functions. Projects are limited to 25 MiB, 2,000 scene objects and 15 MiB of embedded GLB assets. Imports require embedded `model/gltf-binary` data URLs; file paths and executable content are not accepted. A failed import leaves the current project active.

## Player package

Schema: `elsemesh.player-world/1`. The `.emw-world.json` file contains the validated editable project and the envelope fields `units: metres` and `axes: right-handed-y-up-minus-z-forward`. The package includes terrain height/material buffers, objects, embedded asset bytes, spawn, environment and metadata. It is a portable data package; it does not include JavaScript, remote asset paths, a federation owner signature or admission credentials.

The isolated test checkout at ElseMesh commit `95719848d5ffa4428b57c75c272483e1c2113a72` has a local-only importer at `world-test.html`. It validates the envelope before replacing the active world, builds terrain triangles with the same sample order and diagonal, feeds the same heights to the actual `Player` ground query, and registers supported primitive collision boxes in the actual `Colliders` implementation. The harness deliberately rejects GLB scene objects because that path has not been integrated yet. This local test importer is not part of the upstream game or a released runtime contract.

## Separate exchange formats

The experimental `elsemesh.region/1` federation descriptor is not an editable world or player package. The `elsemesh.landscape-world/v1` document is a constrained procedural landscape draft. The Blender terrain export is only an exchange format and is not imported by the ElseMesh player. None of these formats is silently substituted for `.emw-world.json`.
