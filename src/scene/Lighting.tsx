/**
 * Light and air.
 *
 * There is no HDR file anywhere in this project. The image-based lighting is a handful of
 * `<Lightformer>` panels rendered once into a 256px cubemap: a hot low sun, a big cold sky
 * dome, a warm band along the horizon and a moss-coloured bounce off the meadow. Every PBR
 * material in the scene reflects that little studio, which is what stops the wood and the brass
 * reading as flat vertex colour.
 *
 * On top of it sit four real lights — a low sun outdoors, a lamp and a hearth indoors, a lantern
 * on the porch — whose intensities are crossfaded by the journey read-out, so walking through
 * the door genuinely changes the light rather than swapping a preset.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { CABIN, CORNERS, PORCH, SUN_DIRECTION } from './layout';
import { journeyState } from './journey';
import { PALETTE, SURFACE } from './palette';
import type { Budget } from './capabilities';

const SUN = new THREE.Vector3(...SUN_DIRECTION);
const SUN_DIR = SUN.clone().normalize();

/* ------------------------------------------------------------------ environment */

export function ProceduralEnvironment({ resolution }: { resolution: number }) {
  // The lightformers live in their own little scene around the origin; these positions are the
  // sun's bearing, scaled down to that scene's radius.
  const sun = useMemo(() => SUN_DIR.clone().multiplyScalar(11), []);

  return (
    <Environment resolution={resolution} frames={1} background={false} environmentIntensity={1}>
      {/* Cold sky dome overhead: the thing that keeps shadows blue instead of black. */}
      <Lightformer form="rect" intensity={0.85} color={SURFACE.skyZenith} scale={[46, 46]} position={[0, 16, 0]} rotation={[Math.PI / 2, 0, 0]} />
      {/* Warm band along the horizon, all the way round. */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle) => (
        <Lightformer
          key={angle}
          form="rect"
          intensity={angle === 0 ? 1.7 : 0.85}
          color={SURFACE.skyMid}
          scale={[34, 9]}
          position={[Math.sin(angle) * 15, 2.4, Math.cos(angle) * 15]}
          rotation={[0, angle + Math.PI, 0]}
        />
      ))}
      {/* The sun itself: small, hot, and the only specular highlight worth having. */}
      <Lightformer form="circle" intensity={9} color={SURFACE.sunCore} scale={3.2} position={[sun.x, sun.y, sun.z]} target={[0, 0, 0]} />
      <Lightformer form="circle" intensity={2.1} color={SURFACE.sunHalo} scale={8} position={[sun.x * 0.94, sun.y * 0.94, sun.z * 0.94]} target={[0, 0, 0]} />
      {/* Bounce off the meadow and the kraft-coloured path. */}
      <Lightformer form="rect" intensity={0.7} color={SURFACE.meadow} scale={[40, 40]} position={[0, -11, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      <Lightformer form="rect" intensity={0.4} color={PALETTE.kraft} scale={[18, 18]} position={[0, -8, 9]} rotation={[-Math.PI / 2, 0, 0]} />
    </Environment>
  );
}

/* ------------------------------------------------------------------------ lights */

/**
 * The sun. Its shadow camera is a 62 m box that walks with the visitor, so a 2048 map buys
 * ~3 cm texels where you can see them instead of 10 cm spread over the whole valley.
 */
