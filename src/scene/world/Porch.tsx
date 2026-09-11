/**
 * The porch at the back: a boarded deck under a shed roof, a turned railing, three steps down to
 * the grass, a letterbox on its post and the brass plaques beside the door.
 *
 * This is the last thing on the walk and the only part of the world lit by dusk rather than by
 * golden hour, so the materials lean on the environment map and the door lantern rather than the
 * sun, which by now is nearly down.
 */
import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CABIN, PORCH } from '../layout';
import { mulberry32 } from '../noise';
import { PALETTE, SURFACE } from '../palette';
import { shingleSurface, woodSurface } from '../textures';
import { terrainHeight } from '../terrain';

const DEPTH = PORCH.zFront - PORCH.zEdge;
const MID_Z = (PORCH.zFront + PORCH.zEdge) / 2;
const STEP_X = 1.2;
const STEP_WIDTH = 2.3;

function Deck({ shadows }: { shadows: boolean }) {
  const planks = useMemo(() => woodSurface('plank', 4, 7), []);
  const joist = useMemo(() => woodSurface('wall', 1, 2), []);

  return (
    <group>
      <mesh position={[0, PORCH.deckY - 0.03, MID_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows} castShadow={shadows}>
        <planeGeometry args={[PORCH.halfWidth * 2, DEPTH]} />
        <meshStandardMaterial
          map={planks.map}
          normalMap={planks.normalMap}
          normalScale={new THREE.Vector2(0.9, 0.9)}
          roughnessMap={planks.roughnessMap}
          color="#6A5138"
          roughness={0.85}
          metalness={0}
          envMapIntensity={0.6}
        />
      </mesh>
      {/* Rim joist all the way round, so the deck has a thickness. */}
      <mesh position={[0, PORCH.deckY - 0.11, PORCH.zEdge]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[PORCH.halfWidth * 2, 0.2, 0.09]} />
        <meshStandardMaterial map={joist.map} normalMap={joist.normalMap} color="#4A3628" roughness={0.9} metalness={0} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * PORCH.halfWidth, PORCH.deckY - 0.11, MID_Z]} castShadow={shadows} receiveShadow={shadows}>
          <boxGeometry args={[0.09, 0.2, DEPTH]} />
          <meshStandardMaterial map={joist.map} normalMap={joist.normalMap} color="#4A3628" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

function Steps({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => woodSurface('plank', 2, 3), []);
  const groundY = terrainHeight(STEP_X, PORCH.zEdge - 0.9);
  const rise = (PORCH.deckY - groundY) / PORCH.steps;

  return (
    <group position={[STEP_X, 0, PORCH.zEdge]}>
      {Array.from({ length: PORCH.steps }, (_, i) => (
        <RoundedBox
          key={i}
          args={[STEP_WIDTH, rise * 0.55, 0.36]}
          radius={0.014}
          smoothness={2}
          position={[0, PORCH.deckY - rise * (i + 0.5), -0.2 - i * 0.34]}
          castShadow={shadows}
          receiveShadow={shadows}
        >
          <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} normalScale={wood.normalScale} color="#6A5138" roughness={0.88} metalness={0} envMapIntensity={0.5} />
        </RoundedBox>
      ))}
    </group>
  );
}

