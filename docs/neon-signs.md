# Neon signs

Choose **Objects → Interactive Objects → Neon Sign** to create a pink **THE RED
LION** sign. The sign is an ordinary 3D object: move, rotate, scale, group,
duplicate, lock, hide, save and reopen it using the existing object controls.

The front face points along local **+Z**. Rotate the sign to face the viewing
position, or enable **Double sided**. Its mounting and backing are real geometry.
The designer shows unscaled bounds including the mounts; object scale changes
the final dimensions.

## Design the lettering

The designer provides twelve editable text presets: OPEN, CLOSED, WELCOME, BAR,
PUB, CAFE, HOTEL, RESTAURANT, SHOP, VACANCIES, EXIT and Custom Text. A preset is a
starting configuration: replace its text with your own words, using up to 80
codepoints and three lines.

Choose the bundled Helvetiker or Optimer font, alignment, letter size and spacing,
line height, extrusion depth and bevel/tube thickness. Seven named colour
presets—red, pink, blue, amber, green, purple and white—can be replaced with any
custom colour. Brightness and glow are independent.

Supported style combinations configure those actual fields: traditional,
retro-diner, vintage-pub, minimalist and multicolour. Lettering is generated as
extruded, bevelled typeface geometry. It remains editable text rather than an
HTML label or image decal. The styles do not introduce unimplemented script
fonts, curved baselines or hand-drawn tube paths.

Choose no backing or a coloured panel, an optional frame, wall/hanging/
freestanding mounts, single or double sided lettering, and low/medium/high
quality. Quality changes curve detail and bounds the glow shell layers.

## Effects and local interaction

| Effect | Controls that affect it |
| --- | --- |
| steady | authored power, brightness and colour |
| flicker | speed, intensity and deterministic seed |
| pulse | speed and intensity |
| flash | speed, intensity and duty cycle |
| sequence | speed; letters illuminate in order while unlit letters remain physical |
| colour-cycle | speed, tube colour and second colour |
| faulty | speed, intensity and deterministic seed |
| timed | start/end world hour, including schedules across midnight |

Timed mode uses the world's configured hour, defaulting to 14 when it is absent.
It does not read the computer's local clock. Effect time and seeds are supplied
to a shared, deterministic effect function used by the renderers.

In **Enter preview**, aim the centre of the view at a sign within **3 metres**.
The prompt **E · Turn off/on _name_** identifies the current target. Press **E**
to toggle it. The keypress performs a fresh mesh raycast: an intervening visible
wall or other object blocks interaction. Being nearby without aiming at a
physical sign surface is insufficient.

Preview power and effect-start time are transient runtime state. Saving while a
sign is toggled off still preserves its authored power setting. Exiting the local
preview or changing worlds clears local runtime overrides. Authoring locks protect
editing; they do not prevent this local preview interaction. This capability
does not enforce ownership or establish multiplayer authority.

## Reuse a sign

**Export neon preset** writes a validated `elsemesh.neon-prefab/1` JSON package.
**Import neon preset** replaces the selected sign's authored configuration after
validation; its object ID and transform remain intact. Imports are limited to
64 KiB and are cancelled if the project revision, world or selection changes
while the file is being read. Invalid input leaves the project intact.

The package is a reusable single-sign preset. It does not implement a general
prefab library, component program or behaviour graph. Ordinary project files
embed the sign's versioned configuration; no external model download is needed
to regenerate its bundled-font geometry.

## Optional private test world

The Objects panel also offers **Private neon test world**. Connecting authenticates
the browser's enrolled public identity to the configured private server; it does
not replace the current world. **Load private world demo** is the explicit action
that loads matching sign IDs and world identity, after a replacement confirmation.
The previous world is retained in Undo.

Matching requires the exact world ID and complete unique sign ID set. Adding or
deleting signs deactivates shared overrides and commands until the matching demo
is explicitly loaded. Private timed effects use the server's authoritative world
hour, also saved into the matching authoring document.

When the matching session is connected, aiming at a sign and pressing E sends a
server command. Accepted snapshots supply shared power, effect timing and
configuration. The enrolled owner can change configuration through the designer;
a member can toggle runtime power but has read-only configuration controls.
Configuration changes appear after acknowledgement and their accepted values are
merged into the saved project. Transient power/effect start remain outside the
authoring document. Offline bound signs cannot issue local changes pretending to
be shared commands.

Undo/Redo are disabled while a matching private session is connected: local
history cannot undo a server-authorised configuration. Disconnect before using
Undo to restore the previous world. The private session component remains mounted
when switching editor panels. Closing the local preview does not reset server
state.

This is a bounded private sign test session. Object transforms and other scene
changes remain local; it does not replicate the general object world or provide a
general multiplayer behaviour system.

## Rendering, budgets and current scope

WebGL uses an emissive physical letter core plus bounded additive glow shells.
Shells test scene depth, so opaque intervening surfaces occlude them. This is a
lower-cost glow approximation; it is not screen-space bloom and does not cast
coloured light onto nearby surfaces. Native preview uses the engine's existing
bloom and the shared generated geometry/effect samples. Neither renderer adds
dynamic light spill.

Non-sequence modes render merged lettering, while sequence uses individual
glyphs so their emission can change independently. Geometry is immutable and
shared between matching signs; colour, brightness, power and effect edits do not
rebuild letter geometry. Each instance owns its mutable materials and releases
them and its geometry lease when replaced or removed.

Validation limits a sign to 150,000 triangles, a world to 50 signs and 1,000,000
total neon triangles. Existing object and project byte budgets still apply.
Software-browser profiling is useful for comparing rendering cost; it does not
qualify physical GPU performance.

This slice supports authoring, rendering, local first-person power toggles,
reusable sign presets and the separately enrolled private sign test session.
General object replication and integration into the live game remain separate
work.
