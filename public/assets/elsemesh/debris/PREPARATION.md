# ElseMesh Worlds prepared debris derivatives

These four catalogue GLBs derive from the same Poly Haven CC0 1.0 source assets attributed in `CREDITS.md` and audited in `Burning-Horizons/public/models/debris/CREDITS.md`.

The preparation script in the reviewed donor working copy (`tools/prepare-elsemesh-assets.mjs`) extracted each source GLB's LOD0 geometry, kept its source origin and dimensions, and wrote these self-contained GLBs. The converter embeds the source albedo and normal JPEG maps. It does not embed the ARM map or preserve the source material factors; it assigns neutral PBR values (metallic 0, roughness 0.85). These prepared derivatives were copied into this standalone editor; the game files were not changed. This is suitable for editor preview and placement, not a pixel-identical reproduction of the game's runtime material.

The adjacent `.svg` files are schematic catalogue illustrations. They are not renders of the mesh files. The source GLB geometry and texture bytes remain licensed CC0 1.0. This checkout has no root license file, so no project-wide license is asserted for the converter or editor code here.
