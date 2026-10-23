# World data and runtime admission

A single installed editor consumes any supported world through `loadWorldSource`. Sources supply bytes, never JavaScript modules, package manifests, install hooks or runtime credentials. `describeRuntimeWorld` validates and copies the resulting authored document into terrain queries, collision descriptors, spawn and interaction identifiers. The browser editor and its native preview continue to render the validated project using the existing scene adapters. No engine rebuild is required when opening another world.

## Actual player integration evidence

Run `ELSEMESH_REFERENCE_ROOT=/path/to/pristine/ElseMesh node scripts/world-runtime-acceptance.mjs /path/to/world-a /path/to/world-b` from the editor installation. The reference installation is trusted engine code, not repository content. The harness uses its unmodified actual `Player`, `Colliders` and CPU engine math; it initializes them from two separately validated repositories, advances real controller updates, checks camera/ground state and proves authored bytes remain unchanged. This is a CPU player integration test, not a browser rendering or multiplayer-device acceptance claim.

The adapter currently supplies conservative world-axis bounding boxes for the original game's box collider API. This preserves admission of hierarchy and model bounds but is not exact triangle collision for tilted or concave assets. Existing editor first-person collision and computer/neon interactions retain their own qualified implementation.

## Federation identity and permissions

Authored world and region identifiers are stable portable data. The existing federation protocol uses different `elsemesh-world:`/`elsemesh-region:` namespaces and signed runtime descriptors. Never rewrite existing content IDs merely to fit those namespaces. An explicit runtime-owned admission record binds authored world ID, authored region ID and exact content digest to the separately signed federation world/region/authority. The harness signs this content binding using the existing identity implementation, verifies it against the independently signed region descriptor, and rejects untrusted signatures, changed content digests and authority changes. The browser repository session separately checks owner trust, descriptor hash, current server ID/epoch and bounded admission expiry. It does not turn a world repository's metadata or collaborator list into an administrator list.

Node keys, trusted owners, delegation, multiplayer sessions, persistent server state and admission bindings remain in runtime operator storage outside world repositories. An independent fork requires deliberate admission as its new authored identity; it does not inherit source session enrollment. Repository read/write access alone never signs a federation descriptor.

## State boundaries

1. Authored world: terrain, entities, features, declarative capabilities, assets and metadata; local drafts and explicit repository snapshots contain this document.
2. Persistent gameplay state: server-authorized durable settings and changes; authority controls them independently of Git. An enrolled owner may deliberately adopt supported settings into their editable document using the checked snapshot revision. Repository write permission remains a separate filesystem/Git operation.
3. Temporary state: movement, presence, power/effect clocks and active sessions; never commit them to Git. No frame callback creates a repository checkpoint.

## Hosting and large assets

Checked 23 October 2026: GitHub blocks ordinary Git files over 100 MiB and enforces a 2 GB push limit. LFS limits and storage/bandwidth depend on account plan; that entitlement has not been established here. See [GitHub large-file documentation](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github) and [repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits).

This increment deliberately retains the stricter 25 MiB world and 15 MiB hydrated GLB budgets with content-addressed deduplicated binary files. It uses ordinary Git and rejects unhydrated LFS pointers. For larger worlds, use a separately qualified content-addressed storage provider or hydrated LFS adapter with explicit quotas; changing provider must preserve byte hashes and attribution. No account charge or provider enrollment is implied.
