# No.146 maze ramp

References inspected:
- Top and underside photos: https://www.ebay.com/itm/117301914006
- Original patent, Figure 7A/B: https://patentimages.storage.googleapis.com/06/15/b2/91a255822e9b86/US4713038-drawings-page-4.png

The inlet feeds a scalloped, sloping tray. Eight pins form successive 1–2–3–2 rows toward the outlet. The underside photo confirms hollow pins with closed tops. Pins have rounded top edges and filleted bases. The broadest part of the tray is downstream of its midpoint.

Uses the established 140.1 mm connector span and 13 mm fall. Photographic estimates: 24 mm row spacing, 28 mm transverse pin spacing, 20 mm scallop radius, 4 mm pin diameter and 8 mm pin height. These are reconstruction estimates, not measured factory dimensions.

Construction reuses parallel contour lofting, the U-profile's floor/wall fillet and rolled rim, track connectors, inlet floor slope, mesh normal sources, baked previews and Box3D mesh collisions. Pin fillets follow the floor plane; its planar normals must remain exact after boolean joins.

Build: `bun run geometry:maze`. Drop tests: `bun scripts/test-preview-drops.ts --offsets`.
