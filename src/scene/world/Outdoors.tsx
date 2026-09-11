/**
 * Everything outside the cabin except the trees: the sky, the sun, the ground, the ridges
 * receding into haze, the valley mist, the worn path and the loose rock beside it.
 *
 * All procedural. The sky is a gradient written into a MeshBasicMaterial through
 * `onBeforeCompile`, which is a deliberate choice over a raw ShaderMaterial: it inherits three's
 * own tone-mapping and colour-space chunks, so the horizon grades identically whether the post
 * stack is running (high tier) or the renderer is drawing straight to the canvas (low tier).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CABIN } from '../layout';
import { fbm, mulberry32, ridged, smoothstep } from '../noise';
import { PALETTE, SURFACE } from '../palette';
import { glowTexture, groundSurface, mistTexture, pathSurface } from '../textures';
import { journeyState } from '../journey';
import { TRAIL_CURVE, terrainHeight, terrainSlope, trailXAt } from '../terrain';

/* ---------------------------------------------------------------------------- sky */

const SKY_PARS = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uBelow;
  uniform vec3 uSunColour;
  uniform vec3 uSunDir;
  varying vec3 vSkyDir;
`;

const SKY_BODY = /* glsl */ `
  vec3 dir = normalize(vSkyDir);
  float h = dir.y;
  vec3 sky = mix(uHorizon, uMid, smoothstep(-0.02, 0.24, h));
  sky = mix(sky, uZenith, smoothstep(0.16, 0.78, h));
  sky = mix(uBelow, sky, smoothstep(-0.16, 0.01, h));
  float toSun = max(dot(dir, normalize(uSunDir)), 0.0);
  // Two-lobe scattering: a tight halo round the disc, a broad wash across that side of the sky.
  float halo = pow(toSun, 60.0) * 0.85 + pow(toSun, 12.0) * 0.22;
  float wash = pow(toSun, 2.6) * 0.13 * smoothstep(-0.1, 0.5, h + 0.3);
  sky += uSunColour * (halo + wash);
  vec4 diffuseColor = vec4(sky, 1.0);
`;

interface SkyPalette {
  zenith: string;
  mid: string;
  horizon: string;
  below: string;
  sun: string;
}

const DAY: SkyPalette = { zenith: SURFACE.skyZenith, mid: SURFACE.skyMid, horizon: SURFACE.skyHorizon, below: SURFACE.skyBelow, sun: SURFACE.sunHalo };
const DUSK: SkyPalette = { zenith: SURFACE.duskZenith, mid: SURFACE.duskMid, horizon: SURFACE.duskHorizon, below: SURFACE.duskBelow, sun: '#E08A44' };

function Sky({ sunDir }: { sunDir: THREE.Vector3 }) {
  const mesh = useRef<THREE.Mesh>(null);

  const { material, uniforms } = useMemo(() => {
    const u = {
      uZenith: { value: new THREE.Color(DAY.zenith) },
      uMid: { value: new THREE.Color(DAY.mid) },
      uHorizon: { value: new THREE.Color(DAY.horizon) },
      uBelow: { value: new THREE.Color(DAY.below) },
      uSunColour: { value: new THREE.Color(DAY.sun) },
      uSunDir: { value: sunDir.clone() },
    };
    const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = `varying vec3 vSkyDir;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vSkyDir = normalize(position);',
      );
      shader.fragmentShader = `${SKY_PARS}\n${shader.fragmentShader}`.replace('vec4 diffuseColor = vec4( diffuse, opacity );', SKY_BODY);
    };
    m.customProgramCacheKey = () => 'cabin-sky';
    return { material: m, uniforms: u };
  }, [sunDir]);

  const day = useMemo(() => Object.fromEntries(Object.entries(DAY).map(([k, v]) => [k, new THREE.Color(v)])) as Record<keyof SkyPalette, THREE.Color>, []);
  const dusk = useMemo(() => Object.fromEntries(Object.entries(DUSK).map(([k, v]) => [k, new THREE.Color(v)])) as Record<keyof SkyPalette, THREE.Color>, []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera }) => {
    if (mesh.current) mesh.current.position.copy(camera.position);
    const t = journeyState.dusk;
    (uniforms.uZenith.value as THREE.Color).copy(day.zenith).lerp(dusk.zenith, t);
    (uniforms.uMid.value as THREE.Color).copy(day.mid).lerp(dusk.mid, t);
    (uniforms.uHorizon.value as THREE.Color).copy(day.horizon).lerp(dusk.horizon, t);
    (uniforms.uBelow.value as THREE.Color).copy(day.below).lerp(dusk.below, t);
    (uniforms.uSunColour.value as THREE.Color).copy(day.sun).lerp(dusk.sun, t);
  });

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={-1000} material={material}>
      <sphereGeometry args={[60, 48, 28]} />
    </mesh>
  );
}

