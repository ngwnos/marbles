# Piece 01 — original standard ramp (J-loop)

Approval status: pending. Only this piece is being reconstructed. The rejected
multi-piece course was removed; the marble game remains available at `/`.
Review at `/ramp.html`. All dimensions below are provisional reconstruction
parameters, not factory specifications or caliper measurements.

## Primary geometry evidence

- **Isolated original No. 142**, unobstructed whole part from both sides:
  https://www.ebay.com/itm/198497502658
  The seller calls it a U-turn, but its geometry is the original J-loop.
  Top: https://i.ebayimg.com/images/g/74gAAeSw-1dqVmcC/s-l1600.webp
  Underside: https://i.ebayimg.com/images/g/khIAAeSwvA9qVmcC/s-l1600.webp
  These show the full circular outer tray and the solid web joining it to the
  straight trough. There is no air gap or freestanding curled terminal wall.
- Additional No. 142 closeups (stamp reads NO.142 PAT.PEND.):
  https://poshmark.com/listing/Discovery-Toys-Marbleworks-Run-Replacement-Part-Piece-Lot-Of-10-Standard-Ramps-6a31e7eecf0577d47dfd4d8f
  Outlet openings: https://di2ponv0v5otw.cloudfront.net/posts/2026/06/16/6a31e7eecf0577d47dfd4d8f/l_6a31e7eff6035aba5cbddb0f.jpeg
  Underside junction: https://di2ponv0v5otw.cloudfront.net/posts/2026/06/16/6a31e7eecf0577d47dfd4d8f/l_6a31e7f088849a59408ba2c1.jpeg
- Discovery Toys / William J. Wichman design patent **USD290028S**, granted
  May 26, 1987: https://patents.google.com/patent/USD290028S/en
  The seven views match the original standard ramp in the 1988 specimen photos.
  Local archival copy: USD290028.pdf.
- Utility patent **US4713038A**, FIG 4A–C, calls this the J-loop marble race toy.
  The section shows the channel entering the side of the hollow outlet column.
  https://patents.google.com/patent/US4713038A/en
  Figure sheet: https://patentimages.storage.googleapis.com/49/54/ce/80a4fa1be2d8f3/US4713038-drawings-page-3.png
- 1988 specimen, four views including ruler, sides, and underside:
  https://www.ebay.com/itm/358138698821
  Top/oblique: https://i.ebayimg.com/images/g/yI8AAeSwXldpcIcz/s-l1600.webp
  Side: https://i.ebayimg.com/images/g/UTQAAeSwwhFpcIdJ/s-l1600.webp
  Underside: https://i.ebayimg.com/images/g/qr4AAeSwrxJpcIdR/s-l1600.webp
- Second group photographed next to ruler:
  https://www.ebay.com/itm/325938902221
  https://i.ebayimg.com/images/g/BXMAAOSwta9k33mR/s-l1200.png

## Confirmed shape features

- **The returning channel tightens before entering the outlet.** It is not an
  annular groove ending in a radial notch. The user's close-up clearly shows
  its outer rail curling inward and becoming an edge of the opening.
  Exact supplied image: `public/references/no142-curve-reference.png`.
- Two vertically aligned hollow connector columns with offset horizontal centers.
- Narrow straight trough tangent to the outside of a descending J-shaped loop.
- Loop goes around the outlet column and enters a side opening, not a bowl with
  an exposed central floor hole.
- Stepped male connector above the wider socket body, C-shaped side openings.
- Rounded channel floor/wall junction and underside. Thin injection-molded shell.
- Open bottom of outlet column. Inlet has a cupped interior directing the marble.
- The underside is rounded and follows the trough; it is not a flat slab.

## Construction and checks

The reconstruction uses a solid exterior with channel and socket cores removed
by Manifold booleans. The tray is a complete circular shell joined to the
straight trough, with its divider protected from the channel cut. The channel
uses two tangent arcs: a 24 mm main radius followed by a 10.5 mm terminal radius.
They join at approximately 128.94 degrees about the outlet axis. The terminal
arc is centered at (-8.485, 10.5) mm relative to that axis and finishes pointing
along +X into the bore, with a short straight continuation to its center.
These radii are a geometric reconstruction of the visible contour, not measured
dimensions. The circular exterior and small joining web remain in place.
The inner U-shaped wall meets the outlet cylinder with a single quarter-circle
profile (6.5 mm radius on the broad arc), followed directly by the cylinder's
vertical surface. There is no additional lower shelf or S-shaped transition.
The intended stacking shoulder remains at 47 mm.
This avoids the open seams and overlapping faces of the earlier surface-patch draft.
The result must report `NoError` and exactly one connected solid before it is
converted to a Three.js mesh. Top, perspective, and underside are inspected in
the review page against the photographs. `tests/standard-ramp.ts` also checks
57 placements of a 15.9 mm sphere along the actual channel and through the
outlet bore for intersections with the final solid. Radial probes check that the
lower shelf is gone and the stacking shoulder is retained. No game physics is attached yet.

## Dimensions and uncertainty

The compatible Grand Prix connector CAD author gives 27 mm across, 1.5–2 mm
tapered walls, and a 50 mm stacking increment. Inspection of the actual STL
during No.141 research clarified that 27 mm is its mating diameter, with an
approximately 31 mm body. The earlier interpretation as body diameter was
incorrect. The reviewed reconstruction is preserved as a shared working spec;
see `modular-spec.md` for the discrepancy and the common dimensions.
These are **compatible-print** dimensions, not direct measurements of the 1988 part:
https://www.thingiverse.com/thing:4202469
https://www.crealitycloud.com/ko/model-detail/marbleworks-compatible-connectors

Working model: 27 mm body OD, 24 mm male OD, 21 mm male bore, 24.2 mm female
socket bore with an internal shoulder, 62 mm overall height,
47 mm shoulder, 138 mm longitudinal axis separation, 24 mm lateral offset,
24 mm bend center radius, 20 mm channel inside width, 10 mm trough depth.
Nominal shell thickness 1.5 mm. Model envelope is approximately 187 × 73 × 62 mm.
The tray bed is provisionally 24 mm above the base, rising to 29 mm where the
incoming trough meets it; the rim is approximately 39 mm high.

The socket's 0.2 mm diametral fit clearance is a reconstruction choice, not a
verified original tolerance. The socket must exceed the male connector OD;
the same 21 mm bore cannot be used through both sections of the post.

The compatible connector and wall/stacking values have textual measurement
evidence, but do not verify this reconstruction's original-era dimensions.
Other values are shape fits to
photos/drawings. The ruler lies at a different height and orientation to the
part; it does not justify sub-millimetre accuracy. The patent views are not
manufacturing drawings and are not assumed to share an exact plotting scale.

The utility patent describes a nominal 15.9 mm marble and an 18.3 mm channel
for the zigzag specifically; the latter is not treated as a verified width
for this standard ramp. A collector's Item 387 listing gives 14.29–15.08 mm
marbles: https://donsgamecloset.com/marbleworks-discoverytoys.html

Remaining unverified details: mold draft angle, exact fillet radii, fit
clearances, cavity/ejector markings, original resin and gloss, and the original
specimen's absolute dimensions. Do not call this a measured or perfect replica.

Other piece patents, for later approval rounds only: D290026 pachinko,
D290143 funnel, D290145 paddle wheel, D293696 zigzag, D294044 serpentine.
