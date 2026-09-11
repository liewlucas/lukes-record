/**
 * The cabin shell: stacked log walls with real openings, a shingled roof on visible rafters, a
 * field-stone chimney trailing smoke, glazed windows, two doors and a lantern.
 *
 * The logs are one InstancedMesh of capped cylinders. Because they are round and capped, the
 * same instances read as the outside wall, the inside wall, and the notched corner ends where
 * each course oversails the next — one draw call doing three jobs.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CABIN, CORNERS, PORCH, WINDOW } from '../layout';
import { mulberry32 } from '../noise';
import { PALETTE, SURFACE } from '../palette';
import { barkSurface, puffTexture, shingleSurface, stoneSurface, woodSurface } from '../textures';
import { journeyState } from '../journey';
import { terrainHeight } from '../terrain';

const COURSE = 0.34;
const LOG_RADIUS = 0.195;
const OVERHANG = 0.38;
const HALF = CABIN.halfWidth;
const DOOR_HALF = CABIN.doorWidth / 2;
const MID_Z = (CABIN.zFront + CABIN.zBack) / 2;
const DEPTH = CABIN.zFront - CABIN.zBack;

interface Opening {
  from: number;
  to: number;
  bottom: number;
  top: number;
}

const WINDOW_BOTTOM = WINDOW.bottom;
const WINDOW_TOP = WINDOW.top;
const WINDOW_MID = (WINDOW_BOTTOM + WINDOW_TOP) / 2;

const FRONT_OPENINGS: Opening[] = [
  { from: CABIN.frontDoorX - DOOR_HALF, to: CABIN.frontDoorX + DOOR_HALF, bottom: -1, top: CABIN.doorHeight },
  { from: -3.9, to: -2.2, bottom: WINDOW_BOTTOM, top: WINDOW_TOP },
  { from: 2.2, to: 3.9, bottom: WINDOW_BOTTOM, top: WINDOW_TOP },
];
const BACK_OPENINGS: Opening[] = [
  { from: CABIN.backDoorX - DOOR_HALF, to: CABIN.backDoorX + DOOR_HALF, bottom: -1, top: CABIN.doorHeight },
  { from: 0.4, to: 2.0, bottom: WINDOW_BOTTOM, top: WINDOW_TOP },
];
/** Left wall openings are quoted in z. The big one is the firebox. */
const LEFT_OPENINGS: Opening[] = [
  { from: -96.9, to: -95.2, bottom: WINDOW_BOTTOM, top: WINDOW_TOP },
  { from: -104.1, to: -102.1, bottom: -1, top: 1.42 },
];
const RIGHT_OPENINGS: Opening[] = [{ from: -104.6, to: -102.9, bottom: WINDOW_BOTTOM, top: WINDOW_TOP }];

/** Cut a course of logs around every opening it passes through. */
function courseSegments(from: number, to: number, y: number, openings: Opening[]): [number, number][] {
  let segments: [number, number][] = [[from, to]];
  for (const opening of openings) {
    if (y + LOG_RADIUS * 0.8 < opening.bottom || y - LOG_RADIUS * 0.8 > opening.top) continue;
    const next: [number, number][] = [];
    for (const [s, e] of segments) {
      if (opening.to <= s || opening.from >= e) {
        next.push([s, e]);
        continue;
      }
      if (s < opening.from) next.push([s, opening.from]);
      if (e > opening.to) next.push([opening.to, e]);
    }
    segments = next;
  }
  return segments.filter(([s, e]) => e - s > 0.12);
}

interface LogInstance {
  position: [number, number, number];
  length: number;
  axis: 'x' | 'z';
  radius: number;
  roll: number;
  shade: number;
}

