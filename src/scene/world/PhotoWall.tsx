/**
 * The photo wall: prints pegged to a line that sags across the back wall, each with a white
 * border and the hand-set tilt the CMS gives it (±2°, docs/BRIEF.md §4.3).
 *
 * The line is a real catenary — a tube swept along a curve whose sag is the same function the
 * print heights are measured from — so the pegs sit on it exactly and the row dips in the middle
 * the way a strung line does.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CABIN, LINE, PEG_DROP, printSlot } from '../layout';
import { mulberry32 } from '../noise';
import { PALETTE, SURFACE } from '../palette';
import { kraftSurface, loadCover, woodSurface } from '../textures';
import { useClickable } from '../interactive';
import type { ScenePrint } from '../types';

const MIN_PRINTS = 5;
const BORDER = 0.04;
const DEG = Math.PI / 180;

function lineY(t: number): number {
  return CABIN.floorY + LINE.y - Math.sin(Math.PI * t) * LINE.sag;
}

function Line() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      points.push(new THREE.Vector3(LINE.fromX - 0.5 + (LINE.toX - LINE.fromX + 1) * t, lineY(t), LINE.z));
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    return new THREE.TubeGeometry(curve, 40, 0.007, 6, false);
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial color="#7A6A4E" roughness={0.9} metalness={0} />
      </mesh>
      {/* The two hooks it is strung between. */}
      {[LINE.fromX - 0.5, LINE.toX + 0.5].map((x) => (
        <mesh key={x} position={[x, CABIN.floorY + LINE.y + 0.02, LINE.z + 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.011, 0.011, 0.1, 8]} />
          <meshStandardMaterial color={SURFACE.brass} metalness={0.8} roughness={0.32} envMapIntensity={1.3} />
        </mesh>
      ))}
    </group>
  );
}

function Pegs({ width, top }: { width: number; top: number }) {
  const wood = useMemo(() => woodSurface('desk', 1, 2), []);
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * width * 0.34, top, 0.006]}>
          <RoundedBox args={[0.026, 0.11, 0.026]} radius={0.008} smoothness={1}>
            <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} color="#C9A97A" roughness={0.7} metalness={0} envMapIntensity={0.8} />
          </RoundedBox>
          <RoundedBox args={[0.026, 0.11, 0.026]} radius={0.008} smoothness={1} position={[0, 0, -0.026]}>
            <meshStandardMaterial color="#B89A6E" roughness={0.72} metalness={0} envMapIntensity={0.8} />
          </RoundedBox>
        </group>
      ))}
    </>
  );
}

function Print({ print, index, total }: { print: ScenePrint; index: number; total: number }) {
  const slot = useMemo(() => printSlot(index, total), [index, total]);
  const [photo, setPhoto] = useState<THREE.Texture | null>(null);
  const paper = useMemo(() => kraftSurface(1, PALETTE.parchment, 'photo-paper'), []);
  const window_ = useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    if (!print.src) return;
    return loadCover(print.src, setPhoto, 640);
  }, [print.src]);

  // As with the sleeves: whether a material has a map is part of its compiled program.
  useEffect(() => {
    const material = window_.current;
    if (!material || !photo) return;
    material.map = photo;
    material.color.set('#FFFFFF');
    material.needsUpdate = true;
  }, [photo]);

  // Prints are 3:2, hung either way up depending on the source aspect once it lands.
  const width = LINE.printWidth;
  const source = photo?.image as { width?: number; height?: number } | undefined;
  const portrait = Boolean(source?.width && source?.height && source.width < source.height);
  const height = portrait ? width * 1.3 : width * 0.72;

  const ref = useClickable({
    href: print.href,
    id: `photo:${print.slug}`,
    pull: [0, 0.01, 0.11],
    turn: 0,
    glowStrength: 0.6,
  });

  return (
    <group ref={ref} position={[slot.position[0], slot.position[1] - height / 2 - PEG_DROP, slot.position[2]]} rotation={[0, 0, print.tilt * DEG]}>
      {/* Board: white border, a real thickness, softened corners. */}
      <RoundedBox args={[width, height, 0.008]} radius={0.004} smoothness={2} receiveShadow>
        <meshStandardMaterial
          map={paper.map}
          normalMap={paper.normalMap}
          normalScale={new THREE.Vector2(0.3, 0.3)}
          color={PALETTE.parchment}
          roughness={0.85}
          metalness={0}
          envMapIntensity={0.6}
        />
      </RoundedBox>
      {/* Image window, inset by the border. */}
      <mesh position={[0, height * 0.03, 0.0046]}>
        <planeGeometry args={[width - BORDER * 2, height - BORDER * 2 - height * 0.06]} />
        <meshStandardMaterial ref={window_} color="#8FA3B0" roughness={0.55} metalness={0} envMapIntensity={0.6} />
      </mesh>
      <Pegs width={width} top={height / 2 + 0.012} />
    </group>
  );
}

/** A blank print or two, so a single published photo does not hang alone on a long line. */
function BlankPrint({ index, total }: { index: number; total: number }) {
  const slot = useMemo(() => printSlot(index, total), [index, total]);
  const paper = useMemo(() => kraftSurface(1, PALETTE.parchment, 'photo-paper'), []);
  const random = useMemo(() => mulberry32(index * 17 + 3), [index]);
  const width = LINE.printWidth;
  const height = width * (random() > 0.5 ? 0.72 : 1.24);

  return (
    <group position={[slot.position[0], slot.position[1] - height / 2 - PEG_DROP, slot.position[2]]} rotation={[0, 0, (random() * 4 - 2) * DEG]}>
      <RoundedBox args={[width, height, 0.008]} radius={0.004} smoothness={2} receiveShadow>
        <meshStandardMaterial map={paper.map} normalMap={paper.normalMap} color={PALETTE.parchment} roughness={0.86} metalness={0} envMapIntensity={0.6} />
      </RoundedBox>
      <mesh position={[0, height * 0.03, 0.0046]}>
        <planeGeometry args={[width - BORDER * 2, height - BORDER * 2 - height * 0.06]} />
        <meshStandardMaterial color="#C4B79C" roughness={0.7} metalness={0} />
      </mesh>
      <Pegs width={width} top={height / 2 + 0.012} />
    </group>
  );
}

export default function PhotoWall({ prints }: { prints: ScenePrint[] }) {
  const shown = useMemo(() => prints.slice(0, 9), [prints]);
  const total = Math.max(shown.length, MIN_PRINTS);

  return (
    <group>
      <Line />
      {shown.map((print, index) => (
        <Print key={print.slug} print={print} index={index} total={total} />
      ))}
      {Array.from({ length: total - shown.length }, (_, i) => (
        <BlankPrint key={`blank-${i}`} index={shown.length + i} total={total} />
      ))}
    </group>
  );
}
