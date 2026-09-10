/**
 * The cabin from the outside: stacked log walls with real openings, a shingled pitched roof,
 * a stone chimney with a slow trail of smoke, and windows that glow amber and flicker.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CABIN } from '../layout';
import { mulberry32 } from '../noise';
import { PALETTE, SURFACE } from '../palette';
import { barkTexture, shingleTexture, stoneTexture, woodTexture } from '../textures';

const COURSE = 0.55;
const LOG_RADIUS = 0.31;
const OVERHANG = 0.55;

interface Opening {
  from: number;
  to: number;
  bottom: number;
  top: number;
}

const HALF = CABIN.halfWidth;
const DOOR_HALF = CABIN.doorWidth / 2;

const FRONT_OPENINGS: Opening[] = [
  { from: CABIN.frontDoorX - DOOR_HALF, to: CABIN.frontDoorX + DOOR_HALF, bottom: 0, top: CABIN.doorHeight },
  { from: -4.5, to: -2.7, bottom: 1.65, top: 2.95 },
  { from: 2.7, to: 4.5, bottom: 1.65, top: 2.95 },
];
const BACK_OPENINGS: Opening[] = [
  { from: CABIN.backDoorX - DOOR_HALF, to: CABIN.backDoorX + DOOR_HALF, bottom: 0, top: CABIN.doorHeight },
];
const LEFT_OPENINGS: Opening[] = [{ from: -104.4, to: -102.6, bottom: 1.65, top: 2.95 }];
const RIGHT_OPENINGS: Opening[] = [{ from: -108.4, to: -106.6, bottom: 1.65, top: 2.95 }];

/** Cut a course of logs around the openings it passes through. */
function courseSegments(from: number, to: number, y: number, openings: Opening[]): [number, number][] {
  let segments: [number, number][] = [[from, to]];
  for (const opening of openings) {
    if (y + LOG_RADIUS * 0.7 < opening.bottom || y - LOG_RADIUS * 0.7 > opening.top) continue;
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
  return segments.filter(([s, e]) => e - s > 0.15);
}

interface LogInstance {
  position: [number, number, number];
  length: number;
  axis: 'x' | 'z';
  radius: number;
  roll: number;
}

function buildLogs(): LogInstance[] {
  const random = mulberry32(0xc0ffee);
  const logs: LogInstance[] = [];
  const courses = Math.floor((CABIN.wallHeight - 0.2) / COURSE);

  for (let c = 0; c < courses; c++) {
    const y = 0.28 + c * COURSE;
    const jitter = () => (random() - 0.5) * 0.03;

    for (const [span, openings] of [
      [CABIN.zFront, FRONT_OPENINGS],
      [CABIN.zBack, BACK_OPENINGS],
    ] as const) {
      for (const [s, e] of courseSegments(-HALF - OVERHANG, HALF + OVERHANG, y, openings)) {
        logs.push({
          position: [(s + e) / 2, y + jitter(), span],
          length: e - s,
          axis: 'x',
          radius: LOG_RADIUS * (0.94 + random() * 0.12),
          roll: random() * Math.PI,
        });
      }
    }

    for (const [x, openings] of [
      [-HALF, LEFT_OPENINGS],
      [HALF, RIGHT_OPENINGS],
    ] as const) {
      for (const [s, e] of courseSegments(CABIN.zBack - OVERHANG, CABIN.zFront + OVERHANG, y, openings)) {
        logs.push({
          position: [x, y + COURSE / 2 + jitter(), (s + e) / 2],
          length: e - s,
          axis: 'z',
          radius: LOG_RADIUS * (0.94 + random() * 0.12),
          roll: random() * Math.PI,
        });
      }
    }
  }

  return logs;
}

function LogWalls({ shadows }: { shadows: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const logs = useMemo(() => buildLogs(), []);
  const bark = useMemo(() => barkTexture(), []);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const colour = new THREE.Color();
    const warm = new THREE.Color('#6B4F35');
    const cool = new THREE.Color('#4A3628');

    logs.forEach((log, i) => {
      if (log.axis === 'x') euler.set(0, log.roll, Math.PI / 2);
      else euler.set(Math.PI / 2, 0, log.roll);
      quaternion.setFromEuler(euler);
      scale.set(log.radius, log.length, log.radius);
      position.set(...log.position);
      matrix.compose(position, quaternion, scale);
      target.setMatrixAt(i, matrix);
      target.setColorAt(i, colour.copy(warm).lerp(cool, (i % 7) / 7));
    });

    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [logs]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, logs.length]} castShadow={shadows} receiveShadow={shadows} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, 10, 1]} />
      <meshStandardMaterial map={bark} roughness={0.95} metalness={0} />
    </instancedMesh>
  );
}

