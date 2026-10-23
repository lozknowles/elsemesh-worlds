# Changelog

## 1.0.0 — 2026-10-23

### Editor

- Unified asset catalogue: 1,775 verified, pinned Kenney static models from 19 packs, lazy previews, transactional surface placement, provenance and licence inventory. Existing ElseMesh debris and editable warehouse content preserved.
- Scene hierarchy, pruned multi-selection, group/ungroup/reparent, full-building scale, inherited locks/visibility, descriptions/tags, fresh-ID subtree copy and embedded asset deduplication. Explicit schema 1 to 2 migration.
- Procedural 3D neon sign designer with bundled licensed fonts, editable typography/backing/mounting, colour/style presets, eight deterministic effect presets, local power interaction and reusable single-sign preset files.
- Bounded interactive desktop computer with a functional local panel and linked neon controls. Shared geometry in editor/native views and directional first-person floor/step/ceiling contact.
- Existing terrain, water, weather, GLB import/material tools, geographic import and world repository workflows retained.

### Experimental

- Private single-authority sign-state server, explicit Ed25519 public-key enrolment, owner/member rules, CAS revisions, idempotent requests, durable persistence/recovery, late-join snapshots, common clock and fixed loopback proxy. Protocol/browser fixture evidence is separate from physical multi-device acceptance.

### Compatibility and limits

- Projects and player export use version 2. Legacy flat project files migrate; an original game runtime accepting the new package is not established.
- Whole-group resize scales furnishings too. Bounds/collision are approximate; unrepresentable shear operations are rejected.
- WebGL neon glow is a depth-tested shell fallback, not scene illumination. Native preview uses existing emissive/bloom. Extruded lettering is not a centreline tube-font or arbitrary script-font system.
- Generic behaviour graphs, movement simulation, shell remodelling, general prefab graph updates and multi-authority federation are not included.
- Physical GPU performance and multi-device private-world acceptance remain qualification tasks.

Source release only; no game deployment. Local verification is used instead of GitHub CI. Detailed executed checks and limitations are recorded in [release verification](docs/release-1.0-verification.md).
