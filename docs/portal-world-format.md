# Authored portals, water and retro terminals

The project remains `elsemesh.worlds.project/2`. Optional `portals`, `water` and `terminals` declarations are data; they carry no endpoints, credentials, scripts or executable modules.

## Upright portal geometry

A portal is a unit-scale upright rectangle. `position: [x,y,z]` is the aperture **centre**, `yaw` is radians around world +Y, and `width`/`height` are metres. There is no parent transform, pitch, roll or scale. Local +Z is its front: traversal sweeps from local positive Z through the aperture into negative Z.

```json
{
  "id": "elsemesh-portal:warehouse-east",
  "name": "Warehouse to island",
  "position": [10, 1.25, 0],
  "yaw": 1.5707963267948966,
  "width": 2,
  "height": 2.5,
  "destination": {
    "worldId": "elsemesh.world:island",
    "regionId": "elsemesh.region:island-main",
    "portalId": "elsemesh-portal:island-arrival"
  },
  "enabled": true,
  "view": { "enabled": true, "maxDistance": 40 },
  "traversal": { "enabled": true },
  "policyRef": "portal-policy:public",
  "visual": { "frameColor": "#55aaff", "unavailableColor": "#553333" }
}
```

World and region identity are independent of repository URLs. A destination refers to identities resolved by the runtime/server, while `policyRef` names a server-owned policy. Admission, authorization and loading failures must leave an unavailable portal: content validation does not grant traversal permission. A local destination must match the current region and an existing portal. An external destination can remain unresolved; no remote requests occur during validation.

There are at most 16 portals. Apertures measure 0.60–20 metres wide and 1.79–20 metres high to fit the default radius 0.28 m and body height 1.75 m. Position components are bounded to ±2000 m, yaw to ±2π and view distance to 0.5–200 m. All numbers must be finite. Unknown portal fields are rejected, including endpoint and credential fields.

## Shared geometry contract

`src/domain/portal.ts` exports `portalLocalPoint`, `portalWorldPoint`, `mapPortalPoint`, `mapPortalDirection`, `mapPortalYaw`, `portalMappingElements` and `sweepPortalCapsule`.

Every position, camera orientation, player yaw and velocity uses:

```text
Mdestination × Ry(pi) × inverse(Msource)
```

`portalMappingElements` returns the same transform as 16 column-major matrix elements. It introduces no scale. The positive-to-negative entrance sweep maps to the destination's positive Z exit. Point and direction round trips return to the original frame. Directions retain their magnitude and vertical component.

`sweepPortalCapsule` takes previous and next **feet** positions, plus optional radius/bodyHeight. It returns `{fraction, feet}` at the plane crossing, or null for a reverse sweep, disabled traversal, nonfinite input, or aperture miss. The horizontal radius and full upright body must fit at that crossing. The runtime must additionally validate destination capsule fit, landing/contact clearance, admission, epoch/cooldown and any authority transfer before committing player movement.

## Water

`water: { level, waveAmplitude, waveSpeed, extent }` configures an authored sea plane. `level` is metres, bounded ±2000; amplitude is 0–3 m, speed is 0–10, and `extent` is the full square width in metres (16–4096). The runtime must use matching wave evaluation for rendered water and player queries. This data declaration alone does not prove swimming or underwater behavior.

## Retro terminals

`terminals` has at most 32 entries:

```json
{
  "id": "retro:warehouse-c64",
  "objectId": "warehouse-c64",
  "kind": "c64",
  "screenObjectIds": ["warehouse-c64-screen"],
  "position": [3, 1.3, -2],
  "interactionRadius": 2
}
```

Kinds are `c64`, `bbc` or `sun`. `objectId`, optional `screenObjectId`, and optional `screenObjectIds` must reference existing scene object IDs. The plural list contains at most eight distinct IDs. Position is the world interaction point, with components bounded to ±2000 m, and radius is 0.5–5 m. These declarations map authored objects to existing runtime presentations; they contain no OS commands, passwords or executable programs.

## Repository compatibility

Packing any project with one of these optional declarations present creates `elsemesh.world-repository/3`, version 3. Its immutable snapshot adds `connections.json` alongside metadata, terrain, objects, features, environment, spawn, geography and assets. Connections preserve the presence and values of all three optional declarations. Their bytes and SHA-256 participate in the snapshot hash and existing read/hydration budgets.

Nonempty portals require engine capability `portal/1`; water requires `water/1`; nonempty terminals require `retro-terminal/1`. The engine contract remains `elsemesh.worlds.runtime/1`. Missing or unknown required capabilities are rejected. Older engines reject the unknown repository/3 schema rather than silently omit behavior.

The loader continues reading repository/1 and repository/2 without mutating the repository. Projects without these optional declarations continue to pack as repository/2. Repacking a newly extended project is the explicit format upgrade; merely loading an older repository does not write or migrate any source files.

## Editing portal openings

In the builder, choose **Objects → Portal opening** (or **Add portal near spawn**). The new rectangle is centred 1.25 m above terrain near spawn. Selecting an opening in the list or clicking its frame focuses the existing editor camera; **Frame portal in viewport** repeats that action.

The form changes its world position, yaw in degrees, width/height in metres, destination identities, policy reference, colors, view distance and enabled flags. **Apply portal changes** validates and commits all fields together through the normal undo/redo history. Broken local destinations are rejected without changing authored data. Delete is undoable; an opening referenced by another local portal must be repointed before deletion.

The coloured frame and translucent aperture are editor guides. Game rendering and traversal are exercised in the actual game. Set the launch URL in the panel or via `VITE_ELSEMESH_GAME_URL`, save the repository snapshot, then load that saved repository in the game. The launch link does not transfer unsaved editor data.

## Builder verification (2026-10-23)

This increment was checked on hpubuntu before its local commit:

- `npx vitest run --maxWorkers=1 --testTimeout=15000`: 132 tests passed across 18 files (14.22 seconds).
- `npm run lint` and `npm run build`: passed. Build reported the existing mixed static/dynamic GPU import and large chunk warnings.
- `node --test scripts/world-repository-git.portal.test.mjs`: passed the mixed v2/v3 retained-history, checkpoint, clone and orphan-component rejection regression.
- `node scripts/portal-editor-acceptance.mjs`: passed create, numeric position/yaw/size editing, undo/redo, broken local destination rejection, valid local target, configured game link and delete/undo, with no page errors.
- `git diff --check`: passed.

The ordinary 5-second Vitest timeout was exceeded by the existing exhaustive weather geometry test on two parallel runs; the documented serial command above passed without changing weather code or test configuration. Browser screenshots and generated fixture repositories are local evidence and are excluded from the source increment. These checks establish builder authoring and serialization behavior. Actual game rendering, traversal, connected clients and two-machine acceptance remain separate runtime evidence.