function Sun({ shadows, mapSize, radius }: { shadows: boolean; mapSize: number; radius: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const scene = useThree((state) => state.scene);
  const warm = useMemo(() => new THREE.Color('#FFD9A0'), []);
  const dusk = useMemo(() => new THREE.Color('#C87F4A'), []);

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  const close = useRef(false);

  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const indoors = journeyState.indoors;
    const dusking = journeyState.dusk;
    const eye = journeyState.eye;

    // Indoors the only thing the sun still has to shadow is what it throws through the windows,
    // so the frustum shrinks from 62 m to 20 m and the same map gets nine times the resolution.
    const wantClose = indoors > 0.5;
    if (wantClose !== close.current) {
      close.current = wantClose;
      const half = wantClose ? 10 : 31;
      const camera = l.shadow.camera;
      camera.left = -half;
      camera.right = half;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
    }

    target.position.set(eye.x, 0, eye.z - (close.current ? 1 : 8));
    target.updateMatrixWorld();
    l.position.set(target.position.x + SUN_DIR.x * 90, SUN_DIR.y * 90, target.position.z + SUN_DIR.z * 90);
    l.intensity = (3.1 - dusking * 2.78) * (1 - indoors * 0.72);
    l.color.copy(warm).lerp(dusk, dusking);
    // Nothing outside is visible from the middle of the room; stop paying for its shadow map.
    l.castShadow = shadows && indoors < 0.94;
  });

  return (
    <directionalLight
      ref={light}
      target={target}
      intensity={3.1}
      color="#FFD9A0"
      castShadow={shadows}
      shadow-mapSize-width={mapSize}
      shadow-mapSize-height={mapSize}
      shadow-camera-near={1}
      shadow-camera-far={220}
      shadow-camera-left={-31}
      shadow-camera-right={31}
      shadow-camera-top={31}
      shadow-camera-bottom={-31}
      shadow-bias={-0.0006}
      shadow-normalBias={0.035}
      shadow-radius={radius}
    />
  );
}

/** The reading lamp: a shadow-casting spot inside the shade plus a soft point for the bloom. */
function Lamp({ shadows, mapSize, radius }: { shadows: boolean; mapSize: number; radius: number }) {
  const spot = useRef<THREE.SpotLight>(null);
  const point = useRef<THREE.PointLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const scene = useThree((state) => state.scene);
  const y = CABIN.floorY + 1.42;

  useEffect(() => {
    target.position.set(CORNERS.lamp.x, CABIN.floorY, CORNERS.lamp.z);
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useFrame(() => {
    const indoors = journeyState.indoors;
    if (spot.current) {
      spot.current.intensity = 17 * indoors;
      spot.current.castShadow = shadows && indoors > 0.2;
    }
    if (point.current) point.current.intensity = 1.9 * indoors;
  });

  return (
    <group>
      <spotLight
        ref={spot}
        position={[CORNERS.lamp.x, y, CORNERS.lamp.z]}
        target={target}
        angle={1.24}
        penumbra={1}
        decay={2}
        distance={16}
        intensity={0}
        color="#FFC978"
        castShadow={shadows}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
        shadow-camera-near={0.2}
        shadow-camera-far={16}
        shadow-radius={radius}
      />
      <pointLight ref={point} position={[CORNERS.lamp.x, y + 0.06, CORNERS.lamp.z]} intensity={0} distance={9} decay={2} color={PALETTE.lampAmber} />
    </group>
  );
}

/** The hearth. Two harmonics and a little noise: never a sine wave you can hear. */
function Hearth({ animate }: { animate: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  const seed = useRef(0);

  useFrame((state, delta) => {
    const l = light.current;
    if (!l) return;
    const indoors = journeyState.indoors;
    let flicker = 1;
    if (animate) {
      seed.current += delta * (0.6 + Math.random() * 0.8);
      flicker = 0.74 + Math.sin(state.clock.elapsedTime * 2.7) * 0.14 + Math.sin(state.clock.elapsedTime * 7.3 + 1.1) * 0.08 + Math.sin(seed.current * 3.1) * 0.12;
    }
    l.intensity = 36 * indoors * flicker;
    l.position.x = CORNERS.hearth.x + 0.55 + (animate ? Math.sin(state.clock.elapsedTime * 3.9) * 0.03 : 0);
  });

  return <pointLight ref={light} position={[CORNERS.hearth.x + 0.55, CABIN.floorY + 0.55, CORNERS.hearth.z]} intensity={0} distance={17} decay={2} color="#FF8433" />;
}

/** Cool daylight leaking in at the windows, so the amber has something to sit against. */
function WindowFill() {
  const front = useRef<THREE.PointLight>(null);
  const back = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const indoors = journeyState.indoors;
    const day = 1 - journeyState.dusk;
    if (front.current) front.current.intensity = 9 * indoors * day;
    if (back.current) back.current.intensity = 6 * indoors;
  });

  return (
    <>
      <pointLight ref={front} position={[-4.2, CABIN.floorY + 2.1, CABIN.innerFront - 0.2]} intensity={0} distance={12} decay={2} color={SURFACE.skyZenith} />
      <pointLight ref={back} position={[CABIN.backDoorX, CABIN.floorY + 1.5, CABIN.innerBack + 0.3]} intensity={0} distance={9} decay={2} color="#9FB6C4" />
    </>
  );
}

/** The lantern by the porch door — the last warm thing before the walk ends. */
function PorchLantern({ animate }: { animate: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    const l = light.current;
    if (!l) return;
    const flicker = animate ? 0.9 + Math.sin(state.clock.elapsedTime * 3.3) * 0.06 + Math.sin(state.clock.elapsedTime * 9.1) * 0.04 : 1;
    l.intensity = 20 * Math.max(journeyState.dusk, journeyState.indoors * 0.2) * flicker;
  });
  return <pointLight ref={light} position={[CABIN.backDoorX - 1.5, PORCH.deckY + 2.15, CABIN.zBack - 0.7]} intensity={0} distance={12} decay={2} color="#FFB65E" />;
}

