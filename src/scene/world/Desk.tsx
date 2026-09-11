/**
 * The desk: the wink at the day job. A plank top on tapered legs, a monitor whose screen is a
 * canvas terminal repainted a few times a second, a mug, a task lamp and a stack of paper.
 *
 * The terminal texture is the only thing in the scene that redraws on a timer, so it is throttled
 * to ~6 fps and stops entirely under prefers-reduced-motion.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CABIN, CORNERS } from '../layout';
import { PALETTE, SURFACE } from '../palette';
import { kraftSurface, terminalTexture, woodSurface } from '../textures';

const TOP_Y = 0.76;

function Monitor({ ownerName, animate }: { ownerName: string; animate: boolean }) {
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const terminal = useMemo(() => terminalTexture(ownerName), [ownerName]);
  const clock = useRef(0);

  useEffect(() => () => terminal.dispose(), [terminal]);

  useFrame((_, delta) => {
    if (!animate) return;
    clock.current += delta;
    if (clock.current < 0.16) return;
    clock.current = 0;
    terminal.update();
  });

  const width = 0.66;
  const height = 0.42;

  return (
    <group position={[0, CABIN.floorY + TOP_Y, -0.2]}>
      {/* Foot and stem. */}
      <RoundedBox args={[0.3, 0.02, 0.19]} radius={0.008} smoothness={3} position={[0, 0.015, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2E2A26" roughness={0.45} metalness={0.3} envMapIntensity={0.9} />
      </RoundedBox>
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.03, 0.26, 12]} />
        <meshStandardMaterial color="#2E2A26" roughness={0.4} metalness={0.35} envMapIntensity={1} />
      </mesh>
      {/* Body. */}
      <group position={[0, 0.28 + height / 2, 0.01]} rotation={[-0.07, 0, 0]}>
        <RoundedBox args={[width + 0.04, height + 0.04, 0.035]} radius={0.012} smoothness={3} castShadow receiveShadow>
          <meshStandardMaterial color="#26221E" roughness={0.5} metalness={0.15} envMapIntensity={0.8} />
        </RoundedBox>
        <mesh position={[0, 0, 0.019]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial
            ref={screen}
            map={terminal.texture}
            emissiveMap={terminal.texture}
            emissive="#FFFFFF"
            emissiveIntensity={1.35}
            color="#000000"
            roughness={0.35}
            metalness={0}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function Mug() {
  const profile = useMemo(() => {
    const points: THREE.Vector2[] = [];
    // Outside wall up, over the rim, and back down the inside.
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      points.push(new THREE.Vector2(0.036 + Math.sin(t * 1.3) * 0.012, t * 0.1));
    }
    points.push(new THREE.Vector2(0.046, 0.102));
    for (let i = 10; i >= 1; i--) {
      const t = i / 10;
      points.push(new THREE.Vector2(0.03 + Math.sin(t * 1.3) * 0.011, t * 0.1));
    }
    points.push(new THREE.Vector2(0, 0.012));
    return points;
  }, []);

  return (
    <group position={[0.44, CABIN.floorY + TOP_Y + 0.001, 0.16]} rotation={[0, 0.5, 0]}>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 28]} />
        <meshStandardMaterial color={PALETTE.kraft} roughness={0.42} metalness={0} envMapIntensity={1.1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.056, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.028, 0.007, 8, 20, Math.PI * 1.25]} />
        <meshStandardMaterial color={PALETTE.kraft} roughness={0.42} metalness={0} envMapIntensity={1.1} />
      </mesh>
      {/* What is in it. */}
      <mesh position={[0, 0.088, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.032, 20]} />
        <meshStandardMaterial color="#2A1A10" roughness={0.18} metalness={0} envMapIntensity={1.6} />
      </mesh>
    </group>
  );
}

