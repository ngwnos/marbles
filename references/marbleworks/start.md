# Pivoting starting gate

Reference: [US4932917, figures 2–4 and mechanism description](https://patentimages.storage.googleapis.com/e4/7f/69/9f75d93ad2f73a/US4932917.pdf).

Six parallel lanes meet an upturned retaining lip on a pivoting tray. The tray tips forward into an inclined receiving surface with three rounded deflectors and a terminal funnel/socket. The lane pitch accommodates the project's 15.9 mm marble; overall dimensions are reconstruction estimates, not measured factory dimensions.

The stationary shell uses shared vertices from the socket through the bowl, floor, rolled rim and underside. The holder is a separate joined solid. Its compound convex collision shapes follow the same deck and divider profiles. A Box3D revolute joint holds the loaded tray, drives the release, and limits its angle. Release explicitly wakes the sleeping body. Reset restores the hold position.

Checks: both solids manifold with no collapsed or sliver triangles; no body/holder overlap at nine release angles; socket fits the common spacer; all six lanes hold then discharge individually; all six loaded together also discharge. The first undersized deflectors allowed a multi-marble bridge; their corrected rounded profile passes that case. Arbitrary many-marble hopper jams are still physically possible. Offline perspective checked; browser QA pending locked macOS.
