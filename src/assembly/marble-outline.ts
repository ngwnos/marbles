import * as T from 'three/webgpu';
import {Discard, Fn, If, Loop, attribute, float, smoothstep, texture, uniform, uv, varying, vec2, vec3, vec4, viewZToOrthographicDepth, viewZToPerspectiveDepth} from 'three/tsl';

export const DEFAULT_MARBLE_OUTLINE = {inside: 1, outside: 2};

/** The exact perspective silhouette of a sphere is an ellipse, including off-axis marbles. */
export function projectSphere(center: T.Vector3, radius: number, camera: T.PerspectiveCamera | T.OrthographicCamera, size: T.Vector2) {
  const p = camera.projectionMatrix.elements;
  const fx = p[0] * size.x / 2, fy = p[5] * size.y / 2;
  const d = -center.z;
  let x: number, y: number, xx: number, xy: number, yy: number;
  if (camera instanceof T.PerspectiveCamera) {
    if (d <= radius || d + radius < camera.near || d - radius > camera.far) return;
    const denominator = d * d - radius * radius;
    const scale = radius * radius / denominator;
    x = fx * d * center.x / denominator + (1 - p[8]) * size.x / 2;
    y = fy * d * center.y / denominator + (1 - p[9]) * size.y / 2;
    xx = fx * fx * scale * (1 + center.x * center.x / denominator);
    xy = fx * fy * scale * center.x * center.y / denominator;
    yy = fy * fy * scale * (1 + center.y * center.y / denominator);
  } else {
    if (d + radius < camera.near || d - radius > camera.far) return;
    x = fx * center.x + (1 + p[12]) * size.x / 2;
    y = fy * center.y + (1 + p[13]) * size.y / 2;
    xx = (fx * radius) ** 2; xy = 0; yy = (fy * radius) ** 2;
  }
  const difference = Math.hypot(xx - yy, 2 * xy);
  const a = Math.sqrt((xx + yy + difference) / 2);
  const b = Math.sqrt(Math.max(1e-12, (xx + yy - difference) / 2));
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  return {x, y, a, b, cos: Math.cos(angle), sin: Math.sin(angle)};
}

