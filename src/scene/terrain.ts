/**
 * The shape of the ground, shared by everything that has to stand on it.
 *
 * One function, `terrainHeight`, is the single source of truth: the mesh is a displaced plane
 * sampled from it, the trees are placed on it, the path is laid over it and the cabin's clearing
 * is flattened by it. Nothing in the scene ever floats or sinks because nothing has its own idea
 * of where the ground is.
 */
import * as THREE from 'three';
import { CABIN, TRAIL_POINTS } from './layout';
import { clamp01, fbm, ridged, smoothstep } from './noise';

export const TRAIL_CURVE = new THREE.CatmullRomCurve3(
  TRAIL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'centripetal',
  0.5,
);

const SPINE = Array.from({ length: 129 }, (_, i) => TRAIL_CURVE.getPoint(i / 128));

/** Where the path runs at a given depth. */
export function trailXAt(z: number): number {
  if (z >= SPINE[0].z) return SPINE[0].x;
  for (let i = 1; i < SPINE.length; i++) {
    if (z >= SPINE[i].z) {
      const t = (SPINE[i - 1].z - z) / (SPINE[i - 1].z - SPINE[i].z || 1);
      return SPINE[i - 1].x + (SPINE[i].x - SPINE[i - 1].x) * t;
    }
  }
  return SPINE[SPINE.length - 1].x;
}

const CLEARING_Z = (CABIN.zFront + CABIN.zBack) / 2;

/**
 * Rolling hills, flattened into a corridor along the trail and into a level clearing around the
 * cabin. The `bumps` term keeps even the flat parts from reading as a table.
 */
export function terrainHeight(x: number, z: number): number {
  const hills = (fbm(x * 0.0092, z * 0.0092, 5) - 0.44) * 21 + ridged(x * 0.0048, z * 0.0048, 4) * 15;
  const valley = smoothstep(150, 34, Math.abs(x - trailXAt(z))) * 0.86;
  const corridor = smoothstep(26, 7.5, Math.abs(x - trailXAt(z)));
  const clearing = smoothstep(46, 22, Math.hypot(x - CABIN.frontDoorX, z - CLEARING_Z));
  const flatten = clamp01(Math.max(valley * 0.55, corridor * 0.96, clearing));
  const bumps = (fbm(x * 0.11, z * 0.11, 3) - 0.5) * 0.62 + (fbm(x * 0.44, z * 0.44, 2) - 0.5) * 0.13;
  return hills * (1 - flatten) + bumps * (0.22 + 0.78 * (1 - flatten));
}

/** Slope in radians, sampled with a small central difference. Used for scattering and colour. */
export function terrainSlope(x: number, z: number, step = 1.2): number {
  const dx = terrainHeight(x + step, z) - terrainHeight(x - step, z);
  const dz = terrainHeight(x, z + step) - terrainHeight(x, z - step);
  return Math.atan(Math.hypot(dx, dz) / (2 * step));
}
