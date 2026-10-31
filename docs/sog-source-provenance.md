# Published SOG source provenance

Splat scene provenance accepts either the existing exact video/PLY hash tuple or
`{sourceFormat:'sog', sourceManifestSha256, reviewSha256, qualificationSha256}`.
Fields cannot be mixed. All digests are lowercase SHA-256. This variant requires
a contract bundle generated from this change or later; older bundles reject it.

The source manifest digest identifies the exact retained inventory JSON bytes.
The inventory should record original source URLs, file paths, hashes and byte
sizes, author/licence, and conversion tool/version/recipe. The scene asset digest
continues to identify the actual runtime SOG. A decoded intermediate PLY must not
be described as the uploader's original capture.

The runtime resource capability remains limited to the scene's SOG and physics
bytes. The publisher must separately verify and retain the inventory and its
listed original files; descriptor validation alone does not verify that evidence.