/** The disc and its bloom, held at a fixed bearing from the eye so it never clips the far plane. */
function SunDisc({ sunDir, animate }: { sunDir: THREE.Vector3; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useMemo(() => glowTexture('rgba(255,248,228,0.95)', 'rgba(232,176,88,0.4)', 'sun-glow'), []);
  const drop = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, delta) => {
    const g = group.current;
    if (!g) return;
    const t = journeyState.dusk;
    // The sun sinks toward the ridge as dusk comes on.
    drop.copy(sunDir);
    drop.y -= t * 0.16;
    drop.normalize().multiplyScalar(320);
    g.position.copy(camera.position).add(drop);
    g.quaternion.copy(camera.quaternion);
    if (core.current) {
      const pulse = animate ? 1 + Math.sin(performance.now() * 0.0004) * 0.03 : 1;
      core.current.color.setRGB(2.1 * pulse, 1.85 * pulse - t * 0.6, 1.4 * pulse - t * 0.7);
    }
    if (halo.current) halo.current.opacity = 0.44 - t * 0.12;
    void delta;
  });

  return (
    <group ref={group} frustumCulled={false}>
      <mesh renderOrder={-900}>
        <circleGeometry args={[7.5, 40]} />
        <meshBasicMaterial ref={core} color="#FFF1D2" fog={false} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh position={[0, 0, -0.5]} renderOrder={-901}>
        <planeGeometry args={[150, 150]} />
        <meshBasicMaterial ref={halo} map={glow} transparent opacity={0.44} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} fog={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------------ terrain */

function Terrain({ segments }: { segments: number }) {
  const detail = useMemo(() => groundSurface(90), []);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(700, 700, segments, segments);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -110);

    const position = geo.attributes.position as THREE.BufferAttribute;
    const colours = new Float32Array(position.count * 3);
    const meadow = new THREE.Color(SURFACE.meadow);
    const moss = new THREE.Color(PALETTE.moss);
    const pine = new THREE.Color(PALETTE.pineShadow);
    const rock = new THREE.Color('#7E7669');
    const haze = new THREE.Color(PALETTE.ridgeHaze);
    const tint = new THREE.Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = terrainHeight(x, z);
      position.setY(i, y);

      const distance = Math.hypot(x, z + 40);
      const slope = terrainSlope(x, z, 2.4);
      tint.copy(meadow).lerp(moss, smoothstep(-0.6, 4, y));
      tint.lerp(pine, smoothstep(4, 15, y));
      // Steep faces lose their grass.
      tint.lerp(rock, smoothstep(0.5, 0.95, slope) * 0.8);
      // Aerial perspective, baked in so even unlit distance reads as far away.
      tint.lerp(haze, smoothstep(110, 400, distance) * 0.86);
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
      <meshStandardMaterial
        vertexColors
        map={detail.map}
        normalMap={detail.normalMap}
        normalScale={detail.normalScale}
        roughnessMap={detail.roughnessMap}
        roughness={1}
        metalness={0}
        envMapIntensity={0.6}
      />
    </mesh>
  );
}

