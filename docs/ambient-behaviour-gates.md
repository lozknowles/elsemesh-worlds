# Ambient wildlife implementation gates

## PLAN gate
Trigger: a versioned world-object descriptor shared by the editor, player and both render backends, with multiplayer ownership implications. Architect recommended separating ownership, shared simulation authority and local presentation. Primary chose bounded ambient presentation only. The world stores validated route parameters; installed software evaluates motion. No arbitrary repository scripts or owner-authoritative AI are claimed.

## NO-PROGRESS gate
Trigger: the same evaluator test expectation failed twice under a single test habitat. Architect inspected the evaluator and found a fixture conflict: the first ground level put the crab four metres above ground, while the second put the fish too close to ground. Primary changed the test to use species-specific anchors and added vertical assertions; the focused tests then passed. No evaluator code was changed to satisfy an invalid fixture.

## Acceptance scope
World repositories preserve descriptors and authored weather values through save/reopen. Bird and crab placements default to editable client-local routes; imported non-colliding fish GLBs can opt into swimming. Preview and player consume the same evaluator. Weather effects remain in engine code and worlds choose mode, clouds, mist, rain and wind through authored environment values. These are ambient visual routes, with static animal poses and no shared AI or moving collision.
