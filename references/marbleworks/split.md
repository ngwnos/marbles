# Split / switch track

Source: USD305045, six views.
https://patents.google.com/patent/USD305045S/en

One upper inlet and two lower end drops, with raised walls near the junction.
The existing intersection contour supplies the same three-arm footprint and
shared port spacing. `buildProfiledTrack` supplies one continuous mold/core and
shared receivers instead of intersecting separately capped arms.

Validated: one manifold, no collapsed/sliver triangles, three collar sheet scans,
three actual spacer fits above/below, five Box3D drops reaching both outlets,
and an offline perspective render. The triggering +1.5 mm drop is also the
regression case for the Box3D manifold-allocation fix. Existing 70 offset-drop
checks, base retention, landing drops and airborne transfers still pass.
Physical dimensions beyond common connectors remain inferred from drawings.
Brave inspection remains pending while the Mac is locked.