/** Turned balusters between a top and bottom rail, skipping the step opening. */
function Railing({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => woodSurface('shelf', 2, 3), []);

  const runs = useMemo(() => {
    const out: { from: [number, number]; to: [number, number] }[] = [];
    // Along the front edge, either side of the steps.
    out.push({ from: [-PORCH.halfWidth, PORCH.zEdge], to: [STEP_X - STEP_WIDTH / 2 - 0.12, PORCH.zEdge] });
    out.push({ from: [STEP_X + STEP_WIDTH / 2 + 0.12, PORCH.zEdge], to: [PORCH.halfWidth, PORCH.zEdge] });
    // Down both sides, stopping short of the cabin wall.
    out.push({ from: [-PORCH.halfWidth, PORCH.zEdge], to: [-PORCH.halfWidth, PORCH.zFront - 0.6] });
    out.push({ from: [PORCH.halfWidth, PORCH.zEdge], to: [PORCH.halfWidth, PORCH.zFront - 0.6] });
    return out;
  }, []);

  const balusters = useMemo(() => {
    const random = mulberry32(0xba15);
    const out: { x: number; z: number; jitter: number }[] = [];
    for (const run of runs) {
      const dx = run.to[0] - run.from[0];
      const dz = run.to[1] - run.from[1];
      const length = Math.hypot(dx, dz);
      const count = Math.max(2, Math.round(length / 0.24));
      for (let i = 1; i < count; i++) {
        const t = i / count;
        out.push({ x: run.from[0] + dx * t, z: run.from[1] + dz * t, jitter: (random() - 0.5) * 0.012 });
      }
    }
    return out;
  }, [runs]);

  return (
    <group>
      {runs.map((run, i) => {
        const dx = run.to[0] - run.from[0];
        const dz = run.to[1] - run.from[1];
        const length = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        const cx = (run.from[0] + run.to[0]) / 2;
        const cz = (run.from[1] + run.to[1]) / 2;
        return (
          <group key={i} position={[cx, 0, cz]} rotation={[0, angle, 0]}>
            <RoundedBox args={[0.09, 0.075, length]} radius={0.018} smoothness={2} position={[0, PORCH.deckY + PORCH.railHeight, 0]} castShadow={shadows} receiveShadow={shadows}>
              <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} normalScale={wood.normalScale} color="#6B5138" roughness={0.8} metalness={0} envMapIntensity={0.6} />
            </RoundedBox>
            <RoundedBox args={[0.06, 0.05, length]} radius={0.012} smoothness={2} position={[0, PORCH.deckY + 0.14, 0]} castShadow={shadows}>
              <meshStandardMaterial color="#5A4028" roughness={0.82} metalness={0} />
            </RoundedBox>
          </group>
        );
      })}
      <Balusters balusters={balusters} shadows={shadows} />
    </group>
  );
}

/** Ninety turned balusters in one draw call. */
function Balusters({ balusters, shadows }: { balusters: { x: number; z: number; jitter: number }[]; shadows: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    balusters.forEach((b, i) => {
      euler.set(b.jitter, 0, b.jitter);
      quaternion.setFromEuler(euler);
      position.set(b.x, PORCH.deckY + (PORCH.railHeight + 0.14) / 2, b.z);
      matrix.compose(position, quaternion, scale);
      target.setMatrixAt(i, matrix);
    });
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [balusters]);

  if (!balusters.length) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, balusters.length]} castShadow={shadows} frustumCulled={false}>
      <cylinderGeometry args={[0.019, 0.024, PORCH.railHeight - 0.1, 8]} />
      <meshStandardMaterial color="#5F452C" roughness={0.84} metalness={0} envMapIntensity={0.5} />
    </instancedMesh>
  );
}

