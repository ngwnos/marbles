# Assembly builder

Open `/`; `/build.html` remains an alias, and `/components.html` contains the
component gallery. All 20 reviewed part types
share their cached meshes through one `InstancedMesh` per type (256 copies/type).
The tray thumbnails render those same meshes. No geometry generation runs in the
browser.

Connectors come from the verified component-alignment report. Mating positions
are seating planes, not spigot tips, and include polarity and insertion axis.
The extension and double-ended connector have explicit reversed top/bottom ports.
The snap solver derives yaw from pairs of ports, prefers more connected ends,
respects occupancy, and never stretches a part. Its 0.075 mm per-end fit budget
is below the nominal 0.1 mm socket clearance. Base placement magnetizes to the
shared track span to make two-tower layouts practical. Snaps below the floor are
rejected.

Click selects a piece without picking it up. Select a column by clicking its tube,
gold marker, or the Column buttons; drag the green Y ring for continuous rotation.
The angle slider and Q/E also rotate about that column. The pivot stays stationary,
its connection remains attached, and connections at moved ends detach. Exact
aligned ends reconnect on release without shifting the pivot. Escape cancels an
active ring drag. Dragging a piece more than five pixels picks it up.

Held parts are upright and rotate about Y. Picking uses instance IDs and retains
the local point grabbed; raycast bounds are invalidated when instances move.
Connected components are locked construction placements. Once a part has no
connections, Box3D simulates its fall and rotation. These loose-body colliders
are approximate convex patches in 14 mm spatial cells, preserving large holes
and channels; they are not the exact static triangle colliders used by the
existing marble drop previews. The paddle wheel uses a separate blue instanced
mesh and convex rotor on a Box3D revolute joint, attached to its yellow chute.
The hinge also follows loose-part motion and has the preview's axle friction.
The starting gate has its own hinged six-lane deck. Select it to use Fill all
slots, Release, and Close gate. Fill closes the gate and adds one randomly colored
marble to each empty lane; occupied lanes are detected in the deck's local frame.
The component preview has the same Fill all slots behavior.
Run `bun run test:gate-fill` for occupancy, colors, release, and refill checks.
Selected pieces show a Drop marble button above each unoccupied input column.
The inlet definitions are shared with component previews. Connected upper sockets
hide their buttons; a marble occupying the entry temporarily disables another drop.
Marbles use Box3D spheres. Connected tracks use the previews' continuous triangle
collision surfaces, while loose parts retain their dynamic convex patches.
Test marbles expire after 60 seconds and are not saved with the layout.

Layouts save automatically to localStorage as `marbleworks-assembly-v1`.
Persistence starts only after restoration completes, so loading assets cannot
overwrite a saved layout with an empty scene.

- `bun run geometry:assembly`: refresh missing assembly meshes and loose colliders.
- `bun run test:assembly`: port fitting, occupancy, settlement tolerance, and all
  20 Box3D loose colliders falling onto the floor.
- `/build.html?verify` in development: real React tray events, free fall, joining,
  cancellation, instanced picking, rotation, disconnecting, support spacing and
  two-ended placement, click selection, and arbitrary-angle column pivots, and inlet marble dropping. This mode does not read or write saved layouts.

The shared running channel is 17 mm deep. Connector seating remains at the
47 mm grid datum; the standard entrance now has about 18.1 mm beneath an upper
socket for a 15.9 mm marble. Shell undersides and connector blends follow that
depth. The jump retains its calibrated launch elevation.

`bun run test:stacked-entrances` tests 65 centered/offset drops across 12 track
types, with upper and lower spacers installed. It is included in component checks.
The standalone snake collar-runout audit still reports a missing sampled surface
at inlet/side -1/radius 10.53/t=0.2; the same probe fails on the pre-change cached
mesh. The snake was regenerated with the existing draft-build option; its
topology, C-connector, and cylinder-normal checks passed, as did the full drop
and alignment suites. This pre-existing audit failure remains unresolved.

The support base has a continuous graded floor leading out of its rear-facing
post opening and around into the front tray. Its rounded C ends allow 17 mm
clearance. Base drop tests require the marble to reach the front and settle,
not merely remain trapped somewhere inside the base.

## Loadable presets

The builder header loads presets from `presets.ts`. Loading replaces the layout,
clears marbles, fits the camera, and selects the starting gate. Restore previous
layout keeps one pre-load snapshot, including across refreshes.

**Split & Rejoin** uses ten pieces: starting gate → split → intersection →
standard ramp → finish lane. Three support bases and two spacers support the
three aligned branch columns; the finish supports the ramp's far end.
All elevated female sockets are occupied, and all ordinary drop inputs are
covered, leaving the gate as the sole source. The bases are structural only.

`bun run test:presets` checks socket occupancy, a conservative support polygon
against uniform-plastic volume centroid (65.9 mm margin), and a fresh six-marble
release through both branches to the finish. This is a static balance check,
not a simulation of the assembled joints flexing or tipping.
The browser verification also exercises loading, clearing marbles, gate selection
and restoring the previous layout.

