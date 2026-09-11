/**
 * The record rack: projects as sleeved records, standing face out on two rails against the left
 * wall, with the turntable on a low cabinet beside them.
 *
 * A sleeve is a bevelled kraft board with the cover art on its face (or a printed kraft sleeve
 * when the CMS has no cover yet) and a slice of black vinyl showing above the opening. Hovering
 * eases it out of the rack and lifts an amber ramp on its emissive — the same glow the 2D layer
 * uses for focus rings.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, RoundedBoxGeometry } from '@react-three/drei';
import * as THREE from 'three';
import { CABIN, CORNERS, RACK, rackSlotOrder, recordSlot } from '../layout';
import { mulberry32 } from '../noise';
import { PALETTE, SLEEVE_CYCLE, SURFACE } from '../palette';
import { kraftSurface, loadCover, sleeveTexture, woodSurface } from '../textures';
import { useClickable } from '../interactive';
import type { SceneRecord } from '../types';

/** Enough sleeves that the rack reads as a collection even before the CMS is filled. */
const MIN_SLEEVES = 21;

function Sleeve({ record, index, slotIndex }: { record: SceneRecord; index: number; slotIndex: number }) {
  const slot = useMemo(() => recordSlot(slotIndex), [slotIndex]);
  const band = SLEEVE_CYCLE[index % SLEEVE_CYCLE.length];
  const kraft = useMemo(() => kraftSurface(1), []);
  const printed = useMemo(() => sleeveTexture(record.title, record.year, band), [record.title, record.year, band]);
  const [cover, setCover] = useState<THREE.Texture | null>(null);
  const face = useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    if (!record.cover) return;
    return loadCover(record.cover, setCover);
  }, [record.cover]);

  // Swapping `map` on a compiled material is not enough on its own: whether a material samples a
  // map is baked into its shader program, so the cover has to be assigned with needsUpdate.
  useEffect(() => {
    const material = face.current;
    if (!material) return;
    material.map = cover ?? printed;
    material.needsUpdate = true;
  }, [cover, printed]);

  // Featured records stand a little proud of the rest (docs/BRIEF.md §5).
  const proud = record.featured ? 0.035 : 0;
  const lean = -0.11;

  const ref = useClickable({
    href: record.href,
    id: record.slug,
    pull: [0.17, 0.012, 0],
    turn: -0.28,
    glowStrength: 0.55,
  });

  const size = RACK.size;

  return (
    <group ref={ref} position={[slot.position[0] + proud, slot.position[1], slot.position[2]]} rotation={[0, slot.yaw, 0]}>
      <group rotation={[lean, 0, 0]}>
        {/* Vinyl showing above the sleeve opening. */}
        <mesh position={[0, size * 0.5, -0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[size * 0.47, size * 0.47, 0.004, 24]} />
          <meshStandardMaterial color="#141210" roughness={0.28} metalness={0.05} envMapIntensity={1.1} />
        </mesh>
        {/* Sleeve board. */}
        <RoundedBox args={[size, size, RACK.thickness]} radius={0.006} smoothness={2} receiveShadow>
          <meshStandardMaterial
            map={kraft.map}
            normalMap={kraft.normalMap}
            normalScale={new THREE.Vector2(0.5, 0.5)}
            roughnessMap={kraft.roughnessMap}
            color={PALETTE.kraft}
            roughness={0.88}
            metalness={0}
            envMapIntensity={0.5}
          />
        </RoundedBox>
        {/* Face: the cover when there is one, the printed kraft sleeve when there is not. */}
        <mesh position={[0, 0, RACK.thickness / 2 + 0.002]}>
          <planeGeometry args={[size - 0.012, size - 0.012]} />
          <meshStandardMaterial ref={face} map={printed} roughness={0.62} metalness={0} envMapIntensity={0.7} />
        </mesh>
        {/* Spine strip in the record's colour, so a rack of them still reads as a row. */}
        <mesh position={[-size / 2 - 0.001, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[RACK.thickness, size - 0.01]} />
          <meshStandardMaterial color={band} roughness={0.8} metalness={0} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * The rest of the collection: blank kraft sleeves in one InstancedMesh. They are scenery, never
 * clickable, and drawing sixty of them as separate meshes was costing more than the whole cabin.
 */
function FillerSleeves({ slots }: { slots: number[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const kraft = useMemo(() => kraftSurface(1), []);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    const colour = new THREE.Color();
    const base = new THREE.Color(PALETTE.kraft);
    const tint = new THREE.Color();

    slots.forEach((slotIndex, i) => {
      const random = mulberry32(slotIndex * 31 + 7);
      const slot = recordSlot(slotIndex);
      euler.set(-0.1 - random() * 0.05, slot.yaw, 0, 'YXZ');
      quaternion.setFromEuler(euler);
      position.set(slot.position[0] - 0.02, slot.position[1], slot.position[2]);
      matrix.compose(position, quaternion, scale);
      target.setMatrixAt(i, matrix);
      tint.set(SLEEVE_CYCLE[(slotIndex * 3) % SLEEVE_CYCLE.length]);
      target.setColorAt(i, colour.copy(base).lerp(tint, 0.14 + random() * 0.16));
    });

    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [slots]);

  if (!slots.length) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, slots.length]} receiveShadow frustumCulled={false}>
      <RoundedBoxGeometry args={[RACK.size, RACK.size, RACK.thickness]} radius={0.006} smoothness={2} />
      <meshStandardMaterial
        map={kraft.map}
        normalMap={kraft.normalMap}
        roughnessMap={kraft.roughnessMap}
        roughness={0.9}
        metalness={0}
        envMapIntensity={0.45}
      />
    </instancedMesh>
  );
}

/** The carcass: a back board and one rail per tier for the sleeves to lean on. */
function Rack({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => woodSurface('shelf', 3, 4), []);
  const span = (RACK.perTier - 1) * RACK.pitch + RACK.size + 0.24;
  const x = CORNERS.vinyl.x;
  const lowest = RACK.tiers[RACK.tiers.length - 1];
  const highest = RACK.tiers[0];
  const backHeight = highest - lowest + RACK.size + 0.5;
  const backY = CABIN.floorY + (highest + lowest) / 2 + 0.06;

  return (
    <group>
      <mesh position={[x - 0.03, backY, CORNERS.vinyl.z]} rotation={[0, Math.PI / 2, 0]} receiveShadow={shadows}>
        <planeGeometry args={[span, backHeight]} />
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} color="#4A3628" roughness={0.9} metalness={0} envMapIntensity={0.4} />
      </mesh>
      {RACK.tiers.map((tier) => (
        <group key={tier}>
          <RoundedBox
            args={[0.22, 0.045, span]}
            radius={0.011}
            smoothness={2}
            position={[x + 0.12, CABIN.floorY + tier - RACK.size / 2 - 0.02, CORNERS.vinyl.z]}
            castShadow={shadows}
            receiveShadow={shadows}
          >
            <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} normalScale={wood.normalScale} roughnessMap={wood.roughnessMap} color="#6B5138" roughness={0.72} metalness={0} envMapIntensity={0.7} />
          </RoundedBox>
          <RoundedBox
            args={[0.03, 0.07, span]}
            radius={0.007}
            smoothness={2}
            position={[x + 0.215, CABIN.floorY + tier - RACK.size / 2 + 0.013, CORNERS.vinyl.z]}
            castShadow={shadows}
          >
            <meshStandardMaterial color="#5A4028" roughness={0.75} metalness={0} envMapIntensity={0.6} />
          </RoundedBox>
        </group>
      ))}
      {/* Uprights at either end, and a top rail. */}
      {[-1, 1].map((side) => (
        <RoundedBox
          key={side}
          args={[0.26, backHeight, 0.06]}
          radius={0.013}
          smoothness={2}
          position={[x + 0.11, backY, CORNERS.vinyl.z + (side * span) / 2]}
          castShadow={shadows}
          receiveShadow={shadows}
        >
          <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} color="#5A4028" roughness={0.78} metalness={0} envMapIntensity={0.6} />
        </RoundedBox>
      ))}
      <RoundedBox args={[0.28, 0.06, span + 0.12]} radius={0.013} smoothness={2} position={[x + 0.11, backY + backHeight / 2, CORNERS.vinyl.z]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} color="#6B5138" roughness={0.74} metalness={0} envMapIntensity={0.7} />
      </RoundedBox>
    </group>
  );
}