function Roof({ shadows }: { shadows: boolean }) {
  const shingles = useMemo(() => shingleTexture(), []);
  const timber = useMemo(() => woodTexture('wall'), []);

  const run = HALF + 0.95;
  const rise = CABIN.ridgeHeight - CABIN.wallHeight;
  const slope = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const depth = CABIN.zFront - CABIN.zBack + 2.2;
  const midZ = (CABIN.zFront + CABIN.zBack) / 2;

  const gable = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-HALF - 0.15, 0);
    shape.lineTo(HALF + 0.15, 0);
    shape.lineTo(0, CABIN.ridgeHeight - CABIN.wallHeight);
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 1);
  }, []);

  useEffect(() => () => gable.dispose(), [gable]);

  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[(side * run) / 2, (CABIN.wallHeight + CABIN.ridgeHeight) / 2, midZ]}
          rotation={[0, 0, -side * angle]}
          castShadow={shadows}
          receiveShadow={shadows}
        >
          <boxGeometry args={[slope, 0.2, depth]} />
          <meshStandardMaterial map={shingles} roughness={0.95} metalness={0} />
        </mesh>
      ))}

      {/* Gable ends, front and back. */}
      <mesh geometry={gable} position={[0, CABIN.wallHeight, CABIN.zFront + 0.02]}>
        <meshStandardMaterial map={timber} color="#6A5136" roughness={1} />
      </mesh>
      <mesh geometry={gable} position={[0, CABIN.wallHeight, CABIN.zBack - 0.02]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial map={timber} color="#6A5136" roughness={1} />
      </mesh>

      {/* Ridge beam. */}
      <mesh position={[0, CABIN.ridgeHeight + 0.06, midZ]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, depth, 8]} />
        <meshStandardMaterial color="#3A2A1D" roughness={1} />
      </mesh>
    </group>
  );
}

