# Builder trees

`src/domain/trees.ts` supplies identical deterministic rest geometry and per-vertex wind offsets to the Three.js editor and the ElseMesh native renderer. The React adapter is `src/ui/TreeShape.tsx`. Object species and seed select reproducible variants. Each geometry is rooted at local Y=0.

Broadleaf geometry adapts the five-vertex, four-triangle folded lance leaf from the read-only game reference `src/world/vegetation/FruitTreeCrown.js`; its source SHA-256 is `de1374a97ece793d2a4963a1df88a1c67e9abea0b0e1812b47b1fd64e4048eb0`. The builder applies larger leaves to twelve branching crowns and uses its own pure-array mesh assembly. No game source is modified. Reference inspected: `ElseMesh-reference-20261019` in the 18 October reference workspace.

The segmented palm trunk and frond silhouette were informed by `src/world/vegetation/PlantGeometry.js` (SHA-256 `ec14240412ffc06144472affa97ff22666180b7ac96f1870361d69972663d68d`). Palm leaflet surfaces are explicit folded geometry rather than the game's shader-cut fronds. Pine branch tiers and individual needle sprays are a builder approximation. These do not load the complete game's vegetation, impostor, collision, fruit, wildlife, translucency, vein, or procedural material systems. The native and editor renderers use their respective standard materials, so lighting is approximate even though tree topology and wind formula are shared. Wind normals remain the rest-pose normals.

Tests check all species for deterministic seeded variation, finite geometry, in-range indices, nondegenerate triangles, meaningful foliage triangle counts, bounded crown motion, and pinned roots. Runtime visual acceptance is separate from those checks.

## Adapted source license

MIT License

Copyright (c) 2026 DRG Software Solutions LLC

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
