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
