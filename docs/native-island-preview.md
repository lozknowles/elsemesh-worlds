# Native island editor preview

Native repository islands use the clean engine scene and resource-loader source closure recorded in `src/vendor/native-island-runtime-provenance.json`. Its per-file byte counts and SHA-256 hashes are authoritative for those files. The older `elsemesh-provenance.json` retains the initial upstream import record and original CRLF-byte hashes; the native runtime manifest explicitly supersedes overlapping entries.

The parent editor validates resource bytes through its native-island resource reader. The same-origin preview bridge checks the sending frame, exact resource descriptor, bounded pending reads, field representation and revision lifetime. Preview navigation uses the editable coarse proxy rather than claiming native full-resolution movement parity.

The editor preview retains its existing local weather and mist adapters. It does not yet inherit the game's warehouse weather shelter exclusions. The clean scene closure does not include the application weather loop. Warehouse interior weather behavior in the editor therefore remains a known preview limitation; the game has separate native and WebGL shelter integration and acceptance evidence.

The runtime sync command requires a clean source checkout by default. Its explicit dirty prototype override must not be used for a release. The sync copies the bounded inspected dependency closure and retained license/credits, never the game application entry point.
