# Piece 02 — original No.141 funnel ramp

Geometry approved in review. Review this piece at `/funnel.html`.
The standard ramp remains at `/ramp.html`; neither review adds game physics.

## Original specimen

The isolated red specimen is stamped DISCOVERYTOYS, NO 141, PAT PEND.
Listing: https://www.ebay.com/itm/198495370103

- Top: https://i.ebayimg.com/images/g/g6UAAeSwY89qVRJ9/s-l1600.webp
- Oblique top: https://i.ebayimg.com/images/g/nt0AAeSwYlpqVRJ9/s-l1600.webp
- Underside: https://i.ebayimg.com/images/g/VTYAAeSwuzZqVRJ9/s-l1600.webp
- Stamp and underside junction: https://i.ebayimg.com/images/g/QGEAAeSwhINqVRJ9/s-l1600.webp

These establish the tangential straight inlet, circular bowl, rounded upper rim,
central drain, hollow outlet sleeve and open-bottom inlet column. The inlet's
outer rail continues into the bowl perimeter; it does not terminate as a fin.
No scale or caliper measurements are present in the photographs.

## Primary drawings and actual published dimensions

- Design patent USD290143S, June 2, 1987, seven views:
  https://patents.google.com/patent/USD290143S/en
  Local copy: `USD290143.pdf`.
- Utility patent US4713038A, FIG.2A–C and accompanying description:
  https://patents.google.com/patent/US4713038A/en
  Local copy: `US4713038.pdf`.

The utility patent explicitly specifies a 9.5 mm throat radius, a nominal
24.4 mm vortex/cone transition radius, 25.6 mm of fall between them, and a
20-degree conical upper surface. Its vortex equation is
`d = K * ((R/r)^2 - 1)`, with `R = 50.8 mm` and `K = 1.06 mm`.
An upward-curving rim finishes the conical surface. These are preferred-embodiment
patent dimensions, not new measurements of the photographed specimen.

The rounded numbers in the patent are slightly inconsistent. The model uses
the published equation and solves its derivative for tangency to the 20-degree
cone, producing a 24.679 mm join radius and approximately 25.82 mm of fall to
the throat. There is no discrete ridge between those surfaces.

The 89 mm bowl diameter, 68 mm rim height, 30 mm throat height and rim fillet
are fitted outline parameters. Draft, mold markings, and exact surface finish
have not been measured and are not claimed as exact replicas.

## Shared modular dimensions

`src/pieces/marbleworks-spec.ts` is the common specification for both pieces.
It contains connector profiles, socket/cup cores, track section, stacking rise,
male insertion depth and horizontal connector-center span. See `modular-spec.md`.

The funnel's inlet base is one stacking unit above its drain base. Its sideways
offset is derived from the bowl radius minus the track's outside half-width,
so the outside rail meets the bowl tangentially. The along-track distance is
computed from that offset and the shared center span; it is not independently
fitted. The upper inlet and both lower sockets use the same connector geometry.

## Construction and verification

The bowl and track share a structured surface mesh. A sector is removed from
both faces of the bowl and replaced by one cubic Hermite loft. Its boundary
positions and tangent planes match the straight U-channel and the analytic
bowl. The inner rail becomes the near bowl rim; the outer rail follows the
tangent perimeter. A normal offset forms the underside, and a half-round edge
joins both skins around the complete exposed perimeter. All patch boundaries
share vertex indices; there are no overlapping track/bowl solids or voxel
extraction at the junction. The rounded bowl lip matches the cone and vertical
wall with continuous curvature so its tangent data cannot introduce a crease
inside the loft. Surface normals are retained through rendering.

The lower vortex and drain socket share an exact revolved profile with the
bowl. Only the inlet's standard connector uses boolean attachment and core
cuts. The regular mesh keeps geometric edges separate from lighting artifacts.

`tests/funnel.ts` checks shared seam positions and tangent planes, patch regularity,
normal-offset orientation, measured shell thickness, connectivity, descending
entry, marble passage, and physical insertion of the common male profile into both sockets. Junction
probes allow the small seating adjustment of a sphere bridging a concave
fillet; they still reject obstructions over 1 mm or an upward bed step. The shared
specification extraction was also checked against the previous ramp: its
triangle count, volume and complete profile coordinates were unchanged.