function Canopy({ shadows }: { shadows: boolean }) {
  const shingles = useMemo(() => shingleSurface(4), []);
  const timber = useMemo(() => woodSurface('wall', 1, 3), []);
  const eaveY = PORCH.deckY + PORCH.postHeight;
  const wallY = eaveY + 0.9;
  const run = DEPTH + 0.5;
  const slope = Math.hypot(run, wallY - eaveY);
  const angle = Math.atan2(wallY - eaveY, run);

  const posts: [number, number][] = [
    [-PORCH.halfWidth + 0.16, PORCH.zEdge + 0.16],
    [PORCH.halfWidth - 0.16, PORCH.zEdge + 0.16],
    [-PORCH.halfWidth + 0.16, MID_Z],
    [PORCH.halfWidth - 0.16, MID_Z],
  ];

  return (
    <group>
      {posts.map(([x, z], i) => (
        <group key={i}>
          <RoundedBox args={[0.16, PORCH.postHeight, 0.16]} radius={0.026} smoothness={2} position={[x, PORCH.deckY + PORCH.postHeight / 2, z]} castShadow={shadows} receiveShadow={shadows}>
            <meshStandardMaterial map={timber.map} normalMap={timber.normalMap} normalScale={timber.normalScale} color="#6B5138" roughness={0.82} metalness={0} envMapIntensity={0.6} />
          </RoundedBox>
          {/* Bracket where the post meets the beam. */}
          <mesh position={[x, PORCH.deckY + PORCH.postHeight - 0.22, z + (z > MID_Z ? -0.16 : 0.16)]} rotation={[Math.PI / 4, 0, 0]} castShadow={shadows}>
            <boxGeometry args={[0.1, 0.42, 0.08]} />
            <meshStandardMaterial color="#5A4028" roughness={0.85} metalness={0} />
          </mesh>
        </group>
      ))}

      {/* Head beams along both sides. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (PORCH.halfWidth - 0.16), eaveY + 0.09, MID_Z + 0.1]} castShadow={shadows} receiveShadow={shadows}>
          <boxGeometry args={[0.18, 0.2, DEPTH + 0.2]} />
          <meshStandardMaterial map={timber.map} normalMap={timber.normalMap} color="#5A4028" roughness={0.85} metalness={0} />
        </mesh>
      ))}

      {/* Shed roof, sloping back up to the cabin wall. */}
      <mesh position={[0, (eaveY + wallY) / 2 + 0.16, MID_Z + 0.1]} rotation={[angle, 0, 0]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[PORCH.halfWidth * 2 + 0.5, 0.13, slope]} />
        <meshStandardMaterial
          map={shingles.map}
          normalMap={shingles.normalMap}
          normalScale={new THREE.Vector2(1.2, 1.2)}
          roughnessMap={shingles.roughnessMap}
          roughness={1}
          metalness={0}
          envMapIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

/** The letterbox: contact, as an object. Its door is the 2D form's twin, not a duplicate of it. */
function Letterbox({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => woodSurface('shelf', 2, 2), []);
  const x = -2.7;
  const z = PORCH.zEdge + 0.5;
  const postTop = PORCH.deckY + 1.06;

  return (
    <group position={[x, 0, z]} rotation={[0, 0.18, 0]}>
      <mesh position={[0, PORCH.deckY + (postTop - PORCH.deckY) / 2, 0]} castShadow={shadows} receiveShadow={shadows}>
        <cylinderGeometry args={[0.05, 0.062, postTop - PORCH.deckY, 12]} />
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} color="#5A4028" roughness={0.84} metalness={0} />
      </mesh>
      <RoundedBox args={[0.4, 0.24, 0.28]} radius={0.05} smoothness={4} position={[0, postTop + 0.13, 0]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} normalScale={wood.normalScale} color={PALETTE.burntSienna} roughness={0.55} metalness={0.05} envMapIntensity={1} />
      </RoundedBox>
      {/* Brass flap and knob. */}
      <mesh position={[0, postTop + 0.13, 0.142]}>
        <planeGeometry args={[0.3, 0.06]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.85} roughness={0.3} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[0, postTop + 0.05, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.02, 12]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.85} roughness={0.28} envMapIntensity={1.5} />
      </mesh>
      {/* A letter, half in. */}
      <mesh position={[0.02, postTop + 0.26, 0.02]} rotation={[0.3, 0.2, 0.08]} castShadow={shadows}>
        <boxGeometry args={[0.24, 0.006, 0.16]} />
        <meshStandardMaterial color={PALETTE.parchment} roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}

/** Brass plaques beside the door — one per social link, engraved by the label texture. */
function Plaques({ count, shadows }: { count: number; shadows: boolean }) {
  const shown = Math.min(count, 4);
  if (!shown) return null;
  return (
    <group>
      {Array.from({ length: shown }, (_, i) => (
        <RoundedBox
          key={i}
          args={[0.3, 0.13, 0.014]}
          radius={0.006}
          smoothness={3}
          position={[CABIN.backDoorX + 1.25, PORCH.deckY + 1.34 - i * 0.19, CABIN.zBack - 0.16]}
          rotation={[0, Math.PI, 0]}
          castShadow={shadows}
        >
          <meshStandardMaterial color={SURFACE.brass} metalness={0.86} roughness={0.26} envMapIntensity={1.6} />
        </RoundedBox>
      ))}
    </group>
  );
}

export default function Porch({ shadows, plaques }: { shadows: boolean; plaques: number }) {
  const stone = useMemo(() => woodSurface('wall', 1, 2), []);

  return (
    <group>
      <Deck shadows={shadows} />
      <Canopy shadows={shadows} />
      <Railing shadows={shadows} />
      <Steps shadows={shadows} />
      <Letterbox shadows={shadows} />
      <Plaques count={plaques} shadows={shadows} />

      {/* A pair of boots by the door and a bench to pull them off on. */}
      <group position={[-1.4, 0, PORCH.zFront - 0.9]}>
        <RoundedBox args={[1.4, 0.06, 0.36]} radius={0.014} smoothness={3} position={[0, PORCH.deckY + 0.42, 0]} castShadow={shadows} receiveShadow={shadows}>
          <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} color="#6B5138" roughness={0.84} metalness={0} envMapIntensity={0.6} />
        </RoundedBox>
        {[-0.55, 0.55].map((lx) => (
          <mesh key={lx} position={[lx, PORCH.deckY + 0.21, 0]} castShadow={shadows}>
            <boxGeometry args={[0.07, 0.42, 0.3]} />
            <meshStandardMaterial color="#5A4028" roughness={0.86} metalness={0} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