**Known physics limitation:** a successful fresh release does not establish
repeat reliability. Earlier repeated fills piled up at the split entrance.
Gate orientations, an extra spacer, disabled sleeping and reduced marble friction
did not consistently resolve it; those physics experiments were discarded.
The shared receiving-floor change and current load-test results are described
below. The existing preset stress assertions remain intact.

### Grand Tour

The default preset choice is now **Grand Tour — twin tower maze**: 165 pieces,
including 21 functional pieces, 127 spacers, and 17 supporting feet. Its two
eight-piece branches each contain snake, maze, zigzag, paddle, U-turn, passing,
funnel, and snake sections. Both loops descend into the intersection, followed
by the standard ramp and the sole finish lane.

Track poses come from their actual inlet/outlet connector coordinates, so
two-level pieces keep their real rise. The support generator fills exposed
underside sockets down to the next existing connector or a foot on the floor.
The volume-centroid support margin is 223.6 mm. The full six-marble test checks
both branches and requires each marble to visit all eight sections of its
branch before reaching the finish; it simulates 55 seconds. As with the compact
preset, one passing batch is not a claim that every repeated fill is jam-free.

### Shared contact calibration and remaining bridging

The part-specific bowl friction override has been removed. Every track and
marble again uses its original contact material. Shared settings in
`physics-settings.ts` use 240 Hz contact stiffness with eight substeps per
1/240-second step. Box3D clamps stiffness according to substep duration, so
changing Hertz without enough substeps does not achieve that stiffness.

`test:contact-model` measures a six-marble stack on a flat floor and inside
straight spacers. Old defaults allow 2.7511 mm of pair overlap; the shared
configuration holds that below 0.05 mm (measured 0.0431 mm). A separate plain
cone control demonstrates that one marble drains but two can form a stable
frictional bridge, without connectors or joins.

`test:receiver-clearance` checks the collision meshes of 14 inlet columns
across 13 piece types, with an upper spacer seated on each. It searches from
the resting landing position along a non-ascending path and certifies sphere
sweeps using distance bounds. All tested entrances have a path for a 15.9 mm
marble. This establishes space for a marble, not the presence of a solid floor:
the old funnel had a socket opening through its floor despite passing clearance.

This corrects excessive compression, not every physical jam. Marble states
include stable IDs so tests cannot confuse marbles after earlier ones expire.

### Receiving floors and load regression

Thirteen track families now share a smooth turn from the vertical bore into the
channel, formed by deforming the existing solid. The floor rises toward the back
of the receiver by at most a quarter of channel depth (4.25 mm); the outer post,
upper bore and downstream runout are unchanged. Render and fixed collision
assets come from that same solid. No material coefficients, forces or hidden
collider shapes were changed. The support base retains its separate graded tray.

The funnel had a pre-existing opening where a flat underside socket roof
intersected its descending floor. The socket roof now follows the track grade,
retaining the insertion band. `test:receiver-floors` checks floor coverage and
positive material thickness on both render and collision meshes, across the
mouth of all 14 track inputs (8,036 probes). It rejects the old funnel at the
reported defect. These sampled checks supplement visual inspection; manifold
status by itself cannot distinguish an intended hole from an unwanted one.

`test:downspout-load` retains the actual 165-piece Grand Tour physics world
between 12 six-marble gate releases. All 72 marbles left the original receiving
column with the current geometry. The stricter downstream-height test still
fails on release 10: one marble stops near the split's central divider, about
85 mm from the receiving column. The command exits nonzero for this failure.

Its isolated 2/3/6-marble column fixtures pass 131 of 135 cases. Three passing
lane cases queue against the first divider, and one six-marble base case jams.
The fixture removes a marble only after its entire sphere clears the column;
the full-preset test retains all marbles. These remaining failures are recorded
and asserted, not excluded or treated as proof of jam-free routes.

The unchanged 65 single-marble stacked entrance cases, 14 swept-sphere clearance
checks, 32 connector fits, floor probes, authored-normal checks, material-response
tests and assembly tests pass with the updated assets. Normal checks cover known
parent surfaces, not every fillet or cosmetic detail of every part.

### Material response and motion

`contact-materials.ts` now supplies the same plastic response to fixed and
loose parts and the component previews. Glass/glass contacts transfer energy
with restitution 0.85; glass/plastic retains friction 0.22 and restitution 0.18.
Two mutually exclusive sphere collision filters implement pair materials in
the WASM API, which lacks material callbacks. Only one sphere has density,
so mass and rotational inertia are not doubled. Carpet and wood have their own
contact rolling resistance and rebound, with no air damping or part overrides.

`test:physics-feel` checks actual builder free fall against Earth gravity,
interpolation, mass preservation, momentum and energy in head-on impacts,
surface-specific stopping distances, and bounce heights. At 400 mm/s a rolling
marble stops on carpet after approximately 0.40 m, instead of coasting indefinitely.
These are explicit tuning targets, not measured coefficients from the toy.
The 15.9 mm marble and millimeter geometry are unchanged. The builder renders
interpolated marble positions and rotations between its 120 Hz snapshots.

