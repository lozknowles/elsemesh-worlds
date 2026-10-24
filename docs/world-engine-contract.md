# Installed world software contract

Run `node scripts/build-world-engine-contract.mjs --target=<engine>/src/world-runtime/vendor` after committing editor source. The explicit `--allow-dirty` flag builds a prototype marked unsuitable for release. Provenance records exact editor commit, source input hashes, esbuild and Three versions, and output hash. Generated JavaScript is installed in the engine; no editor checkout is required at runtime.

## Boundaries

Source loading uses parseGitHubWorldLocation, resolveGitHubWorldSource and loadWorldSource. Public GitHub refs resolve once to a full commit; local and remote readers share bounded, digest-checked repository validation. Legacy v1/v2 reads do not rewrite input; explicit packing emits v2 for basic projects or v3 when [authored connections](portal-world-format.md) are present.

Conversion exports Three namespaces T and Three, shared geometry builders, hierarchy transforms, static GLB admission, material slots and assetPrimitiveGroups. Actual engine scene, GPU, textures and materials stay in the actual engine. No copied editor engine or preview code enters this bundle.

Admission uses describeRuntimeWorld for normalized data and admitFederatedRuntimeWorld with installed runtime signature and region verifiers. World data cannot grant authority. The host must visibly reject requirements it does not implement. Exported software functions alone do not establish host capabilities. The bundle exports validated portal declarations and shared portal transforms/sweep geometry; the host owns views, landing clearance, authorization and traversal. Water and retro terminal declarations likewise require the corresponding host implementation.

The browser private neon client is installed software. It creates nonextractable browser CryptoKeys locally; no keys or backend code are bundled. Runtime connection intent and exact world/sign binding remain host responsibilities.

## Conversion limits

Static admitted GLB meshes preserve source transforms and material slots. The existing native converter supports base colour textures and vertex colours; normal, ORM, occlusion and emissive texture maps are omitted. Shared authored-asset admission rejects skinning and morph targets. `BuiltinCharacterGLTFLoader` is a separate installed character loader export; it does not relax authored-asset admission. Geography metadata, imagery and weather must only be advertised when implemented in the actual host.

## Licensing

Three, esbuild and supplied font notices are copied beside the bundle. Editor authored software currently has no root LICENSE and is recorded as unspecified; no open source license is inferred.

## Compressed source responses

Source budgets count decoded content bytes. HTTP Content-Length is optional
encoded transfer metadata, so it is checked for numeric syntax only. A missing
Content-Encoding header does not establish identity encoding: CORS may hide it.
The reader bounds each decoded stream chunk before storing it, cancels overflow,
and retains request deadlines and repository expected-size/hash verification.
This allows a valid tiny component to load when compression adds wire overhead.

## Ambient wildlife and world weather

A non-colliding GLB object may declare `ambientBehaviour` with schema `elsemesh.ambient-behaviour/1`, one of `bird-flight`, `crab-walk` or `fish-swim`, and bounded `speed`, `radius` and `seed`. The authored transform is the home anchor; the installed engine evaluates a client-local visual route. This is not a world script, AI agent, shared multiplayer position or ownership grant. Unsupported descriptors fail repository validation. Fish movement needs a global water surface; unsuitable habitat leaves the model at its authored transform. The GLB's geometry remains static, so wings, legs and fins do not articulate.

Clouds, mist, rain, lightning, thunder and wind remain engine effects. Each repository's authored `environment` selects weather mode and values. `weather: 'clear'`, `cloudCoverage: 0`, `mistDensity: 0` and `windSpeed: 0` are explicit world choices. Weather data never includes executable effect code or engine credentials. The editor's ElseMesh graphics view uses the same authored settings; the standalone player reads them on world activation.
## Private splat scene resource contract

An optional `project.splatScene` uses `elsemesh.splat-scene/1` and requires the
`splat-scene/1` capability. It is stored in the digest-bound `connections`
component. The descriptor and its provenance hashes therefore participate in the
world content digest; resource bytes are independently checked against their
exact declared hash and length on every read.

The descriptor has exactly `schema`, `asset`, `physics`, `transform`,
`scaleStatus`, and `provenance`. `asset` has `path`, `sha256`, `bytes`, `count`;
`physics` has `path`, `sha256`, `bytes`. The only resource paths are
`splat-scenes/<64 lowercase hexadecimal SHA-256>.sog` (at most 16 MiB) and
`splat-scenes/<hash>.json` (at most 8 MiB). Declared count is an integer from 1 to
1,000,000. The installed SOG decoder must also check the actual decoded count
against that declaration and cap before renderer admission.

`transform` contains three-element finite `position` (components within +/-2000),
three-element `rotation` (radians within +/-2 pi), and uniform `scale` from
0.000001 to 1000. `scaleStatus` is exactly `assumed-gameplay`; these values do not
claim measured physical scale. `provenance` contains exactly `videoSha256`,
`plySha256`, `reviewSha256`, and `qualificationSha256`, each a lowercase SHA-256.
Unknown nested fields, traversal, URLs, unsupported versions, and invalid bounds
are rejected.

`createSplatSceneResourceReader(project, read)` returns `read(path, maxBytes)`,
`readSog()`, and `readPhysicsBytes()`. Its capability is limited to the two
admitted paths, snapshots the validated descriptor, checks exact bytes, and
returns owned byte copies. It never creates a URL, changes authorization, or
falls back to a public fetch. `loadWorldSource` returns this dedicated
`splatSceneRead` capability without eagerly reading either resource. The host
must supply its existing VIEW-authorized repository reader. Physics bytes are
opaque here; a separate physics compiler/admission stage owns their JSON schema.

`packWorldRepository(project, { splatSceneRead })` copies both verified resources
at their exact hash paths. Forked sources retain their supplied reader in pack
options. Standalone packages cannot preserve the resource closure and fail
closed; save a repository snapshot/copy instead. The dedicated 16+8 MiB resource
budget does not increase generic 25 MiB project/GLB budgets or change native
island limits. Installed exports alone do not activate rendering, physics,
controller logic, or host capability advertisement.
