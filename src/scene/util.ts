/** Small procedural helpers shared by the zones. No assets: gray-box geometry only. */
import * as THREE from 'three';

/** Deterministic PRNG so a reload places the same trees in the same spots. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth mountain profile: three harmonics, seeded phases. 0..1 */
export function ridgeProfile(x: number, seed: number): number {
  const p = seed * 1.7;
  const a = Math.sin(x * 0.9 + p) * 0.5 + 0.5;
  const b = Math.abs(Math.sin(x * 2.3 + p * 1.9));
  const c = Math.sin(x * 5.1 + p * 3.3) * 0.5 + 0.5;
  return 0.34 + a * 0.42 + b * 0.16 + c * 0.08;
}

/**
 * Silhouette of a ridge as a closed shape: a displaced top edge dropped to a flat base.
 * Cheap (one triangulated polygon) and reads as a mountain from any distance.
 */
export function ridgeGeometry(width: number, height: number, seed: number, segments: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const half = width / 2;
  shape.moveTo(-half, -height);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = -half + width * t;
    // Ease the ends down so neighbouring layers overlap instead of butting together.
    const shoulder = Math.sin(Math.PI * t) ** 0.35;
    shape.lineTo(x, ridgeProfile(t * 12, seed) * height * shoulder);
  }
  shape.lineTo(half, -height);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 1);
}

/** Soft radial falloff, drawn once into a 128px canvas. Used for the sun glow and lamp bloom. */
export function radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.45, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A flat ribbon following a curve in the XZ plane — the trail underfoot. */
export function ribbonGeometry(curve: THREE.Curve<THREE.Vector3>, width: number, segments: number): THREE.BufferGeometry {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent);
    side.set(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
    const o = i * 6;
    positions[o] = point.x - side.x;
    positions[o + 1] = point.y;
    positions[o + 2] = point.z - side.z;
    positions[o + 3] = point.x + side.x;
    positions[o + 4] = point.y;
    positions[o + 5] = point.z + side.z;
    const u = i * 4;
    uvs[u] = 0;
    uvs[u + 1] = t;
    uvs[u + 2] = 1;
    uvs[u + 3] = t;
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export const DEG = Math.PI / 180;
