# Stage A — Object platform architecture and delivery plan

Date: 23 October 2026. Status: discovery complete; catalogue first slice approved by architect; remaining platform stages proposed, not implemented.

## Repository and execution boundary

Canonical origin is `https://github.com/lozknowles/elsemesh-worlds.git`; remote main is `c6603f879010888983da7794cbd69f1e5264d85e`. The acquired clean checkout on hpubuntu is `/fast/work/elsemesh-audit-acquire-20261022/elsemesh-worlds`. Development is isolated at `/fast/work/elsemesh-platform-20261023/elsemesh-worlds`, branch `feature/object-platform-catalogue`. Prior warehouse work was preserved separately as commit `b75599b`; the local MSI checkout was not reset or changed for this task. No production services or deployments are modified.

The related game origin is `lozknowles/ElseMesh`; inspected remote main is `95b49d0f1364483efd1a78207bc547a544f62d8a`. The previously deployed production-preserving branch includes earlier landscape work absent from default main. Editor changes must not silently replace either game history. The editor vendors a pinned subset for graphics preview rather than importing the production game at runtime.

## Current implementation, backed by source

- `package.json`, `src/ui/App.tsx`: React + TypeScript, React Three Fiber/Drei/Three for the design viewport. A separate native WebGPU iframe (`src/ui/NativePreview.tsx`, `src/native/preview.js`) uses the vendored ElseMesh engine. There is no general ECS in either authoring code or inspected game; both renderers already have scene graphs.
- `src/domain/world.ts`: `elsemesh.worlds.project/1` is the actual editable document. Objects are a flat list with stable IDs, world-space transforms, visibility, collision classification, embedded asset references and sparse per-material overrides. It has no persisted parent/local transform, programmable component registry or graph references. Renderer GLTF child nodes are not editor hierarchy records.
- `src/ui/App.tsx`: one selected ID, direct viewport/outline selection, visual transform gizmos, numeric transforms, duplicate/delete, bounded undo/redo, terrain editing and local walk preview. Warehouse import retains 1,755 independent components; five reusable models remain one editor object each. Multi-selection, copy/paste, locking, owner permissions and group transforms need implementation.
- `src/domain/asset-glb.ts`, `src/ui/asset-admission.ts`: binary self-contained static GLB admission, bounds/geometry/image budgets, per-material slots and explicit rejection of animation/skin/morph/external resources or unsupported compression. `.gltf` and direct `.blend` are not accepted. Native preview omits normal/ORM/AO/emissive texture maps and animation; Three supports admitted PBR materials more fully.
- `src/domain/features.ts`, `src/ui/FeaturePanel.tsx`: existing path/river/lake/bridge/shape/waterfall geometry is drawn from points. It is not reusable movement-path execution. Do not silently reinterpret a drawn road as a vehicle route.
- `src/domain/persistence.ts`: revision-guarded IndexedDB autosave; `App.tsx` supports portable `.emw`, player envelope export, and validated reopening. `src/domain/world-repository.ts` and `src/ui/repository-files.ts` provide versioned content-hashed snapshots, independent world IDs and asset deduplication. Hash integrity is not authorisation; concurrent editing is not solved.
- `src/native/NativeNavigation.js` and local preview walker: camera/player terrain clearance and bounded navigation, not full game collision parity. No general rigid-body physics engine is installed. Object `collision` labels do not establish arbitrary mesh collision or a complete vehicle solver.

## Existing cars and federation: reuse limits

The working cars are game-owned Bracken Quay systems, not programmable objects imported into Worlds. `src/world/PortIslandSystem.js` creates proxies, swaps in admitted GLBs and advances kinematic player/traffic cars. `PortVehicleAsset.js` reconstructs custom-engine meshes/materials; `PortWheelRig.js` supplies steering/spin pivots and wheel semantics. `PortTraffic.js` provides deterministic fixed-step graph routing, junction reservations and footprint collision; `PortRoadGraph.js` is tied to port coordinates. Preserve this functionality and extract reusable pure route/steering primitives behind an adapter rather than introduce a second competing vehicle simulation. Vehicle model licences and proxy fallback must be explicitly qualified before using them as redistributable demonstration assets.

Game `network/federation.mjs` validates/signs region descriptors, delegation/replicas and portal player handoffs. It does not replicate authored objects, behavior state or durable vehicle authority. `docs/networking/sector-authority.md` explicitly disclaims atomic authority transfer and durable player state. MSI and macomarchy are online Tailscale peers, but this is not evidence of consistent two-player vehicle execution. Their actual client builds, server owner, identities and physical acceptance remain to be established. Never treat an owner field or a content hash as an enforced permission.

The constrained game formats `elsemesh.landscape-world/v1` and `elsemesh.region/1` are NOT replacements for the editor document (`docs/world-format.md`). An explicit engine adapter and versioned protocol extension are required.

## Approved catalogue design

Inspect external `Hidencod/tge-assets` at immutable commit `7be9b573bc74f32ed766b44b3f46550d02ca83b5`; do not run its scripts. Its provisional catalogue lists 1,883 GLBs in 19 packs, 67,513,420 model bytes. Confirm every referenced model/thumbnail, size, SHA256, geometry bounds/counts, compatible material features and original Kenney pack licence. Keep exclusion reasons. Do not label unverified files admitted.

