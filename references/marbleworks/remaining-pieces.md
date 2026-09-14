# Remaining original Marbleworks pieces

Work proceeds one piece at a time. Existing approved components stay intact.
All mating elevations use `connectorLevels`, not photo-estimated post heights.

## Reference inventory

The 1997 Super Marbleworks inventory lists split track, jump chute, landing ramp,
starting gate, finish gate, extension tubes and connectors in addition to the
nine previewed components. The ordinary connector/post is already the spacer.
The later U-turn is distinct from the existing coiled standard ramp. The original
banked hairpin and passing-lane design drawings also identify distinct shapes.

Sources:
- https://toytales.ca/super-marbleworks-raceway-construction-set-from-discovery-toys-1997/
- https://patents.google.com/patent/US4932917A/en (pivoting starter)
- https://patents.google.com/patent/USD305047S/en (banked hairpin)
- https://patents.google.com/patent/USD305046S/en (landing)
- https://patents.google.com/patent/USD305443S/en (jump chute)
- https://patents.google.com/patent/USD305044S/en (passing lane)
- https://www.discoverytoys.us/products/marbleworks-grand-prix-racing-marble-run

## Queue

- [x] Split track: geometry, three ports, both exits, offline render and engine regression checked
- [x] Jump chute: mesh, launches, full airborne transfers, spacer fits and offline render checked
- [x] Landing ramp: mesh, five drops, spacer fits and offline render checked; five airborne transfers also pass
- [x] Starting gate: six individual lanes and simultaneous six-marble release, hinge sweep clearance and socket fit
- [x] Finish lane: mesh, spacer fits, five settling drops, six-marble queue, perspective and underside checked
- [x] Banked hairpin / U-turn: full far-bend traversal, five offsets, both spacer fits, side/top renders
- [x] Passing lane
- [x] Extension tube: confirmed plain sockets at both ends; five drops and both spacer insertions pass
- [x] Double-ended extension connector: common shoulders, both tube insertions, five drops
- [x] Coil ramp: full two-and-a-half-turn traversal, five offsets, inlet/outlet fits, support bars
- [x] Starter funnel: continuous bowl shell, five drops, socket fit

For each: inspect reference top/side/underside, use shared connector geometry,
check continuous running surfaces and rolled edges, reject detached geometry and
paper-thin join sheets, test actual spacer fits, run Box3D behavior checks, inspect
rendered views, add to the preview index, and commit.

At work start, Brave inspection is blocked by the locked Mac. Patent PDFs remain
available for inspection. Do not count numerical checks as completed browser QA.

## Regression command

Run `bun run test:components` after shared geometry or physics changes. It checks
all current drop simulations, jump transfer, six-marble gate operation, settling,
and connector insertion/alignment. Full output goes to `tmp/component-checks/`.
Run the changed piece's `geometry:*` command first to regenerate and audit its
mesh, and `bun run build` to check the application. Visual reference comparison
remains necessary: passing simulation and manifold checks does not prove an
accurate replica.
