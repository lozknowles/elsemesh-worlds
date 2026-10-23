# Private neon browser client and loopback proxy

This is an explicitly enrolled, single authority private test world. It is not a federation or public release. The browser connects only to the same origin `/__private-neon` socket. `scripts/private-neon-proxy.mjs` forwards that route to the single operator-configured Tailscale endpoint on fixed port `5197` and path `/api`. Run the proxy on each client with an already built `dist` directory and Node plus the `ws` dependency:

```
PRIVATE_NEON_UPSTREAM_HOST=<approved-tailscale-ipv4> node scripts/private-neon-proxy.mjs
```

Open `http://localhost:5198`. The HTTP listener binds only `127.0.0.1`; localhost is a browser secure context for WebCrypto/WebGPU. The upstream hop relies on encrypted Tailscale transport. No TLS validation bypass or Funnel is used. `PRIVATE_NEON_PROXY_PORT` may change the loopback port; `PRIVATE_NEON_DIST` selects the local built artifact folder. The required `PRIVATE_NEON_UPSTREAM_HOST` is trusted operator configuration: only an IPv4 address in Tailscale range `100.64.0.0/10` is accepted. Keep real addresses and launch configuration outside the repository. Browser requests cannot select or override the upstream host, port or path. Requests with an unexpected Host, Origin or WebSocket path are rejected. The proxy logs no keys, session challenges or payloads.

Use **Show public identity for enrolment** and supply the resulting node ID and public key to the administrator. The administrator must add that public identity to the server allowlist over SSH, choosing owner or member. The first browser is never automatically made owner. This export contains no private key. Ed25519 private keys are nonextractable WebCrypto keys stored in IndexedDB for the browser profile and origin. Clearing site data loses this identity; changing localhost port/origin creates separate storage. Browser profile or device compromise remains outside this storage protection.

The client signs the recursively sorted canonical JSON challenge containing protocol, server/world IDs, client node ID and public key, session ID, nonce and expiry. Node IDs are `elsemesh-node:` followed by lowercase SHA256 of SPKI DER, matching ElseMesh identity conventions. The fixed proxy route establishes the approved private server destination; challenge binding alone is not a general trust system for arbitrary servers.

Connecting fetches a snapshot with role, server epoch, global revision, sign configurations, power, effect start and server clock. The UI displays the role, epoch and revision. Snapshot configuration shape and limits are checked before rendering. Runtime changes are kept separate from the authored local project. A mismatching world or sign set requires an explicit **Load private world demo** action. The application owns the replacement confirmation and demo construction.

Writes are explicit `setPower` or owner-only `setConfig` with a request ID and expected global revision. Stale writes surface an error and the refreshed snapshot; the user can retry against the current revision. No per-frame updates are sent. A stable handshake midpoint clock estimate maps server effect time to rendering; this estimate includes network uncertainty and is not a precision clock synchronization claim. Reconnect refreshes the snapshot and clock estimate.

Validation on hpubuntu:

```
node --test scripts/private-neon-proxy.test.mjs
node --test scripts/private-neon-client.test.mjs
node --test scripts/private-neon-browser-session.test.mjs
npx tsc -b
```

Set `PRIVATE_NEON_CHROMIUM` to an installed Chromium executable if the default Playwright browser is unavailable. The session fixture discovers a local Tailscale interface or uses `PRIVATE_NEON_TEST_HOST`, which must match a local Tailscale IPv4 interface; it skips if no interface is available and no host was supplied. It temporarily binds port `5197` and closes it after the test.

The browser test verifies nonextractable key storage, reload continuity, independent context identity, Node-compatible canonical signing and the node ID. The session integration test authenticates two independent browser contexts through the fixed proxy, confirms owner/member power synchronization, owner configuration propagation, late join, reconnect identity continuity, and terminal malformed-message disconnect. One hpubuntu run observed a 4 ms sequential phase estimate difference; this is not physical display timing evidence. Proxy tests cover hostile Host/Origin, traversal, reserved paths and missing assets. Real MSI/mac WebGPU, key persistence and two-device shared neon interaction require physical device acceptance. These checks do not establish full ElseMesh federation.
