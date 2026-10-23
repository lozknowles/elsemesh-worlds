# World separation verification

Run editor checks with `npm test -- --run`, `npm run lint`, `npm run build`, the workspace and world-regression Playwright configurations, and `node --test scripts/world-repository-git.test.mjs`. `scripts/world-runtime-acceptance.mjs` uses an explicitly supplied actual ElseMesh checkout for CPU Player/collision and signed admission evidence. See the script arguments/environment for the fixture locations.

The game repository includes `worlds.html`, native host/unit tests and separate protocol/native-host authority harnesses. The latter require `ELSEMESH_BUILDER_ROOT`, independent content repositories and a Playwright installation. No credentials or world-owner private keys belong in content repositories.

Acceptance mapping:

1. One installed game loaded two independent repositories through the same validated loader (house and landscape), both in editor browser tests and the actual native game on MSI Edge.
2. Git qualification edited/checkpointed A and verified unchanged engine/other-world bytes. Browser tests switched workspace drafts and restored them independently.
3. Exact-commit Git clones at fresh paths loaded without engine-checkout asset paths.
4. Snapshot/content digests matched at the pinned revision; A to B to A restored the same digest. Remote branch resolution is explicit and never an automatic running-world update.
5. Actual native Player terrain walking, doorway collision, stairs and computer/neon interaction were observed. Existing federation/network/security suites passed. Actual signed-session/native-host lifecycle is separately exercised; this is not live two-machine traversal proof.
6. Legacy repository v1 and embedded EMW inputs read without rewriting source. Full procedural island extraction is deferred; default game initialization is retained.

Detailed gate decisions and limitations are in world-separation-gates.md. Source checks, CPU checks, browser protocol harnesses and rendered client observations are distinct evidence categories.