function Smoke({ animate }: { animate: boolean }) {
  const points = useRef<THREE.Points>(null);
  const count = 54;
  const origin = useMemo(() => new THREE.Vector3(-4.8, 8.6, -107.5), []);

  const geometry = useMemo(() => {
    const random = mulberry32(0x5c0c3);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (random() - 0.5) * 0.5;
      positions[i * 3 + 1] = origin.y + random() * 9;
      positions[i * 3 + 2] = origin.z + (random() - 0.5) * 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [origin]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    if (!animate || !points.current) return;
    const attribute = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < attribute.count; i++) {
      let y = attribute.getY(i) + delta * (0.5 + (i % 5) * 0.08);
      let x = attribute.getX(i) + Math.sin(t * 0.4 + i) * delta * 0.32;
      if (y > origin.y + 10) {
        y = origin.y;
        x = origin.x + ((i % 7) - 3) * 0.06;
      }
      attribute.setY(i, y);
      attribute.setX(i, x);
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial color="#D8CDBA" size={0.85} sizeAttenuation transparent opacity={0.16} depthWrite={false} />
    </points>
  );
}

function Chimney({ shadows }: { shadows: boolean }) {
  const stone = useMemo(() => stoneTexture(), []);
  return (
    <mesh position={[-4.8, 4.2, -107.5]} castShadow={shadows} receiveShadow={shadows}>
      <boxGeometry args={[1.25, 8.4, 1.25]} />
      <meshStandardMaterial map={stone} roughness={1} metalness={0} />
    </mesh>
  );
}

/** A window: frame, sill, and a pane that glows from the lamp inside. */
function Window({ position, rotationY, flicker }: { position: [number, number, number]; rotationY: number; flicker: { current: number } }) {
  const pane = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    if (pane.current) pane.current.emissiveIntensity = 1.05 * flicker.current;
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh>
        <planeGeometry args={[1.8, 1.3]} />
        <meshStandardMaterial ref={pane} color={SURFACE.glass} emissive={PALETTE.lampAmber} emissiveIntensity={1.05} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Frame and glazing bars. */}
      {[
        { args: [1.95, 0.12, 0.12] as [number, number, number], pos: [0, 0.68, 0.03] as [number, number, number] },
        { args: [1.95, 0.14, 0.16] as [number, number, number], pos: [0, -0.68, 0.05] as [number, number, number] },
        { args: [0.12, 1.4, 0.12] as [number, number, number], pos: [-0.92, 0, 0.03] as [number, number, number] },
        { args: [0.12, 1.4, 0.12] as [number, number, number], pos: [0.92, 0, 0.03] as [number, number, number] },
        { args: [0.07, 1.3, 0.07] as [number, number, number], pos: [0, 0, 0.04] as [number, number, number] },
      ].map((bar, i) => (
        <mesh key={i} position={bar.pos}>
          <boxGeometry args={bar.args} />
          <meshStandardMaterial color="#4A3628" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** A plank door, standing open against the wall so the walk continues straight through. */
function Door({ x, z, facing, open }: { x: number; z: number; facing: 1 | -1; open: number }) {
  const planks = useMemo(() => woodTexture('wall'), []);
  return (
    <group position={[x - DOOR_HALF, CABIN.floorY, z]} rotation={[0, facing * open, 0]}>
      <mesh position={[DOOR_HALF * facing, CABIN.doorHeight / 2 - 0.05, 0]} castShadow>
        <boxGeometry args={[CABIN.doorWidth, CABIN.doorHeight - 0.1, 0.09]} />
        <meshStandardMaterial map={planks} color="#7A5C3C" roughness={0.9} />
      </mesh>
      <mesh position={[DOOR_HALF * facing * 1.7, 1.05, 0.08]}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshStandardMaterial color={PALETTE.lampAmber} metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

export default function CabinShell({ shadows, animate }: { shadows: boolean; animate: boolean }) {
  const flicker = useRef(1);

  useFrame((state) => {
    if (!animate) {
      flicker.current = 1;
      return;
    }
    const t = state.clock.elapsedTime;
    flicker.current = 0.92 + Math.sin(t * 1.9) * 0.05 + Math.sin(t * 5.3) * 0.03;
  });

  return (
    <group>
      <LogWalls shadows={shadows} />
      <Roof shadows={shadows} />
      <Chimney shadows={shadows} />
      <Smoke animate={animate} />

      {/* Foundation course so the walls do not float on the grass. */}
      <mesh position={[0, 0.12, (CABIN.zFront + CABIN.zBack) / 2]} receiveShadow={shadows}>
        <boxGeometry args={[HALF * 2 + 1.2, 0.34, CABIN.zFront - CABIN.zBack + 1.2]} />
        <meshStandardMaterial color="#4E463D" roughness={1} />
      </mesh>

      <Window position={[-3.6, 2.3, CABIN.zFront + 0.02]} rotationY={0} flicker={flicker} />
      <Window position={[3.6, 2.3, CABIN.zFront + 0.02]} rotationY={0} flicker={flicker} />
      <Window position={[-HALF - 0.02, 2.3, -103.5]} rotationY={-Math.PI / 2} flicker={flicker} />
      <Window position={[HALF + 0.02, 2.3, -107.5]} rotationY={Math.PI / 2} flicker={flicker} />

      <Door x={CABIN.frontDoorX} z={CABIN.zFront} facing={-1} open={1.75} />
      <Door x={CABIN.backDoorX} z={CABIN.zBack} facing={1} open={1.7} />
    </group>
  );
}
