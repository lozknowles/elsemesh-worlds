# Object Manager and groups

The **Scene** panel displays the world as a parent/child tree. Use its search box
to match object names, descriptions or tags; matching descendants retain their
ancestors in the results. Expand or collapse a group with its arrow.

Click an outline row or viewport object to select it. **Shift-click** adds or
removes objects. Selecting a parent removes its descendants from the independent
selection. Transform fields and the gizmo edit the active object; choose
**Group selected** to transform a selection together.

## Group and arrange objects

- **Group selected** creates a geometry-free parent while preserving the selected
  objects' world transforms.
- **Group entire world** explicitly places all current root objects into a new
  group. This can collect the warehouse's 1,755 components into one editable
  assembly.
- **Parent group** in the inspector reparents the selected roots while preserving
  their world transforms. Choose **World root** to detach them.
- **Ungroup selected** removes selected group containers and reparents their
  children to the former parent, preserving world transforms.
- **Undo** and **Redo** restore whole commands, including parent changes and group
  operations.

Object transforms are local to their parent. Moving, rotating or scaling a group
affects its complete descendant hierarchy. The viewport renders nested local
transforms directly, including rotated children under scaled parents. The gizmo
helper is mounted at the scene root while controlling the selected object's
local transform; rejected or invalid gizmo changes restore the prior transform.

## Resize the warehouse or another group

Select the group and edit **Group width m**, **Group height m** or **Group depth
m**. These are bounding extents along the group's local axes. **Keep proportions**
scales all axes by the changed axis's factor.

Resizing scales the group and everything inside it, including furnishings.
Bounding dimensions are approximate: rotated objects use conservative bounding
boxes, and procedural tree representations can differ between renderer LODs.
This action does not infer a building shell or preserve furnishing sizes while
resizing walls. Zero-extent groups cannot be resized. Reparenting or ungrouping
that would require a nonrepresentable local shear is rejected atomically with an
explanation.

## Copy, lock and describe objects

**Copy selection** / **Paste objects** (or Ctrl/Cmd+C / Ctrl/Cmd+V) copies complete
selected subtrees. Every paste creates fresh object IDs, preserves internal
parents, detaches copied roots with their world transforms, offsets them by
1.5 metres in world X, and embeds only any needed model assets. Existing embedded
bytes are reused. The clipboard can be pasted into another world. A paste that
would exceed project limits leaves the destination unchanged.

The outline's lock control locks an object and its descendants. A locked parent
prevents children being unlocked independently. Locked descendants also prevent
their containing group from being transformed, resized, reparented or deleted.
Read-only copying remains available. Outline visibility propagates through
groups; a child's local visibility setting remains stored while a parent is
hidden. These are authoring controls, not network permissions.

Add an **Object description** and comma-separated **Object tags** in the
inspector. Descriptions and tags are saved and can be searched in Scene. Editing
text, including pressing Delete inside a text field, does not delete the object.

## Project compatibility and rendering limits

Saving writes `elsemesh.worlds.project/2`; player exports use the corresponding
version 2 envelope. Opening a version 1 project explicitly migrates its flat
objects without changing their IDs, assets or transforms. A document cannot
disguise hierarchy fields under the old schema.

Object-surface placement continues to raycast the actual composed visible mesh.
The local first-person preview uses conservative world bounding boxes composed
through the hierarchy. This remains a bounded navigation approximation rather
than a rigid-body or triangle collision solver. Native hierarchy rendering uses
the same composed world transforms, while the existing native fly controls retain
their previous navigation limits.

The limits remain 2,000 objects (including group containers), 128 embedded assets,
15 MiB embedded asset bytes and 25 MiB project bytes. Grouping the warehouse adds
one object. Copying that entire assembly into the same world exceeds the object
limit and is rejected.
