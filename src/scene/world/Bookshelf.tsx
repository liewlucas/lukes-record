/**
 * The bookcase on the right-hand wall. Spine colours come from the CMS palette token; heights
 * and thicknesses are derived from the slug, so the same book is always the same book, and the
 * row is never a set of identical dominoes. Pulling a spine forward is the hover state.
 */
import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox, RoundedBoxGeometry } from '@react-three/drei';
import * as THREE from 'three';
import { CABIN, CORNERS, SHELF, bookSlot, shelfSlotOrder } from '../layout';
import { mulberry32 } from '../noise';
import { PALETTE, spineHex } from '../palette';
import { labelTexture, woodSurface } from '../textures';
import { useClickable } from '../interactive';
import type { SceneBook } from '../types';

const MIN_BOOKS = 70;
const DEPTH = 0.2;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Light text on dark spines, dark text on light ones. */
function inkFor(hex: string): string {
  const colour = new THREE.Color(hex);
  const luminance = colour.r * 0.2126 + colour.g * 0.7152 + colour.b * 0.0722;
  return luminance > 0.45 ? '#33261A' : '#F0E5D2';
}

function Book({ book, slotIndex }: { book: SceneBook; slotIndex: number }) {
  const slot = useMemo(() => bookSlot(slotIndex), [slotIndex]);
  const seed = useMemo(() => hash(book.slug), [book.slug]);
  const hex = spineHex(book.spineColor);
  const height = 0.19 + seed * 0.1;
  const thickness = 0.032 + ((seed * 7) % 1) * 0.022;
  const lean = seed > 0.86 ? (seed - 0.86) * 1.6 : 0;

  const label = useMemo(
    () =>
      labelTexture(book.title, {
        font: "600 34px Fraunces, Georgia, serif",
        colour: inkFor(hex),
        width: 96,
        height: 512,
        rotate: true,
        align: 'center',
      }),
    [book.title, hex],
  );

  const ref = useClickable({
    href: book.href,
    id: book.slug,
    pull: [-0.075, 0.008, 0],
    turn: 0.16,
    glowStrength: 0.7,
  });

  return (
    <group ref={ref} position={[slot.position[0], slot.position[1] - 0.24 + height / 2, slot.position[2]]} rotation={[0, slot.yaw, 0]}>
      <group rotation={[0, 0, lean]}>
        <RoundedBox args={[thickness, height, DEPTH]} radius={0.005} smoothness={2} receiveShadow>
          <meshStandardMaterial color={hex} roughness={0.78} metalness={0} envMapIntensity={0.55} />
        </RoundedBox>
        {/* Spine face and its title. */}
        <mesh position={[0, 0, DEPTH / 2 + 0.0012]}>
          <planeGeometry args={[thickness * 0.98, height * 0.98]} />
          <meshStandardMaterial map={label} transparent color={hex} roughness={0.72} metalness={0} envMapIntensity={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * The rest of the shelf: one InstancedMesh of unit rounded boxes, scaled per book. Seventy books
 * as separate meshes was the single biggest draw-call cost in the room.
 */
function FillerBooks({ slots }: { slots: number[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const palette = useMemo(() => [PALETTE.moss, PALETTE.pineShadow, PALETTE.walnut, PALETTE.ridgeHaze, PALETTE.kraft, PALETTE.burntSienna], []);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const colour = new THREE.Color();

    slots.forEach((slotIndex, i) => {
      const random = mulberry32(slotIndex * 977 + 5);
      const slot = bookSlot(slotIndex);
      const height = 0.18 + random() * 0.11;
      const thickness = 0.028 + random() * 0.024;
      const lean = random() > 0.9 ? (random() - 0.5) * 0.22 : 0;
      euler.set(0, slot.yaw, lean, 'YZX');
      quaternion.setFromEuler(euler);
      scale.set(thickness, height, DEPTH);
      position.set(slot.position[0], slot.position[1] - 0.24 + height / 2, slot.position[2]);
      matrix.compose(position, quaternion, scale);
      target.setMatrixAt(i, matrix);
      colour.set(palette[Math.floor(random() * palette.length)]).multiplyScalar(0.82);
      target.setColorAt(i, colour);
    });

    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
    target.computeBoundingSphere();
  }, [slots, palette]);

  if (!slots.length) return null;

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, slots.length]} receiveShadow frustumCulled={false}>
      <RoundedBoxGeometry args={[1, 1, 1]} radius={0.06} smoothness={2} />
      <meshStandardMaterial roughness={0.82} metalness={0} envMapIntensity={0.5} />
    </instancedMesh>
  );
}

function Carcass({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => woodSurface('shelf', 3, 5), []);
  const span = (SHELF.perTier - 1) * SHELF.pitch + 0.24;
  const x = CORNERS.books.x;
  const bottom = CABIN.floorY;
  const top = CABIN.floorY + SHELF.tiers[SHELF.tiers.length - 1] + 0.3;

  const material = (
    <meshStandardMaterial
      map={wood.map}
      normalMap={wood.normalMap}
      normalScale={wood.normalScale}
      roughnessMap={wood.roughnessMap}
      color="#5C4633"
      roughness={0.76}
      metalness={0}
      envMapIntensity={0.6}
    />
  );

  return (
    <group>
      {/* Back board. */}
      <mesh position={[x + 0.11, (bottom + top) / 2, CORNERS.books.z]} rotation={[0, -Math.PI / 2, 0]} receiveShadow={shadows}>
        <planeGeometry args={[span, top - bottom]} />
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} color="#3F2E20" roughness={0.92} metalness={0} envMapIntensity={0.3} />
      </mesh>
      {/* Sides. */}
      {[-1, 1].map((side) => (
        <RoundedBox
          key={side}
          args={[0.28, top - bottom, 0.045]}
          radius={0.01}
          smoothness={3}
          position={[x - 0.03, (bottom + top) / 2, CORNERS.books.z + (side * span) / 2]}
          castShadow={shadows}
          receiveShadow={shadows}
        >
          {material}
        </RoundedBox>
      ))}
      {/* Centre divider: at this width the case wants to read as two bays, not one long run. */}
      <RoundedBox args={[0.28, top - bottom, 0.04]} radius={0.01} smoothness={2} position={[x - 0.03, (bottom + top) / 2, CORNERS.books.z]} castShadow={shadows} receiveShadow={shadows}>
        {material}
      </RoundedBox>
      {/* Shelves, plus the top and the plinth. */}
      {[bottom + 0.06, ...SHELF.tiers.map((t) => CABIN.floorY + t - 0.263), top - 0.03].map((y, i) => (
        <RoundedBox key={i} args={[0.28, 0.045, span]} radius={0.01} smoothness={2} position={[x - 0.03, y, CORNERS.books.z]} castShadow={shadows} receiveShadow={shadows}>
          {material}
        </RoundedBox>
      ))}
    </group>
  );
}

export default function Bookshelf({ books, shadows }: { books: SceneBook[]; shadows: boolean }) {
  const order = useMemo(() => shelfSlotOrder(), []);
  const capacity = order.length;
  const shown = useMemo(() => books.slice(0, capacity), [books, capacity]);
  const fillerSlots = useMemo(() => order.slice(shown.length, Math.max(shown.length, Math.min(capacity, MIN_BOOKS))), [order, shown.length, capacity]);

  return (
    <group>
      <Carcass shadows={shadows} />
      {shown.map((book, index) => (
        <Book key={book.slug} book={book} slotIndex={order[index]} />
      ))}
      <FillerBooks slots={fillerSlots} />
    </group>
  );
}
