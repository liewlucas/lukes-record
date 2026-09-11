/**
 * The pine forest. One merged geometry — four stacked, noise-displaced cones on a tapered
 * trunk — drawn as a single InstancedMesh a few hundred times, with per-instance scale, lean and
 * tint, and a sway injected into the standard material's vertex stage.
 *
 * The silhouette matters more than the polygon count here: the cones are deliberately irregular
 * (radius pushed around per vertex by fbm) so no two trees repeat, and each tier is darker
 * underneath, which is what stops a low-poly conifer reading as a traffic cone.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CABIN } from '../layout';
import { fbm, mulberry32 } from '../noise';
import { PALETTE } from '../palette';
import { barkSurface } from '../textures';
import { terrainHeight, terrainSlope, trailXAt } from '../terrain';

interface Part {
  geometry: THREE.BufferGeometry;
  /** Per-vertex brightness multiplier baked into the colour attribute. */
  shade: (x: number, y: number, z: number) => number;
  tint: THREE.Color;
}

/** Merge position/normal/uv/color, indexed. Hand-rolled to keep BufferGeometryUtils out. */
function merge(parts: Part[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.geometry.attributes.position.count;
    indexCount += part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colours = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(indexCount);
  const tint = new THREE.Color();

  let vo = 0;
  let io = 0;
  for (const part of parts) {
    const p = part.geometry.attributes.position as THREE.BufferAttribute;
    const n = part.geometry.attributes.normal as THREE.BufferAttribute;
    const uv = part.geometry.attributes.uv as THREE.BufferAttribute | undefined;
    positions.set(p.array as Float32Array, vo * 3);
    normals.set(n.array as Float32Array, vo * 3);
    if (uv) uvs.set(uv.array as Float32Array, vo * 2);
    for (let i = 0; i < p.count; i++) {
      const shade = part.shade(p.getX(i), p.getY(i), p.getZ(i));
      tint.copy(part.tint).multiplyScalar(shade);
      colours[(vo + i) * 3] = tint.r;
      colours[(vo + i) * 3 + 1] = tint.g;
      colours[(vo + i) * 3 + 2] = tint.b;
    }
    const idx = part.geometry.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[io + i] = idx.getX(i) + vo;
      io += idx.count;
    } else {
      for (let i = 0; i < p.count; i++) indices[io + i] = i + vo;
      io += p.count;
    }
    vo += p.count;
    part.geometry.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * One tree, normalised so a unit instance scale means a one-metre tree. `tierCount` is the LOD
 * knob: four skirts for the trees beside the path, two for the ones filling the hillside.
 */
function pineGeometry(radialSegments: number, tierCount = 4): THREE.BufferGeometry {
  const canopy = new THREE.Color(PALETTE.moss);
  const bark = new THREE.Color('#4A3626');
  const allTiers = [
    { y: 0.3, r: 0.29, h: 0.34 },
    { y: 0.48, r: 0.245, h: 0.3 },
    { y: 0.66, r: 0.185, h: 0.26 },
    { y: 0.82, r: 0.11, h: 0.2 },
  ];
  // The far LOD keeps the bottom skirt and the crown, so the silhouette still tapers.
  const tiers = tierCount >= 4 ? allTiers : [{ y: 0.3, r: 0.29, h: 0.52 }, allTiers[3]];

  const parts: Part[] = tiers.map((tier, index) => {
    const cone = new THREE.ConeGeometry(tier.r, tier.h, radialSegments, 2, true);
    const position = cone.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const angle = Math.atan2(z, x);
      // Ragged branch tips: the radius wobbles with angle and with height up the tier.
      const wobble = 0.74 + fbm(Math.cos(angle) * 2.6 + index * 7, Math.sin(angle) * 2.6 + y * 6, 3) * 0.62;
      position.setXYZ(i, x * wobble, y + (fbm(angle * 3 + index, y * 9, 2) - 0.5) * tier.h * 0.16, z * wobble);
    }
    cone.computeVertexNormals();
    cone.translate(0, tier.y + tier.h / 2, 0);
    return {
      geometry: cone,
      tint: canopy,
      // Dark under each skirt, brighter where the sun reaches the top of the tier.
      shade: (_x, y) => {
        const local = (y - tier.y) / tier.h;
        return 0.42 + local * 0.78 + (index / tiers.length) * 0.16;
      },
    };
  });

  const trunk = new THREE.CylinderGeometry(0.028, 0.055, 0.42, Math.max(6, radialSegments - 4), 2, true);
  trunk.translate(0, 0.2, 0);
  parts.push({ geometry: trunk, tint: bark, shade: (_x, y) => 0.55 + y * 0.9 });

  return merge(parts);
}

interface Placement {
  x: number;
  y: number;
  z: number;
  height: number;
  spread: number;
  lean: number;
  rotation: number;
  shade: number;
  /** Beyond the corridor the camera ever walks through: gets the cheap geometry. */
  far: boolean;
}

/** Lateral distance from the trail past which a tree is never seen close up. */
const LOD_DISTANCE = 22;

function usePlacements(count: number): Placement[] {
  return useMemo(() => {
    const random = mulberry32(0x0cabf1);
    const out: Placement[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 12) {
      const z = 30 - random() * 314;
      const side = random() < 0.5 ? -1 : 1;
      // Density falls off from the path, so the corridor stays open and the flanks close in.
      const distance = 3.6 + random() ** 1.4 * 62;
      const x = trailXAt(Math.max(z, CABIN.zFront)) + distance * side;
      // Keep the cabin, its clearing, the porch and the path itself clear.
      if (Math.abs(x - trailXAt(z)) < 2.6) continue;
      if (Math.abs(x) < 10 && z < CABIN.zFront + 8 && z > CABIN.zBack - 14) continue;
      const y = terrainHeight(x, z);
      if (terrainSlope(x, z, 2) > 0.85) continue;
      const height = 5.5 + random() ** 1.5 * 11;
      out.push({
        x,
        y: y - 0.12,
        z,
        height,
        spread: 0.78 + random() * 0.42,
        lean: (random() - 0.5) * 0.075,
        rotation: random() * Math.PI * 2,
        shade: random(),
        far: distance > LOD_DISTANCE,
      });
    }
    return out;
  }, [count]);
}

/** Write one set of placements into an InstancedMesh. */
function useInstances(mesh: React.RefObject<THREE.InstancedMesh | null>, placements: Placement[]) {
  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const colour = new THREE.Color();
    const nearTint = new THREE.Color(PALETTE.moss);
    const farTint = new THREE.Color(PALETTE.pineShadow);

    placements.forEach((p, i) => {
      euler.set(p.lean, p.rotation, p.lean * 0.6);
      quaternion.setFromEuler(euler);
      scale.set(p.height * p.spread, p.height, p.height * p.spread * (0.92 + p.shade * 0.16));
      offset.set(p.x, p.y, p.z);
      matrix.compose(offset, quaternion, scale);
      target.setMatrixAt(i, matrix);
      target.setColorAt(i, colour.copy(nearTint).lerp(farTint, 0.18 + p.shade * 0.62));
    });

    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [mesh, placements]);
}

