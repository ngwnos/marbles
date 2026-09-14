import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, float, instanceIndex, int, mix,
  positionWorld, reflect, refract, smoothstep, storage, varying, vec2, vec3, vec4, texture, screenUV, mrt,
} from 'three/tsl';
import { createRefractionPasses, MARBLE_LAYER } from './refraction';

export interface Sphere {
  center: [number, number, number];
  radius: number;
}

// Shared by the background, reflection, and terminal transmission rays.
export const environment = (direction: THREE.Node<'vec3'>) => {
  const sky = mix(vec3(0.2, 0.22, 0.24), vec3(0.018, 0.025, 0.035),
    smoothstep(-0.5, 0.65, direction.y));
  const key = smoothstep(0.984, 0.99, direction.dot(vec3(-0.45, 0.65, 0.6).normalize()));
  const rim = smoothstep(0.991, 0.996, direction.dot(vec3(0.8, 0.15, -0.55).normalize()));
  return sky.add(key.mul(14)).add(rim.mul(4));
};

export function createPile(): Sphere[] {
  const spheres: Sphere[] = [];
  const spacing = 2.06;
  // Three close-packed, nonintersecting layers: 36 + 25 + 16 marbles.
  for (let layer = 0; layer < 3; layer++) {
    const side = 6 - layer;
    for (let z = 0; z < side; z++) {
      for (let x = 0; x < side; x++) {
        spheres.push({ center: [(x - (side - 1) / 2) * spacing,
          (layer - 1) * spacing / Math.sqrt(2), (z - (side - 1) / 2) * spacing], radius: 1 });
      }
    }
  }
  return spheres;
}

