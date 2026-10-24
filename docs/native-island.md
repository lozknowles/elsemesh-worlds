# Portable original native island contract

The installed native-island/1 capability admits project.nativeIsland with schema elsemesh.native-island/1. Metadata is authored JSON. It contains no script, URL, local absolute path, provider credential, or private runtime state. Unsupported fields, recipes, formats and capabilities fail closed.

## Spatial and binary conventions

The original domain is 2048 by 2048 metres with 2048 cell-centred samples. Origin is [-1024,-1024]; sample (i,j) at pyramid level L is origin + [(i+0.5)*2**L,(j+0.5)*2**L]. Tile x/z are sample indices at that level, with row-major z then x ordering. Tiles have no halo; adjacent cell centres remain one spacing apart. Fine source fields never imply that distant physics or rendering data is resident.

Complete original level 0 height, baked normal RGBA8, baked splat RGBA8, and rock/sand/path/gully/seagrass/rubble/scarp scalar masks are required. Original grass is level 1 RGBA8 (1024 squared), and shore is level 2 Float32 RGBA (512 squared). Level 4 height/normal/splat coarse coverage is required; extra pyramid levels can be included. All scalar Float32 resources are explicitly little endian. The original mask resources remain separate from baked normal/splat interpretation. Min/max values cover every scalar component in a resource and are checked against decoded bytes when requested.

Resource IDs and cells are unique. Every reference uses native-island/<sha256>.bin, exact byte size and SHA-256. Tiles are at most 128 squared with one or four channels. At most 8192 resources, 16 assets, 16 MiB per field resource, 8 MiB per JPEG and 256 MiB aggregate descriptor closure are admitted. JPEG assets declare bounded dimensions (at most 2048 squared); their actual SOF header dimensions are checked before bytes reach the renderer. Credits are bounded UTF-8 text.

## Original vegetation and ocean

Vegetation JSON preserves the named original arrays (palms, trees, bananas, shrubs, youngPalms, ferns, monsteras, elephantEars, heliconias, strelitzias) and original numeric x/y/z/s/sy/yaw/la/l/H/seed fields. JSON numbers retain original fractional seeds without Float32 or uint32 conversion. Original LOD constants, generation seeds and village palm count are included. vegetationRecipe identifies the installed original generator version; no world code executes.

vegetationTextures binds the six original bark JPEG assets explicitly to palm/tree albedo, normal and ORM slots. Credits and licence metadata travel with those files. The ordinary engine remains responsible for its installed procedural leaf and impostor generators.

Sea metadata preserves typed original FFT cascade sizes, complete local and swell spectra, choppiness/foam/time parameters, original shore simulation parameters, simulation domain, surface foam settings, swell direction and reef location/radius. It does not substitute a sine-wave approximation.

## Lazy loading and preservation

unpackWorldRepository/loadWorldSource validate metadata and register the source reader without reading any native binary. createNativeIslandResourceReader(project, read?) returns an ID-based asynchronous consumer; only a requested reference is read, hash checked, decoded and checked against dimensions/extrema. The renderer owns bounded visible-tile caching and eviction.

packWorldRepository(project,{nativeIslandRead}) explicitly reads and validates the complete closure, copying every referenced byte unchanged. An in-memory source registry also preserves reader access across immutable editor copies and forks, without serializing functions or source credentials into authored content. Local workspaces retain metadata; after a browser restart the source repository must be reopened before native resources can be read or saved. Missing resources cause a clear failure.

The ordinary editor terrain is a coarse editable proxy. Editing it does not modify the original native field resources. Native graphics use the separate native adapter. Standalone project/player JSON exports fail with an explicit instruction to Save repository snapshot or Save repository copy; they never silently produce unresolved native references.

NativePreview uses a same-origin, exact-iframe request/response bridge. The parent hashes and decodes only requested resources and sends no source paths outside the bounded reference contract. Runtime rendering, original visual fidelity, streaming budgets, texture disposal and browser acceptance require separate integration evidence.