/** One instanced draw for sphere silhouettes, then a composite. No neighborhood sampling. */
export function createMarbleOutline() {
  const size = new T.Vector2(), bufferSize = new T.Vector2(), viewCenter = new T.Vector3();
  const viewport = uniform(new T.Vector2(1, 1));
  const widths = uniform(new T.Vector2(DEFAULT_MARBLE_OUTLINE.inside, DEFAULT_MARBLE_OUTLINE.outside));
  const aa = uniform(.5);
  const lens = uniform(new T.Vector4()); // focal length and optical center, in CSS pixels
  const near = uniform(1), far = uniform(30000), perspective = uniform(1);
  const target = new T.RenderTarget(1, 1, {type: T.HalfFloatType, depthBuffer: true});
  const scene = new T.Scene();
  const material = new T.MeshBasicNodeMaterial({toneMapped: false, blending: T.NoBlending});
  let geometry: T.InstancedBufferGeometry;
  let capacity = 0;
  const mesh = new T.Mesh(new T.BufferGeometry(), material);
  mesh.frustumCulled = false; scene.add(mesh);

  const ellipse = varying(attribute<'vec4'>('ellipse', 'vec4'));
  const rotation = varying(attribute<'vec2'>('ellipseRotation', 'vec2'));
  const sphere = varying(attribute<'vec4'>('sphere', 'vec4'));
  const color = varying(attribute<'vec3'>('outlineColor', 'vec3'));
  const local = varying(attribute<'vec3'>('position', 'vec3').xy.mul(ellipse.zw.add(widths.y).add(aa)));
  const pixel = ellipse.xy.add(vec2(local.x.mul(rotation.x).sub(local.y.mul(rotation.y)), local.x.mul(rotation.y).add(local.y.mul(rotation.x))));
  material.vertexNode = vec4(pixel.div(viewport).mul(2).sub(1), 0, 1);

  const distance = Fn(() => {
    const p = local.abs().toVar(), axes = ellipse.zw;
    const result = float(0).toVar();
    If(axes.x.sub(axes.y).lessThan(.0001), () => {
      result.assign(p.length().sub(axes.x));
    }).Else(() => {
      // Solve for the closest point on the ellipse. Bisection stays stable at the
      // axes and inside the silhouette, unlike a gradient-distance approximation.
      const squared = axes.mul(axes), closest = vec2(0).toVar();
      If(p.y.lessThan(.00001), () => {
        const qx = squared.x.mul(p.x).div(squared.x.sub(squared.y)).min(axes.x);
        closest.assign(vec2(qx, axes.y.mul(float(1).sub(qx.div(axes.x).pow(2)).max(0).sqrt())));
      }).Else(() => {
        const low = axes.y.mul(p.y).sub(squared.y).toVar();
        const high = axes.x.mul(p.length()).toVar();
        Loop(22, () => {
          const t = low.add(high).mul(.5);
          const q = axes.mul(p).div(squared.add(t));
          If(q.dot(q).greaterThan(1), () => {low.assign(t);}).Else(() => {high.assign(t);});
        });
        closest.assign(squared.mul(p).div(squared.add(low.add(high).mul(.5))));
      });
      const sign = p.div(axes).length().greaterThanEqual(1).select(1, -1);
      result.assign(p.sub(closest).length().mul(sign));
    });
    return result;
  })();
  material.fragmentNode = Fn(() => {
    const d = distance.toVar();
    If(d.greaterThan(widths.y.add(aa)), () => {Discard();});
    const inner = smoothstep(widths.x.negate().sub(aa), widths.x.negate().add(aa), d);
    const outer = float(1).sub(smoothstep(widths.y.sub(aa), widths.y.add(aa), d));
    // Transparent interiors still write depth: a front marble hides the outlines
    // of marbles behind it, while maze walls do not hide the marble silhouettes.
    return vec4(color, inner.mul(outer).mul(.5));
  })();
  material.depthNode = Fn(() => {
    const rayXY = pixel.sub(lens.zw).div(lens.xy);
    const depth = float(0).toVar();
    If(perspective.greaterThan(.5), () => {
      const ray = vec3(rayXY, 1), dot = ray.dot(sphere.xyz), squared = ray.dot(ray);
      const discriminant = dot.mul(dot).sub(squared.mul(sphere.xyz.dot(sphere.xyz).sub(sphere.w.mul(sphere.w))));
      const z = dot.sub(discriminant.max(0).sqrt()).div(squared).max(near);
      depth.assign(viewZToPerspectiveDepth(z.negate(), near, far));
    }).Else(() => {
      const offset = rayXY.sub(sphere.xy);
      const z = sphere.z.sub(sphere.w.mul(sphere.w).sub(offset.dot(offset)).max(0).sqrt()).max(near);
      depth.assign(viewZToOrthographicDepth(z.negate(), near, far));
    });
    return depth;
  })();
  const compositeMaterial = new T.MeshBasicNodeMaterial({transparent: true, depthTest: false, depthWrite: false, toneMapped: false});
  compositeMaterial.fragmentNode = texture(target.texture, uv());
  const composite = new T.QuadMesh(compositeMaterial);

  function reserve(count: number) {
    if (count <= capacity) return;
    mesh.geometry.dispose();
    capacity = 2 ** Math.ceil(Math.log2(Math.max(16, count)));
    geometry = new T.InstancedBufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0], 3));
    geometry.setIndex([0,1,2, 0,2,3]);
    for (const [name, width] of [['ellipse',4], ['ellipseRotation',2], ['sphere',4], ['outlineColor',3]] as const) {
      geometry.setAttribute(name, new T.InstancedBufferAttribute(new Float32Array(capacity * width), width).setUsage(T.DynamicDrawUsage));
    }
    mesh.geometry = geometry;
  }

  return {
    setWidths(inside: number, outside: number) {
      widths.value.set(Number.isFinite(inside) ? Math.max(0, inside) : 0, Number.isFinite(outside) ? Math.max(0, outside) : 0);
    },
    render(renderer: T.WebGPURenderer, camera: T.PerspectiveCamera | T.OrthographicCamera, marbles: readonly T.Mesh[]) {
      if (widths.value.x + widths.value.y === 0 || !marbles.some(m => m.visible)) return;
      renderer.getSize(size); renderer.getDrawingBufferSize(bufferSize);
      viewport.value.copy(size); aa.value = .5 / renderer.getPixelRatio();
      if (target.width !== bufferSize.x || target.height !== bufferSize.y) target.setSize(bufferSize.x, bufferSize.y);
      reserve(marbles.length);
      camera.updateMatrixWorld();
      const p = camera.projectionMatrix.elements, isPerspective = camera instanceof T.PerspectiveCamera;
      lens.value.set(p[0] * size.x / 2, p[5] * size.y / 2, (1 + (isPerspective ? -p[8] : p[12])) * size.x / 2, (1 + (isPerspective ? -p[9] : p[13])) * size.y / 2);
      near.value = camera.near; far.value = camera.far; perspective.value = +isPerspective;
      let count = 0;
      for (const marble of marbles) {
        if (!marble.visible) continue;
        marble.updateWorldMatrix(true, false);
        if (!marble.geometry.boundingSphere) marble.geometry.computeBoundingSphere();
        const bounds = marble.geometry.boundingSphere!;
        viewCenter.copy(bounds.center).applyMatrix4(marble.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        const radius = bounds.radius * marble.matrixWorld.getMaxScaleOnAxis();
        const e = projectSphere(viewCenter, radius, camera, size);
        if (!e) continue;
        const padding = e.a + widths.value.y + 1;
        if (e.x + padding < 0 || e.y + padding < 0 || e.x - padding > size.x || e.y - padding > size.y) continue;
        const base = (marble.material as T.MeshPhysicalNodeMaterial).color;
        geometry.getAttribute('ellipse').setXYZW(count, e.x, e.y, e.a, e.b);
        geometry.getAttribute('ellipseRotation').setXY(count, e.cos, e.sin);
        geometry.getAttribute('sphere').setXYZW(count, viewCenter.x, viewCenter.y, -viewCenter.z, radius);
        geometry.getAttribute('outlineColor').setXYZ(count, base.r, base.g, base.b);
        count++;
      }
      if (!count) return;
      geometry.instanceCount = count;
      for (const name of ['ellipse', 'ellipseRotation', 'sphere', 'outlineColor']) geometry.getAttribute(name).needsUpdate = true;
      const previousTarget = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      const clearColor = renderer.getClearColor(new T.Color()), clearAlpha = renderer.getClearAlpha();
      try {
        renderer.setRenderTarget(target); renderer.autoClear = true; renderer.setClearColor(0, 0);
        renderer.render(scene, camera);
        renderer.setRenderTarget(previousTarget); renderer.autoClear = false;
        composite.render(renderer);
      } finally {
        renderer.setRenderTarget(previousTarget); renderer.autoClear = autoClear; renderer.setClearColor(clearColor, clearAlpha);
      }
    },
    dispose() {mesh.geometry.dispose(); material.dispose(); compositeMaterial.dispose(); target.dispose();},
  };
}
