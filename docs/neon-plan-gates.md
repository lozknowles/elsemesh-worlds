# Neon sign architecture and gate record

## Inspection

Canonical upstream is lozknowles/elsemesh-worlds; implementation is in its isolated hpubuntu feature checkout after Stage B checkpoint 2ab1d27. The editor uses React/R3F/Three, local hierarchy TRS, project/2 validation and IndexedDB/file/repository persistence. Objects now support groups, cloning, locking and metadata. No general Behaviour Editor or configured prefab graph exists. First-person navigation uses pointer lock and conservative object bounds, without an interaction registry. Catalogue models are static, admitted GLBs; neon definitions are procedural data rather than catalogue binary variants.

The native preview uses the vendored ElseMesh WebGPU renderer, Material emissive uniforms and existing HDR PostFX bloom. WebGL has standard emissive materials but no compositor bloom. The shared procedural geometry/effect modules are reused across both adapters; WebGL uses a depth-tested halo fallback that does not illuminate neighbouring surfaces. Installed Three fonts include immutable typeface JSON with embedded original licence notices; selected files and complete notices are bundled.

Existing game federation handles signed regions, delegation/replicas and portal player handoffs, but has no authored-object authoritative state protocol. The game checkout remains outside this change. Authenticated sign ownership/revisions, late join snapshots, common effect clock and real MSI/macomarchy acceptance are not established. No fake network permission controls are added.

## PLAN gate

Architect approved a bounded authored-sign vertical slice: validated versioned config on normal world objects; separate transient power/effect start state; shared generator and deterministic whitelisted effects; bounded fonts/text/geometry/sign count; depth-tested glow; geometry-derived hierarchy bounds; explicit resource disposal. First acceptance creates THE RED LION, edits/duplicates/groups/saves/reopens, views both renderers, and toggles within range with wall occlusion. Primary accepted this architecture. Federation remains a separate unmet implementation/physical acceptance dependency. No production deployment is authorised.

## Local sign completion source gate

Architect approved local source after resolving sequence emission parity, shared hour-14 fallback, fresh centre-ray/range/occlusion checks on E, and stale asynchronous preset import guards. Resource/profile checks count unique sign IDs backed by actual emissive glyph geometry, rather than counting each tagged letter as a sign. MSI visual acceptance created pink THE RED LION with flicker in the warehouse. Native WebGPU and 1/10/50-sign software scenes passed; physical performance remains unqualified.

## Private world PLAN gate

User chose a private hpubuntu test world. Architect approved an isolated single authority, explicitly not federation between independent servers. Reuse copied ElseMesh Ed25519 canonical identity helpers with pinned provenance/licence; bootstrap owner via trusted SSH administration and an explicit public-key allowlist. Bind a verified unused Tailscale-only port; preserve port 5200 and protected services. Use nonce/expiry/session/world/client-bound challenges, explicit setPower with CAS revision and deduplicated request IDs, atomic persistence before acknowledgement, late-join/reconnect snapshots, and server-clock effects. Serve clients via a fixed loopback proxy to the approved Tailnet upstream; no arbitrary proxy target, certificate bypass, public Funnel or credentials in URLs/logs. Primary accepted this bounded private-test architecture.

## Computer preview NO-PROGRESS gate: rendered-frame timing

Combined acceptance under concurrent video encoding reached the upper-floor computer, changed linked neon power, and closed the panel, then failed a fixed 150 ms movement wait without a rendered movement frame. Architect approved measuring actual renderer frame progress rather than weakening the movement assertion or changing physics. Primary accepted a test-only change: hold W while the panel is open across at least three `gl.info.render.frame` advances and require an unchanged full camera pose; after closing, require both frame progress and Z movement greater than 0.1 m within a bounded poll. Timestamped frame/pose evidence is attached and key-up executes in finally. No application source changes. Focused rerun result is recorded below once complete.

Focused hpubuntu result: `ELSEMESH_BROWSER_EXECUTABLE=/home/loz/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npx playwright test --config playwright.computer.config.ts --grep "reload, physically"` passed 1/1 (23.8 s total; case 21.5 s). Targeted ESLint passed. This proves the bounded fixture path; final recorded home acceptance remains a separate primary evidence gate.
