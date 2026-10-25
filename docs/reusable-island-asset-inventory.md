# Reusable Original Island and wildlife assets

Regenerate on hpubuntu: node tools/prepare-island-assets.mjs [game-checkout] [original-island-repository]. Source commit: 6fdb63c5fa281065b03388079fa1b2b64e986bd8. The script verifies committed source bytes before importing, records the CPU-engine closure and model input SHA256s, and verifies the six source GLB hashes. Full provenance: public/assets/elsemesh/wildlife/provenance.json.

License: MIT; Copyright (c) 2026 DRG Software Solutions LLC; ElseMesh contributors. LICENSE.txt accompanies both directories. Source CREDITS.md describes the whale as original procedural geometry; its side profile references a public-domain NOAA illustration. Photographic references are not included.

All assets are self-contained static glTF 2.0 GLBs; Y up, metres, no animation clips. Wildlife geometry is extracted from the actual source builders or whale binary, not replacement shapes. Simplified PBR palettes preserve coarse species colors but omit feather, eyes, shell patterns, granules, runtime lighting and ocean effects. The boat already approximates procedural shaders in its source GLB. Crab specimen carapace scale .08m is explicitly chosen.

Checks: valid GLB header/length, <=15MiB, finite extracted positions, embedded resources, buffer view bounds, no animation, and the application inspectGlbJson portable admission (all 14 pass). Whale original lod0 albedo is 4096x2048; no resize. Browser admission, visual placement, live publication and save/reopen are checked separately from model extraction; static portability does not mean complete-game behavior parity.

| File | Bytes | Dimensions X × Y × Z (m) | SHA256 |
|---|---:|---|---|
| assets/elsemesh/original-island/beach-hut-s1.glb | 219288 | 4.98519 × 6.72328 × 9.31342 | 85aee505096199b644d6790fe144b342a151130f1514c0591425e1a4d4442269 |
| assets/elsemesh/original-island/beach-hut-s2.glb | 222220 | 5.70000 × 7.30997 × 8.68159 | b819d48535f13209d150590d923c08504f158c78bddf901f2eb75b216a85fbf7 |
| assets/elsemesh/original-island/beach-hut-s3.glb | 225744 | 4.90000 × 6.85388 × 8.32323 | af8cd3ef2632789938e63e22f2c9549b5de096c39a211ee4f65e5016d22169cd |
| assets/elsemesh/original-island/timber-pier.glb | 2445872 | 14.29749 × 11.32631 × 105.96658 | 1d2f08e0276138aaea37e9ba53e38567960bfce9d93131667ce460061bc23444 |
| assets/elsemesh/original-island/boardwalk.glb | 484256 | 14.21585 × 3.24541 × 42.50392 | c3dd5dea8a0b683ebaadc0ab36081fc890c3a345873edf73d980165777949320 |
| assets/elsemesh/original-island/lobster-boat.glb | 2564524 | 3.48216 × 5.63002 × 8.73918 | 7c740567333bea7edbfe5678b3e67eb89d6b590c669a241d030b65840f36b7dc |
| assets/elsemesh/wildlife/laughing-gull.glb | 21232 | 1.03000 × 0.17170 × 0.44128 | 03fd6424179478b6e9db3eb805b3c0eea3216e876ad351e9a4e38e3b9d9f0264 |
| assets/elsemesh/wildlife/royal-tern.glb | 21228 | 1.29600 × 0.13387 × 0.50487 | 5394478a9bafc9192e316490a701e5286f1466e1ec014d143afa70b2c3179dc7 |
| assets/elsemesh/wildlife/brown-pelican.glb | 21228 | 2.10000 × 0.41146 × 1.05026 | 50c9e21f30bfbe781e6107873c913f253d5a25d1c520d9117569a5b21fe50f34 |
| assets/elsemesh/wildlife/magnificent-frigatebird.glb | 21236 | 2.30000 × 0.17274 × 0.93281 | 1027b0ff40819f68d68c476f466a2f499b7b6dee748f782bbdb62de03e3689f4 |
| assets/elsemesh/wildlife/sanderling.glb | 21228 | 0.38000 × 0.09430 × 0.23695 | 7a95c2ea78f74dc66150437e12774914d90ba4878e0539687d64c0268cd9d94f |
| assets/elsemesh/wildlife/ghost-crab.glb | 18036 | 0.23015 × 0.05390 × 0.13914 | dde99b0a8107835cbdf1678fc6d654bdf85589541b22a3e1a75168fb63eea228 |
| assets/elsemesh/wildlife/hermit-crab.glb | 17052 | 0.15830 × 0.11432 × 0.13969 | 2d7178264b8a4962202e475053baf3159dfcff1458b882164188e1217f1f0e1a |
| assets/elsemesh/wildlife/humpback-whale.glb | 6536652 | 8.73799 × 4.24287 × 15.13800 | fe238cfcab2083140f0c8e8357d0e99a812508ee2e8f9241dffcbbd2082c634c |