/** Sky fill. Warm from above outdoors, cold and low indoors so the lamps do the work. */
function Ambient() {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sky = useMemo(() => new THREE.Color(SURFACE.skyZenith), []);
  const duskSky = useMemo(() => new THREE.Color(SURFACE.duskZenith), []);
  const ground = useMemo(() => new THREE.Color(SURFACE.meadow), []);

  useFrame(() => {
    const l = hemi.current;
    if (!l) return;
    const indoors = journeyState.indoors;
    l.intensity = (0.85 - journeyState.dusk * 0.68) * (1 - indoors * 0.62);
    l.color.copy(sky).lerp(duskSky, journeyState.dusk);
    l.groundColor.copy(ground);
  });

  return <hemisphereLight ref={hemi} args={[SURFACE.skyZenith, SURFACE.meadow, 0.85]} position={[0, 30, 0]} />;
}

/* ------------------------------------------------------------------- atmosphere */

/**
 * Fog, exposure and environment intensity, all crossfaded from the same read-out. The fog is
 * tinted to whatever the sky is doing, which is the whole trick behind aerial perspective.
 */
export function Atmosphere() {
  const { scene, gl } = useThree();
  const fog = useMemo(() => new THREE.FogExp2(SURFACE.skyHorizon, 0.0036), []);
  const day = useMemo(() => new THREE.Color(SURFACE.skyHorizon), []);
  const dusk = useMemo(() => new THREE.Color('#3E4A55'), []);
  const inside = useMemo(() => new THREE.Color('#2A2119'), []);
  const tint = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useFrame(() => {
    const { indoors, dusk: dusking, exposure } = journeyState;
    tint.copy(day).lerp(dusk, dusking).lerp(inside, indoors);
    fog.color.copy(tint);
    fog.density = 0.0036 * (1 - indoors) + 0.016 * indoors + dusking * 0.0034;
    scene.environmentIntensity = (1 - indoors * 0.42) * (1 - dusking * 0.6);
    gl.toneMappingExposure = exposure;
  });

  return null;
}

/* ------------------------------------------------------------------------ export */

export default function Lighting({ budget, animate }: { budget: Budget; animate: boolean }) {
  return (
    <>
      <ProceduralEnvironment resolution={budget.envResolution} />
      <Atmosphere />
      <Ambient />
      <Sun shadows={budget.shadows} mapSize={budget.shadowMapSize} radius={budget.shadowRadius} />
      <Lamp shadows={budget.shadows} mapSize={Math.min(1024, budget.shadowMapSize)} radius={budget.shadowRadius * 1.4} />
      <Hearth animate={animate} />
      <WindowFill />
      <PorchLantern animate={animate} />
    </>
  );
}
