# No.149 zigzag bumper ramp

Reference: https://www.ebay.com/itm/198497506138 (three isolated top/underside photographs inspected).
Original drawing: https://patentimages.storage.googleapis.com/63/b5/b5/fc01ae811c51ae/US4713038-drawings-page-2.png (US4713038, Fig.3A/B).

Eight alternating angular bends; rounded molding corners, constant trough section, a single sloping floor, and two C connectors. Uses the shared 140.071 mm span, 13 mm fall, 20 mm inside channel width, 10 mm depth, connector mold, and sloped receiving cup. Bend pitch 15 mm and lateral excursion ±3.1 mm are photo fits, not measured factory dimensions.

Geometry uses corresponding offset rails lofted through the shared trough section. Corners have 0.65 mm planar fillets. Connector bodies and channel are one closed solid. A 0.001 mm coordinate grid removes microscopic Boolean fragments before simplification; maximum coordinate change is 0.0005 mm.

Validation: connected manifold; no collapsed render triangles; 45 floor-plane normal probes; centered and four 1.5 mm offset Box3D drops exit successfully. Preview has drop/reset and standard inspection views.

Terminal segments run directly from each connector center to the first/last bend. Both C openings and the inlet receiving slope follow that segment tangent (about 10° from the span axis), so the tube ends align with the approaching rails.

The channel core continues above the rail crest instead of sharing a coplanar cap with the mold. This prevents thin leftover skins at the outlet. Both connectors now receive a radial thickness sweep that rejects clusters of sheets thinner than 0.02 mm; verified to reject the previous defective outlet.
