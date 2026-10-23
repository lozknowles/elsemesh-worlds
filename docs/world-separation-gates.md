# Independent world repositories: gates and acceptance

## PLAN gate, 23 October 2026

Trigger: cross-component separation requested as highest implementation priority. Architect reviewed existing format, runtime mutation, autosave and loader boundaries.

Findings: isolate authored/runtime state first; workspace identity must differ from world identity; retain immutable components; commit-pinned remote resolution must be separate from loading; repository permissions never imply runtime administration; actual Player adapter evidence is required beyond editor preview. Git helpers must suppress hooks and external filters and reject symlinks/submodules.

Primary decision: accepted. Preserve dirty source in isolated worktree baseline c92fc89, keep original game and world files untouched. Extend existing format/read pipeline rather than replace it. Implement and verify local content repositories before any remote publishing. The original game checkout was initially a read-only integration dependency. Later explicit authorization permits the separate runtime integration checkout described below; protected original checkouts remain untouched.

## Ownership

Content loader: manifest, validation, portable references and forks. Workspace/UI: authored/runtime state, local drafts and repository controls. Git workflow: deliberate checkpoints and conflict recovery. Primary: runtime adapter, integration evidence and overall acceptance.

## COMPLETION gate

Architect reviewed the completed implementation and evidence. Release is conditional on the fixes and final artifact steps recorded below; the game release record supplies the exact generated contract and client-artifact results.

## Actual ElseMesh integration PLAN gate

The user subsequently explicitly authorized changes and pushes to both editor and game. Architect approved a separate repository-world entry backed by the actual Engine/Player/Input/Colliders, preserving the legacy App island initialization. Shared data/geometry contract is generated from a clean pinned editor revision, without bundling an engine copy. Candidates activate atomically; session admission stays outside content repositories. Primary accepted.

## Review findings resolved

- Persistent World panel mounting preserves folder/source/fork state across navigation, covered by browser regression.
- Git clone/push validates all reachable history under explicit budgets, rejecting a forbidden ancestor even with a clean tip.
- New-world intent invalidates imports before asynchronous workspace recovery; blocked-writer browser regression proves cancellation.
- Runtime evidence now includes actual Player ground contact and authored wall interception plus signed content admission. Rendering and device-specific qualification are recorded separately.

## Browser environment NO-PROGRESS gates

Linux SwiftShader produced SharedImage swapchain presentation failures even in a minimal GPU clear independent of world content. Headful comparison and adapter/device diagnostics excluded a world-loader fix as justified. Architect directed supported visible Edge client acceptance of hpubuntu-built artifacts. Two reverse SSH attempts failed; the protected SSH configuration explicitly prohibits remote forwarding. Primary stopped forwarding attempts and used the existing Codex browser connector; no SSH security settings or relay bypass changed. Source/build/test suites remain on hpubuntu, MSI is the approved browser client only.

## Final local verification, 23 October 2026

- Editor: 118 unit tests in 16 files; lint; production build; seven first-person/computer/neon browser regressions; five workspace/repository browser cases; Git history/security/isolation integration passed.
- Two independent native Git content repositories: house and landscape. Editing/checkpointing one preserves the engine and the other repository. Exact-commit clone, fresh-location load, snapshot reproduction and legacy v1/EMW non-destructive migration are covered.
- Actual game: 32 existing network tests, six existing online security tests and 15 repository/session/host tests passed. Signed session protocol and actual native host integration have separately scoped evidence.
- Approved MSI Edge client: native engine rendered both repositories; A to B to A restored identity/digest; an unsupported world was rejected while retaining A. Actual keyboard input walked through the house doorway and climbed from floor 16.6 to 19.6, opened the upstairs computer, edited neon text and switched power off. Authored content digest stayed unchanged.
- MSI browser-input controller was explicitly authorized for client acceptance only. Its source was prepared on hpubuntu; development/build/regression suites remained there.

The old procedural island game remains the default route. This incremental release does not claim extraction of every legacy procedural island into a world repository. Collision is conservative authored-part AABB, not generated concave hulls. GLB auxiliary texture maps remain omitted as documented. Shared-session tests are local; MSI/mac two-machine federation and semantic portals are not claimed. Independent content repositories are local; the requested software pushes are separate from creating content remotes or deploying a public game.

Final release review, clean source provenance and exact final-artifact smoke are required before pushing. No GitHub CI is used as an acceptance dependency.

## Completion review findings and primary decision

Architect held release for two behavioral findings: merely checking an update activated it, and authoritative neon power was not taking precedence over config power. Both have focused regressions. Check now stages the revision; a separate Apply action reloads it, with stale-candidate rejection. Actual native-session integration reproduced the power defect before the fix and passed 26 checks after correcting precedence, including zero brightness/emissive when off. The game host suite now has 17 passing cases; existing network/security suites remain 32/6 passing.

Primary accepted the review: commit editor source, regenerate its installed contract from the clean pinned commit, run parity/build and final MSI artifact acceptance, obtain final architect clearance, then normally push both reviewed repository tips with CI skipped. Operational evidence and client controllers stay outside published source. Public GitHub network loading is not qualified by the local and mocked-reader checks; live two-machine federation is not claimed.
