# Neon sign architecture

An editor object of kind `neon-sign` carries an authored `neon` configuration using `elsemesh.neon-sign/1`. Project schema 2 persists that configuration. Runtime power overrides and elapsed animation time belong to renderer or visitor state and never change the authored configuration. This supplies a reusable local data format; original game runtime admission and federation integration remain unverified.

## Shared generation

`neon-sign.ts` exports defaults, twelve text presets, bounded validation, pure deterministic effect sampling and `elsemesh.neon-prefab/1` import/export helpers. Text is limited to 80 Unicode codepoints and three lines. Font identifiers are a fixed allowlist. Unsupported characters become visible question marks. Text and configuration are data; no remote fonts, scripts, evaluation or resource URLs are accepted.

`neon-geometry.ts` builds real Three TextGeometry from bundled fonts. Text lies in XY, is centred around its geometric centre, and faces +Z. Extrusion depth extends along +Z, with the configured tubeThickness controlling the bevel. This is extruded lettering with bevels, rather than a physical model of bent glass tubing. Alignment positions multiple lines before centring the complete layout. Double sided signs include readable rear glyph copies. Backing, frame and mounting support geometry are shared between adapters. Hanging wires, freestanding feet/posts and wall standoffs contribute to generated bounds.

The return value contains aggregate `geometry`, per-character `glyphs` with `geometry/index/character`, plain `bounds.min/max` tuples, `triangles`, and optional `backingGeometry/frameGeometry/mountingGeometry`. Character indices include spaces and exclude newlines. Sequence effects return a numeric `litGlyphs` count; indices below that count are lit.

`neonGeometryKey(config)` includes geometry fields only. Colours, brightness, power and animation fields do not rebuild geometry. Renderer adapters borrow immutable buffers with `acquireNeonGeometry(config)` and must call its idempotent `release()` on replacement or disposal. References share one value per key; final release disposes every owned buffer and removes that entry. At most 100 distinct geometry entries may be borrowed simultaneously, allowing bounded overlap while a 50-sign scene replaces or previews geometry. `buildNeonGeometry` returns an independently owned value; callers must use `disposeNeonGeometry`. Bounds/triangle metadata use a separate bounded 64-entry cache without retaining buffers.

## Effects and limits

Steady, seeded flicker, pulse, flash, sequence, colour cycle, seeded faulty and timed modes share `sampleNeonEffect(config,timeSeconds,worldHour)`. It returns brightness, colour and optional leading glyph count. Effect intensity blends modulation against steady output. Time of day is supplied explicitly, including overnight timed intervals. Simulation is deterministic and mutates no configuration. Glow remains an adapter presentation feature and is not a baked lighting or global illumination system.

Validation permits at most 50 signs and 150,000 triangles per sign, with a combined world neon budget of 1,000,000 triangles. These are upper resource limits, not performance guarantees. Quality controls curve tessellation. Generated mounting and backing also count toward complexity. Hierarchy matrices, generated world bounds and all configuration numbers pass existing finite safety bounds before rendering. No local runtime E interaction establishes a federation permission or ownership check.

## Font provenance

The unchanged `fonts/helvetiker_regular.typeface.json` and `fonts/optimer_regular.typeface.json` were copied from installed Three 0.180.0 examples/fonts. Their embedded `original_font_information` names Helvetiker-Regular and Optimer-Regular, version 1.00 initial release (2004), copyright Magenta Ltd. Both retain their complete original metadata, including licence descriptions and historic licence URLs.

The complete accompanying MAGENTA font licence is preserved in `fonts/LICENSE`. It permits use, copying, merging, publishing and distribution with its copyright/permission notice retained, prohibits selling font copies alone, and specifies naming conditions for modified fonts. The JSON fonts are distributed unchanged. Three's examples/fonts README identifies the collection as MgOpen typefaces and links the historic source at https://web.archive.org/web/20050528114140/https://ellak.gr/fonts/mgopen/index.en . No font files are fetched at runtime.