## Builder use

Open **Assets**, search for a model and click its card. Each click creates one editable world object with its own ID and transform. Huts start beside the existing beach huts on the shoreline; the whale and static lobster boat start over sufficiently deep water; birds start above terrain and crabs beside the spawn shore. The model bytes are embedded once per distinct asset and referenced by subsequent placements. Move, rotate or resize individual instances in the object properties. The whale, birds and crabs are non-solid scenery; huts, pier, boardwalk and boat retain solid collision bounds.

These catalogue objects remain static model geometry. New bird and crab placements receive an optional, editable, bounded ambient route evaluated in the player's browser; there is no wing or leg rig, flocking, burrow logic, shared AI state or moving collision. Imported fish GLBs can use the fish-swim route over a suitable global water surface. The whale and drivable boat remain static here pending dedicated engine behaviours. Weather, wind, rain, thunder and lightning remain engine effects selected by each world's environment data. The editor's coarse terrain view does not display the native ocean; use **ElseMesh graphics** to preview placements with the island sea.

## Extraction details

- Original beach hut S1: Trusted CPU extraction from original ElseMesh Village/buildHouse; source closure hashes in provenance; byte-identical source GLB
- Original beach hut S2: Trusted CPU extraction from original ElseMesh Village/buildHouse; source closure hashes in provenance; byte-identical source GLB
- Original beach hut S3: Trusted CPU extraction from original ElseMesh Village/buildHouse; source closure hashes in provenance; byte-identical source GLB
- Original timber pier: Trusted original Village generator capture; byte-identical source GLB
- Boardwalk to pier: Trusted original Village generator capture; byte-identical source GLB
- Original lobster boat: Trusted original BoatModel geometry capture; procedural shader details approximated in GLB; byte-identical source GLB
- laughing gull (static spread wings): Exact buildBird topology/rest body and spread wings. Exact BirdPose stationary ground legs; BirdBatch leg tube CPU port. Simplified shader-derived PBR palette; feather/eye/material shaders omitted.
- royal tern (static spread wings): Exact buildBird topology/rest body and spread wings. Exact BirdPose stationary ground legs; BirdBatch leg tube CPU port. Simplified shader-derived PBR palette; feather/eye/material shaders omitted.
- brown pelican (static spread wings): Exact buildBird topology/rest body and spread wings. Exact BirdPose stationary ground legs; BirdBatch leg tube CPU port. Simplified shader-derived PBR palette; feather/eye/material shaders omitted.
- magnificent frigatebird (static spread wings): Exact buildBird topology/rest body and spread wings. Exact BirdPose stationary ground legs; BirdBatch leg tube CPU port. Simplified shader-derived PBR palette; feather/eye/material shaders omitted.
- sanderling (static spread wings): Exact buildBird topology/rest body and spread wings. Exact BirdPose stationary ground legs; BirdBatch leg tube CPU port. Simplified shader-derived PBR palette; feather/eye/material shaders omitted.
- Ghost crab (static): Exact buildCritters body/limb topology, CritterBatch joints/vertex CPU port. stride=0 lift=.1 outK=1 eyes=1 claws=0. Simplified colors, shell/granule shaders omitted. Chosen .08m carapace scale.
- Hermit crab (static): Exact buildCritters body/limb topology, CritterBatch joints/vertex CPU port. stride=0 lift=.1 outK=1 eyes=1 claws=0. Simplified colors, shell/granule shaders omitted. Chosen .08m carapace scale.
- Humpback whale (static rest pose): Exact lod0 rest positions, normalized int16 normals, uv0, indices; embedded original 4096x2048 albedo. No runtime spine/flipper deformation, swimming, surfacing, blow, height shader, or animation.