function buildLogs(): LogInstance[] {
  const random = mulberry32(0xc0ffee);
  const logs: LogInstance[] = [];
  // Courses must reach the ceiling boards or daylight leaks in along the whole wall head.
  const courses = Math.ceil((CABIN.wallHeight - 0.2 - LOG_RADIUS) / COURSE) + 1;

  for (let c = 0; c < courses; c++) {
    const y = 0.2 + c * COURSE;
    const jitter = () => (random() - 0.5) * 0.022;
    // Alternate which pair of walls oversails, the way real corner notching works.
    const xRuns = c % 2 === 0;

    for (const [z, openings] of [
      [CABIN.zFront, FRONT_OPENINGS],
      [CABIN.zBack, BACK_OPENINGS],
    ] as const) {
      const reach = xRuns ? HALF + OVERHANG : HALF;
      for (const [s, e] of courseSegments(-reach, reach, y, openings)) {
        logs.push({
          position: [(s + e) / 2, y + jitter(), z],
          length: e - s,
          axis: 'x',
          radius: LOG_RADIUS * (0.93 + random() * 0.14),
          roll: random() * Math.PI,
          shade: random(),
        });
      }
    }

    for (const [x, openings] of [
      [-HALF, LEFT_OPENINGS],
      [HALF, RIGHT_OPENINGS],
    ] as const) {
      const from = xRuns ? CABIN.zBack : CABIN.zBack - OVERHANG;
      const to = xRuns ? CABIN.zFront : CABIN.zFront + OVERHANG;
      for (const [s, e] of courseSegments(from, to, y + COURSE / 2, openings)) {
        logs.push({
          position: [x, y + COURSE / 2 + jitter(), (s + e) / 2],
          length: e - s,
          axis: 'z',
          radius: LOG_RADIUS * (0.93 + random() * 0.14),
          roll: random() * Math.PI,
          shade: random(),
        });
      }
    }
  }

  return logs;
}

function LogWalls({ shadows, logs }: { shadows: boolean; logs: LogInstance[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const bark = useMemo(() => barkSurface(2), []);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const roll = new THREE.Quaternion();
    const align = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const colour = new THREE.Color();
    const warm = new THREE.Color('#7A5A3C');
    const cool = new THREE.Color('#4A3628');
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3(0, 0, 1);

    logs.forEach((log, i) => {
      // Spin the log about its own length first, then lay it down along the wall. Doing it the
      // other way round (a single Euler) swings the whole log out of the wall plane.
      roll.setFromAxisAngle(Y, log.roll);
      if (log.axis === 'x') align.setFromAxisAngle(Z, -Math.PI / 2);
      else align.setFromAxisAngle(X, Math.PI / 2);
      quaternion.copy(align).multiply(roll);
      scale.set(log.radius, log.length, log.radius);
      position.set(...log.position);
      matrix.compose(position, quaternion, scale);
      target.setMatrixAt(i, matrix);
      target.setColorAt(i, colour.copy(warm).lerp(cool, 0.15 + log.shade * 0.7));
    });

    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [logs]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, logs.length]} castShadow={shadows} receiveShadow={shadows} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, 12, 1]} />
      <meshStandardMaterial
        map={bark.map}
        normalMap={bark.normalMap}
        normalScale={new THREE.Vector2(0.7, 0.7)}
        roughnessMap={bark.roughnessMap}
        roughness={1}
        metalness={0}
        envMapIntensity={0.55}
      />
    </instancedMesh>
  );
}

/**
 * Chinking: the pale mortar packed between the courses. Built from the same segment list as the
 * logs, so it is cut around every door, window and the firebox without knowing what they are.
 */
