# World computers and walking between floors

Choose **Objects → Interactive Objects → World Computer** to add a desktop world
terminal. Its monitor, screen, stand and keyboard are procedural 3D geometry.
The front faces local **+Z** and its base is local Y=0. Place it on a desk using
the ordinary object transforms.

Select the computer in the inspector to choose its **Linked neon sign** and
screen colour. The link is an authored object ID. Duplicating a subtree containing
both the computer and its target remaps the link to the copied sign. A missing
target is reported by the terminal rather than replaced with an unrelated sign.
Computer configuration is versioned as `elsemesh.computer/1`; worlds retain the
existing project format and allow up to 32 computers.

## Use the terminal

Enter the editor's first-person preview. Aim at the physical computer within
three metres and press **E** when the prompt says **Open _computer name_**.
The same selector handles neon signs and computers, so one E press activates only
the nearest aimed interactive object. An intervening wall blocks interaction.

Opening releases mouse pointer lock and pauses movement at the current position.
The terminal provides working **Home**, **World Info** and **Lighting Controls**
pages. World Info reads the current world name, object/sign counts and terrain
size. Lighting Controls changes the linked neon sign's runtime power using the
same route as its direct E interaction. In a matching private session this sends
an authenticated server command; in an ordinary local world it changes transient
local preview state.

**Close computer** or Escape closes the panel, clears the interaction state and
focuses the viewport. Movement resumes at the same location; click the viewport
when mouse-look capture is needed. Deleting the open computer or loading another
world also clears the panel. The terminal is a world-control interface; it does
not run a desktop operating system or an in-world web browser.

The native graphics preview renders the same computer geometry and screen
emission. Terminal interaction is qualified in the editor's first-person preview;
the existing native fly control's E movement is retained.

## Floors and stairs

The first-person walker uses composed world bounding boxes for solid and walkable
objects. It lands on a floor while descending across its top from above, steps up
new lateral contacts within 0.45 m when there is head clearance, and clips upward
jumps against a ceiling's underside. Standing below an upper floor no longer
snaps the player onto it. A blocked sideways move samples terrain at the returned
position.

Build continuous stair/landing contacts and leave a real stairwell opening in
upper floors. This remains a conservative bounding-box navigation approximation,
rather than a full mesh or rigid-body physics solver.