/** The turntable, lid up, needle down. */
function Turntable({ animate, shadows }: { animate: boolean; shadows: boolean }) {
  const platter = useRef<THREE.Group>(null);
  const wood = useMemo(() => woodSurface('desk', 2, 3), []);
  const cabinet = useMemo(() => woodSurface('shelf', 2, 3), []);
  const x = CORNERS.turntable.x;
  const z = CORNERS.turntable.z;
  const cabinetTop = CABIN.floorY + 0.66;

  useFrame((_, delta) => {
    if (animate && platter.current) platter.current.rotation.y += delta * 3.49; // 33⅓ rpm
  });

  return (
    <group position={[x, 0, z]} rotation={[0, CORNERS.turntable.yaw, 0]}>
      {/* Low cabinet. */}
      <RoundedBox args={[0.9, 0.62, 0.58]} radius={0.02} smoothness={2} position={[0, CABIN.floorY + 0.33, 0]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={cabinet.map} normalMap={cabinet.normalMap} normalScale={cabinet.normalScale} roughnessMap={cabinet.roughnessMap} color="#5C4633" roughness={0.75} metalness={0} envMapIntensity={0.6} />
      </RoundedBox>
      <RoundedBox args={[0.96, 0.05, 0.64]} radius={0.014} smoothness={2} position={[0, cabinetTop, 0]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} roughnessMap={wood.roughnessMap} color="#7A5C3C" roughness={0.5} metalness={0} envMapIntensity={0.9} />
      </RoundedBox>

      {/* Deck. */}
      <RoundedBox args={[0.6, 0.085, 0.48]} radius={0.012} smoothness={2} position={[0, cabinetTop + 0.07, 0]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial color="#3A2E24" roughness={0.55} metalness={0.05} envMapIntensity={0.9} />
      </RoundedBox>
      <mesh position={[-0.05, cabinetTop + 0.118, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.2, 0.2, 0.012, 36]} />
        <meshStandardMaterial color="#8A8378" roughness={0.35} metalness={0.7} envMapIntensity={1.2} />
      </mesh>
      <group ref={platter} position={[-0.05, cabinetTop + 0.126, 0]}>
        <mesh castShadow={shadows}>
          <cylinderGeometry args={[0.185, 0.185, 0.005, 40]} />
          <meshStandardMaterial color="#131211" roughness={0.26} metalness={0.06} envMapIntensity={1.3} />
        </mesh>
        <mesh position={[0, 0.004, 0]}>
          <cylinderGeometry args={[0.062, 0.062, 0.002, 24]} />
          <meshStandardMaterial color={PALETTE.burntSienna} roughness={0.85} metalness={0} />
        </mesh>
      </group>
      <mesh position={[-0.05, cabinetTop + 0.14, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.035, 8]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Tonearm. */}
      <group position={[0.2, cabinetTop + 0.135, -0.16]}>
        <mesh castShadow={shadows}>
          <cylinderGeometry args={[0.026, 0.03, 0.05, 14]} />
          <meshStandardMaterial color={SURFACE.brass} metalness={0.85} roughness={0.28} envMapIntensity={1.4} />
        </mesh>
        <mesh position={[-0.12, 0.03, 0.11]} rotation={[0, -0.75, Math.PI / 2 - 0.06]} castShadow={shadows}>
          <cylinderGeometry args={[0.006, 0.006, 0.34, 10]} />
          <meshStandardMaterial color="#C0BAB0" metalness={0.75} roughness={0.24} envMapIntensity={1.3} />
        </mesh>
      </group>
    </group>
  );
}

export default function VinylShelf({ records, animate, shadows }: { records: SceneRecord[]; animate: boolean; shadows: boolean }) {
  const order = useMemo(() => rackSlotOrder(), []);
  const capacity = order.length;
  const shown = useMemo(() => records.slice(0, capacity), [records, capacity]);
  // Published records take the best-framed slots; the fillers close ranks around them.
  const fillerSlots = useMemo(() => order.slice(shown.length, Math.max(shown.length, Math.min(capacity, MIN_SLEEVES))), [order, shown.length, capacity]);

  return (
    <group>
      <Rack shadows={shadows} />
      <FillerSleeves slots={fillerSlots} />
      {shown.map((record, index) => (
        <Sleeve key={record.slug} record={record} index={index} slotIndex={order[index]} />
      ))}
      <Turntable animate={animate} shadows={shadows} />
    </group>
  );
}