function Chinking({ logs }: { logs: LogInstance[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    logs.forEach((log, i) => {
      if (log.axis === 'x') {
        euler.set(0, 0, 0);
        scale.set(log.length, COURSE * 0.98, LOG_RADIUS * 0.85);
      } else {
        euler.set(0, Math.PI / 2, 0);
        scale.set(log.length, COURSE * 0.98, LOG_RADIUS * 0.85);
      }
      quaternion.setFromEuler(euler);
      position.set(...log.position);
      matrix.compose(position, quaternion, scale);
      target.setMatrixAt(i, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [logs]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, logs.length]} receiveShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#6B5F4E" roughness={1} metalness={0} envMapIntensity={0.35} />
    </instancedMesh>
  );
}

/* --------------------------------------------------------------------------- roof */

function Roof({ shadows }: { shadows: boolean }) {
  const shingles = useMemo(() => shingleSurface(6), []);
  const timber = useMemo(() => woodSurface('wall', 2, 6), []);

  const run = HALF + 0.85;
  const rise = CABIN.ridgeHeight - CABIN.wallHeight;
  const slope = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const depth = DEPTH + 1.9;

  const gable = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-HALF - 0.1, 0);
    shape.lineTo(HALF + 0.1, 0);
    shape.lineTo(0, CABIN.ridgeHeight - CABIN.wallHeight);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  }, []);

  useEffect(() => () => gable.dispose(), [gable]);

  // Rafter tails poking out under the eaves.
  const rafters = useMemo(() => {
    const out: number[] = [];
    const count = Math.floor(depth / 0.82);
    for (let i = 0; i <= count; i++) out.push(CABIN.zBack - 1.2 + (i / count) * depth);
    return out;
  }, [depth]);

  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[(side * run) / 2, (CABIN.wallHeight + CABIN.ridgeHeight) / 2, MID_Z]}
            rotation={[0, 0, -side * angle]}
            castShadow={shadows}
            receiveShadow={shadows}
          >
            <boxGeometry args={[slope, 0.16, depth]} />
            <meshStandardMaterial
              map={shingles.map}
              normalMap={shingles.normalMap}
              normalScale={new THREE.Vector2(1.3, 1.3)}
              roughnessMap={shingles.roughnessMap}
              roughness={1}
              metalness={0}
              envMapIntensity={0.5}
            />
          </mesh>
          {/* Fascia board along the eave. */}
          <mesh position={[side * run, CABIN.wallHeight - rise * 0.02, MID_Z]} castShadow={shadows}>
            <boxGeometry args={[0.09, 0.24, depth]} />
            <meshStandardMaterial map={timber.map} normalMap={timber.normalMap} color="#4A3628" roughness={0.95} metalness={0} />
          </mesh>
        </group>
      ))}

      <RafterTails rafters={rafters} run={run} rise={rise} angle={angle} shadows={shadows} />

      {/* Gable ends. */}
      <mesh geometry={gable} position={[0, CABIN.wallHeight, CABIN.zFront - 0.02]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={timber.map} normalMap={timber.normalMap} normalScale={timber.normalScale} roughnessMap={timber.roughnessMap} color="#6A5136" roughness={1} metalness={0} />
      </mesh>
      <mesh geometry={gable} position={[0, CABIN.wallHeight, CABIN.zBack - 0.14]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={timber.map} normalMap={timber.normalMap} normalScale={timber.normalScale} roughnessMap={timber.roughnessMap} color="#6A5136" roughness={1} metalness={0} />
      </mesh>

      {/* Ridge cap. */}
      <mesh position={[0, CABIN.ridgeHeight + 0.04, MID_Z]} rotation={[Math.PI / 2, 0, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.15, 0.15, depth + 0.1, 12]} />
        <meshStandardMaterial color="#2F2318" roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}

/** The exposed rafter tails under both eaves, in one draw call. */
function RafterTails({ rafters, run, rise, angle, shadows }: { rafters: number[]; run: number; rise: number; angle: number; shadows: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    let i = 0;
    for (const z of rafters) {
      for (const side of [-1, 1]) {
        euler.set(0, 0, -side * angle);
        quaternion.setFromEuler(euler);
        position.set(side * (run - 0.36), CABIN.wallHeight + rise * (0.36 / run) - 0.16, z);
        matrix.compose(position, quaternion, scale);
        target.setMatrixAt(i++, matrix);
      }
    }
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [rafters, run, rise, angle]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, rafters.length * 2]} castShadow={shadows} frustumCulled={false}>
      <boxGeometry args={[0.8, 0.1, 0.11]} />
      <meshStandardMaterial color="#3A2A1D" roughness={1} metalness={0} />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------------ chimney */

function Chimney({ shadows }: { shadows: boolean }) {
  const stone = useMemo(() => stoneSurface(2.4), []);
  const base = terrainHeight(CABIN.chimneyX, CABIN.chimneyZ);
  const top = CABIN.ridgeHeight + 2.5;

  return (
    <group position={[CABIN.chimneyX, 0, CABIN.chimneyZ]}>
      {/* A slight batter: wider at the foot than at the flue. */}
      <RoundedBox args={[1.75, top - base, 1.6]} radius={0.09} smoothness={3} position={[0, base + (top - base) / 2, 0]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          map={stone.map}
          normalMap={stone.normalMap}
          normalScale={new THREE.Vector2(1.4, 1.4)}
          roughnessMap={stone.roughnessMap}
          roughness={1}
          metalness={0}
          envMapIntensity={0.6}
        />
      </RoundedBox>
      <RoundedBox args={[2.05, 0.2, 1.9]} radius={0.05} smoothness={3} position={[0, top + 0.08, 0]} castShadow={shadows}>
        <meshStandardMaterial color={SURFACE.stoneDark} roughness={0.95} metalness={0} />
      </RoundedBox>
      <mesh position={[0, top + 0.2, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.5]} />
        <meshStandardMaterial color={SURFACE.soot} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

/** Woodsmoke: soft sprites rising, swelling and thinning out. */
function Smoke({ count, animate }: { count: number; animate: boolean }) {
  const points = useRef<THREE.Points>(null);
  const puff = useMemo(() => puffTexture(), []);
  const origin = useMemo(() => new THREE.Vector3(CABIN.chimneyX, CABIN.ridgeHeight + 2.8, CABIN.chimneyZ), []);
  const rise = 13;

  const geometry = useMemo(() => {
    const random = mulberry32(0x5c0c3);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const t = random();
      positions[i * 3] = origin.x + (random() - 0.5) * 0.4;
      positions[i * 3 + 1] = origin.y + t * rise;
      positions[i * 3 + 2] = origin.z + (random() - 0.5) * 0.4;
      sizes[i] = 0.6 + t * 4.2;
      seeds[i] = random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.userData.seeds = seeds;
    return geo;
  }, [count, origin]);

  const material = useMemo(() => {
    const m = new THREE.PointsMaterial({
      map: puff,
      color: '#CFC4B2',
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      sizeAttenuation: true,
      size: 1,
    });
    // Per-point size. `size` is already a uniform in points_vert, hence the aSize attribute.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float aSize;\n${shader.vertexShader}`.replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    };
    m.customProgramCacheKey = () => 'cabin-smoke';
    return m;
  }, [puff]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state, delta) => {
    if (!animate || !points.current) return;
    const attribute = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sizes = points.current.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const seeds = points.current.geometry.userData.seeds as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < attribute.count; i++) {
      let y = attribute.getY(i) + delta * (0.55 + seeds[i] * 0.5);
      const life = (y - origin.y) / rise;
      let x = attribute.getX(i) + Math.sin(t * 0.5 + seeds[i] * 9) * delta * (0.3 + life * 0.9);
      let z = attribute.getZ(i) + Math.cos(t * 0.37 + seeds[i] * 7) * delta * (0.2 + life * 0.7);
      if (life > 1) {
        y = origin.y;
        x = origin.x + (seeds[i] - 0.5) * 0.4;
        z = origin.z + (seeds[i] - 0.5) * 0.4;
      }
      attribute.setXYZ(i, x, y, z);
      sizes.setX(i, 0.6 + Math.max(0, life) * 4.2);
    }
    attribute.needsUpdate = true;
    sizes.needsUpdate = true;
  });

  if (!count) return null;

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------------------ windows */

/**
 * A window: reveal, frame, glazing bars and a pane. On the high tier the pane is real physical
 * glass with a little transmission; below that it is a tinted, reflective surface, which reads
 * almost the same from outside and costs nothing.
 */
function Window({
  position,
  rotationY,
  glass,
  flicker,
  width = 1.42,
}: {
  position: [number, number, number];
  rotationY: number;
  glass: boolean;
  flicker: { current: number };
  width?: number;
}) {
  const timber = useMemo(() => woodSurface('wall', 1, 4), []);
  const inner = useRef<THREE.MeshStandardMaterial>(null);
  const height = 1.03;

  useFrame(() => {
    if (inner.current) inner.current.emissiveIntensity = (0.5 + journeyState.indoors * 0.35) * flicker.current * (1 + journeyState.dusk * 0.8);
  });

  const bars: { args: [number, number, number]; pos: [number, number, number] }[] = [
    { args: [width + 0.28, 0.14, 0.2], pos: [0, height / 2 + 0.08, 0.02] },
    { args: [width + 0.28, 0.17, 0.26], pos: [0, -height / 2 - 0.09, 0.05] },
    { args: [0.14, height + 0.3, 0.2], pos: [-width / 2 - 0.07, 0, 0.02] },
    { args: [0.14, height + 0.3, 0.2], pos: [width / 2 + 0.07, 0, 0.02] },
    { args: [0.045, height, 0.09], pos: [0, 0, 0.03] },
    { args: [width, 0.045, 0.09], pos: [0, 0, 0.03] },
  ];

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* The lit interior behind the glass — what you see from the trail. Front-facing only, so
          from inside the room the same window is simply a window and you look out of it. */}
      <mesh position={[0, 0, -0.1]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial ref={inner} color={SURFACE.glassLit} emissive={PALETTE.lampAmber} emissiveIntensity={0.6} roughness={1} metalness={0} side={THREE.FrontSide} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[width, height]} />
        {glass ? (
          <meshPhysicalMaterial
            transmission={0.82}
            thickness={0.035}
            ior={1.5}
            roughness={0.08}
            metalness={0}
            color="#DDE8EC"
            transparent
            side={THREE.DoubleSide}
          />
        ) : (
          <meshStandardMaterial color="#BFD2D8" roughness={0.12} metalness={0.06} transparent opacity={0.34} side={THREE.DoubleSide} envMapIntensity={2.2} />
        )}
      </mesh>
      {bars.map((bar, i) => (
        <mesh key={i} position={bar.pos} castShadow receiveShadow>
          <boxGeometry args={bar.args} />
          <meshStandardMaterial map={timber.map} normalMap={timber.normalMap} color="#4A3628" roughness={0.85} metalness={0} envMapIntensity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- doors */

function Door({ x, z, facing, open, handleSide }: { x: number; z: number; facing: 1 | -1; open: number; handleSide: 1 | -1 }) {
  const planks = useMemo(() => woodSurface('plank', 1, 4), []);
  const timber = useMemo(() => woodSurface('wall', 1, 5), []);

  return (
    <group position={[x, 0, z]}>
      {/* Frame. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (DOOR_HALF + 0.1), CABIN.doorHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.2, CABIN.doorHeight + 0.24, 0.34]} />
          <meshStandardMaterial map={timber.map} normalMap={timber.normalMap} color="#4A3628" roughness={0.9} metalness={0} />
        </mesh>
      ))}
      <mesh position={[0, CABIN.doorHeight + 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[CABIN.doorWidth + 0.4, 0.22, 0.34]} />
        <meshStandardMaterial map={timber.map} normalMap={timber.normalMap} color="#4A3628" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[CABIN.doorWidth + 0.4, 0.08, 0.42]} />
        <meshStandardMaterial color={SURFACE.stoneDark} roughness={0.95} metalness={0} />
      </mesh>

      {/* Leaf, hinged open against the wall so the walk goes straight through. */}
      <group position={[-DOOR_HALF * handleSide, 0, 0]} rotation={[0, facing * open, 0]}>
        <group position={[DOOR_HALF * handleSide, 0, 0]}>
          <RoundedBox args={[CABIN.doorWidth - 0.06, CABIN.doorHeight - 0.06, 0.075]} radius={0.014} smoothness={3} position={[0, CABIN.doorHeight / 2, 0]} castShadow receiveShadow>
            <meshStandardMaterial
              map={planks.map}
              normalMap={planks.normalMap}
              normalScale={planks.normalScale}
              roughnessMap={planks.roughnessMap}
              color="#7A5C3C"
              roughness={0.88}
              metalness={0}
              envMapIntensity={0.7}
            />
          </RoundedBox>
          {/* Two ledger battens across the planks. */}
          {[0.55, 1.62].map((y) => (
            <mesh key={y} position={[0, y, 0.05]} castShadow>
              <boxGeometry args={[CABIN.doorWidth - 0.16, 0.13, 0.035]} />
              <meshStandardMaterial color="#5A4028" roughness={0.9} metalness={0} />
            </mesh>
          ))}
          {/* Brass handle and a small back-plate. */}
          <mesh position={[handleSide * (DOOR_HALF - 0.2), 1.05, 0.07]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.16, 12]} />
            <meshStandardMaterial color={SURFACE.brass} metalness={0.85} roughness={0.28} envMapIntensity={1.4} />
          </mesh>
          <mesh position={[handleSide * (DOOR_HALF - 0.2), 1.05, 0.045]}>
            <circleGeometry args={[0.055, 16]} />
            <meshStandardMaterial color={SURFACE.brass} metalness={0.8} roughness={0.35} envMapIntensity={1.3} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** The lantern by a door: a glazed brass box with a hot filament inside. */
export function Lantern({ position, animate }: { position: [number, number, number]; animate: boolean }) {
  const core = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (!core.current) return;
    const flicker = animate ? 0.9 + Math.sin(state.clock.elapsedTime * 3.1) * 0.07 + Math.sin(state.clock.elapsedTime * 8.7) * 0.04 : 1;
    core.current.emissiveIntensity = (1.4 + journeyState.dusk * 2.6) * flicker;
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.24, 8]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.8} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.16, 0]} castShadow>
        <coneGeometry args={[0.13, 0.11, 8]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.85} roughness={0.3} envMapIntensity={1.4} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.095, 0.095, 0.22, 8, 1, true]} />
        <meshStandardMaterial color="#F5DFAF" emissive="#FFC46A" emissiveIntensity={1.4} roughness={0.25} metalness={0} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.045, 12, 10]} />
        <meshStandardMaterial ref={core} color="#FFE9BD" emissive="#FFB244" emissiveIntensity={1.4} roughness={0.4} metalness={0} />
      </mesh>
      <mesh position={[0, -0.13, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.085, 0.05, 8]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.85} roughness={0.32} envMapIntensity={1.4} />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------------------------- shell */