export default function Pines({ count, animate, shadows, radialSegments = 10 }: { count: number; animate: boolean; shadows: boolean; radialSegments?: number }) {
  const near = useRef<THREE.InstancedMesh>(null);
  const far = useRef<THREE.InstancedMesh>(null);
  const time = useMemo(() => ({ value: 0 }), []);
  const bark = useMemo(() => barkSurface(3), []);

  const nearGeometry = useMemo(() => pineGeometry(radialSegments, 4), [radialSegments]);
  const farGeometry = useMemo(() => pineGeometry(Math.max(5, radialSegments - 4), 2), [radialSegments]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      normalMap: bark.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      envMapIntensity: 0.55,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 treeOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 treeOrigin = vec3(0.0);
        #endif
        float swayPhase = uTime * 0.42 + treeOrigin.x * 0.19 + treeOrigin.z * 0.13;
        // Cubic falloff: the trunk holds still, the crown moves.
        float swayLift = pow(max(transformed.y, 0.0), 1.7);
        transformed.x += sin(swayPhase) * 0.026 * swayLift;
        transformed.z += cos(swayPhase * 0.81 + 1.7) * 0.018 * swayLift;`,
      );
    };
    m.customProgramCacheKey = () => 'cabin-pine';
    return m;
  }, [bark, time]);

  const placements = usePlacements(count);
  const nearPlacements = useMemo(() => placements.filter((p) => !p.far), [placements]);
  const farPlacements = useMemo(() => placements.filter((p) => p.far), [placements]);

  useInstances(near, nearPlacements);
  useInstances(far, farPlacements);

  useEffect(
    () => () => {
      nearGeometry.dispose();
      farGeometry.dispose();
      material.dispose();
    },
    [nearGeometry, farGeometry, material],
  );

  useFrame((state) => {
    if (animate) time.value = state.clock.elapsedTime;
  });

  return (
    <>
      {nearPlacements.length > 0 && (
        <instancedMesh ref={near} args={[nearGeometry, material, nearPlacements.length]} castShadow={shadows} receiveShadow={shadows} frustumCulled={false} />
      )}
      {farPlacements.length > 0 && (
        <instancedMesh ref={far} args={[farGeometry, material, farPlacements.length]} castShadow={shadows} frustumCulled={false} />
      )}
    </>
  );
}
