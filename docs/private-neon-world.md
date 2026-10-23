# Private neon world authority

This is one private world with one authoritative Node 24 server on hpubuntu. It synchronises authored neon configuration and runtime power for explicitly enrolled identities. It is not multi-server federation, discovery, a production authentication service or a claim of compatibility with the original game runtime.

## Binding and bootstrap

The server is started explicitly:

```sh
node scripts/private-neon-server.mjs --config /absolute/private-config.json
```

The JSON config contains `host`, `port`, `statePath`, `worldId`, `allowlist` and `signs`, with optional `worldHour` (default 22). A private test instance uses the verified local Tailscale IP and a verified unused explicit port; the intended endpoint is `<configured-tailnet-ip>:5197/api`. The CLI refuses wildcard/public binds and nonlocal interfaces. Library tests use `127.0.0.1` with port zero. No existing game service is modified.

`statePath` should be an absolute path under the ignored `.local-evidence/private-world/` folder. The server creates its directory with mode 0700 and durable state files with mode 0600. Keep private bootstrap config and test keys in that ignored directory. Never put private keys into the server config or logs.

Each allowlist property is the exact `elsemesh-node:` prefix plus lowercase SHA-256 of SPKI DER, mapping to `{publicKey: SPKI_PEM, role: "owner" | "member"}`. Only Ed25519 keys are accepted. At least one owner must be enrolled explicitly. Nobody becomes owner by connecting first.

To enrol a public key through SSH, provide the existing private config and a public PEM file:

```sh
node scripts/private-neon-server.mjs --config /absolute/private-config.json --enroll /absolute/member-public.pem
node scripts/private-neon-server.mjs --config /absolute/private-config.json --enroll /absolute/owner-public.pem --owner
```

Restart after changing the allowlist. The owner flag is an operator decision. This command handles public keys only. The server config does not create client keys.

Bootstrap `signs` is an array of `{id,config,powered}`; all IDs are explicitly configured. A demo can use ID `red-lion`, `defaultNeonSign("THE RED LION")` and `powered:true`. Recovery must contain exactly those configured sign IDs. Members cannot create signs. The server validates shared neon schemas, geometry bounds/complexity, 50-sign count, 150,000 triangles per sign and a combined 1,000,000 triangles before accepting state.

## Protocol

WebSocket path is `/api`; protocol is `elsemesh.neon-session/1`. The local browser proxy has a fixed Tailnet destination and validates its browser Origin. The server authenticates enrolled Ed25519 clients. The `serverId` is a stable endpoint/world label derived from host, port and world ID; it is not a cryptographic server identity. Endpoint trust comes from the configured Tailnet host/proxy, not federation server authentication.

Client hello is `{type:"hello",protocol,nodeId,publicKey}`. The server returns `{type:"challenge",challenge}`, where the challenge contains protocol, serverId, worldId, nodeId, publicKey, sessionId, random nonce and expiry. The client signs UTF-8 recursive sorted-key canonical JSON of that exact challenge and sends `{type:"auth",sessionId,signature:base64}`. Challenges expire after 30 seconds and are consumed on the first auth attempt. Cross-session replay fails because the session challenge differs.

Authenticated snapshots contain:

```text
type: snapshot
protocol, serverId, worldId, epoch, revision
serverNow: Unix milliseconds
effectStart: Unix milliseconds
worldHour: authoritative finite 0..24
role: owner | member
signs: [{id, config, powered}]
```

Runtime power is a separate field from authored `config.powered`. Renderer session overrides must use snapshot runtime power without editing the authored config. Animation phase uses `(estimatedServerNow-effectStart)/1000`. The global effectStart survives restart. Configuration and power edits share this baseline; they do not restart every effect independently. A restart creates a new epoch and sends a full snapshot, preserving revision, configuration, power and phase baseline.

Enrolled members may send `{type:"setPower",requestId,expectedRevision,signId,powered:boolean}`. Owners may additionally send `{type:"setConfig",requestId,expectedRevision,signId,config}`. The protocol has no toggle command. Every mutation compares the global revision. Unknown signs, unknown fields, malformed config, insufficient role and stale revision are rejected.

After durable persistence the server replies `{type:"ack",requestId,revision}` and broadcasts snapshots. Retrying exactly the same mutation with the same identity/requestId returns its original revision and `duplicate:true`; different content with that ID is rejected. The last 512 accepted requests are retained across restart. An evicted retry carrying an old revision is stale and cannot apply again.

Errors contain `type:"error"`, code, message, current revision and a requestId when valid. Codes include AUTH, SHAPE, FORBIDDEN, UNKNOWN_SIGN, STALE, REQUEST_REUSE, RATE and PERSIST. A stale write also receives a fresh snapshot. A failure before rename leaves the accepted state unchanged and returns PERSIST. A failure after rename has an indeterminate durable outcome: the authority fails stopped, closes all sessions and its listener, emits no success or false rejection, and prevents queued writes. Restart reads and validates the stored candidate; retries resolve through persisted request history.

## Persistence and bounds

Bootstrap state is durably persisted before the listener opens, so effectStart survives a restart before the first mutation. The authoritative worldHour is also persisted and recovered; local editor hour controls cannot change shared timed-sign behaviour. Writes are serialised across all sessions. A candidate is written to a new mode-0600 file, fsynced, atomically renamed, and its directory fsynced before acknowledgement/broadcast. Recovery validates the saved schema, world, signs, geometry budgets and bounded request history. Config and runtime power remain separate in the persisted sign record.

The server accepts at most 32 concurrent sockets, 64 KiB text messages, and 40 messages per socket in ten seconds. Binary/oversized messages are rejected. Unauthenticated sockets expire after thirty seconds. These are bounded experimental controls rather than a full Internet-facing denial-of-service defence.

## Source and checks

`scripts/lib/identity.mjs` is copied from ElseMesh `network/identity.mjs` at commit `95b49d0`; `scripts/lib/IDENTITY-LICENSE` retains the 2026 DRG Software Solutions LLC MIT notice. It supplies the exact game node ID/canonicalisation convention; no original game files were edited.

Run `npm run test:private-world`. Tests cover unknown identities, challenge replay, explicit roles, malformed and oversized messages, excessive geometry, unknown signs, revision conflict, idempotent retry, request-ID reuse, rate limits, late joining, persistence restart recovery, initial-clock persistence, authoritative world hour, and injected failures before and after atomic rename. The factory-only persistenceHook accepts trusted test functions; CLI JSON rejects that field and cannot supply executable hooks. Test identities exist only in temporary directories/memory and are never printed.

