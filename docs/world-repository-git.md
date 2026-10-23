# Independent world Git repositories

World repositories contain world content only. The engine remains in its existing repository. The two local examples created from the actual house and landscape .emw evidence are /fast/world-repositories/house and /fast/world-repositories/landscape. The landscape is an explicit fork with a fresh world and region identity, and provenance pointing to its source identity and digest. Source .emw files were read without modification. No GitHub repository was created and no content was pushed.

Run the CLI on the trusted engine host using Node 24:
~~~sh
node scripts/world-repository-export.mjs INPUT.emw /new/content-folder [--fork NAME]
node scripts/world-repository-git.mjs init /absolute/content-folder
node scripts/world-repository-git.mjs status /absolute/content-folder
node scripts/world-repository-git.mjs checkpoint /absolute/content-folder EXPECTED_HEAD "Describe this deliberate save"
node scripts/world-repository-git.mjs history /absolute/content-folder
node scripts/world-repository-git.mjs read /absolute/content-folder EXACT_COMMIT /new/snapshot-folder
node scripts/world-repository-git.mjs clone /absolute/content-folder EXACT_COMMIT /new/reproduced-repository
node scripts/world-repository-git.mjs update /absolute/content-folder EXPECTED_HEAD EXACT_CANDIDATE_COMMIT
~~~

Use "none" as the expected HEAD for the first checkpoint. Walking, moving a camera, opening a world, and autosave do not call checkpoint. The CLI emits structured JSON. status is read only; checkpoint creates a commit only when validated content changes. It uses an isolated temporary index and writes Git blobs directly without clean filters. A pre-existing staged index differing from HEAD is preserved and blocks checkpoint. This bounded CLI is deliberately separate from the browser file adapter.

init accepts an already exported and validated world folder, refuses existing Git state, and creates an explicit local content marker in .git. clone validates every reachable commit before transferring any history, reads and validates Git blobs, exports them into a new folder, and transfers an object pack into a new initialized repository at the same exact commit. Transfers are bounded to 128 reachable commits, 4096 files per commit, 16384 unique blobs and 128 MiB of unique blob content. A clean tip cannot hide forbidden files or credentials in an ancestor: the full transferred ancestry must pass the same world-content validation. No history is rewritten. The subprocess transport buffer is additionally bounded to 32 MiB. It copies no hooks, configuration, or worktree metadata and performs no checkout. read requires a full 40-character commit and a new destination. Content digests and identities can be checked through the common local source loader.

update validates an already present candidate commit, checks expected HEAD, requires a clean local world, and requires fast forward ancestry. Its result is an explicit recovery action: export the candidate using read to a new folder and open that folder. It does not overwrite the active folder or move the active branch. Divergence, dirty content and stale HEAD are refused with both snapshots preserved. A fetch/merge service and automatic conflict resolution are not implemented. A normal Git fetch from an untrusted repository is outside this trusted local CLI: use the browser's pinned GitHub source reader for remote content instead.

Only an explicitly initialized local repository is accepted. All files must be the validated manifest, its immutable components/binaries, independently validated retained snapshots, or exact canonical README/.gitattributes/.gitignore files. Unexpected code, credential/session filenames, secret-bearing JSON keys, credential URLs, common token/private key material, executable Git modes, symlinks, submodules, alternate object storage and unexpected Git configuration are refused. Embedded content is subject to the domain validator and aggregate limits. These checks do not establish authorship or asset licences, and cannot recognize every possible secret embedded in human prose or binary material; review user-authored content before publication.

Git commands override hooks, signing, fsmonitor, attributes, external diff and unsafe protocols. Object reads use plumbing without textconv, filters, checkout or repository code execution. Native Git object and history parsing remains part of the trust boundary. Keep this CLI and the engine installation trusted. It is not a shell wrapper for arbitrary Git options.

A push requires separate release authorization and this explicit contract:
~~~sh
node scripts/world-repository-git.mjs push /absolute/content-folder EXPECTED_HEAD https://github.com/OWNER/REPOSITORY.git main AUTHORIZE_PUSH
~~~
Only credential-free HTTPS github.com URLs and normal branch refs are accepted. Push requires a clean validated checkpoint and validates every reachable ancestor under the same transfer limits before starting transport, uses a normal non-force refspec, suppresses credential-bearing command output, and delegates existing authentication to the installed trusted gh auth git-credential helper. It never copies tokens into world files. Authentication and any actual remote push remain unqualified in this run. Never create a new remote or invoke push until the user authorizes that release.

GitHub's official limits, checked 23 October 2026: files larger than 100 MiB are blocked in ordinary Git, and a single push is limited to 2 GiB. See [large file limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github) and [push limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits). This content contract is bounded to 25 MiB total repository content, with at most 15 MiB of hydrated GLB assets, so ordinary Git is suitable for the current examples. Accumulated Git history still grows as binaries change. The CLI caps a validated checked-out content tree, not lifetime history.

Git LFS is not enabled: unhydrated pointer files are rejected. LFS storage/bandwidth and per-file limits depend on the account's plan; that plan and quota were not verified. See [Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage). For larger worlds, use a future explicit storage adapter with content hashes in the manifest and qualified availability/authentication/budget behavior. Do not silently turn on LFS.

The integration test scripts/world-repository-git.test.mjs uses the actual local examples and produces a unique evidence folder under /fast/world-repositories. It covers exact commit reproduction in a fresh location, explicit content checkpoints, dirty content and stale HEAD preservation, retained snapshots, no movement commits, content isolation from the engine source and the other world, and hostile paths/configuration/hooks. No remote network write is part of this test.


An interrupted folder save can leave a partial new immutable snapshot while world.json still selects the previous readable snapshot. The strict Git helper deliberately refuses that orphan/incomplete material. Preserve the original folder. Use Open world repository to read its still-valid active world.json and Save as a new world repository in a fresh folder, then initialize/checkpoint that validated export. If the original HEAD is the desired recovery point, use read with its exact commit into a new folder instead. Neither recovery path deletes or changes the partial original folder; do not remove orphan files automatically to make a checkpoint pass.
