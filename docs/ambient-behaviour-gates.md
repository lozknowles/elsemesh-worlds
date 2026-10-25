# Ambient wildlife implementation gates

## PLAN gate
Trigger: a versioned world-object descriptor shared by the editor, player and both render backends, with multiplayer ownership implications. Architect recommended separating ownership, shared simulation authority and local presentation. Primary chose bounded ambient presentation only. The world stores validated route parameters; installed software evaluates motion. No arbitrary repository scripts or owner-authoritative AI are claimed.

## NO-PROGRESS gate
Trigger: the same evaluator test expectation failed twice under a single test habitat. Architect inspected the evaluator and found a fixture conflict: the first ground level put the crab four metres above ground, while the second put the fish too close to ground. Primary changed the test to use species-specific anchors and added vertical assertions; the focused tests then passed. No evaluator code was changed to satisfy an invalid fixture.

## Acceptance scope
World repositories preserve descriptors and authored weather values through save/reopen. Bird and crab placements default to editable client-local routes; imported non-colliding fish GLBs can opt into swimming. Preview and player consume the same evaluator. Weather effects remain in engine code and worlds choose mode, clouds, mist, rain and wind through authored environment values. These are ambient visual routes, with static animal poses and no shared AI or moving collision.

## Contract NO-PROGRESS gate

Trigger: the current game rejected the editor's first ambient bundle because its main branch also admits private splat scenes. Architect identified contract lineage as the cause and recommended carrying the complete splat commit into the editor. Primary cherry-picked that standalone contract, preserved both advertised capabilities, rebuilt a clean bundle, and preflighted all 121 game runtime imports.

## COMPLETION gate

Trigger: substantial editor/player integration before source publication. Architect's first review found a stale game baseline, loss of affine transforms for moving meshes, and unqualified bundle provenance. Primary rebased implementation onto the current game, retained full authored transforms, and generated the exact bundle from a clean editor source tree. The final review found no remaining code blocker after the editor's final production build passed.

Evidence: editor 245/245 serial tests, typecheck and production build; game 39/39 focused and access tests, 160/160 portal tests and production build. Builder source commit 6c4d4a7 and game source commit ffdf3a5 are the reviewed code. Browser visual acceptance, real-device frame rate and rendered WebGL weather parity remain unqualified. Primary decision: publish these bounded source changes with the limits stated, while keeping weather rendering in the engine and weather selection in world data.