The browser `?verify` interaction sequence currently fails its two-support
bridge step: loose support settling can change the guided span by about 0.24 mm,
outside the 0.15 mm total fit tolerance. This remains unresolved; the tolerance
has not been relaxed to hide the misalignment. The headless assembly checks,
six paddle orientations, and the material-response checks pass. A manual
compact-preset batch in Brave reached the finish with one marble escaping onto
the carpet; this does not certify every fill or solve the known funnel bridges.

### Storage tub

The playground includes a fixed, open blue-grey Roughneck-style 18-gallon tub
beside the building area. Loose pieces use conservative Box3D convex envelopes
against convex wall sectors; the detailed collision mesh preserves the cavity and
external grips. Dragging over the opening raises a held piece above the rim,
and picking a stored piece lifts it clear before moving sideways. Opaque tub
walls occlude picking. The tub is environment geometry, outside saved layouts.

References: [open blue-grey tote and lid](https://media.suthlbr.com/products/images/18525/2163707_ep_1629398530_2.jpg),
[open top with interior dimensions](https://media.sandhredbrick.com/assets/images/products/EJD/display/5038462_V3.jpg),
[open grey tote and lid from the other end](https://mobileimages.lowes.com/productimages/dc66ea60-41b2-477a-8396-397025f56e84/04362305.jpg),
[closed lid covering the grips](https://i.ebayimg.com/images/g/j6QAAeSwNWRomh9N/s-l1600.webp),
and [manufacturer dimensions](https://www.unitedsolutions.net/products/storage-organization/).
The published outside envelope includes a lid; this model is the open body,
606 × 397 × 418.75 mm. Interior floor dimensions use the published
17.5 × 10.75 inches. Draft, wall thickness, collar, rim, grooves and external
U-shaped grips are fitted to photographs, not measured factory CAD. The wall
behind each grip is continuous: there are no hand holes into the cavity.

`geometry:storage-tub` bakes the smooth shell and rounded grips into one connected
render mesh and a collider simplified to 0.15 mm. Geometry generation stays out
of the browser. `test:storage-tub` probes both exported assets for floor coverage,
wall continuity, external finger space and grip height below the rim; it checks
render normals against winding and uses the actual builder physics to drop a
marble and retain 24 mixed loose parts. This is a storage/containment check, not
a simulation of the real flexible tote's deformation or load limit.

The tub starts with a freshly seeded assortment, settled in a Web Worker before
being inserted into the live scene. `Refill tub` generates another assortment
and replaces only loose contents of the tub. Maze presets preserve those
contents. Saved layouts retain the seed, sleeping state and relative wheel/gate
rotations, so refreshing does not regenerate stock or replay the settling.
Taking pieces out does not automatically replenish them.

`geometry:piece-envelopes` clips every rendered triangle into up to five 60 mm
slabs and builds circumscribed 26-direction convex hulls. This encloses the
entire source surface, unlike sampling a few extreme source vertices. Hulls
have a 1.5 mm contact skin to absorb solver compression; separately generated
unpadded envelopes are used for validation. These coarse shapes contact other
plastic pieces and the environment. Marbles use the existing detailed track
surfaces through separate collision filters, so channels and sockets remain
open to marbles. Only the coarse hulls contribute mass, normalized to the
actual mesh volume. Friction, restitution and gravity remain shared settings.
Run this asset builder after changing component geometry; `geometry:assembly`
also runs it automatically.

`geometry:tub-envelopes` clips the tub shell into 24 angular sectors and four
height bands, plus its floor (97 convex shapes). This keeps the cavity open
while avoiding detailed triangle contacts for the plastic pile. The original
concave tub mesh still handles marbles and containment audits. Both the pieces
and tub use enclosures derived from their actual meshes; no visible geometry
is altered. Piece contacts disable Box3D's approximate contact recycling to
prevent slow rolling parts from keeping an entire pile awake. Increment
`TUB_PACK_VERSION` when changing packing collider geometry/settings so old
stock is regenerated without replacing the maze.

The worker simulates randomly chosen pieces and orientations, waits for every
body and rotor to sleep, then checks two more seconds of translational and
rotational stability. Complete convex SAT checks unpadded envelopes against
each other; radial probes check their vertices against the actual tub collider.
Rejected piles are regenerated using deterministic seeds (up to four attempts),
and are never shown. There are no premade pose templates. Removing a part
explicitly wakes nearby loose bodies because a loaded sleeping pile does not
yet have Box3D's original contact graph.

`test:tub-packing` tests analytic SAT cases, mixed random fills, containment,
saved-pose replay, activation of detailed marble colliders without changing
mass, and removal of a bottom support followed by another overlap/sleep check.
Pass seed numbers to exercise more packs. Typical tested fills contain 35–72
pieces and settle in a few seconds; rejected attempts take longer. The
envelopes intentionally prevent pieces from nesting through narrow slots and
holes, so this is a stable loose-parts approximation, not exact mesh contact.
