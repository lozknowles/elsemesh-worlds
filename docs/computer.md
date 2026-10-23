# Interactive computer prop

A computer is a normal versioned editor object: `kind: computer`, with `computer: {schema:"elsemesh.computer/1", screenColor:"#39ff88", targetSignId?:string}`. It has ordinary local TRS, hierarchy, visibility and collision behaviour. At most 32 computers are allowed. Computers contain no assets or external resource URLs.

The target ID is an optional bounded reference to a neon sign. A missing/deleted target does not invalidate the world; the UI reports an unlinked control. When copying a subtree that includes the sign and its computer, the copy remaps the target to the new sign ID. Copying the computer alone preserves its external target ID. Changing a clone cannot mutate the original configuration.

`buildComputerGeometry()` creates shared real 3D box geometry for a monitor, inset emissive screen, post, base, keyboard and key rows. Its return value has `parts: {name,geometry,color,emissive?}[]` and plain metre-scale `bounds.min/max`. All geometry is baked into object-local coordinates: base Y=0, front +Z. Width is 0.9 m, height 0.8 m and depth 0.595 m. Place its base on a desk surface using the object's Y position. Adapters render the screen with the authored screenColor, and dispose owned buffers with `disposeComputerGeometry(value)`. The fixed COMPUTER_BOUNDS is checked against generated geometry in unit tests.

Interaction is a local in-world control panel, with active/open panel state kept separately from authored configuration. This prop does not run an operating system, load websites, fetch external resources or grant a server permission. The App chooses one eligible E interaction target across computers and neon signs; permission for a linked private sign still comes from the private authority.

## Player contact helper

`resolvePlayerMotion` in `player-contact.ts` accepts previous/proposed eye positions, vertical velocity, collider world bounds, terrain height and optional player dimensions. Defaults are eye height 1.65 m, body height 1.75 m, radius 0.28 m and step height 0.45 m.

The helper lands on a platform only during downward crossing from above. A player beneath an upper floor remains beneath it. A lateral newly entered step must be reachable and have clear space for the whole player body. Ascending head motion clips against an underside and stops upward velocity; tall side walls roll horizontal movement back. Both solid and walkable colliders are physical surfaces; none is ignored. It uses conservative world AABBs and discrete motion contacts, rather than a swept capsule physics engine.

Focused tests cover generated bounds, configuration limits, missing references, cloned target remapping, stair ascent/descent, standing under a floor, jumping against its underside, head clearance and side walls.