export function createMarbles(options: { spheres?: Sphere[] } = {}) {
  const spheres = options.spheres ?? createPile();
  const packed = new Float32Array(spheres.flatMap(s => [...s.center, s.radius]));
  const sphereAttribute = new THREE.StorageBufferAttribute(packed, 4);
  const sphereData = storage(sphereAttribute, 'vec4', spheres.length).toReadOnly();
  const passes = createRefractionPasses();
  const worldColor = texture(passes.world.texture);
  const worldDepth = texture(passes.world.depthTexture!, screenUV);
  const baseColor = texture(passes.marbles.textures[0]);
  const baseId = texture(passes.marbles.textures[1]);
  // Eight vec4s per marble: shape, optics, orientation basis, and three colors.
  const appearanceArray = new Float32Array(spheres.length * 8 * 4);
  const localAppearance = new Float32Array(appearanceArray.length);
  const appearanceAttribute = new THREE.StorageBufferAttribute(appearanceArray, 4);
  const appearance = storage(appearanceAttribute, 'vec4', spheres.length * 8).toReadOnly();
  const palettes = [
    [0xe99b08, 0x075cce, 0xe99b08], [0x008345, 0x008345, 0x008345],
    [0x075cce, 0x075cce, 0x075cce], [0xe5a10a, 0xc52511, 0x075cce],
    [0xc52511, 0xc52511, 0xe5a10a], [0x008345, 0xe5a10a, 0x008345],
  ];
  const randomize = () => {
    const color = new THREE.Color();
    spheres.forEach((_, id) => {
      const offset = id * 32;
      appearanceArray.set([THREE.MathUtils.randFloat(0.55, 0.7), THREE.MathUtils.randFloat(0.25, 0.43),
        THREE.MathUtils.randFloat(-0.9, 0.9), THREE.MathUtils.randFloat(-0.45, 0.45)], offset);
      appearanceArray.set([THREE.MathUtils.randFloat(0.9, 2), [3, 3, 4, 6][Math.floor(Math.random() * 4)], 1.51, 0], offset + 4);
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI,
      ));
      [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
        .forEach((axis, i) => appearanceArray.set([...axis.applyQuaternion(rotation).toArray(), 0], offset + 8 + i * 4));
      const palette = palettes[Math.floor(Math.random() * palettes.length)];
      palette.forEach((hex, i) => appearanceArray.set([...color.setHex(hex).toArray(), 0], offset + 20 + i * 4));
    });
    localAppearance.set(appearanceArray);
    appearanceAttribute.needsUpdate = true;
  };
  randomize();

  const primaryId = varying(instanceIndex, 'marbleId');
  const makeMaterial = (basePass: boolean) => {
    const material = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending });
    material.outputNode = Fn(() => {
      const rasterClip = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(positionWorld, 1)));
      // The world is not redrawn in passes 2/3: preserve its foreground occlusion.
      rasterClip.z.div(rasterClip.w).greaterThan(worldDepth.r.add(0.000001)).discard();

      const origin = cameraPosition.toVar();
      const ray = positionWorld.sub(cameraPosition).normalize().toVar();
      const id = int(primaryId).toVar();
      const radiance = vec3(0).toVar();
      const throughput = vec3(1).toVar();

      const sphere = sphereData.element(id).toVar();
      const relative = origin.sub(sphere.xyz);
      const b = relative.dot(ray);
      const discriminant = b.mul(b).sub(relative.dot(relative).sub(sphere.w.mul(sphere.w)));
      const distance = b.negate().sub(discriminant.max(0).sqrt());
      const entryWorld = origin.add(ray.mul(distance));
      const entry = entryWorld.sub(sphere.xyz).div(sphere.w).toVar();
      const normal = entry.normalize();
      const base = id.mul(8);
      const shape = appearance.element(base).toVar();
      const optics = appearance.element(base.add(1)).toVar();
      const length = shape.x;
      const width = shape.y;
      const bend = shape.z;
      const curl = shape.w;
      const density = optics.x;
      const ior = optics.z;
      const f0 = ior.sub(1).div(ior.add(1)).pow(2);
      const fresnel = f0.add(float(1).sub(f0).mul(float(1).sub(ray.negate().dot(normal).clamp(0, 1)).pow(5)));
      radiance.addAssign(throughput.mul(environment(reflect(ray, normal))).mul(fresnel));
      throughput.mulAssign(float(1).sub(fresnel));
      const inside = refract(ray, normal, float(1).div(ior)).normalize().toVar();
      const exitDistance = entry.dot(inside).mul(-2).toVar();
      const exit = entry.add(inside.mul(exitDistance)).toVar();
      const outgoing = refract(inside, exit.normalize().negate(), ior).normalize().toVar();
      const axisX = appearance.element(base.add(2)).xyz;
      const axisY = appearance.element(base.add(3)).xyz;
      const axisZ = appearance.element(base.add(4)).xyz;
      const localEntry = vec3(entry.dot(axisX), entry.dot(axisY), entry.dot(axisZ)).toVar();
      const localDirection = vec3(inside.dot(axisX), inside.dot(axisY), inside.dot(axisZ)).toVar();
      const opticalDepth = vec3(0).toVar();
      const pigmentLight = vec3(0).toVar();
      const totalWeight = float(0).toVar();
      Loop({ start: int(0), end: int(optics.y), type: 'int' }, ({ i: vane }) => {
        const angle = float(vane).div(optics.y).mul(Math.PI * 2);
        const cosine = angle.cos();
        const sine = angle.sin();
        const o = vec3(localEntry.x.mul(cosine).sub(localEntry.z.mul(sine)), localEntry.y,
          localEntry.x.mul(sine).add(localEntry.z.mul(cosine))).toVar();
        const d = vec3(localDirection.x.mul(cosine).sub(localDirection.z.mul(sine)), localDirection.y,
          localDirection.x.mul(sine).add(localDirection.z.mul(cosine))).toVar();
        const pigmentColor = appearance.element(base.add(5).add(vane.mod(3))).xyz;
        // Curved radial vane: z = bend*x*y + curl*x*x.
        // All vanes share x=z=0 and pinch to the same two tips.
        // Substituting o+t*d gives a quadratic: exact intersections, no marching.
        const a = bend.mul(d.x).mul(d.y).add(curl.mul(d.x.mul(d.x)));
        const halfB = bend.mul(o.x.mul(d.y).add(o.y.mul(d.x)))
          .add(curl.mul(o.x).mul(d.x).mul(2)).sub(d.z).mul(0.5);
        const c = bend.mul(o.x).mul(o.y).add(curl.mul(o.x.mul(o.x))).sub(o.z);

        const shadeHit = (t: THREE.Node<'float'>) => {
          const p = o.add(d.mul(t));
          const taper = float(1).sub(p.y.div(length).pow(2));
          const outer = width.mul(taper);
          If(t.greaterThan(0).and(t.lessThan(exitDistance))
            .and(taper.greaterThan(0)).and(p.x.greaterThanEqual(0)).and(p.x.lessThan(outer)), () => {
            const n = vec3(bend.mul(p.y).add(curl.mul(p.x).mul(2)).negate(), bend.mul(p.x).negate(), 1).normalize();
            const edge = smoothstep(0, 0.035, outer.sub(p.x));
            // Thin pigmented glass, thicker at the shared spine.
            const thickness = mix(float(0.45), float(1.4), float(1).sub(p.x.div(outer.max(0.001))));
            const u = p.x.div(outer.max(0.001));
            const striation = u.mul(105).add(p.y.mul(5)).sin().mul(0.09)
              .add(u.mul(237).sub(p.y.mul(9)).sin().mul(0.04)).add(1);
            const weight = thickness.mul(density).mul(edge).mul(striation).div(n.dot(d).abs().max(0.2));
            const extinction = vec3(1).sub(pigmentColor).mul(2.8).add(0.08);
            opticalDepth.addAssign(extinction.mul(weight));
            pigmentLight.addAssign(pigmentColor.mul(weight));
            totalWeight.addAssign(weight);
          });
        };

        If(a.abs().lessThan(0.00001), () => {
          If(halfB.abs().greaterThan(0.00001), () => shadeHit(c.negate().div(halfB.mul(2))));
        }).Else(() => {
          const delta = halfB.mul(halfB).sub(a.mul(c));
          If(delta.greaterThan(0), () => {
            const q = halfB.add(halfB.greaterThanEqual(0).select(delta.sqrt(), delta.sqrt().negate())).negate();
            shadeHit(q.div(a));
            If(q.abs().greaterThan(0.000001), () => shadeHit(c.div(q)));
          });
        });
      });
      const transmission = opticalDepth.negate().exp();
      const pigment = pigmentLight.div(totalWeight.max(0.001));
      radiance.addAssign(throughput.mul(pigment).mul(vec3(1).sub(transmission)).mul(0.48));
      throughput.mulAssign(transmission.mul(vec3(0.09, 0.018, 0.055).mul(exitDistance).negate().exp()));
      const exitFresnel = f0.add(float(1).sub(f0).mul(float(1).sub(inside.dot(exit.normalize()).clamp(0, 1)).pow(5)));
      radiance.addAssign(throughput.mul(environment(reflect(inside, exit.normalize()))).mul(exitFresnel));
      throughput.mulAssign(float(1).sub(exitFresnel));
      // A single projected lookup, like conventional screen-space transmission.
      // The projection uses the analytic sphere exit; offscreen rays use the environment.
      const exitWorld = sphere.xyz.add(exit.mul(sphere.w));
      // Fixed-distance screen-space approximation, allowing the lookup to reach
      // visible neighbors beyond this sphere's own projected silhouette.
      const samplePoint = exitWorld.add(outgoing.mul(sphere.w).mul(2));
      const clip = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(samplePoint, 1)));
      const ndc = clip.xy.div(clip.w.max(0.00001));
      const uv = vec2(ndc.x.mul(0.5).add(0.5), ndc.y.mul(-0.5).add(0.5));
      const inFrame = clip.w.greaterThan(0).and(uv.x.greaterThanEqual(0)).and(uv.x.lessThanEqual(1))
        .and(uv.y.greaterThanEqual(0)).and(uv.y.lessThanEqual(1));
      const sampleUV = uv.clamp(0, 1);
      const captured = worldColor.sample(sampleUV).rgb.toVar();
      if (!basePass) {
        const sampledId = baseId.sample(sampleUV).r.round();
        // ID 0 is world. Our own ID also falls back to world: never feed a
        // marble's captured interior back into itself, including at its edges.
        If(sampledId.greaterThan(0).and(sampledId.notEqual(float(id).add(1))), () => {
          captured.assign(baseColor.sample(sampleUV).rgb);
        });
      }
      const background = mix(environment(outgoing), captured, float(inFrame));
      const result = vec4(radiance.add(throughput.mul(background)), 1);
      return result;
    })();
    if (basePass) material.mrtNode = mrt({ marbleId: vec4(float(primaryId).add(1), 0, 0, 1) });
    material.depthFunc = THREE.LessEqualDepth;
    material.depthWrite = true;
    return material;
  };
  const baseMaterial = makeMaterial(true);
  const material = makeMaterial(false);

  const geometry = new THREE.SphereGeometry(1, 48, 32);
  const mesh = new THREE.InstancedMesh(geometry, material, spheres.length);
  // Separate GPU pipelines can round the same vertex depth differently.
  // Bias the cheap prepass back slightly; shading writes the unbiased depth.
  const depthMaterial = new THREE.MeshBasicNodeMaterial({
    colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
  });
  const depthMesh = new THREE.InstancedMesh(geometry, depthMaterial, spheres.length);
  depthMesh.renderOrder = -1;
  depthMesh.layers.set(MARBLE_LAYER);
  mesh.layers.set(MARBLE_LAYER);
  const matrix = new THREE.Matrix4();
  spheres.forEach((sphere, id) => {
    matrix.makeScale(sphere.radius, sphere.radius, sphere.radius).setPosition(...sphere.center);
    mesh.setMatrixAt(id, matrix);
    depthMesh.setMatrixAt(id, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  depthMesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  depthMesh.computeBoundingSphere();
  const group = new THREE.Group();
  group.add(depthMesh, mesh);
  const axis = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const syncTransforms = (transforms: { position: THREE.Vector3; rotation: THREE.Quaternion }[]) => {
    transforms.forEach(({ position, rotation }, id) => {
      packed.set([position.x, position.y, position.z], id * 4);
      matrix.compose(position, rotation, scale.setScalar(spheres[id].radius));
      mesh.setMatrixAt(id, matrix);
      depthMesh.setMatrixAt(id, matrix);
      for (let a = 0; a < 3; a++) {
        const offset = id * 32 + 8 + a * 4;
        axis.fromArray(localAppearance, offset).applyQuaternion(rotation).toArray(appearanceArray, offset);
      }
    });
    sphereAttribute.needsUpdate = true;
    appearanceAttribute.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    depthMesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    depthMesh.computeBoundingSphere();
  };
  return { group, mesh, randomize, syncTransforms, appearanceAttribute, passes,
    render: (renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) =>
      passes.render(renderer, scene, camera, mesh, baseMaterial, material),
    dispose: () => { mesh.dispose(); depthMesh.dispose(); geometry.dispose(); material.dispose(); baseMaterial.dispose(); depthMaterial.dispose(); passes.dispose(); } };
}