function TaskLamp() {
  const arm = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(0, 0.22, 0.02),
      new THREE.Vector3(0.03, 0.38, 0.1),
      new THREE.Vector3(0.06, 0.42, 0.22),
    ]);
    return new THREE.TubeGeometry(curve, 24, 0.016, 8, false);
  }, []);

  useEffect(() => () => arm.dispose(), [arm]);

  return (
    <group position={[-0.58, CABIN.floorY + TOP_Y, -0.18]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.075, 0.085, 0.028, 24]} />
        <meshStandardMaterial color={SURFACE.brass} metalness={0.8} roughness={0.32} envMapIntensity={1.4} />
      </mesh>
      <mesh geometry={arm} castShadow>
        <meshStandardMaterial color={SURFACE.brass} metalness={0.78} roughness={0.34} envMapIntensity={1.4} />
      </mesh>
      <group position={[0.06, 0.4, 0.26]} rotation={[2.3, 0, 0]}>
        <mesh castShadow>
          <coneGeometry args={[0.088, 0.12, 20, 1, true]} />
          <meshStandardMaterial color={PALETTE.burntSienna} metalness={0.25} roughness={0.5} side={THREE.DoubleSide} envMapIntensity={1.1} />
        </mesh>
        <mesh position={[0, 0.035, 0]}>
          <sphereGeometry args={[0.026, 12, 10]} />
          <meshStandardMaterial color="#FFF0CF" emissive="#FFBE64" emissiveIntensity={2.6} roughness={0.35} metalness={0} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Chair({ shadows }: { shadows: boolean }) {
  const wood = useMemo(() => woodSurface('shelf', 2, 3), []);
  const seatY = CABIN.floorY + 0.46;
  const legs: [number, number][] = [
    [-0.19, -0.17],
    [0.19, -0.17],
    [-0.19, 0.17],
    [0.19, 0.17],
  ];

  return (
    <group position={[-0.15, 0, 1.05]} rotation={[0, Math.PI + 0.22, 0]}>
      <RoundedBox args={[0.46, 0.04, 0.42]} radius={0.012} smoothness={3} position={[0, seatY, 0]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={wood.map} normalMap={wood.normalMap} normalScale={wood.normalScale} color="#6B5138" roughness={0.7} metalness={0} envMapIntensity={0.7} />
      </RoundedBox>
      {legs.map(([lx, lz], i) => (
        <mesh key={i} position={[lx, CABIN.floorY + (seatY - CABIN.floorY) / 2, lz]} castShadow={shadows}>
          <cylinderGeometry args={[0.017, 0.023, seatY - CABIN.floorY, 10]} />
          <meshStandardMaterial color="#5A4028" roughness={0.75} metalness={0} />
        </mesh>
      ))}
      {/* Back: two uprights and three slats. */}
      {[-0.2, 0.2].map((lx) => (
        <mesh key={lx} position={[lx, seatY + 0.24, -0.19]} rotation={[-0.1, 0, 0]} castShadow={shadows}>
          <cylinderGeometry args={[0.016, 0.019, 0.48, 10]} />
          <meshStandardMaterial color="#5A4028" roughness={0.75} metalness={0} />
        </mesh>
      ))}
      {[0.12, 0.28, 0.44].map((dy) => (
        <RoundedBox key={dy} args={[0.4, 0.055, 0.022]} radius={0.008} smoothness={2} position={[0, seatY + dy, -0.192 - dy * 0.04]} rotation={[-0.1, 0, 0]} castShadow={shadows}>
          <meshStandardMaterial map={wood.map} color="#6B5138" roughness={0.72} metalness={0} envMapIntensity={0.7} />
        </RoundedBox>
      ))}
    </group>
  );
}

export default function Desk({ ownerName, animate, shadows }: { ownerName: string; animate: boolean; shadows: boolean }) {
  const top = useMemo(() => woodSurface('desk', 2, 4), []);
  const frame = useMemo(() => woodSurface('shelf', 2, 3), []);
  const paper = useMemo(() => kraftSurface(1, PALETTE.parchment, 'desk-paper'), []);
  const width = 1.75;
  const depth = 0.78;

  const legs: [number, number][] = [
    [-width / 2 + 0.1, -depth / 2 + 0.1],
    [width / 2 - 0.1, -depth / 2 + 0.1],
    [-width / 2 + 0.1, depth / 2 - 0.1],
    [width / 2 - 0.1, depth / 2 - 0.1],
  ];

  return (
    <group position={[CORNERS.desk.x, 0, CORNERS.desk.z]} rotation={[0, CORNERS.desk.yaw, 0]}>
      <RoundedBox args={[width, 0.055, depth]} radius={0.016} smoothness={4} position={[0, CABIN.floorY + TOP_Y, 0]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial
          map={top.map}
          normalMap={top.normalMap}
          normalScale={new THREE.Vector2(0.8, 0.8)}
          roughnessMap={top.roughnessMap}
          color="#8A6842"
          roughness={0.42}
          metalness={0}
          envMapIntensity={1.1}
        />
      </RoundedBox>
      {/* Apron. */}
      <RoundedBox args={[width - 0.16, 0.11, depth - 0.24]} radius={0.012} smoothness={3} position={[0, CABIN.floorY + TOP_Y - 0.09, -0.02]} castShadow={shadows} receiveShadow={shadows}>
        <meshStandardMaterial map={frame.map} normalMap={frame.normalMap} color="#5C4633" roughness={0.72} metalness={0} envMapIntensity={0.7} />
      </RoundedBox>
      {legs.map(([lx, lz], i) => (
        <mesh key={i} position={[lx, CABIN.floorY + (TOP_Y - 0.03) / 2, lz]} castShadow={shadows} receiveShadow={shadows}>
          <cylinderGeometry args={[0.026, 0.038, TOP_Y - 0.03, 12]} />
          <meshStandardMaterial map={frame.map} normalMap={frame.normalMap} color="#5C4633" roughness={0.74} metalness={0} envMapIntensity={0.6} />
        </mesh>
      ))}

      <Monitor ownerName={ownerName} animate={animate} />
      <Mug />
      <TaskLamp />

      {/* A short stack of paper, squared off but not quite. */}
      {[0, 1, 2].map((i) => (
        <RoundedBox
          key={i}
          args={[0.3, 0.004, 0.42]}
          radius={0.002}
          smoothness={2}
          position={[-0.24 + i * 0.004, CABIN.floorY + TOP_Y + 0.032 + i * 0.005, 0.19 + i * 0.006]}
          rotation={[0, 0.06 * i - 0.05, 0]}
          receiveShadow={shadows}
        >
          <meshStandardMaterial map={paper.map} normalMap={paper.normalMap} color={PALETTE.parchment} roughness={0.9} metalness={0} envMapIntensity={0.5} />
        </RoundedBox>
      ))}

      <Chair shadows={shadows} />
    </group>
  );
}
