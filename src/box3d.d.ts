// The WASM package does not ship declarations. This is the API subset we use.
declare module 'box3d-wasm/standard' {
  export interface Vec3 { x: number; y: number; z: number }
  export interface Quat extends Vec3 { w: number }
  export interface Filter { categoryBits: number; maskBits: number }
  export interface Shape { isValid(): boolean; delete(): void }
  export interface MeshGeometry { delete(): void }
  export interface Joint { getAngle(): number; setLimits(lower:number,upper:number):void; setMotorSpeed(speed:number):void; enableSpring(flag:boolean):void; setTargetAngle(angle:number):void; delete(): void }
  export interface Body {
    createMesh(mesh: MeshGeometry, options: { density?:number; friction: number; restitution: number; rollingResistance?:number; filter?: Filter }): Shape;
    createHull(options: { points: Vec3[]; maxVertices?: number; density: number; friction: number; restitution: number; rollingResistance?:number; filter?: Filter }): Shape;
    setAwake(awake:boolean):void;
    setEnabled(enabled:boolean):void;
    isAwake():boolean;
    destroy(): void;
    setTransform(position: Vec3, rotation: Quat): void;
    setType(type:'static'|'dynamic'|'kinematic'):void;
    setTargetTransform(target:{position:Vec3;rotation:Quat},timeStep:number,wake:boolean):void;
    setAngularVelocity(velocity: Vec3): void;
    createSphere(options: { radius: number; density: number; friction: number; rollingResistance: number; restitution: number; filter?: Filter }): Shape;
    createBox(options: { halfExtents: Vec3; friction: number; rollingResistance: number; restitution?:number; filter?: Filter }): Shape;
    getPosition(): Vec3;
    getRotation(): Quat;
    getAngularVelocity(): Vec3;
    getLinearVelocity(): Vec3;
    getMass(): number;
    setLinearVelocity(velocity: Vec3): void;
    applyTorque(torque: Vec3, wake: boolean): void;
    applyLinearImpulseToCenter(impulse: Vec3, wake: boolean): void;
    delete(): void;
  }
  export interface World {
    createRevoluteJoint(a: Body, b: Body, options: { anchorA: Vec3; anchorB: Vec3; localFrameA?:{rotation:Quat}; localFrameB?:{rotation:Quat}; enableMotor: boolean; motorSpeed?: number; maxMotorTorque?: number; enableLimit?:boolean; lowerAngle?:number; upperAngle?:number; enableSpring?:boolean; hertz?:number; dampingRatio?:number; collideConnected: boolean }): Joint;
    createBody(options: { type: 'static' | 'dynamic'; position: Vec3; rotation?: Quat; angularDamping?: number; linearDamping?: number; isAwake?:boolean; enableContactRecycling?:boolean }): Body;
    step(dt: number, substeps: number): void;
    castRayClosest(origin: Vec3, translation: Vec3, filter: Filter | {filter:Filter}): { hit: false; normal?: never; shape?: never } | { hit: true; fraction: number; point: Vec3; normal: Vec3; shape: Shape };
    destroy(): void;
    delete(): void;
  }
  export default function init(): Promise<{ MeshGeometry: new (options: { vertices: Float32Array; indices: Uint32Array }) => MeshGeometry; World: new (options: { gravity: Vec3; contactHertz?:number; contactDampingRatio?:number; contactSpeed?:number; enableSleep: boolean; enableContinuous: boolean }) => World }>;
}