Catalogue metadata is versioned separately from projects: stable source-pack/model identity, hash, controlled relative distribution URL, original source/licence, dimensions, triangle count, categories/tags and admission result. Mirror admitted models and matching thumbnails in a controlled versioned local distribution; do not depend on GitHub raw at runtime. A world embeds only assets it uses, deduplicated by bytes/hash through the existing admission path. Existing `.emw` remains portable and unchanged for this slice.

Add an Objects panel using the established UI, metadata search, pack/category/Interiors filters, grid/list with bounded pages, lazy thumbnails, one disposed-on-change 3D preview. A pending ghost placement is transient: loading/cancelling or changing worlds must not leave assets or objects. Confirm commits one validated object and one asset only if not already embedded. Placement stays upright, using the transformed model bottom on the hit terrain/object triangle; object surface and terrain are distinct raycast targets. Rotation before placement is explicit. Missing/corrupt model bytes must show a useful error and leave the world intact.

Catalogue objects retain ordinary object IDs/transforms/materials/collision and later component extension points. No fake behaviour/ownership controls until runtime support exists. Interiors derives from present furniture/food/building models; record gaps such as stylistic authenticity rather than claim a dedicated cottage/pub pack.

## Proposed object-platform contracts

Next schema revision must migrate project/1 without losing embedded assets, terrain, features or IDs. Define `ObjectRecord` with stable ID, optional parent ID, LOCAL transform and typed versioned components. Reject missing parents, cycles, invalid inverses, nonfinite transforms, duplicate IDs and dangling references. Reparent explicitly preserves world transform; group resize has two commands: scale subtree, or resize building shell while retaining furnishing size. Both renderer adapters consume the same resolved world matrices.

Independent `MovementPath` resources contain stable ID, version, waypoint coordinates, linear/Catmull-Rom interpolation, bounded speed/acceleration/braking, orientation, loop/reverse/ping-pong/delay/pauses, event and conditional/branch references. Validate path/graph/object references atomically. One route runtime owns each object's transform channel; physics/vehicle adapters compose rather than race over position.

`BehaviorGraph` is declarative versioned data. Register whitelisted event/condition/action/control nodes with typed ports and component capabilities. Compile to a bounded deterministic scheduler with per-tick work budgets, bounded queues, loop/yield limits and explicit error state. No eval/new Function, filesystem, OS, environment or arbitrary network access. Custom properties have finite typed values and validated object/asset references. Future AI proposals enter exactly this validation boundary and require user approval before application.

`PrefabDefinition` has ID/version, content-addressed dependencies, hierarchy/components and graph/path references. Instances retain prefab version plus explicit overrides. Updating a prefab is an explicit reviewed migration, never an automatic overwrite. Design state and transient simulation state are separate.

Federation needs authenticated authoritative simulation ownership, per-object revision/epoch, bounded replicated snapshots/deltas, interpolation, late join recovery, create/delete and reconnect rules. Enforce permissions server-side. Authority transfer must prevent two simultaneous simulators. Region owner identity is separate from replaceable host keys. No raw script bodies in network messages.

## Reviewable stages and acceptance

| Stage | Dependencies | Deliverable and acceptance |
| --- | --- | --- |
| A | Repository/source inspection | This assessment; baseline and limitations identified; architect PLAN recorded. |
| Catalogue slice | A + verified licence inventory | All eligible indexed assets; furniture browse/preview/ghost placement; terrain AND object-surface placement; cancel leaves no residue; dedup; save/reopen; missing/corrupt failures; representative furniture/building/vehicle browser proof. |
| B Object Manager | Approved v2 object/component migration | Hierarchy, multi-select, group scale/shell resize, lock/search/copy-paste, typed properties, ownership metadata; migration/undo/redo tests; both renderers preserve transforms; no implied enforced network permissions yet. |
| C Path Editor | B references + one simulation adapter | Click/drag/insert/delete reusable paths, linear/spline, speed/acceleration/braking/pauses and preview; deterministic route tests; preserve existing cars via adapter regression. |
| D Behaviours | B+C | Simple forms + draggable connected graph, typed validation, trace/errors; red-light example entirely configured as data; malicious/dangling/cyclic/runaway definitions fail safely. |
| E Programmable Prefabs | B-D | Save configured subtree/components/path/graph dependencies, instantiate with fresh IDs, overrides survive updates and reopen, dedup assets. |
| F Federation | Authenticated protocol/authority design + D/E | Authoritative owner, replication/interpolation, late join/reconnect/delete and permission/conflict tests. Existing federation is reused, not declared sufficient. |
| G End-to-end | B-F | Real MSI and macomarchy clients import car, configure route/light, play/save/reopen and observe consistent traffic; measure representative frame/network budgets against baseline. No physical result inferred from fixtures. |

Stage A and catalogue source tests do not qualify later stages. Every stage has focused automated tests plus actual browser acceptance; record untested and blocked flows. Production publication requires separate explicit authorisation. No new rendering/physics/graph dependencies are selected without a measured advantage and review.

## Gate record and baseline evidence

Architect PLAN approved metadata/content separation, pinned distribution, lazy loading, transactional placement and explicit future contracts. NO-PROGRESS gate resolved SSH at transport layer: port22 was unreachable; user supplied2222, then authenticated read-only discovery succeeded. No SSH/service/ACL changes were made. Baseline on hpubuntu: `npm ci --ignore-scripts` succeeded, zero audit findings; existing48 tests across7 files passed. These are baseline checks, not the catalogue or multiplayer acceptance result.
