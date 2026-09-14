# No.143 support base — photo reconstruction

References inspected:
- https://www.ebay.com/itm/377231002083 — isolated front, rear, and underside views of four original feet.
- https://www.ebay.com/itm/357613700679 — independent blue/green pair, including ruler and underside views.
- Ruler photo: https://i.ebayimg.com/images/g/8rcAAeSwjB5oxePV/s-l1600.webp
- Underside comparison: https://i.ebayimg.com/images/g/BXkAAeSww8FoxePV/s-l1600.webp

Current working fit: 80×72 mm tray; the shoulder is one shared 47 mm stacking unit above the ground, and the male tip is 15 mm above it (62 mm overall). A previous per-piece 32 mm shoulder estimate from photographs was incorrect: perspective estimates must not override the common grid. Footprint dimensions remain photo estimates, not verified measurements. Shared mating diameters remain 27 mm body, 24 mm male and 21 mm bore. The broad rounded end is a shallow ellipse (27×36 mm radii), with 18 mm corners at the opposite end. Post center is 12 mm toward the curved end; its full-height slot faces that end.

Construction uses parallel outline offsets, rounded C sections, and tangent foot fillets. The channel cutter extends above the rim to prevent coplanar skins. The recessed underside has a C-shaped post pocket, stopping below the connector seat. Its inaccessible narrow interior is filled in the physics collider; exposed ball-contact geometry is preserved. Underside lettering/ejector marks are not modeled; pocket depth remains an inference from external photographs.

Checks: connected manifold, no collapsed/sliver triangles, zero-volume interference with a spacer seated at the base shoulder; five centered/off-center Box3D drops retained with near-zero final velocity. Separate test command: bun run physics:base.
