/**
 * Everything outside the cabin: sky, sun, terrain, ridges, mist, pines and the path underfoot.
 * All procedural — noise-displaced geometry and canvas textures, no asset files.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CABIN, TRAIL_POINTS } from '../layout';
import { clamp01, fbm, mulberry32, ridged, smoothstep } from '../noise';
import { PALETTE, SURFACE } from '../palette';
import { barkTexture, glowTexture, mistTexture, woodTexture } from '../textures';
import { journeyState } from '../journey';

/* ------------------------------------------------------------------ the trail spine */

export const TRAIL_CURVE = new THREE.CatmullRomCurve3(
  TRAIL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'centripetal',
  0.5,
);

const SPINE = Array.from({ length: 97 }, (_, i) => TRAIL_CURVE.getPoint(i / 96));

/** Where the path runs at a given depth (0 once you are past the cabin). */
function trailXAt(z: number): number {
  if (z >= SPINE[0].z) return SPINE[0].x;
  for (let i = 1; i < SPINE.length; i++) {
    if (z >= SPINE[i].z) {
      const t = (SPINE[i - 1].z - z) / (SPINE[i - 1].z - SPINE[i].z || 1);
      return SPINE[i - 1].x + (SPINE[i].x - SPINE[i - 1].x) * t;
    }
  }
  return SPINE[SPINE.length - 1].x;
}

/** Flat where the visitor walks and where the cabin stands; hills everywhere else. */
export function terrainHeight(x: number, z: number): number {
  const hills = (fbm(x * 0.011, z * 0.011, 4) - 0.42) * 16 + ridged(x * 0.0055, z * 0.0055, 3) * 13;
  const corridor = smoothstep(30, 10, Math.abs(x - trailXAt(z)));
  const clearing = smoothstep(56, 26, Math.hypot(x - CABIN.frontDoorX, z - (CABIN.zFront + CABIN.zBack) / 2));
  const flatten = clamp01(Math.max(corridor * 0.92, clearing));
  const bumps = (fbm(x * 0.14, z * 0.14, 2) - 0.5) * 0.45;
  return hills * (1 - flatten) + bumps * (0.3 + 0.7 * (1 - flatten));
}

/* ---------------------------------------------------------------------------- sky */

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uBelow;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
    sky = mix(uBelow, sky, smoothstep(-0.12, 0.02, h));
    float halo = pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 22.0);
    float wash = pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 3.0) * 0.22;
    gl_FragColor = vec4(sky + uSunColor * (halo * 0.65 + wash), 1.0);
    #include <colorspace_fragment>
  }
