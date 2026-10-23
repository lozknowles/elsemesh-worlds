# Release 1.0.0 verification

## Scope

Editor source release, prepared and checked on hpubuntu. Existing game and acquired reference checkouts are not modified or deployed. GitHub CI is not a release dependency. Private shared sign state is an experimental single-authority prototype; physical two-device acceptance remains outstanding. The requested building video is a separate delivery and is not evidence of all release features until its walkthrough is qualified.

## Executed checks

| Check | Result |
| --- | --- |
| Unit suite | 94 tests in 13 files passed; `npx vitest run --maxWorkers=1 --testTimeout=15000` |
| Private protocol/client/proxy | 8 Node tests passed with test concurrency 1, including two independent browser identities |
| Catalogue verifier | 1,775 models in 19 packs passed reference/hash/size/bounds checks; 108 unsupported source models excluded |
| Dependency audit | 0 vulnerabilities at moderate threshold |
| Native WebGPU | Actual composed hierarchy matrix test passed; procedural neon and eight-part computer geometry with emissive screen passed |
| Local neon UI | Five cases passed across focused runs: design/presets/effects/save, interaction/occlusion, cache/cleanup, stale import guard, private-world exact matching/hour |
| Computer walkthrough | Saved/reloaded fixture, physically climbed stairs, opened computer, used World Info/Linked Neon Control, closed and resumed movement; under-floor jump check passed |
| Final consolidated browser suite | Running; update before release |
| Final lint/build | Update before release |

The unchanged weather stress test exceeded its default five-second timeout during simultaneous recording/browser workloads on earlier runs. Its isolated rerun passed. The release unit run serializes workers and allows fifteen seconds; no assertion or weather implementation was changed to obtain this result.

## Private state checks

Executed cases include unknown identity rejection, canonical Ed25519 browser/Node signature compatibility, nonextractable stored browser keys and reload continuity, consumed/replayed challenges, owner/member separation, unknown sign rejection, malformed and oversized commands, stale CAS revisions, request retry/reuse, rate limits, late join, reconnect, restart recovery, and injected pre/post-rename persistence failures. A post-rename indeterminate commit fails stopped without false acceptance/rejection; recovery retains deduplication history. Initial state and authoritative world hour persist before listening.

Browser fixture clock estimates differed sequentially by a few milliseconds; this is not precision synchronization or physical-device visual proof. Fixed loopback proxy upstream configuration is supplied privately by the trusted operator; no host credential or real Tailnet address is embedded in release configuration.

## Representative software rendering profile

Headless Chromium with SwiftShader, 1280 × 800, low quality OPEN signs, 60 frame-scheduling samples. These measurements are software-renderer observations, not a hardware performance target.

| Signs | Draw calls | Rendered triangles | Allocated geometries | Mean frame interval | P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | 10,126 | 6 | 56.4 ms | 100.0 ms |
| 10 | 62 | 27,514 | 6 | 66.1 ms | 116.7 ms |
| 50 | 302 | 104,794 | 6 | 109.7 ms | 133.4 ms |

Merging non-sequence lettering reduced the measured 50-sign draw count from 752 to 302; geometry stays shared. Sequence retains per-letter control. Physical GPU acceptance and realistic client-specific frame budgets remain unqualified.

## Release boundaries

- Player-world/2 admission in the original live game is unverified. No original game code or live deployment is included.
- Whole-group resize scales all descendants; shell-only remodelling is not implemented. Bounds and navigation collision are conservative. Shear-requiring regrouping is rejected.
- WebGL glow is a depth-tested shell approximation; native uses existing HDR emissive/bloom. These signs do not provide dynamic scene lighting, arbitrary remote fonts, curved centreline tubing or an operating system.
- Computer panels are local first-person UI with linked neon controls; native fly preview renders the computer but does not implement that panel interaction.
- Generic behaviour graphs, movement-path simulation, full programmable prefab graphs and multi-server federation are not claimed.
- Frame world fits visible scene objects, falling back to terrain when no eligible object exists.
- Browser folder-picker, physical MSI/mac shared-world operation and maximum-resource hardware responsiveness are not established by these fixtures.
