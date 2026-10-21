# A separate repository for each world

The builder repository contains the editor, native preview adapter and bundled catalogue. A world repository contains authored content only. Neither operation modifies the existing ElseMesh game checkout.

## Create and publish a world

1. Build or open a world as usual. Choose **World repository** in the top bar.
2. Choose **Save to repository** and select a new empty folder. The browser asks for access to that folder. Existing `.emw` downloads and autosave remain available.
3. Add this folder in GitHub Desktop and create/publish a repository in your own account. Choose its visibility and content licence deliberately. No licence is assigned to your authored world automatically.
4. Continue using every existing terrain, pen, water, tree, asset and weather control. Choose **Save to repository** after edits. Browser autosave does not save to the repository folder.
5. Review the Git changes, commit and push through GitHub Desktop or Git. The builder never receives a GitHub password or token.

To collaborate, clone a world repository using Git, then choose **Open repository folder** in the builder. This validates the complete candidate before replacing the active world. Resolve branch merges in Git before reopening. Choose **Save repository as…** for another empty folder; it preserves world identity, so a separately identified world should start with **New world** instead.

## Files and compatibility

`world.json` selects an immutable snapshot. Named JSON files within `snapshots/<hash>/` contain terrain, objects, features, environment, spawn and source metadata. Content-addressed GLBs and imagery sit outside the JSON, retaining licence and attribution metadata. No engine scripts, browser storage, access tokens, screenshots or Git metadata are copied into the world.

SHA-256 hashes detect changed or incomplete content; they do not establish author identity or trust. Manually editing hashed files invalidates a snapshot. Edit in the builder and save a new snapshot. Unchanged files and binaries retain their hashes. Older snapshots and assets are retained, so repository size grows over time; there is no automatic pruning.

The manifest identifies the editable project format and the pinned native preview source revision. This is **not a verified game runtime compatibility contract**. Existing **Export world** remains the provisional player-package export. The production game is unchanged and has not been qualified to load these repositories.

## Storage and failures

Folder operations require Edge or Chrome on localhost or HTTPS with File System Access support. Permission denial and unsupported browsers leave normal `.emw` Open/Save available. Folder permissions are session-local; reopen the folder after refreshing the page.

The adapter writes new immutable snapshot and asset files first, closes each stream, then replaces the root manifest. A failed write can leave unused files, but it does not deliberately select an incomplete snapshot. This is not a cross-process filesystem transaction. Concurrent external changes to the manifest are checked before saving; reopen the repository after pulling or editing it elsewhere. Do not save concurrently from multiple builder tabs.

Only recognised repository paths are read. Paths, hashes, schemas, byte limits and the reconstructed project are validated. Corrupt, missing and unsupported assets are rejected. Current project and asset limits still apply: 25 MiB embedded project and 15 MiB total GLB content. Ordinary Git is used for this bounded version. If your checkout contains Git LFS pointer files, hydrate them using Git LFS before opening; pointers are not models or images.

Only distribute assets and imagery you have rights to share. Existing source, licence and attribution records are preserved; their presence is not a legal permission check.

If the very first save fails before a manifest exists, the folder may contain incomplete files and will no longer count as empty. Choose a new empty folder, or inspect and recover those files outside the builder. The builder does not automatically remove them. Formatted repository files also have a 25 MiB budget, so projects close to the compact .emw limit may need less content.
