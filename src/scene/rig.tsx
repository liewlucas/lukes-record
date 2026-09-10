/**
 * Camera choreography. Nothing snaps: positions are damped with maath (an exponential settle
 * in the spirit of cubic-bezier(0.22, 1, 0.36, 1)). Under prefers-reduced-motion the same
 * targets are applied as instant cuts (docs/BRIEF.md §4.3).
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { damp3 } from 'maath/easing';
import * as THREE from 'three';

export type V3 = readonly [number, number, number];

interface RigProps {
  position: V3;
  lookAt: V3;
  /** Seconds-ish to settle. Bigger is heavier. */
  smoothTime?: number;
  /** prefers-reduced-motion: cut instead of travel. */
  instant?: boolean;
  /** Idle drift amplitude in world units. 0 disables it. */
  drift?: number;
}

export function CameraRig({ position, lookAt, smoothTime = 1.4, instant = false, drift = 0 }: RigProps) {
  const camera = useThree((state) => state.camera);
  const goal = useMemo(() => new THREE.Vector3(), []);
  const focus = useMemo(() => new THREE.Vector3(...lookAt), []);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    goal.set(position[0], position[1], position[2]);
    if (drift > 0) {
      goal.x += Math.sin(t * 0.07) * drift;
      goal.y += Math.sin(t * 0.045 + 1.2) * drift * 0.35;
    }
    if (instant) {
      camera.position.copy(goal);
      focus.set(lookAt[0], lookAt[1], lookAt[2]);
    } else {
      damp3(camera.position, goal, smoothTime, delta);
      damp3(focus, [lookAt[0], lookAt[1], lookAt[2]], smoothTime, delta);
    }
    camera.lookAt(focus);
  });

  return null;
}

/** Sets the camera to its arrival pose before the first frame is drawn. */
export function useInitialCamera(position: V3, lookAt: V3) {
  const camera = useThree((state) => state.camera);
  const done = useRef(false);
  if (!done.current) {
    done.current = true;
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  }
}
