/**
 * Inside the cabin: plank floor, boarded ceiling on exposed beams, a big worn rug, the hearth
 * with its fire, an armchair turned toward it, the reading lamp on a side table, curtains at the
 * windows, a few framed prints, coat pegs by the door and a basket of logs.
 *
 * The room is 10.8 m by 11 m with a 2.7 m ceiling — small enough that the walls are always in
 * frame, which is the whole point: the cabin should feel occupied, not exhibited. The log walls
 * are shared with the exterior (they are round, so the same instances face both ways), which is
 * why there is no interior wall geometry here.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CABIN, CORNERS, WINDOW } from '../layout';
import { fbm, mulberry32 } from '../noise';
import { PALETTE, SURFACE } from '../palette';
import { kraftSurface, linenSurface, puffTexture, rugSurface, stoneSurface, woodSurface } from '../textures';

const INNER_WIDTH = CABIN.innerHalfWidth * 2;
const INNER_DEPTH = CABIN.innerFront - CABIN.innerBack;
const MID_Z = (CABIN.innerFront + CABIN.innerBack) / 2;
const CEILING = CABIN.wallHeight - 0.04;

/* -------------------------------------------------------------------------- shell */

function FloorAndCeiling({ shadows }: { shadows: boolean }) {
  const planks = useMemo(() => woodSurface('floor', 5, 6), []);
  const boards = useMemo(() => woodSurface('wall', 4, 8), []);
  const beam = useMemo(() => woodSurface('wall', 1, 3), []);

  const beams = useMemo(() => {
    const out: number[] = [];
    const count = 5;
    for (let i = 0; i < count; i++) out.push(CABIN.innerBack + ((i + 0.5) / count) * INNER_DEPTH);
    return out;
  }, []);

  return (
    <group>
      <mesh position={[0, CABIN.floorY, MID_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[INNER_WIDTH, INNER_DEPTH]} />
        <meshStandardMaterial
          map={planks.map}
          normalMap={planks.normalMap}
          normalScale={new THREE.Vector2(0.75, 0.75)}
          roughnessMap={planks.roughnessMap}
          color="#7A5C3E"
          roughness={0.72}
          metalness={0}
          envMapIntensity={0.35}
        />
      </mesh>

      <mesh position={[0, CEILING, (CABIN.zFront + CABIN.zBack) / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[CABIN.halfWidth * 2 + 0.6, CABIN.zFront - CABIN.zBack + 0.6]} />
        <meshStandardMaterial map={boards.map} normalMap={boards.normalMap} roughnessMap={boards.roughnessMap} color="#4E3A2A" roughness={0.9} metalness={0} envMapIntensity={0.25} />
      </mesh>

      {beams.map((z) => (
        <mesh key={z} position={[0, CEILING - 0.14, z]} castShadow={shadows} receiveShadow={shadows}>
          <boxGeometry args={[CABIN.halfWidth * 2 + 0.5, 0.22, 0.17]} />
          <meshStandardMaterial map={beam.map} normalMap={beam.normalMap} normalScale={beam.normalScale} color="#3F2E20" roughness={0.95} metalness={0} envMapIntensity={0.3} />
        </mesh>
      ))}

      {/* Skirting where the floor meets the logs, so the two never just intersect. */}
      {[
        { pos: [0, CABIN.floorY + 0.07, CABIN.innerFront] as [number, number, number], args: [INNER_WIDTH, 0.14, 0.06] as [number, number, number] },
        { pos: [0, CABIN.floorY + 0.07, CABIN.innerBack] as [number, number, number], args: [INNER_WIDTH, 0.14, 0.06] as [number, number, number] },
        { pos: [-CABIN.innerHalfWidth, CABIN.floorY + 0.07, MID_Z] as [number, number, number], args: [0.06, 0.14, INNER_DEPTH] as [number, number, number] },
        { pos: [CABIN.innerHalfWidth, CABIN.floorY + 0.07, MID_Z] as [number, number, number], args: [0.06, 0.14, INNER_DEPTH] as [number, number, number] },
      ].map((strip, i) => (
        <mesh key={i} position={strip.pos} receiveShadow={shadows}>
          <boxGeometry args={strip.args} />
          <meshStandardMaterial color="#3F2E20" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

function Rug() {
  const weave = useMemo(() => rugSurface(1), []);
  return (
    <group position={[-1.5, CABIN.floorY + 0.008, -101.9]} rotation={[0, 0.09, 0]}>
      <RoundedBox args={[4.4, 0.024, 3.4]} radius={0.07} smoothness={2} receiveShadow>
        <meshStandardMaterial
          map={weave.map}
          normalMap={weave.normalMap}
          normalScale={new THREE.Vector2(1.1, 1.1)}
          roughnessMap={weave.roughnessMap}
          roughness={1}
          metalness={0}
          envMapIntensity={0.3}
        />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 2.24, 0.004, 0]} receiveShadow>
          <boxGeometry args={[0.12, 0.014, 3.3]} />
          <meshStandardMaterial color={PALETTE.kraft} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- fire */

/** Layered billboards with a soft radial mask. Cheap, and with bloom on it reads as flame. */
function Flames({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const puff = useMemo(() => puffTexture(), []);
  const world = useMemo(() => new THREE.Vector3(), []);

  const tongues = useMemo(() => {
    const random = mulberry32(0xf1a3);
    return Array.from({ length: 8 }, (_, i) => ({
      key: i,
      x: (random() - 0.5) * 0.26,
      z: (random() - 0.5) * 0.62,
      scale: 0.2 + random() * 0.2,
      speed: 1.6 + random() * 2.4,
      phase: random() * Math.PI * 2,
      colour: i % 3 === 0 ? SURFACE.ember : i % 3 === 1 ? SURFACE.flame : '#FFD98A',
    }));
  }, []);

  useFrame(({ camera, clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const tongue = tongues[i];
      if (!tongue) return;
      const wobble = animate ? 0.72 + Math.abs(Math.sin(t * tongue.speed + tongue.phase)) * 0.62 : 1;
      child.scale.set(tongue.scale * (0.8 + wobble * 0.3), tongue.scale * 1.7 * wobble, 1);
      child.position.y = tongue.scale * 0.85 * wobble;
      child.getWorldPosition(world);
      child.rotation.y = Math.atan2(camera.position.x - world.x, camera.position.z - world.z);
    });
  });

  return (
    <group ref={group} position={[CORNERS.hearth.x + 0.58, CABIN.floorY + 0.22, CORNERS.hearth.z]}>
      {tongues.map((tongue) => (
        <mesh key={tongue.key} position={[tongue.x, 0.3, tongue.z]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={puff} color={tongue.colour} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Embers({ count, animate }: { count: number; animate: boolean }) {
  const points = useRef<THREE.Points>(null);
  const puff = useMemo(() => puffTexture(), []);
  const origin = useMemo(() => new THREE.Vector3(CORNERS.hearth.x + 0.58, CABIN.floorY + 0.28, CORNERS.hearth.z), []);

  const geometry = useMemo(() => {
    const random = mulberry32(0xe4be);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (random() - 0.5) * 0.45;
      positions[i * 3 + 1] = origin.y + random() * 1.5;
      positions[i * 3 + 2] = origin.z + (random() - 0.5) * 0.5;
      seeds[i] = random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData.seeds = seeds;
    return geo;
  }, [count, origin]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    if (!animate || !points.current) return;
    const attribute = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const seeds = points.current.geometry.userData.seeds as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < attribute.count; i++) {
      let y = attribute.getY(i) + delta * (0.5 + seeds[i] * 1.1);
      let x = attribute.getX(i) + Math.sin(t * 2.1 + seeds[i] * 12) * delta * 0.14;
      if (y > origin.y + 1.7) {
        y = origin.y;
        x = origin.x + (seeds[i] - 0.5) * 0.45;
      }
      attribute.setXYZ(i, x, y, attribute.getZ(i));
    }
    attribute.needsUpdate = true;
  });

  if (!count) return null;

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial map={puff} color="#FF9A45" size={0.04} sizeAttenuation transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

function Hearth({ animate, embers, shadows }: { animate: boolean; embers: number; shadows: boolean }) {
  const stone = useMemo(() => stoneSurface(2), []);
  const beam = useMemo(() => woodSurface('wall', 1, 2), []);
  const x = CORNERS.hearth.x;
  const z = CORNERS.hearth.z;

  return (
    <group>
      {/* Firebox surround: two jambs and a lintel, set into the wall opening. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[x + 0.3, CABIN.floorY + 0.6, z + side * 0.82]} castShadow={shadows} receiveShadow={shadows}>
          <boxGeometry args={[0.72, 1.2, 0.5]} />
          <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color="#635A50" roughness={1} metalness={0} envMapIntensity={0.4} />
        </mesh>
      ))}
      <mesh position={[x + 0.3, CABIN.floorY + 1.36, z]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[0.72, 0.32, 2.14]} />
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} color="#5B534A" roughness={1} metalness={0} />
      </mesh>
      {/* Breast above the lintel, carrying the flue up to the ceiling. */}
      <mesh position={[x + 0.16, CABIN.floorY + 2.05, z]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[0.44, 1.16, 1.8]} />
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} color="#5B534A" roughness={1} metalness={0} />
      </mesh>
      {/* Sooted back of the firebox. */}
      <mesh position={[x - 0.02, CABIN.floorY + 0.58, z]} rotation={[0, Math.PI / 2, 0]} receiveShadow={shadows}>
        <planeGeometry args={[1.1, 1.16]} />
        <meshStandardMaterial color={SURFACE.soot} roughness={1} metalness={0} />
      </mesh>
      {/* Hearthstone on the floor. */}
      <RoundedBox args={[1.05, 0.08, 1.86]} radius={0.022} smoothness={2} position={[x + 1.05, CABIN.floorY + 0.04, z]} receiveShadow={shadows}>
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} color="#6E655B" roughness={0.95} metalness={0} />
      </RoundedBox>
      {/* Mantel. */}
      <RoundedBox args={[0.88, 0.13, 2.26]} radius={0.024} smoothness={2} position={[x + 0.44, CABIN.floorY + 1.58, z]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={beam.map} normalMap={beam.normalMap} normalScale={beam.normalScale} color="#5A4029" roughness={0.85} metalness={0} envMapIntensity={0.6} />
      </RoundedBox>

      {/* Burning logs. */}
      {[
        { p: [0.58, 0.14, -0.2], r: [0, 0.4, Math.PI / 2] },
        { p: [0.56, 0.14, 0.2], r: [0, -0.3, Math.PI / 2] },
        { p: [0.6, 0.29, 0.0], r: [0.2, 0.9, Math.PI / 2] },
      ].map((log, i) => (
        <mesh key={i} position={[x + log.p[0], CABIN.floorY + log.p[1], z + log.p[2]]} rotation={log.r as [number, number, number]} castShadow={shadows}>
          <cylinderGeometry args={[0.055, 0.066, 0.58, 9]} />
          <meshStandardMaterial color="#2A1B12" emissive="#8A2E0C" emissiveIntensity={0.5} roughness={0.95} metalness={0} />
        </mesh>
      ))}
      {/* Glowing bed of coals. */}
      <mesh position={[x + 0.58, CABIN.floorY + 0.1, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 20]} />
        <meshStandardMaterial color="#3A1608" emissive="#FF6A1E" emissiveIntensity={1.5} roughness={1} metalness={0} toneMapped={false} />
      </mesh>

      <Flames animate={animate} />
      <Embers count={embers} animate={animate} />
      <LogBasket shadows={shadows} />
    </group>
  );
}

/** A woven basket of split logs on the hearthstone. */
function LogBasket({ shadows }: { shadows: boolean }) {
  const bark = useMemo(() => woodSurface('plank', 1, 2), []);
  const profile = useMemo(() => {
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      points.push(new THREE.Vector2(0.2 + t * 0.08, t * 0.26));
    }
    return points;
  }, []);

  const logs = useMemo(() => {
    const random = mulberry32(0x1067);
    return Array.from({ length: 7 }, () => ({
      x: (random() - 0.5) * 0.24,
      y: 0.2 + random() * 0.1,
      z: (random() - 0.5) * 0.24,
      tilt: (random() - 0.5) * 0.7,
      turn: random() * Math.PI,
      r: 0.035 + random() * 0.02,
    }));
  }, []);

  return (
    <group position={[CORNERS.hearth.x + 1.15, CABIN.floorY + 0.08, CORNERS.hearth.z + 1.15]}>
      <mesh castShadow={shadows} receiveShadow={shadows}>
        <latheGeometry args={[profile, 18]} />
        <meshStandardMaterial color="#8A6A42" roughness={0.95} metalness={0} side={THREE.DoubleSide} envMapIntensity={0.5} />
      </mesh>
      {logs.map((log, i) => (
        <mesh key={i} position={[log.x, log.y, log.z]} rotation={[log.tilt, log.turn, Math.PI / 2 + log.tilt * 0.4]} castShadow={shadows}>
          <cylinderGeometry args={[log.r, log.r * 1.1, 0.4, 8]} />
          <meshStandardMaterial map={bark.map} normalMap={bark.normalMap} color="#6B5138" roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------- soft goods */

/**
 * A drape: a strip of cloth whose vertices are pushed into folds by a sine, so it hangs rather
 * than hanging flat. Two per window, plus a brass rod.
 */
function Curtain({ width, height, folds, seed }: { width: number; height: number; folds: number; seed: number }) {
  const linen = useMemo(() => linenSurface(1.1), []);
  const geometry = useMemo(() => {
    const cols = folds * 4;
    const rows = 8;
    const geo = new THREE.PlaneGeometry(width, height, cols, rows);
    const position = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      // Folds are deepest at the top where the cloth is gathered, easing out toward the hem.
      const gather = 0.3 + 0.7 * ((y + height / 2) / height);
      const z = Math.sin((x / width) * Math.PI * 2 * folds + seed) * 0.022 * gather;
      position.setZ(i, z + (fbm(x * 3 + seed, y * 3, 2) - 0.5) * 0.012);
    }
    geo.computeVertexNormals();
    return geo;
  }, [width, height, folds, seed]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial
        map={linen.map}
        normalMap={linen.normalMap}
        roughnessMap={linen.roughnessMap}
        color="#6E5340"
        roughness={0.98}
        metalness={0}
        side={THREE.DoubleSide}
        envMapIntensity={0.4}
      />
    </mesh>
  );
}

function Curtains() {
  const drop = WINDOW.top - WINDOW.bottom + 0.42;
  const rodY = WINDOW.top + 0.18;
  const half = 0.52;

  /** [x, z, yaw] of each window's inside face. */
  const windows: [number, number, number][] = [
    [-3.05, CABIN.innerFront, 0],
    [3.05, CABIN.innerFront, 0],
    [1.2, CABIN.innerBack, Math.PI],
    [-CABIN.innerHalfWidth, -96.05, -Math.PI / 2],
    [CABIN.innerHalfWidth, -103.75, Math.PI / 2],
  ];

  return (
    <group>
      {windows.map(([x, z, yaw], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, yaw, 0]}>
          {/* Rod. */}
          <mesh position={[0, rodY, 0.09]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.014, 0.014, 1.95, 8]} />
            <meshStandardMaterial color={SURFACE.brass} metalness={0.8} roughness={0.34} envMapIntensity={1.2} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (0.52 + half / 2 - 0.06), rodY - drop / 2 - 0.03, 0.075]}>
              <Curtain width={half} height={drop} folds={3} seed={i * 3 + side} />
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

/** An armchair with a sagging seat cushion, turned toward the fire. */
function Armchair({ shadows }: { shadows: boolean }) {
  const linen = useMemo(() => linenSurface(1.4), []);
  const wood = useMemo(() => woodSurface('shelf', 1, 2), []);
  const seatY = CABIN.floorY + 0.4;

  const fabric = (
    <meshStandardMaterial
      map={linen.map}
      normalMap={linen.normalMap}
      normalScale={new THREE.Vector2(0.8, 0.8)}
      roughnessMap={linen.roughnessMap}
      color="#8A5A3E"
      roughness={0.98}
      metalness={0}
      envMapIntensity={0.35}
    />
  );

  return (
    <group position={[CORNERS.chair.x, 0, CORNERS.chair.z]} rotation={[0, CORNERS.chair.yaw, 0]}>
      {/* Body. */}
      <RoundedBox args={[0.86, 0.36, 0.82]} radius={0.09} smoothness={2} position={[0, seatY, 0]} castShadow={shadows} receiveShadow={shadows}>
        {fabric}
      </RoundedBox>
      {/* Seat cushion, sat in. */}
      <RoundedBox args={[0.7, 0.16, 0.66]} radius={0.07} smoothness={2} position={[0, seatY + 0.2, 0.02]} rotation={[0.05, 0, 0]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={linen.map} normalMap={linen.normalMap} color="#96654A" roughness={0.98} metalness={0} envMapIntensity={0.35} />
      </RoundedBox>
      {/* Back. */}
      <RoundedBox args={[0.86, 0.72, 0.2]} radius={0.08} smoothness={2} position={[0, seatY + 0.46, -0.34]} rotation={[-0.14, 0, 0]} castShadow={shadows} receiveShadow={shadows}>
        {fabric}
      </RoundedBox>
      {/* Arms. */}
      {[-1, 1].map((side) => (
        <RoundedBox key={side} args={[0.17, 0.3, 0.8]} radius={0.07} smoothness={2} position={[side * 0.36, seatY + 0.28, 0]} castShadow={shadows} receiveShadow={shadows}>
          {fabric}
        </RoundedBox>
      ))}
      {/* Legs. */}
      {[
        [-0.33, -0.31],
        [0.33, -0.31],
        [-0.33, 0.31],
        [0.33, 0.31],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, CABIN.floorY + 0.11, lz]} castShadow={shadows}>
          <cylinderGeometry args={[0.026, 0.034, 0.22, 8]} />
          <meshStandardMaterial map={wood.map} color="#5A4028" roughness={0.8} metalness={0} />
        </mesh>
      ))}
      {/* A blanket over one arm. */}
      <RoundedBox args={[0.2, 0.42, 0.5]} radius={0.05} smoothness={2} position={[-0.38, seatY + 0.3, 0.08]} rotation={[0, 0, 0.06]} castShadow={shadows}>
        <meshStandardMaterial color={PALETTE.moss} roughness={1} metalness={0} envMapIntensity={0.3} />
      </RoundedBox>
    </group>
  );
}

/* --------------------------------------------------------------------------- lamp */

function ReadingLamp({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => woodSurface('desk', 2, 3), []);
  const linen = useMemo(() => linenSurface(1.6), []);
  const x = CORNERS.lamp.x;
  const z = CORNERS.lamp.z;
  const tableTop = CABIN.floorY + 0.52;

  const legs = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      out.push([Math.cos(a) * 0.26, Math.sin(a) * 0.26]);
    }
    return out;
  }, []);

  return (
    <group position={[x, 0, z]}>
      {/* Round side table on three splayed legs. */}
      <mesh position={[0, tableTop, 0]} castShadow={shadows} receiveShadow={shadows}>
        <cylinderGeometry args={[0.36, 0.36, 0.04, 26]} />
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} normalScale={wood.normalScale} roughnessMap={wood.roughnessMap} color="#7A5C3C" roughness={0.55} metalness={0} envMapIntensity={0.8} />
      </mesh>
      <mesh position={[0, tableTop - 0.026, 0]}>
        <torusGeometry args={[0.36, 0.019, 6, 26]} />
        <meshStandardMaterial color="#5A4028" roughness={0.6} metalness={0} />
      </mesh>
      {legs.map(([lx, lz], i) => (
        <mesh key={i} position={[lx * 0.7, CABIN.floorY + (tableTop - CABIN.floorY) / 2, lz * 0.7]} rotation={[lz * 0.16, 0, -lx * 0.16]} castShadow={shadows}>
          <cylinderGeometry args={[0.016, 0.025, tableTop - CABIN.floorY, 8]} />
          <meshStandardMaterial color="#5A4028" roughness={0.7} metalness={0} />
        </mesh>
      ))}

      {/* Lamp: turned brass column, linen shade, hot inside. */}
      <mesh position={[0, tableTop + 0.05, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.1, 0.12, 0.04, 18]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.82} roughness={0.3} envMapIntensity={1.3} />
      </mesh>
      <mesh position={[0, tableTop + 0.25, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.025, 0.038, 0.4, 12]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.8} roughness={0.33} envMapIntensity={1.3} />
      </mesh>
      <mesh position={[0, tableTop + 0.56, 0]}>
        <cylinderGeometry args={[0.155, 0.235, 0.26, 24, 1, true]} />
        <meshStandardMaterial
          map={linen.map}
          normalMap={linen.normalMap}
          roughnessMap={linen.roughnessMap}
          color="#E8D2A6"
          emissive={PALETTE.lampAmber}
          emissiveIntensity={0.42}
          roughness={0.95}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* The bulb. Small and warm — the bloom threshold is set so only this and the fire lift. */}
      <mesh position={[0, tableTop + 0.53, 0]}>
        <sphereGeometry args={[0.042, 12, 9]} />
        <meshStandardMaterial color="#FFEFCF" emissive="#FFC061" emissiveIntensity={2.1} roughness={0.3} metalness={0} toneMapped={false} />
      </mesh>
      {/* A book left open on the table. */}
      <group position={[0.14, tableTop + 0.03, 0.11]} rotation={[0, 0.5, 0]}>
        <RoundedBox args={[0.22, 0.03, 0.16]} radius={0.006} smoothness={1} castShadow={shadows}>
          <meshStandardMaterial color={PALETTE.burntSienna} roughness={0.8} metalness={0} />
        </RoundedBox>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ wall dressing */

/** Framed prints hung on the log walls — scenery, not content; the photo line owns the CMS. */
function FramedPrints() {
  const paper = useMemo(() => kraftSurface(1, PALETTE.parchment, 'frame-paper'), []);
  const wood = useMemo(() => woodSurface('wall', 1, 2), []);

  const frames: { pos: [number, number, number]; yaw: number; w: number; h: number; tint: string }[] = [
    { pos: [CABIN.innerHalfWidth - 0.04, CABIN.floorY + 1.66, -98.3], yaw: -Math.PI / 2, w: 0.42, h: 0.54, tint: PALETTE.ridgeHaze },
    { pos: [CABIN.innerHalfWidth - 0.04, CABIN.floorY + 1.5, -97.5], yaw: -Math.PI / 2, w: 0.34, h: 0.28, tint: PALETTE.moss },
    { pos: [-1.65, CABIN.floorY + 1.7, CABIN.innerFront - 0.04], yaw: Math.PI, w: 0.38, h: 0.48, tint: '#7A6A58' },
  ];

  return (
    <group>
      {frames.map((frame, i) => (
        <group key={i} position={frame.pos} rotation={[0, frame.yaw, 0]}>
          <RoundedBox args={[frame.w, frame.h, 0.022]} radius={0.006} smoothness={1} castShadow>
            <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} color="#4A3628" roughness={0.8} metalness={0} envMapIntensity={0.6} />
          </RoundedBox>
          <mesh position={[0, 0, 0.013]}>
            <planeGeometry args={[frame.w - 0.05, frame.h - 0.05]} />
            <meshStandardMaterial map={paper.map} color={PALETTE.parchment} roughness={0.9} metalness={0} />
          </mesh>
          <mesh position={[0, 0, 0.014]}>
            <planeGeometry args={[frame.w - 0.13, frame.h - 0.13]} />
            <meshStandardMaterial color={frame.tint} roughness={0.75} metalness={0} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Coat pegs on a board beside the front door, with a coat and a hat on them. */
function CoatPegs({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => woodSurface('plank', 1, 2), []);
  return (
    <group position={[1.55, CABIN.floorY + 1.6, CABIN.innerFront - 0.02]}>
      <RoundedBox args={[0.86, 0.16, 0.045]} radius={0.012} smoothness={1} castShadow={shadows}>
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} color="#6B5138" roughness={0.82} metalness={0} envMapIntensity={0.6} />
      </RoundedBox>
      {[-0.28, 0, 0.28].map((px) => (
        <mesh key={px} position={[px, -0.01, 0.055]} rotation={[Math.PI / 2, 0, 0]} castShadow={shadows}>
          <cylinderGeometry args={[0.015, 0.019, 0.09, 8]} />
          <meshStandardMaterial color={SURFACE.brass} metalness={0.8} roughness={0.32} envMapIntensity={1.2} />
        </mesh>
      ))}
      {/* A coat on the middle peg. */}
      <mesh position={[-0.02, -0.42, 0.09]} rotation={[0.06, 0, 0.03]} castShadow={shadows}>
        <capsuleGeometry args={[0.15, 0.55, 4, 10]} />
        <meshStandardMaterial color={PALETTE.pineShadow} roughness={0.98} metalness={0} envMapIntensity={0.3} />
      </mesh>
      {/* A hat on the right one. */}
      <group position={[0.3, -0.06, 0.1]} rotation={[1.35, 0, 0]}>
        <mesh castShadow={shadows}>
          <cylinderGeometry args={[0.1, 0.115, 0.02, 16]} />
          <meshStandardMaterial color={PALETTE.walnut} roughness={0.95} metalness={0} />
        </mesh>
        <mesh position={[0, 0.05, 0]} castShadow={shadows}>
          <cylinderGeometry args={[0.062, 0.07, 0.09, 16]} />
          <meshStandardMaterial color={PALETTE.walnut} roughness={0.95} metalness={0} />
        </mesh>
      </group>
    </group>
  );
}

/** Dust in the lamp beam: tiny additive points, drifting, never settling. */
function Motes({ count, animate }: { count: number; animate: boolean }) {
  const points = useRef<THREE.Points>(null);
  const puff = useMemo(() => puffTexture(), []);

  const geometry = useMemo(() => {
    const random = mulberry32(0xd05c);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const radius = random() ** 0.6 * 2.2;
      const angle = random() * Math.PI * 2;
      positions[i * 3] = CORNERS.lamp.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = CABIN.floorY + 0.2 + random() * 2.0;
      positions[i * 3 + 2] = CORNERS.lamp.z + Math.sin(angle) * radius;
      seeds[i * 2] = random();
      seeds[i * 2 + 1] = random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData.seeds = seeds;
    return geo;
  }, [count]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    if (!animate || !points.current) return;
    const attribute = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const seeds = points.current.geometry.userData.seeds as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < attribute.count; i++) {
      const a = seeds[i * 2];
      const b = seeds[i * 2 + 1];
      let y = attribute.getY(i) + delta * (0.012 + a * 0.03);
      if (y > CABIN.floorY + 2.35) y = CABIN.floorY + 0.2;
      attribute.setXYZ(
        i,
        attribute.getX(i) + Math.sin(t * (0.1 + a * 0.2) + b * 8) * delta * 0.05,
        y,
        attribute.getZ(i) + Math.cos(t * (0.08 + b * 0.16) + a * 6) * delta * 0.05,
      );
    }
    attribute.needsUpdate = true;
  });

  if (!count) return null;

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial map={puff} color="#FFE3B0" size={0.016} sizeAttenuation transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/* ------------------------------------------------------------------------- export */

export default function Interior({ shadows, animate, motes, embers, detail }: { shadows: boolean; animate: boolean; motes: number; embers: number; detail: boolean }) {
  return (
    <group>
      <FloorAndCeiling shadows={shadows} />
      <Rug />
      <Hearth animate={animate} embers={embers} shadows={shadows} />
      <Armchair shadows={shadows} />
      <ReadingLamp shadows={shadows} />
      {detail && <Curtains />}
      {detail && <FramedPrints />}
      {detail && <CoatPegs shadows={shadows} />}
      <Motes count={motes} animate={animate} />
    </group>
  );
}
