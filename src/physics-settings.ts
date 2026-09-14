// Geometry is in millimetres; Box3D uses one unit per 16 mm. At this scale
// gravity is 613 units/s², so its default 30 Hz soft contacts compress a six-ball
// stack by 2.75 mm per contact. These settings keep that error below 0.05 mm.
// Box3D caps contact Hertz at 1/(8 * substep duration); keep these coupled.
export const CONTACT_HERTZ = 240;
export const PHYSICS_SUBSTEPS = 8;
export const MM_TO_PHYSICS=1/16;
export const GRAVITY_MM=9810;
export const MARBLE_RADIUS_MM=7.95;
export const SOLVER_STEP=1/240;
export const ASSEMBLY_STEP=SOLVER_STEP*2;