/** Four silhouettes receding into haze, so the valley has a horizon to rest against. */
function Ridges() {
  const layers = useMemo(() => {
    const specs = [
      { z: -520, width: 1500, height: 165, seed: 3.1, haze: 0.94, y: -22 },
      { z: -430, width: 1200, height: 132, seed: 7.7, haze: 0.8, y: -20 },
      { z: -340, width: 980, height: 100, seed: 13.3, haze: 0.62, y: -17 },
      { z: -262, width: 800, height: 74, seed: 21.9, haze: 0.44, y: -14 },
    ];
    const haze = new THREE.Color(PALETTE.ridgeHaze);
    const skyward = new THREE.Color(SURFACE.skyMid);
    const rock = new THREE.Color(PALETTE.pineShadow);

    return specs.map((spec) => {
      const segments = 128;
      const shape = new THREE.Shape();
      const half = spec.width / 2;
      shape.moveTo(-half, -spec.height);
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = -half + spec.width * t;
        const shoulder = Math.sin(Math.PI * t) ** 0.42;
        const profile = ridged(t * 8 + spec.seed, spec.seed, 5) * 0.72 + fbm(t * 3.4 + spec.seed, spec.seed * 2, 4) * 0.5;
        shape.lineTo(x, profile * spec.height * shoulder);
      }
      shape.lineTo(half, -spec.height);
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape, 1);

      // Fade each ridge into the sky at its base: that is where the haze pools.
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const colours = new Float32Array(position.count * 3);
      const tint = new THREE.Color();
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        const up = smoothstep(-spec.height, spec.height * 0.7, y);
        tint.copy(haze).lerp(rock, (1 - spec.haze) * up);
        tint.lerp(skyward, (1 - up) * 0.55 + spec.haze * 0.18);
        colours[i * 3] = tint.r;
        colours[i * 3 + 1] = tint.g;
        colours[i * 3 + 2] = tint.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      return { geometry, z: spec.z, y: spec.y };
    });
  }, []);

  useEffect(() => () => layers.forEach((layer) => layer.geometry.dispose()), [layers]);

  return (
    <>
      {layers.map((layer) => (
        <mesh key={layer.z} geometry={layer.geometry} position={[0, layer.y, layer.z]} renderOrder={-800}>
          <meshBasicMaterial vertexColors fog={false} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

/** Slow banks of valley mist. Soft-edged sprites turned to face the eye. */
function Mist({ count, animate }: { count: number; animate: boolean }) {
  const texture = useMemo(() => mistTexture(), []);
  const group = useRef<THREE.Group>(null);

  const banks = useMemo(() => {
    const random = mulberry32(0x515a);
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      x: (random() - 0.5) * 240,
      y: 2 + random() * 11,
      z: -20 - random() * 360,
      scale: 70 + random() * 160,
      speed: 0.15 + random() * 0.4,
      opacity: 0.13 + random() * 0.2,
      phase: random() * Math.PI * 2,
    }));
  }, [count]);

  useFrame(({ camera, clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const bank = banks[i];
      if (!bank) return;
      if (animate) {
        child.position.x = bank.x + Math.sin(t * 0.018 * bank.speed + bank.phase) * 30;
        child.position.y = bank.y + Math.sin(t * 0.04 + bank.phase) * 0.6;
      }
      child.rotation.y = Math.atan2(camera.position.x - child.position.x, camera.position.z - child.position.z);
    });
  });

  return (
    <group ref={group}>
      {banks.map((bank) => (
        <mesh key={bank.key} position={[bank.x, bank.y, bank.z]} scale={[bank.scale, bank.scale * 0.3, 1]} renderOrder={-700}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={texture} transparent opacity={bank.opacity} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------------- path */

function TrailPath({ segments }: { segments: number }) {
  const surface = useMemo(() => pathSurface(), []);

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
      // The path wanders in width the way a walked path does.
      const width = 2.6 + Math.sin(t * 13.7) * 0.5 + fbm(t * 9, 3.2, 3) * 0.9;
      side.set(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
      const o = i * 6;
      const lx = point.x - side.x;
      const lz = point.z - side.z;
      const rx = point.x + side.x;
      const rz = point.z + side.z;
      positions[o] = lx;
      positions[o + 1] = terrainHeight(lx, lz) + 0.035;
      positions[o + 2] = lz;
      positions[o + 3] = rx;
      positions[o + 4] = terrainHeight(rx, rz) + 0.035;
      positions[o + 5] = rz;
      const u = i * 4;
      uvs[u] = 0;
      uvs[u + 1] = t * 42;
      uvs[u + 2] = 1;
      uvs[u + 3] = t * 42;
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
    <mesh geometry={geometry} receiveShadow renderOrder={1}>
      <meshStandardMaterial
        map={surface.map}
        alphaMap={surface.alphaMap}
        normalMap={surface.normalMap}
        normalScale={new THREE.Vector2(0.8, 0.8)}
        transparent
        roughness={1}
        metalness={0}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        envMapIntensity={0.4}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------------ litter */

/** Rounded field stones. Icosahedra pushed around by noise — no facets, no cubes. */
function Boulders({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const grit = useMemo(() => groundSurface(3), []);

  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const position = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const push = 0.72 + fbm(x * 1.6 + 4, z * 1.6 + y, 3) * 0.6;
      position.setXYZ(i, x * push, y * push * 0.72, z * push);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const placements = useMemo(() => {
    const random = mulberry32(0xb0d1e5);
    const out: { x: number; y: number; z: number; s: number; rx: number; ry: number; tint: number }[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 8) {
      const z = 28 - random() * 200;
      const side = random() < 0.5 ? -1 : 1;
      const x = trailXAt(Math.max(z, CABIN.zFront)) + (1.8 + random() ** 2 * 26) * side;
      if (Math.abs(x) < 11 && z < CABIN.zFront + 4 && z > CABIN.zBack - 10) continue;
      const s = 0.16 + random() ** 2.6 * 0.82;
      out.push({ x, y: terrainHeight(x, z) - s * 0.28, z, s, rx: random() * 0.5, ry: random() * Math.PI * 2, tint: random() });
    }
    return out;
  }, [count]);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const colour = new THREE.Color();
    const pale = new THREE.Color('#6B6357');
    const mossy = new THREE.Color(PALETTE.moss);
    placements.forEach((p, i) => {
      euler.set(p.rx, p.ry, p.rx * 0.4);
      quaternion.setFromEuler(euler);
      scale.set(p.s * (0.8 + p.tint * 0.5), p.s, p.s * (0.85 + (1 - p.tint) * 0.4));
      offset.set(p.x, p.y, p.z);
      matrix.compose(offset, quaternion, scale);
      target.setMatrixAt(i, matrix);
      target.setColorAt(i, colour.copy(pale).lerp(mossy, 0.15 + p.tint * 0.55));
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
    return () => geometry.dispose();
  }, [placements, geometry]);

  if (!placements.length) return null;

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, placements.length]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial
        normalMap={grit.normalMap}
        normalScale={new THREE.Vector2(1.4, 1.4)}
        roughnessMap={grit.roughnessMap}
        roughness={1}
        metalness={0}
        envMapIntensity={0.5}
      />
    </instancedMesh>
  );
}

/** Tufts of long grass along the verges: five tapered blades, merged, instanced. */
function Tufts({ count, animate }: { count: number; animate: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const time = useMemo(() => ({ value: 0 }), []);

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const normals: number[] = [];
    const colours: number[] = [];
    const random = mulberry32(919);
    const dark = new THREE.Color('#2F3A24');
    const light = new THREE.Color('#5C6940');
    const tint = new THREE.Color();
    for (let b = 0; b < 7; b++) {
      const angle = (b / 6) * Math.PI * 2 + random() * 0.6;
      const lean = 0.16 + random() * 0.4;
      const height = 0.13 + random() * 0.15;
      const width = 0.032 + random() * 0.02;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      // Two segments so a blade can curve.
      const tipX = dx * lean * height;
      const tipZ = dz * lean * height;
      const midX = tipX * 0.35;
      const midZ = tipZ * 0.35;
      const nx = -dz;
      const nz = dx;
      const quad = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w0: number, w1: number) => {
        const a = [x0 - nx * w0, y0, z0 - nz * w0];
        const bb = [x0 + nx * w0, y0, z0 + nz * w0];
        const c = [x1 + nx * w1, y1, z1 + nz * w1];
        const d = [x1 - nx * w1, y1, z1 - nz * w1];
        positions.push(...a, ...bb, ...c, ...a, ...c, ...d);
        for (let k = 0; k < 6; k++) normals.push(dx * 0.3, 0.94, dz * 0.3);
        for (let k = 0; k < 6; k++) {
          tint.copy(dark).lerp(light, (k < 2 ? y0 : y1) / height);
          colours.push(tint.r, tint.g, tint.b);
        }
      };
      quad(0, 0, 0, midX, height * 0.55, midZ, width, width * 0.7);
      quad(midX, height * 0.55, midZ, tipX, height, tipZ, width * 0.7, width * 0.08);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geo.computeBoundingSphere();
    return geo;
  }, []);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 tuftOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 tuftOrigin = vec3(0.0);
        #endif
        float bend = max(transformed.y, 0.0);
        transformed.x += sin(uTime * 1.1 + tuftOrigin.x * 0.7 + tuftOrigin.z * 0.4) * 0.13 * bend;
        transformed.z += cos(uTime * 0.86 + tuftOrigin.z * 0.6) * 0.09 * bend;`,
      );
    };
    m.customProgramCacheKey = () => 'cabin-tuft';
    return m;
  }, [time]);

  const placements = useMemo(() => {
    const random = mulberry32(0x7a5f);
    const out: { x: number; y: number; z: number; s: number; r: number }[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 8) {
      const z = 26 - random() * 146;
      const side = random() < 0.5 ? -1 : 1;
      const x = trailXAt(Math.max(z, CABIN.zFront)) + (1.3 + random() ** 1.8 * 8) * side;
      out.push({ x, y: terrainHeight(x, z) - 0.015, z, s: 0.55 + random() * 0.6, r: random() * Math.PI * 2 });
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
    placements.forEach((p, i) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r);
      scale.setScalar(p.s);
      offset.set(p.x, p.y, p.z);
      matrix.compose(offset, quaternion, scale);
      target.setMatrixAt(i, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [placements, geometry, material]);

  useFrame((state) => {
    if (animate) time.value = state.clock.elapsedTime;
  });

  if (!placements.length) return null;

  return <instancedMesh ref={mesh} args={[geometry, material, placements.length]} frustumCulled={false} />;
}

/* --------------------------------------------------------------------------- zone */

export interface OutdoorProps {
  terrainSegments: number;
  pathSegments: number;
  mist: number;
  animate: boolean;
  detail: boolean;
  sunDir: THREE.Vector3;
}

export default function Outdoors({ terrainSegments, pathSegments, mist, animate, detail, sunDir }: OutdoorProps) {
  return (
    <>
      <Sky sunDir={sunDir} />
      <SunDisc sunDir={sunDir} animate={animate} />
      <Terrain segments={terrainSegments} />
      <Ridges />
      <TrailPath segments={pathSegments} />
      {detail && <Boulders count={80} />}
      {detail && <Tufts count={430} animate={animate} />}
      <Mist count={mist} animate={animate} />
    </>
  );
}
