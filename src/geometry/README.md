# Shared part construction

Part builders define their path, elevation, dimensions, and intentional changes
of section. Reuse the construction below rather than copying it into each part.

- Use `sweepSection` for both the outside mold and the channel core. Their path
  and elevation mapping must agree. A join starts with the same cross-section
  and tangent on both sides; changing section farther downstream needs a smooth
  transition. Check the actual offset surfaces, not just the centerline.
- Use `troughProfiles` and the connector dimensions in `marbleworks-spec`.
  Rail height includes the rolled lip radius. Don't hard-code a bowl rim height
  independently of its incoming rail.
- Use `buildCSpigot` for rounded C connectors. Validate the assembled shoulder
  beneath the end caps with `auditCConnectors`; checking the isolated spigot
  cannot detect missing support in a part.
- Use `angleWeightedNormals` with `cylinderNormals` for cylindrical faces at
  trims. Shading checks do not replace checks for missing material or steps.
- Use the common mesh regularization and topology-safe edge collapse utilities.
  Preserve small-radius rails when choosing a simplification tolerance.

For each join, sample the final solid and rendered mesh across its bed,
sidewalls, and exposed rolled edges. Test both sides of the join for missing or
extra surfaces, position error, and normal discontinuities. Exclude a surface
only where the construction explicitly buries it inside another part of the
same solid. `tests/standard-entry.ts` exercises this full-section approach.

When extracting shared construction from an accepted part, compare canonical
triangle coordinates before and after, as well as its rendered normals. Keep
that refactor separate from intentional shape changes.


### Vertical track receivers

`pieces/track-connector.ts` owns the receiver cup, radial channel/cup core,
rounded collar cutout, lower socket and C spigot. A straight-track part calls
`buildTrackConnector` with position, approach direction, inlet/drop mode and
its floor function. Curved tracks can supply their channel boundary and mouth
angles. Union the returned bodies with the track mold, subtract all returned
cores, trim at the shared seating height, then install the returned spigots.
Call `dispose()` after those booleans consume the assembly.

`connectorLandingFloor` reserves the receiver's entire upper runout and the
uphill rim, rather than placing the unrounded channel wall at the seating plane.
The S ramp and intersection share `receivingCupProfile` and `buildReceivingCore`.
Their extraction preserved both S receiver meshes exactly (positions and triangle
indices), and preserved its cup profile exactly.

`tests/track-receivers.ts` probes both channel walls at multiple distances and
heights to reject inlet pinching. Pair it with `auditCConnectors`, actual bed and
through-hole probes, and `auditRenderMesh`; manifold status alone is insufficient.

`pieces/receiving-floor.ts` adds a shared smooth downhill turn inside receiving
bores. `deformVertical` refines the existing shell, moves its vertices through a
C2 height deformation, and transports authored normals with the inverse-transpose
Jacobian. This is one continuous solid, with no overlaid floor cap or Boolean
blend. The map is monotone in height (minimum vertical derivative 0.53125), so it
cannot fold the shell. Its support ends at the outer post, upper bore and runout;
`receivingFloorSurface` describes the resulting running floor for shading.

For sockets below sloping floors, use `followSocketFloor` with a core whose roof
starts one wall thickness below the floor. It follows the grade above the fixed
insertion band. A flat roof can cut completely through a descending floor while
still producing a valid manifold. The funnel exposed this failure; its inlet
grade now also starts smoothly instead of changing slope at a clamp. Its section
geometry and analytic normals use the same circular lower fillet.

`bun scripts/build-receivers.ts --out <folder>` builds render and collision assets
from the same solid for all thirteen receiver families; optional part names limit
the build. Use `--assets <folder>` with the receiver floor, clearance, stacked
entrance, alignment, load and normal scripts to check staged assets before
publishing them. After publishing, rebuild the jump assembly and loose-body hulls
with `bun scripts/build-jump-assembly.ts` and
`bun scripts/build-assembly-assets.ts --hulls`.

`test:receiver-floors` casts through the actual rendered and collision meshes
across each inlet mouth and requires both floor coverage and material thickness.
It rejects the original funnel's unwanted opening, which topology and clearance
checks missed. It is a sampled geometric contract, not a substitute for examining
the floor, sides and underside in the browser. Load tests separately check
marble flow and can fail even with complete, smooth geometry.

Build the intersection preview with `bun run geometry:intersection`. It validates
before writing the preview mesh. The browser loads the saved mesh rather than
running the solid kernel on refresh.


Exit bores use the shared 21 mm diameter through the lower collar and the upper
C shell. The wider insertion socket stops at `PART_UNITS.insertionDepth` on the
underside. `auditExitBore` checks both sides of the seating height as well as the
rest of the vertical passage. An undrafted C shell preserves this bore diameter.

When a track core already includes its receiving cup, set `integratedReceiver`;
do not add a second radial cup/track blend over that same surface. Preserve the
analytic spigot and shared seating footprint after lower-body simplification.
The collar cutter must keep corresponding lid/bottom azimuths: mismatching them
twists its radial side faces into the bore.


### Paddle-wheel ramp

No.147 reuses `buildRampSolid` with an elevation function; the standard version
passes none and follows the unchanged code path. The inlet is lifted one stack
unit. The elevation remains constant across both connectors and is zero through
the complete coiled outlet. Refinement before the elevation warp keeps long
straight triangles from turning the chute into a polygonal approximation.

The independent rotor has twelve scalloped pockets and six spokes. Its axle is
placed from the wheel's full clearance envelope, including the channel height
at the edges of the wheel. `bun run geometry:paddle` checks the chute, exit bore,
mesh quality and rotor clearance at several angles before saving the preview.
The wheel preview has its pivot at the axle and remains static for shape review.

Photo references: https://www.ebay.com/itm/117301918807 (top and underside),
https://www.ebay.com/itm/376737690109 (side). Wheel and support dimensions are
photo-fitted against the shared connector dimensions, not factory measurements.

### Authored surface shading in component previews

Use `heightSurfaceNormals` for both sides of a known floor and
`connectorNormals` for the standard cylindrical bands. Finite, unit-length
normals alone do not establish correct shading: Boolean trim triangles can
produce perfectly unit-length normals tens of degrees from the parent tangent.
`test:component-normals` probes the cached mesh against those parent surfaces,
including barycentric interpolation. Vertex error must stay below 0.01 degrees;
curved-surface interpolation has a separate 5-degree tessellation budget. This
check does not cover arbitrary fillets or establish reference accuracy.

The finish deck uses that same parent-surface normal system, including its smooth
change of grade across the connector footprint. Refine extruded caps before an
elevation warp; triangulating a large cap and then moving only its corners can
create unintended planes across the surface. `test:finish-surface` raycasts 150
deck locations and checks both height and interpolated normals without relying
on face classification. It catches malformed faces that a surface matcher could
otherwise skip. Its height and angular limits are 0.025 mm and 1 degree.

`geometry:normals` refreshes shading without rebuilding solids. It rejects any
change to the geometric triangle soup. After changing jump or landing normals,
run `bun scripts/build-jump-assembly.ts` to refresh the assembled preview too.
Catalog previews cast ground shadows but do not receive self-shadows, keeping
hard shadow boundaries separate from the surface shading under inspection.
