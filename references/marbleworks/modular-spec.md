# Shared Marbleworks reconstruction specification

Source of truth: `src/pieces/marbleworks-spec.ts`.
All values are millimeters. These are shared **working reconstruction** values,
preserving the reviewed No.142 ramp, not verified original factory standards.

| Parameter | Current shared value |
| --- | ---: |
| Socket body outside diameter | 27 |
| Male shoulder diameter | 24 |
| Male bore diameter | 21 |
| Female mating bore diameter | 24.2 |
| Column total height | 62 |
| Stacking rise / shoulder height | 47 |
| Male insertion depth | 15 |
| Nominal shell thickness | 1.5 |
| Channel inside width / depth | 20 / 10 |
| Standard channel floor drop | 13 |
| Horizontal connector-center span | 140.071410 |

The connector-center span is `hypot(138,24)`, preserving the accepted ramp.
Each piece chooses the lateral offset required by its shape; the along-track
distance is derived as `sqrt(span^2 - offset^2)`. This preserves the distance
between tower axes while allowing different track outlines. The funnel inlet
base sits exactly one stacking rise above its drain socket base.
The standard ramp's running floor drops one 13 mm working increment; the
funnel's straight slope uses two across its span. The final loft leaves that
straight datum to meet the bowl's running surface. These are reconstruction
constraints, not independently verified factory increments.

Connector profiles and channel profiles derive from these settings. A change
to the common fit changes both pieces. The funnel's published 19 mm throat is
a running-surface feature above the socket, not a separate connector standard.

## Evidence and unresolved scale

US4713038A describes common mating ends and spacers throughout the system:
https://patents.google.com/patent/US4713038A/en
It does not publish the tower spacing or stacking increment.

Modern compatible CAD provides a useful independent cross-check:

- https://www.thingiverse.com/thing:4202469
- https://www.thingiverse.com/thing:4202442

The maker describes iterative fit and tower-spacing checks against Marbleworks.
Measured from their downloaded STL, the 50 mm connector has a 50 mm stacking
rise, 15 mm insertion, approximately 27 mm male diameter, 27 mm female bore and
31 mm maximum body diameter. Their basic ramp's center vector is approximately
131.45 by 26 mm, giving a 133.997 mm span.

This corrects an earlier interpretation of the maker's phrase “27 mm across”:
it describes the mating diameter, not the widest socket body. The older
No.142 reconstruction used it as the body diameter. The accepted part has not
been silently rescaled to a newer compatible print. Establishing original
physical dimensions requires an actual specimen or better measured evidence;
the conflicting dimensions remain recorded here rather than called verified.

## Enforced mating elevations

`VERTICAL_GRID` defines rise=47 and insertion=15. `connectorLevels(integerUnits)` derives bottom, shoulder and male tip. The shoulder is the stacking datum; total tip height includes the overlapping insertion and is not the unit height. The base uses the same one-unit shoulder as every ordinary connector.

| Piece | Socket bottoms | Male shoulders | Male tips |
| --- | --- | --- | --- |
| Base | none (ground at 0) | 47 | 62 |
| Spacer | 0 | 47 | 62 |
| Standard, snake, maze, bumper | 0, 0 | 47, 47 | 62, 62 |
| Intersection | 0, 0, 0 | 47, 47, 47 | 62, 62, 62 |
| Paddle | 47, 0 | 94, 47 | 109, 62 |
| Funnel | 47, 0 | inlet 94; drain has no male end | inlet 109 |

The 13 mm running-floor drop is internal channel geometry, not a tower stacking increment. Raised inlets are exactly one unit above the other socket.

`bun run test:alignment` checks all 17 ports against actual built meshes, including socket bottoms, shoulder surfaces, tip elevations and full spacer intersection tests above/below each mating end. It also checks accumulated seating heights through stacks of zero to four spacers. Results are written to `src/generated/component-alignment.json`.

The female socket reserves the full 15 mm insertion before transitioning to its narrower running bore. The funnel receiving floor reserves its rolled rim below the seating plane. Numeric scale remains the project's shared reconstruction scale; existing evidence does not establish 47 mm as a verified factory measurement.
