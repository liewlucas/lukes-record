/**
 * The journey: one camera path for the whole site.
 *
 * The page is a single tall document whose sections carry `data-scene="<key>"`. At runtime we
 * measure those sections and map window scroll onto one spline that runs from the vista, down
 * the trail, through the cabin door, around the three corners, past the desk and out onto the
 * porch. Scroll position -> section -> eased position along that section's stretch of the spline.
 *
 * The camera is damped along the *path parameter*, not in free space, so it never cuts a corner
 * through a wall however fast the visitor flicks the scrollbar.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { damp } from 'maath/easing';
import * as THREE from 'three';
import { clamp01 } from './noise';

export type SectionKey = 'vista' | 'trail' | 'cabin' | 'vinyl' | 'photos' | 'books' | 'desk' | 'porch';

export const SECTION_ORDER: SectionKey[] = ['vista', 'trail', 'cabin', 'vinyl', 'photos', 'books', 'desk', 'porch'];

interface Waypoint {
  key: SectionKey;
  pos: [number, number, number];
  look: [number, number, number];
}

/** The path. Several waypoints per long section (the trail), one for the tight ones. */
const WAYPOINTS: Waypoint[] = [
  { key: 'vista', pos: [0, 8.6, 40], look: [0, 10.5, -70] },
  { key: 'trail', pos: [1.0, 2.05, 20], look: [0.6, 2.0, 2] },
  { key: 'trail', pos: [-1.2, 2.0, -8], look: [0.9, 2.0, -28] },
  { key: 'trail', pos: [1.1, 1.95, -36], look: [-0.6, 2.0, -56] },
  { key: 'trail', pos: [-0.4, 1.9, -64], look: [0, 2.4, -84] },
  { key: 'cabin', pos: [0, 1.85, -84], look: [0, 2.3, -95] },
  { key: 'cabin', pos: [0, 1.7, -94.6], look: [0, 1.7, -100] },
  { key: 'vinyl', pos: [-2.1, 1.58, -99.6], look: [-6.3, 1.5, -100.6] },
  { key: 'photos', pos: [-2.0, 1.66, -107.4], look: [-2.0, 1.82, -111.2] },
  { key: 'books', pos: [2.5, 1.56, -104.4], look: [6.3, 1.46, -105.6] },
  { key: 'desk', pos: [2.5, 1.5, -106.5], look: [2.7, 1.14, -109.7] },
  { key: 'porch', pos: [4.6, 1.66, -110.4], look: [4.6, 1.5, -114.5] },
  { key: 'porch', pos: [4.2, 1.78, -116.2], look: [1.6, 1.3, -125] },
];

const LAST = WAYPOINTS.length - 1;

const START_INDEX: Record<SectionKey, number> = SECTION_ORDER.reduce((acc, key) => {
  acc[key] = WAYPOINTS.findIndex((w) => w.key === key);
  return acc;
}, {} as Record<SectionKey, number>);

/** The index the camera reaches at the *end* of a section: the next section's first waypoint. */
function endIndex(key: SectionKey): number {
  const next = SECTION_ORDER[SECTION_ORDER.indexOf(key) + 1];
  return next ? START_INDEX[next] : LAST;
}

export function indexForSection(key: SectionKey, progress = 0): number {
  const start = START_INDEX[key] ?? 0;
  return start + clamp01(progress) * (endIndex(key) - start);
}

const positionCurve = new THREE.CatmullRomCurve3(
  WAYPOINTS.map((w) => new THREE.Vector3(...w.pos)),
  false,
  'centripetal',
  0.5,
);
const lookCurve = new THREE.CatmullRomCurve3(
  WAYPOINTS.map((w) => new THREE.Vector3(...w.look)),
  false,
  'centripetal',
  0.5,
);

export function samplePath(index: number, position: THREE.Vector3, look: THREE.Vector3) {
  const u = Math.min(1, Math.max(0, index / LAST));
  positionCurve.getPoint(u, position);
  lookCurve.getPoint(u, look);
}

/**
 * Shared, mutable read-out of where the visitor is. Atmosphere and the lamps read it every frame
 * without re-rendering React.
 */
export const journeyState = {
  /** Fractional waypoint index. */
  index: 0,
  /** 0..1 across the whole walk. */
  u: 0,
  /** 0 outdoors, 1 fully inside the cabin. */
  indoors: 0,
  /** 0 golden hour, 1 dusk on the porch. */
  dusk: 0,
};

