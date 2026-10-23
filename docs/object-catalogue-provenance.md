# Object catalogue inventory and provenance

Source pin: `Hidencod/tge-assets@7be9b573bc74f32ed766b44b3f46550d02ca83b5`. No external repository scripts were executed.

The catalogue contains 19 3D model packs, 1,883 GLBs and three additional image-only packs. Image-only packs are outside this 3D catalogue. All 1,883 model/thumbnail paths were resolved inside the pinned source tree; model byte metadata and WebP signatures were checked. Existing strict editor admission accepts 1,775 static models; 108 are excluded for animation/skinning or required unsupported extensions. Exclusions and exact reasons are in `public/assets/catalogue/inventory.json`. No failed asset is offered for placement.

Admitted models total 54,034,072 bytes and 466,176 indexed triangles. Dimensions/bounds, counts and SHA256 hashes were computed from actual GLB content, not guessed from names. There are 359 name/pack-derived Interiors entries. Thumbnail source pairing and bytes are checked; semantic correspondence is visually qualified only for representative examples.

## Licence evidence

Source `LICENSE` explicitly covers Kenney models and the converted embedded GLB/thumbnail derivatives under CC0. Kenney support states its asset-page resources are CC0: https://kenney.nl/support . All 19 referenced original pack pages returned HTTP200 and a CC0 licence marker on 23 October 2026. Per-pack source links follow. This does not admit unrelated image packs or any future unreviewed source.

| Pack | Models | Admitted | Excluded | Original licence source |
| --- | ---: | ---: | ---: | --- |
| Prototype Kit | 145 | 120 | 25 | [prototype-kit](https://kenney.nl/assets/prototype-kit) |
| Platformer Kit | 153 | 140 | 13 | [platformer-kit](https://kenney.nl/assets/platformer-kit) |
| Nature Kit | 329 | 329 | 0 | [nature-kit](https://kenney.nl/assets/nature-kit) |
| Car Kit | 50 | 50 | 0 | [car-kit](https://kenney.nl/assets/car-kit) |
| City Kit (Commercial) | 41 | 41 | 0 | [city-kit-commercial](https://kenney.nl/assets/city-kit-commercial) |
| City Kit (Suburban) | 40 | 40 | 0 | [city-kit-suburban](https://kenney.nl/assets/city-kit-suburban) |
| City Kit (Roads) | 95 | 95 | 0 | [city-kit-roads](https://kenney.nl/assets/city-kit-roads) |
| Food Kit | 200 | 200 | 0 | [food-kit](https://kenney.nl/assets/food-kit) |
| Furniture Kit | 140 | 140 | 0 | [furniture-kit](https://kenney.nl/assets/furniture-kit) |
| Space Kit | 153 | 153 | 0 | [space-kit](https://kenney.nl/assets/space-kit) |
| Pirate Kit | 72 | 71 | 1 | [pirate-kit](https://kenney.nl/assets/pirate-kit) |
| Castle Kit | 76 | 76 | 0 | [castle-kit](https://kenney.nl/assets/castle-kit) |
| Tower Defense Kit | 160 | 160 | 0 | [tower-defense-kit](https://kenney.nl/assets/tower-defense-kit) |
| Mini Dungeon | 30 | 25 | 5 | [mini-dungeon](https://kenney.nl/assets/mini-dungeon) |
| Blaster Kit | 40 | 37 | 3 | [blaster-kit](https://kenney.nl/assets/blaster-kit) |
| Graveyard Kit | 91 | 84 | 7 | [graveyard-kit](https://kenney.nl/assets/graveyard-kit) |
| Cube Pets | 24 | 0 | 24 | [cube-pets](https://kenney.nl/assets/cube-pets) |
| Mini Characters | 26 | 14 | 12 | [mini-characters](https://kenney.nl/assets/mini-characters) |
| Blocky Characters | 18 | 0 | 18 | [blocky-characters](https://kenney.nl/assets/blocky-characters) |

## Distribution and reproducibility

Runtime serves a controlled local mirror at `assets/catalogue/7be9b573/`; it makes no GitHub raw request. The versioned manifest has stable Kenney pack/model IDs and immutable per-file hashes. Only placed models are embedded in an editable world, with byte-level deduplication; unused catalogue assets are not copied into each world. Offline use requires the editor distribution itself to have been obtained; this slice does not install a service worker or claim a fresh offline cache.

`node scripts/prepare-object-catalogue.mjs ../tge-assets` regenerates from the exact reviewed commit and stops on an unknown pack licence/origin. `node scripts/verify-object-catalogue.mjs` independently resolves and rechecks every distributed manifest reference, content hash, model size and decoded geometry metadata. Keep the original LICENSE in the distribution.

## Categories and gaps

Interiors and categories are derived from actual pack membership and model names. Furniture includes chairs/tables, sofas, beds, kitchen and bathroom pieces; Food supplies interior props. A named object does not establish historic cottage authenticity, pub-specific fixtures, accessible facilities or correct architectural dimensions. Those style/use gaps remain explicit; no nonexistent dedicated cottage/pub/public-building pack is invented. Static source models do not automatically provide sitting, driving, light emission, door hinges, physics or behaviours.

## Future packs

Review licence from original author and derivative distributor first; pin a source commit; inspect without executing source scripts; generate inventory using the current strict importer; record exclusions; normalize stable IDs/relative paths/hashes and tags; mirror only admitted content; run full verification and representative browser placement/save/reopen. Do not replace the source pin in a published distribution without explicit update/review.