export default function Cabin({ shadows, animate, glass, smoke }: { shadows: boolean; animate: boolean; glass: boolean; smoke: number }) {
  const flicker = useRef(1);
  const logs = useMemo(() => buildLogs(), []);
  const stone = useMemo(() => stoneSurface(3), []);
  const stoopY = terrainHeight(0, CABIN.zFront + 1.1);

  useFrame((state) => {
    if (!animate) {
      flicker.current = 1;
      return;
    }
    const t = state.clock.elapsedTime;
    flicker.current = 0.9 + Math.sin(t * 1.9) * 0.06 + Math.sin(t * 5.3 + 0.7) * 0.04;
  });

  return (
    <group>
      {/* Rubble footing, so the walls are founded rather than floating. */}
      <RoundedBox args={[HALF * 2 + 0.9, 0.42, DEPTH + 0.9]} radius={0.06} smoothness={2} position={[0, 0.02, MID_Z]} receiveShadow={shadows} castShadow={shadows}>
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color="#5C5348" roughness={1} metalness={0} envMapIntensity={0.5} />
      </RoundedBox>

      <Chinking logs={logs} />
      <LogWalls shadows={shadows} logs={logs} />
      <Roof shadows={shadows} />
      <Chimney shadows={shadows} />
      <Smoke count={smoke} animate={animate} />

      <Window position={[-3.05, WINDOW_MID, CABIN.zFront + 0.06]} rotationY={0} glass={glass} flicker={flicker} />
      <Window position={[3.05, WINDOW_MID, CABIN.zFront + 0.06]} rotationY={0} glass={glass} flicker={flicker} />
      <Window position={[1.2, WINDOW_MID, CABIN.zBack - 0.06]} rotationY={Math.PI} glass={glass} flicker={flicker} width={1.32} />
      <Window position={[-HALF - 0.06, WINDOW_MID, -96.05]} rotationY={-Math.PI / 2} glass={glass} flicker={flicker} />
      <Window position={[HALF + 0.06, WINDOW_MID, -103.75]} rotationY={Math.PI / 2} glass={glass} flicker={flicker} />

      <Door x={CABIN.frontDoorX} z={CABIN.zFront} facing={-1} open={1.85} handleSide={1} />
      <Door x={CABIN.backDoorX} z={CABIN.zBack} facing={1} open={1.7} handleSide={-1} />

      {/* Front stoop: two flat stones up to the threshold. */}
      {[0, 1].map((i) => (
        <RoundedBox
          key={i}
          args={[2.4 - i * 0.35, 0.16, 0.7]}
          radius={0.04}
          smoothness={2}
          position={[0, stoopY + 0.08 + i * 0.15, CABIN.zFront + 1.15 - i * 0.55]}
          castShadow={shadows}
          receiveShadow={shadows}
        >
          <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} color="#6A6158" roughness={0.96} metalness={0} />
        </RoundedBox>
      ))}

      <Lantern position={[DOOR_HALF + 0.5, 2.32, CABIN.zFront + 0.22]} animate={animate} />
      <Lantern position={[CABIN.backDoorX + DOOR_HALF + 0.45, PORCH.deckY + 2.05, CABIN.zBack - 0.32]} animate={animate} />

      {/* A stack of split firewood against the front wall — the cabin is lived in. */}
      <Woodpile x={-3.4} z={CABIN.zFront + 0.72} shadows={shadows} />
      {/* Marks the hearth breast on the outside so the chimney has something to stand on. */}
      <mesh position={[CORNERS.hearth.x - 1.05, 1.35, CORNERS.hearth.z]} receiveShadow={shadows} castShadow={shadows}>
        <boxGeometry args={[1.9, 2.7, 1.95]} />
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color="#5F564C" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

/** Split logs, ends out, stacked in a rough rick. */
function Woodpile({ x, z, shadows }: { x: number; z: number; shadows: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const bark = useMemo(() => barkSurface(1.6), []);
  const y0 = terrainHeight(x, z);

  const logs = useMemo(() => {
    const random = mulberry32(0xf17e);
    const out: { x: number; y: number; z: number; r: number; roll: number; shade: number }[] = [];
    const rows = 5;
    for (let row = 0; row < rows; row++) {
      const across = 7 - Math.floor(row / 2);
      for (let i = 0; i < across; i++) {
        out.push({
          x: -0.9 + i * 0.26 + (random() - 0.5) * 0.04,
          y: 0.14 + row * 0.25 + (random() - 0.5) * 0.02,
          z: (random() - 0.5) * 0.06,
          r: 0.1 + random() * 0.035,
          roll: random() * Math.PI,
          shade: random(),
        });
      }
    }
    return out;
  }, []);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const colour = new THREE.Color();
    const pale = new THREE.Color('#C6A97C');
    const dark = new THREE.Color('#4A3626');
    logs.forEach((log, i) => {
      euler.set(Math.PI / 2, 0, log.roll);
      quaternion.setFromEuler(euler);
      scale.set(log.r, 0.7, log.r);
      offset.set(log.x, log.y, log.z);
      matrix.compose(offset, quaternion, scale);
      target.setMatrixAt(i, matrix);
      target.setColorAt(i, colour.copy(pale).lerp(dark, 0.2 + log.shade * 0.55));
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [logs]);

  return (
    <group position={[x, y0, z]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, logs.length]} castShadow={shadows} receiveShadow={shadows} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 10, 1]} />
        <meshStandardMaterial map={bark.map} normalMap={bark.normalMap} roughnessMap={bark.roughnessMap} roughness={1} metalness={0} envMapIntensity={0.5} />
      </instancedMesh>
    </group>
  );
}