const INDOORS_FROM = START_INDEX.cabin + 0.6;
const INDOORS_TO = START_INDEX.vinyl;
const OUTSIDE_AGAIN = START_INDEX.porch + 0.7;

function updateReadout(index: number) {
  journeyState.index = index;
  journeyState.u = index / LAST;
  const entering = clamp01((index - INDOORS_FROM) / Math.max(0.001, INDOORS_TO - INDOORS_FROM));
  const leaving = clamp01((index - OUTSIDE_AGAIN) / 0.8);
  journeyState.indoors = entering * (1 - leaving);
  journeyState.dusk = clamp01((index - START_INDEX.books) / (LAST - START_INDEX.books));
}

interface SectionBox {
  key: SectionKey;
  top: number;
  height: number;
}

function readSections(): SectionBox[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'));
  const boxes: SectionBox[] = [];
  for (const node of nodes) {
    const key = node.dataset.scene as SectionKey | undefined;
    if (!key || !SECTION_ORDER.includes(key)) continue;
    const rect = node.getBoundingClientRect();
    boxes.push({ key, top: rect.top + window.scrollY, height: Math.max(1, rect.height) });
  }
  return boxes.sort((a, b) => a.top - b.top);
}

function indexForScroll(boxes: SectionBox[], fallback: SectionKey): number {
  if (!boxes.length) return indexForSection(fallback);
  const y = window.scrollY;
  const last = boxes[boxes.length - 1];
  if (y >= last.top) return indexForSection(last.key, (y - last.top) / last.height);
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (y < box.top + box.height) {
      return indexForSection(box.key, (y - box.top) / box.height);
    }
  }
  return indexForSection(boxes[0].key);
}

/** Live target index, driven by scroll. Re-measures on resize and on any body reflow. */
function useScrollIndex(fallback: SectionKey) {
  const invalidate = useThree((state) => state.invalidate);
  const target = useRef(indexForSection(fallback));

  useEffect(() => {
    let boxes = readSections();
    const read = () => {
      target.current = indexForScroll(boxes, fallback);
      invalidate();
    };
    const measure = () => {
      boxes = readSections();
      read();
    };

    measure();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    // Fonts and late images change section heights after first paint.
    const settle = window.setTimeout(measure, 600);

    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', measure);
      observer.disconnect();
      window.clearTimeout(settle);
    };
  }, [fallback, invalidate]);

  return target;
}

export interface Framing {
  position: [number, number, number];
  lookAt: [number, number, number];
}

interface CameraProps {
  /** Section the page was opened at — also the resting pose when there are no sections. */
  start: SectionKey;
  reducedMotion: boolean;
  /** Detail pages (a single record, a single print) pin the camera here instead of scrolling. */
  framing?: Framing;
}

export function JourneyCamera({ start, reducedMotion, framing }: CameraProps) {
  const camera = useThree((state) => state.camera);
  const target = useScrollIndex(start);
  const current = useRef<number | null>(null);
  const eased = useRef({ v: 0 });
  const position = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const framePos = useMemo(() => new THREE.Vector3(), []);
  const frameLook = useMemo(() => new THREE.Vector3(), []);
  const framed = useRef(false);

  useFrame((_, delta) => {
    if (framing) {
      // Deep link: arrive already looking at the object, then hold.
      framePos.set(...framing.position);
      frameLook.set(...framing.lookAt);
      if (!framed.current || reducedMotion) {
        framed.current = true;
        camera.position.copy(framePos);
        look.copy(frameLook);
      } else {
        camera.position.lerp(framePos, 1 - Math.exp(-delta * 3));
        look.lerp(frameLook, 1 - Math.exp(-delta * 3));
      }
      camera.lookAt(look);
      updateReadout(indexForSection(start, 0.5));
      return;
    }

    if (current.current === null) {
      // First frame: the page has already been scrolled to the deep-linked section, so snap.
      current.current = target.current;
      eased.current.v = target.current;
    } else if (reducedMotion) {
      eased.current.v = target.current;
    } else {
      damp(eased.current, 'v', target.current, 0.42, delta);
    }
    current.current = eased.current.v;

    samplePath(eased.current.v, position, look);
    camera.position.copy(position);
    camera.lookAt(look);
    updateReadout(eased.current.v);
  });

  return null;
}