`;

function Sky({ sunDirection }: { sunDirection: THREE.Vector3 }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uZenith: { value: new THREE.Color(SURFACE.skyHigh) },
          uHorizon: { value: new THREE.Color(SURFACE.skyLow) },
          uBelow: { value: new THREE.Color('#B9A585') },
          uSunColor: { value: new THREE.Color('#FFE0A8') },
          uSunDir: { value: sunDirection.clone().normalize() },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [sunDirection],
  );

  useEffect(() => () => material.dispose(), [material]);

  // Golden hour cools into dusk as the visitor reaches the far end of the walk.
  const day = useMemo(
    () => ({
      zenith: new THREE.Color(SURFACE.skyHigh),
      horizon: new THREE.Color(SURFACE.skyLow),
      below: new THREE.Color('#B9A585'),
      sun: new THREE.Color('#FFE0A8'),
    }),
    [],
  );
  const dusk = useMemo(
    () => ({
      zenith: new THREE.Color(PALETTE.pineShadow),
      horizon: new THREE.Color('#C08A55'),
      below: new THREE.Color('#4A4238'),
      sun: new THREE.Color('#E2A163'),
    }),
    [],
  );

  useFrame(() => {
    const t = journeyState.dusk;
    const u = material.uniforms;
    (u.uZenith.value as THREE.Color).copy(day.zenith).lerp(dusk.zenith, t);
    (u.uHorizon.value as THREE.Color).copy(day.horizon).lerp(dusk.horizon, t);
    (u.uBelow.value as THREE.Color).copy(day.below).lerp(dusk.below, t);
    (u.uSunColor.value as THREE.Color).copy(day.sun).lerp(dusk.sun, t);
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[520, 40, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/* --------------------------------------------------------------------------- sun */

function Sun({ direction, animate }: { direction: THREE.Vector3; animate: boolean }) {
  const glow = useMemo(() => glowTexture('rgba(255,246,222,0.95)', 'rgba(226,170,80,0.42)', 'sun-glow'), []);
  const group = useRef<THREE.Group>(null);
  const disc = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    if (!group.current) return;
    // The sun sinks a little as dusk comes on.
    const drop = journeyState.dusk * 26;
    group.current.position.set(direction.x, direction.y - drop, direction.z);
    if (animate && disc.current) {
      disc.current.opacity = 0.92 + Math.sin(state.clock.elapsedTime * 0.35) * 0.05;
    }
  });

  return (
    <group ref={group} position={direction}>
      <mesh>
        <circleGeometry args={[13, 40]} />
        <meshBasicMaterial ref={disc} color={SURFACE.sunCore} transparent opacity={0.95} toneMapped={false} fog={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, -1]}>
        <planeGeometry args={[210, 210]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} opacity={0.85} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------------ terrain */

function Terrain({ segments }: { segments: number }) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(560, 520, segments, segments);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -170);

    const position = geo.attributes.position as THREE.BufferAttribute;
    const colours = new Float32Array(position.count * 3);
    const near = new THREE.Color(PALETTE.moss);
    const mid = new THREE.Color(PALETTE.pineShadow);
    const far = new THREE.Color(PALETTE.ridgeHaze);
    const grass = new THREE.Color('#7C8A5F');
    const tint = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = terrainHeight(x, z);
      position.setY(i, y);

      const distance = Math.hypot(x, z + 40);
      tint.copy(grass).lerp(near, smoothstep(-0.5, 3, y));
      tint.lerp(mid, smoothstep(3, 13, y));
      tint.lerp(far, smoothstep(120, 330, distance));
      colours[i * 3] = tint.r;
      colours[i * 3 + 1] = tint.g;
      colours[i * 3 + 2] = tint.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.computeVertexNormals();
    return geo;
  }, [segments]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

/** Far silhouettes beyond the terrain, so the valley has a horizon to rest against. */
function Ridges() {
  const layers = useMemo(() => {
    const out: { geometry: THREE.BufferGeometry; z: number; y: number; colour: string }[] = [];
    const specs = [
      { z: -420, width: 1200, height: 118, seed: 3.1, tint: 0.0, y: -14 },
      { z: -350, width: 900, height: 92, seed: 7.7, tint: 0.3, y: -12 },
      { z: -280, width: 700, height: 68, seed: 13.3, tint: 0.6, y: -10 },
    ];
    for (const spec of specs) {
      const segments = 96;
      const shape = new THREE.Shape();
      const half = spec.width / 2;
      shape.moveTo(-half, -spec.height);
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = -half + spec.width * t;
        const shoulder = Math.sin(Math.PI * t) ** 0.4;
        const profile = ridged(t * 7 + spec.seed, spec.seed, 4) * 0.75 + fbm(t * 3 + spec.seed, spec.seed * 2, 3) * 0.45;
        shape.lineTo(x, profile * spec.height * shoulder);
      }
      shape.lineTo(half, -spec.height);
      shape.closePath();
      out.push({
        geometry: new THREE.ShapeGeometry(shape, 1),
        z: spec.z,
        y: spec.y,
        colour: new THREE.Color(PALETTE.ridgeHaze).lerp(new THREE.Color(PALETTE.pineShadow), spec.tint).getStyle(),
      });
    }
    return out;
  }, []);

  useEffect(() => () => layers.forEach((layer) => layer.geometry.dispose()), [layers]);

  return (
    <>
      {layers.map((layer) => (
        <mesh key={layer.z} geometry={layer.geometry} position={[0, layer.y, layer.z]}>
          <meshBasicMaterial color={layer.colour} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** Slow banks of valley mist. Soft-edged sprites, so there is never a visible seam. */
function Mist({ count, animate }: { count: number; animate: boolean }) {
  const texture = useMemo(() => mistTexture(), []);
  const group = useRef<THREE.Group>(null);

  const banks = useMemo(() => {
    const random = mulberry32(0x515a);
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      x: (random() - 0.5) * 180,
      y: 1.5 + random() * 9,
      z: -30 - random() * 300,
      scale: 60 + random() * 130,
      speed: 0.15 + random() * 0.35,
      opacity: 0.16 + random() * 0.22,
      phase: random() * Math.PI * 2,
    }));
  }, [count]);

  useFrame((state) => {
    if (!animate || !group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const bank = banks[i];
      if (!bank) return;
      child.position.x = bank.x + Math.sin(t * 0.02 * bank.speed + bank.phase) * 26;
      child.position.y = bank.y + Math.sin(t * 0.05 + bank.phase) * 0.5;
    });
  });

  return (
    <group ref={group}>
      {banks.map((bank) => (
        <mesh key={bank.key} position={[bank.x, bank.y, bank.z]} scale={[bank.scale, bank.scale * 0.32, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={texture} transparent opacity={bank.opacity} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- pines */

/** One tree: three stacked, slightly irregular cones plus a trunk, merged into one geometry. */
function pineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tiers = [
    { y: 0.42, r: 0.52, h: 0.42 },
    { y: 0.62, r: 0.4, h: 0.36 },
    { y: 0.8, r: 0.26, h: 0.3 },
  ];
  for (const tier of tiers) {
    const cone = new THREE.ConeGeometry(tier.r, tier.h, 7, 1, true);
    cone.translate(0, tier.y, 0);
    parts.push(cone);
  }
  const trunk = new THREE.CylinderGeometry(0.045, 0.075, 0.5, 6);
  trunk.translate(0, 0.22, 0);
  parts.push(trunk);

  // Merge by hand (no BufferGeometryUtils import: keeps the bundle lean).
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.attributes.position.count;
    indexCount += part.index ? part.index.count : part.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(indexCount);
  let vo = 0;
  let io = 0;
  for (const part of parts) {
    const p = part.attributes.position as THREE.BufferAttribute;
    const n = part.attributes.normal as THREE.BufferAttribute;
    positions.set(p.array as Float32Array, vo * 3);
    normals.set(n.array as Float32Array, vo * 3);
    const idx = part.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[io + i] = idx.getX(i) + vo;
      io += idx.count;
    } else {
      for (let i = 0; i < p.count; i++) indices[io + i] = i + vo;
      io += p.count;
    }
    vo += p.count;
    part.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Sway injected into the standard material: cheap, per-instance, phase from world position. */
function addSway(material: THREE.Material, time: { value: number }, amount: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uSway = { value: amount };
    shader.vertexShader = `uniform float uTime;\nuniform float uSway;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 iOrigin = vec3(0.0);
      #endif
      float swayPhase = uTime * 0.55 + iOrigin.x * 0.21 + iOrigin.z * 0.17;
      float swayLift = max(transformed.y, 0.0);
      transformed.x += sin(swayPhase) * uSway * swayLift;
      transformed.z += cos(swayPhase * 0.77) * uSway * 0.6 * swayLift;`,
    );
  };
  material.customProgramCacheKey = () => 'cabin-sway';
}

function Pines({ count, animate, shadows }: { count: number; animate: boolean; shadows: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => pineGeometry(), []);
  const time = useMemo(() => ({ value: 0 }), []);
  const bark = useMemo(() => barkTexture(), []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, map: bark });
    // The bark map only really reads on the trunks; on the canopy it just breaks up the flat green.
    m.map!.repeat.set(2, 2);
    addSway(m, time, 0.02);
    return m;
  }, [bark, time]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  const placements = useMemo(() => {
    const random = mulberry32(0x0cabf1);
    const out: { x: number; z: number; y: number; scale: number; height: number; rotation: number; shade: number }[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 10) {
      const z = 30 - random() * 250;
      const side = random() < 0.5 ? -1 : 1;
      const distance = 4.2 + random() ** 1.5 * 46;
      const x = trailXAt(Math.max(z, CABIN.zFront)) + distance * side;
      // The cabin, its clearing and the porch keep their ground.
      if (Math.abs(x) < 11 && z < CABIN.zFront + 6 && z > CABIN.zBack - 12) continue;
      const height = 6 + random() * 9;
      out.push({
        x,
        z,
        y: terrainHeight(x, z),
        scale: (0.9 + random() * 0.7) * height,
        height,
        rotation: random() * Math.PI * 2,
        shade: random(),
      });
    }
    return out;
  }, [count]);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const colour = new THREE.Color();
    const canopyNear = new THREE.Color(PALETTE.moss);
    const canopyFar = new THREE.Color(PALETTE.pineShadow);

    placements.forEach((p, i) => {
      // A little irregularity: no two trees the same width or lean.
      const lean = (p.shade - 0.5) * 0.09;
      quaternion.setFromEuler(new THREE.Euler(lean, p.rotation, lean * 0.6));
      scale.set(p.height * (0.72 + p.shade * 0.3), p.height, p.height * (0.72 + (1 - p.shade) * 0.3));
      offset.set(p.x, p.y, p.z);
      matrix.compose(offset, quaternion, scale);
      target.setMatrixAt(i, matrix);
      target.setColorAt(i, colour.copy(canopyNear).lerp(canopyFar, 0.2 + p.shade * 0.65));
    });

    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [placements]);

  useFrame((state) => {
    if (animate) time.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, placements.length]}
      castShadow={shadows}
      receiveShadow={shadows}
      frustumCulled={false}
    />
  );
}

/* --------------------------------------------------------------------- the path */

function TrailPath({ segments }: { segments: number }) {
  const dirt = useMemo(() => woodTexture('floor'), []);
  const geometry = useMemo(() => {
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const uvs = new Float32Array((segments + 1) * 2 * 2);
    const indices: number[] = [];
    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      TRAIL_CURVE.getPoint(t, point);
      TRAIL_CURVE.getTangent(t, tangent);
      const width = 3.4 + Math.sin(t * 11) * 0.5;
      side.set(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
      const o = i * 6;
      const y = terrainHeight(point.x, point.z) + 0.05;
      positions[o] = point.x - side.x;
      positions[o + 1] = y;
      positions[o + 2] = point.z - side.z;
      positions[o + 3] = point.x + side.x;
      positions[o + 4] = y;
      positions[o + 5] = point.z + side.z;
      const u = i * 4;
      uvs[u] = 0;
      uvs[u + 1] = t * 26;
      uvs[u + 2] = 1;
      uvs[u + 3] = t * 26;
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [segments]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={dirt} color="#B49468" roughness={1} metalness={0} />
    </mesh>
  );
}

/* ------------------------------------------------------------------------- zone */

export interface OutdoorProps {
  trees: number;
  mist: number;
  segments: number;
  pathSegments: number;
  animate: boolean;
  shadows: boolean;
  sunDirection: THREE.Vector3;
}

export default function Outdoors({ trees, mist, segments, pathSegments, animate, shadows, sunDirection }: OutdoorProps) {
  return (
    <>
      <Sky sunDirection={sunDirection} />
      <Sun direction={sunDirection} animate={animate} />
      <Terrain segments={segments} />
      <Ridges />
      <TrailPath segments={pathSegments} />
      <Pines count={trees} animate={animate} shadows={shadows} />
      <Mist count={mist} animate={animate} />
    </>
  );
}
