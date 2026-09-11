/**
 * Hover and click for the objects in the cabin.
 *
 * The HTML layer sits *in front of* the canvas (`.scene-mount` is at z-index -1), so R3F's own
 * pointer events — which listen on the canvas — would only ever fire in the gaps. Rather than
 * fight the page with pointer-events CSS, the bridge below listens on `window`, decides whether
 * the pointer landed on page furniture or on open scene, and raycasts itself. Text, links and
 * panels always win; the empty parts of the page pass straight through to the 3D objects.
 *
 * The glow ramp and the pull-forward are driven from a single frame loop over the registry, so
 * hovering never re-renders React and forty records cost one callback, not forty.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from './palette';

export interface Clickable {
  object: THREE.Object3D;
  href: string;
  /** Stable identity for deep links: a record slug, `photo:<slug>`, a book slug. */
  id: string;
  /** Rest position, captured on registration. */
  base: THREE.Vector3;
  /** Local offset applied at full hover — the record easing out of the rack. */
  pull: THREE.Vector3;
  /** Extra lift applied at full hover, in radians about Y. */
  turn: number;
  baseTurn: number;
  materials: THREE.MeshStandardMaterial[];
  emissive: THREE.Color;
  glowStrength: number;
  /** 0..1, damped. */
  glow: number;
}

const registry = new Map<THREE.Object3D, Clickable>();

/** Set from the deep link: this object sits pulled out and lit before anyone touches it. */
export const focusState = { id: null as string | null };

/** The object under the pointer right now. Read by the bridge only. */
let hovered: THREE.Object3D | null = null;

/** Elements the pointer may pass through. Everything else on the page keeps the hit. */
const PASS_THROUGH = 'main, body, html, .journey, .stop, .wrap, .scene-mount';

export interface ClickableOptions {
  href: string;
  id: string;
  pull?: [number, number, number];
  turn?: number;
  glowStrength?: number;
  emissive?: string;
}

/**
 * Register a group as clickable. Returns a ref callback; put it on the outermost group of the
 * object so the whole thing glows and moves together.
 */
export function useClickable({ href, id, pull = [0, 0, 0], turn = 0, glowStrength = 0.9, emissive = PALETTE.lampAmber }: ClickableOptions) {
  const held = useRef<THREE.Object3D | null>(null);
  const [pullX, pullY, pullZ] = pull;

  const ref = useCallback((object: THREE.Object3D | null) => {
    held.current = object;
  }, []);

  useEffect(() => {
    const object = held.current;
    if (!object) return;
    const materials: THREE.MeshStandardMaterial[] = [];
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      for (const single of Array.isArray(material) ? material : [material]) {
        if ((single as THREE.MeshStandardMaterial).isMeshStandardMaterial) materials.push(single as THREE.MeshStandardMaterial);
      }
    });
    const entry: Clickable = {
      object,
      href,
      id,
      base: object.position.clone(),
      pull: new THREE.Vector3(pullX, pullY, pullZ),
      turn,
      baseTurn: object.rotation.y,
      materials,
      emissive: new THREE.Color(emissive),
      glowStrength,
      glow: 0,
    };
    object.userData.clickableId = id;
    registry.set(object, entry);
    return () => {
      registry.delete(object);
      if (hovered === object) hovered = null;
    };
  }, [href, id, pullX, pullY, pullZ, turn, glowStrength, emissive]);

  return ref;
}

function ancestorEntry(object: THREE.Object3D | null): Clickable | undefined {
  let node = object;
  while (node) {
    const entry = registry.get(node);
    if (entry) return entry;
    node = node.parent;
  }
  return undefined;
}

/**
 * Window-level pointer routing plus the one frame loop that animates every registered object.
 * Mount it once, inside the Canvas.
 */
export function PointerBridge({ enabled = true }: { enabled?: boolean }) {
  const { camera, gl, invalidate, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2(-2, -2));
  const cursorSet = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const passesThrough = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return true;
      return target.matches(PASS_THROUGH);
    };

    const pick = (event: PointerEvent | MouseEvent): Clickable | undefined => {
      if (!passesThrough(event.target)) return undefined;
      const rect = gl.domElement.getBoundingClientRect();
      pointer.current.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.current.setFromCamera(pointer.current, camera);
      const objects: THREE.Object3D[] = [];
      registry.forEach((entry) => objects.push(entry.object));
      if (!objects.length) return undefined;
      const hits = raycaster.current.intersectObjects(objects, true);
      for (const hit of hits) {
        const entry = ancestorEntry(hit.object);
        if (entry) return entry;
      }
      return undefined;
    };

    const setCursor = (on: boolean) => {
      if (on === cursorSet.current) return;
      cursorSet.current = on;
      document.body.style.cursor = on ? 'pointer' : '';
    };

    const onMove = (event: PointerEvent) => {
      const entry = pick(event);
      const next = entry?.object ?? null;
      if (next !== hovered) {
        hovered = next;
        invalidate();
      }
      setCursor(Boolean(entry));
    };

    const onLeave = () => {
      hovered = null;
      setCursor(false);
      invalidate();
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const entry = pick(event);
      if (!entry?.href) return;
      event.preventDefault();
      window.location.assign(entry.href);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('click', onClick);
      setCursor(false);
      hovered = null;
    };
  }, [camera, gl, invalidate, enabled, scene]);

  useFrame((_, delta) => {
    const step = 1 - Math.exp(-delta * 7);
    registry.forEach((entry) => {
      const focused = focusState.id !== null && focusState.id === entry.id;
      const wanted = entry.object === hovered ? 1 : focused ? 0.45 : 0;
      if (Math.abs(entry.glow - wanted) < 0.001) {
        if (entry.glow !== wanted) entry.glow = wanted;
        else return;
      } else {
        entry.glow += (wanted - entry.glow) * step;
      }
      const g = entry.glow;
      entry.object.position.set(entry.base.x + entry.pull.x * g, entry.base.y + entry.pull.y * g, entry.base.z + entry.pull.z * g);
      entry.object.rotation.y = entry.baseTurn + entry.turn * g;
      for (const material of entry.materials) {
        material.emissive.copy(entry.emissive);
        material.emissiveIntensity = g * entry.glowStrength;
      }
      invalidate();
    });
  });

  return null;
}

/** Deep-link focus: `<slug>` for a record, `photo:<slug>` for a print, or a corner name. */
export function parseFocus(focus: string | undefined): { id: string | null; corner: 'vinyl' | 'photos' | 'books' | null } {
  if (!focus) return { id: null, corner: null };
  if (focus === 'photos' || focus === 'books' || focus === 'vinyl') return { id: null, corner: focus };
  return { id: focus, corner: focus.startsWith('photo:') ? 'photos' : 'vinyl' };
}
