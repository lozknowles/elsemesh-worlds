# Repository traffic capability

`port-traffic/1` is optional `project.traffic` content, stored in the connections component of repository schema 3/4 and preserved in ordinary project/.emw data. Repositories carrying it must require `port-traffic/1`; unsupported engines reject that requirement.

Configuration contains schema, uint32 seed, count (0–12), roadY (±2000 m), graph (nodes, edges, classes) and vehicleAssetIds (car, van, utility). Nodes have id/x/z; edges have id/from/to/roadClass. Classes have width (4–20 m) and speed (1–15 m/s). Limits: 64 nodes, 128 edges, eight classes. All coordinates are finite within ±2000 m. The graph is connected, has no dead ends or duplicate edges, and every edge is at least 30 m. No callbacks, external file paths or world JavaScript are accepted. Vehicle IDs refer to ordinary admitted static GLB WorldAssets within existing package budgets.

Installed PortTraffic routing and junction math animate separate vehicle roots on native and WebGL renderers. Deterministic seed selects initial routes; dt is capped at 0.1 seconds. The active host updates traffic with local player obstruction; previews can show stationary cars. Candidates own their car resources and disposal. Local visual positions can differ across clients and sessions. Vehicles have no network authority and do not alter player physics. Source graph and assets belong to the content repository, never an engine-checkout lookup.

## Collision volumes

`EditorObject.collisionOnly: true` is a first class authored box volume, requiring `collision-volumes/1`. It is accepted only for box objects with solid/walkable collision; render adapters omit its visual mesh and descriptor collision generation retains the ordinary editable box transform/ID. This admits original dock collision boxes separately from a large collision:none dock GLB. No arbitrary collider callback is supported.

Standalone player-world/2 packages declare a capabilities list only when these new capabilities are required; existing packages retain no capabilities field. Landscape player-world/3 packages include their existing project/3 + landscape/1 requirements and any new requirements. Admission demands an exact capability set matching content; older readers reject the additions. Ordinary .emw project content preserves traffic/collisionOnly without a project schema bump.
