/**
 * The journey: one camera path for the whole site.
 *
 * The page is a single tall document whose sections carry `data-scene="<key>"`. At runtime we
 * measure those sections and map window scroll onto one spline that runs from the vista, down
 * the trail, through the cabin door, around the three corners, past the desk and out onto the
 * porch. Scroll position -> section -> eased position along that section's stretch of the spline.
 *
 * The camera is damped along the *path parameter*, not in free space, so it never cuts a corner
 * through a wall however fast the visitor flicks the scrollbar. Every waypoint also carries the
 * light it stands in — exposure, how indoors it is, how far into dusk — and those are
 * interpolated with the same parameter, so the grade changes exactly as the room does.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { damp, damp3 } from 'maath/easing';
import * as THREE from 'three';
import { clamp01 } from './noise';
import { CABIN, EYE } from './layout';

export type SectionKey = 'vista' | 'trail' | 'cabin' | 'vinyl' | 'photos' | 'books' | 'desk' | 'porch';

export const SECTION_ORDER: SectionKey[] = ['vista', 'trail', 'cabin', 'vinyl', 'photos', 'books', 'desk', 'porch'];

export interface Waypoint {
  key: SectionKey;
  pos: [number, number, number];
  look: [number, number, number];
  /** Tone-mapping exposure at this point on the walk. Bright outside, lifted inside. */
  exposure: number;
  /** 0 fully outdoors, 1 fully in the room. Drives fog, env intensity and the lamps. */
  indoors: number;
  /** 0 golden hour, 1 dusk. */
  dusk: number;
  fov: number;
  /**
   * 1 where the shot is *of* something — a rack, a wall, a desk. Narrow viewports pull back and
   * open up at these waypoints so the subject still fits; 0 where the shot is a landscape and
   * cropping it is fine.
   */
  hero: number;
  /**
   * Metres the look point was pushed left of the subject to clear the HTML panel, which on a
   * wide viewport is a column down the left. Narrow viewports put the panel across the top
   * instead, so the bias is unwound as the frame gets tall and the subject re-centres.
   */
  bias?: number;
}

const FLOOR = CABIN.floorY;

/**
 * The waypoint table. One entry per section minimum; the trail — the long one — gets five so
 * the walk actually curves through the pines instead of sliding down a rail.
 */
export const WAYPOINTS: Waypoint[] = [
  // Vista: high on the shoulder above the valley, the whole walk laid out ahead.
  { key: 'vista', pos: [0, 17.5, 62], look: [0, 5.6, -44], exposure: 1.0, indoors: 0, dusk: 0, fov: 46, hero: 0.45 },
  // Trail: down onto the path and in among the trees. Five waypoints, travelled at a constant
  // pace across the whole section, so a quarter of the scroll is a quarter of the walk.
  { key: 'trail', pos: [0.9, EYE + 0.3, 27], look: [0.6, EYE + 0.2, 8], exposure: 1.0, indoors: 0, dusk: 0, fov: 48, hero: 0 },
  { key: 'trail', pos: [-1.4, EYE + 0.24, 2], look: [1.0, EYE + 0.2, -18], exposure: 1.02, indoors: 0, dusk: 0, fov: 48, hero: 0 },
  { key: 'trail', pos: [1.2, EYE + 0.22, -26], look: [-0.8, EYE + 0.25, -46], exposure: 1.04, indoors: 0, dusk: 0, fov: 48, hero: 0 },
  { key: 'trail', pos: [-1.0, EYE + 0.2, -52], look: [0.4, EYE + 0.5, -72], exposure: 1.04, indoors: 0, dusk: 0, fov: 48, hero: 0 },
  { key: 'trail', pos: [0.3, EYE + 0.16, -76], look: [0, EYE + 0.7, -92], exposure: 1.02, indoors: 0, dusk: 0, fov: 48, hero: 0 },
  // Cabin: the doorway grows, swallows the frame, and the room opens up. The section holds on
  // the last of these three while its panel is being read.
  { key: 'cabin', pos: [0, EYE + 0.12, -88.4], look: [0, EYE + 0.55, -95.3], exposure: 1.0, indoors: 0.05, dusk: 0, fov: 47, hero: 0.3 },
  { key: 'cabin', pos: [0, EYE, -93.6], look: [0, FLOOR + 1.35, -98.6], exposure: 1.12, indoors: 0.4, dusk: 0, fov: 52, hero: 0.6 },
  { key: 'cabin', pos: [0, FLOOR + 1.5, -96.3], look: [-1.2, FLOOR + 1.44, -102.2], exposure: 1.3, indoors: 0.9, dusk: 0, fov: 58, hero: 1, bias: 0.62 },
  // The corners. Each is a single waypoint: the camera arrives, holds while the panel is read,
  // then leaves. Every hero object is composed right of centre, clear of the HTML panel.
  { key: 'vinyl', pos: [-2.45, FLOOR + 1.4, -97.9], look: [-4.91, FLOOR + 1.26, -97.91], exposure: 1.36, indoors: 1, dusk: 0, fov: 58, hero: 1, bias: 0.5 },
  { key: 'photos', pos: [-2.0, FLOOR + 1.5, -103.3], look: [-2.45, FLOOR + 1.42, -106.1], exposure: 1.38, indoors: 1, dusk: 0, fov: 58, hero: 1, bias: 0.32 },
  { key: 'books', pos: [3.2, FLOOR + 1.34, -100.5], look: [4.92, FLOOR + 1.04, -101.38], exposure: 1.4, indoors: 1, dusk: 0.04, fov: 58, hero: 1, bias: 0.4 },
  { key: 'desk', pos: [1.5, FLOOR + 1.45, -103.6], look: [0.62, FLOOR + 1.02, -105.65], exposure: 1.38, indoors: 1, dusk: 0.1, fov: 56, hero: 1, bias: 0.55 },
  // Out of the back door onto the porch, into dusk.
  { key: 'porch', pos: [CABIN.backDoorX, FLOOR + 1.56, -105.3], look: [CABIN.backDoorX, FLOOR + 1.36, -109.6], exposure: 1.3, indoors: 0.7, dusk: 0.45, fov: 54, hero: 1 },
  { key: 'porch', pos: [2.4, FLOOR + 1.62, -109.8], look: [0.0, FLOOR + 0.9, -118.5], exposure: 1.16, indoors: 0.08, dusk: 1, fov: 50, hero: 0.4 },
];

const LAST = WAYPOINTS.length - 1;

const START_INDEX = SECTION_ORDER.reduce(
  (acc, key) => {
    acc[key] = Math.max(0, WAYPOINTS.findIndex((w) => w.key === key));
    return acc;
  },
  {} as Record<SectionKey, number>,
);

/** The index the camera reaches at the *end* of a section: the next section's first waypoint. */
function endIndex(key: SectionKey): number {
  const next = SECTION_ORDER[SECTION_ORDER.indexOf(key) + 1];
  return next ? START_INDEX[next] : LAST;
}

function smooth(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Sections whose scroll is a journey rather than an arrival: travel the whole way through. */
const TRAVEL_SECTIONS: SectionKey[] = ['trail'];
/** Fraction of an arrival section spent getting there, and spent standing still once there. */
const ARRIVE = 0.32;
const DWELL = 0.58;

/**
 * Scroll progress within a section -> position along the path.
 *
 * Arrival sections *dwell*. Without this the camera leaves for the next corner the moment the
 * section starts, so by the time the vinyl panel is under your eye the frame is already showing
 * the photo wall. Now the camera reaches the section's own framing, holds it for the middle of
 * the section — the part you are actually reading — and only then travels on.
 */
export function indexForSection(key: SectionKey, progress = 0): number {
  const start = START_INDEX[key] ?? 0;
  const end = endIndex(key);
  const p = clamp01(progress);
  // Constant pace: a quarter of the scroll must be a quarter of the walk, or the forest is
  // gone before the visitor has read the first signpost. Ease only at the two ends.
  if (TRAVEL_SECTIONS.includes(key)) return start + (0.12 * smooth(p) + 0.88 * p) * (end - start);

  // The last waypoint of the section is the one to hold; anything before it is the approach.
  const hold = Math.max(start, end - 1);
  if (p < ARRIVE) return hold > start ? start + smooth(p / ARRIVE) * (hold - start) : start;
  if (p < DWELL) return hold;
  return hold + smooth((p - DWELL) / (1 - DWELL)) * (end - hold);
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
  const u = clamp01(index / LAST);
  positionCurve.getPoint(u, position);
  lookCurve.getPoint(u, look);
}

/**
 * Shared, mutable read-out of where the visitor is and what light they are standing in.
 * Atmosphere, lamps and the post stack read it every frame without re-rendering React.
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
  /** Tone-mapping exposure for this point on the walk. */
  exposure: 1,
  /** Metres from the eye to whatever it is looking at — the depth-of-field focus. */
  focusDistance: 12,
  /** Live camera position, so world modules can measure against it without a useThree call. */
  eye: new THREE.Vector3(),
  /** Live look-at point. Depth of field keeps this one thing sharp. */
  focus: new THREE.Vector3(),
};

function mixAt(index: number) {
  const i = Math.max(0, Math.min(LAST, Math.floor(index)));
  const j = Math.min(LAST, i + 1);
  const t = clamp01(index - i);
  const a = WAYPOINTS[i];
  const b = WAYPOINTS[j];
  return {
    exposure: a.exposure + (b.exposure - a.exposure) * t,
    indoors: a.indoors + (b.indoors - a.indoors) * t,
    dusk: a.dusk + (b.dusk - a.dusk) * t,
    fov: a.fov + (b.fov - a.fov) * t,
    hero: a.hero + (b.hero - a.hero) * t,
    bias: (a.bias ?? 0) + ((b.bias ?? 0) - (a.bias ?? 0)) * t,
  };
}

/* ---------------------------------------------------------------- scroll → index */

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
    boxes.push({ key, top: node.offsetTop, height: Math.max(1, node.offsetHeight) });
  }
  return boxes.sort((a, b) => a.top - b.top);
}

function indexForScroll(boxes: SectionBox[], fallback: SectionKey): number {
  if (!boxes.length) return indexForSection(fallback);
  const y = window.scrollY;
  const last = boxes[boxes.length - 1];
  if (y >= last.top) {
    // The final section is taller than the scroll left to give it — the viewport eats the last
    // screenful — so measure it against the travel that actually remains. Without this the walk
    // stops a waypoint short and never steps out onto the porch.
    const remaining = Math.max(1, document.documentElement.scrollHeight - window.innerHeight - last.top);
    return indexForSection(last.key, (y - last.top) / Math.min(last.height, remaining));
  }
  for (const box of boxes) {
    if (y < box.top + box.height) return indexForSection(box.key, (y - box.top) / box.height);
  }
  return indexForSection(boxes[0].key);
}

/** Live target index, driven by scroll. Re-measures on resize and on any body reflow. */
function useScrollIndex(fallback: SectionKey, enabled: boolean) {
  const invalidate = useThree((state) => state.invalidate);
  const target = useRef(0);
  if (target.current === 0) target.current = indexForSection(fallback);

  useEffect(() => {
    if (!enabled) return;
    let boxes = readSections();
    let frame = 0;
    const read = () => {
      target.current = indexForScroll(boxes, fallback);
      invalidate();
    };
    const measure = () => {
      boxes = readSections();
      read();
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    measure();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    // Fonts and late images change section heights after first paint.
    const settleTimer = window.setTimeout(measure, 700);

    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      window.clearTimeout(settleTimer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [fallback, invalidate, enabled]);

  return target;
}

/* -------------------------------------------------------------------- the camera */

export interface Framing {
  position: [number, number, number];
  lookAt: [number, number, number];
}

interface CameraProps {
  /** Section the page was opened at — also the resting pose when there are no sections. */
  start: SectionKey;
  reducedMotion: boolean;
  /** A deep link pulls the camera off the path to frame one object. */
  framing?: Framing;
}

/* ------------------------------------------------------------- narrow viewports */

/**
 * Portrait rule.
 *
 * Field of view is quoted vertically, so a phone keeps the full vertical angle and loses almost
 * two thirds of the horizontal one: at 390x844 a 58 degree lens sees 29 degrees across instead
 * of 83. A shot composed for a laptop therefore arrives on a phone with both ends of the record
 * rack outside the frame. Rather than author a second set of waypoints, every *hero* waypoint is
 * corrected at runtime:
 *
 *   - dolly straight back along the camera-to-subject line, up to x1.62, so the subject fits;
 *   - open the lens by up to 15 degrees, which buys width without moving further still;
 *   - raise the aim, so the subject sits in the lower two thirds — under the HTML panel, which
 *     on a phone spans the full width across the top third rather than a column down one side.
 *
 * `hero` scales all three, so landscapes (the vista, the trail) are left cropped as intended.
 */
const NARROW_FROM = 1.15;
const NARROW_TO = 0.5;
const MAX_DOLLY = 0.62;
const MAX_FOV_GAIN = 15;
/** Fraction of frame height to push the subject down by, at full correction. */
const LOWER_BY = 0.17;

export function narrowness(aspect: number): number {
  return clamp01((NARROW_FROM - aspect) / (NARROW_FROM - NARROW_TO));
}

/** Mutates `position` and `look` in place. Returns the field of view to use. */
const UP = new THREE.Vector3(0, 1, 0);

export function applyPortrait(
  position: THREE.Vector3,
  look: THREE.Vector3,
  fov: number,
  amount: number,
  bias: number,
  scratch: THREE.Vector3,
  scratch2: THREE.Vector3,
): number {
  if (amount <= 0.001) return fov;
  scratch.subVectors(position, look);
  const distance = scratch.length();
  // Re-centre: give back the sideways offset that was there to dodge a left-hand panel.
  if (bias !== 0) {
    scratch2.crossVectors(scratch, UP).normalize();
    look.addScaledVector(scratch2, -bias * amount);
  }
  position.addScaledVector(scratch.normalize(), distance * MAX_DOLLY * amount);
  const widened = fov + MAX_FOV_GAIN * amount;
  const reach = distance * (1 + MAX_DOLLY * amount);
  look.y += LOWER_BY * amount * reach * Math.tan((widened * Math.PI) / 360);
  return widened;
}

export function JourneyCamera({ start, reducedMotion, framing }: CameraProps) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const target = useScrollIndex(start, !framing);
  const eased = useRef({ v: -1 });
  const position = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const smoothLook = useMemo(() => new THREE.Vector3(), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const scratch2 = useMemo(() => new THREE.Vector3(), []);
  const settled = useRef(false);

  useFrame((_, delta) => {
    // The framing index still drives the light: a deep link into the cabin is lamp-lit.
    const baseIndex = framing ? indexForSection(start, 0.5) : target.current;

    if (eased.current.v < 0) {
      // First frame. The page has already been scrolled to the deep-linked section, so snap.
      eased.current.v = baseIndex;
    } else if (reducedMotion) {
      eased.current.v = baseIndex;
    } else {
      damp(eased.current, 'v', baseIndex, 0.5, delta, undefined, undefined, 0.0005);
    }

    samplePath(eased.current.v, position, look);
    const mix = mixAt(eased.current.v);

    if (framing) {
      position.set(...framing.position);
      look.set(...framing.lookAt);
    }

    // Narrow viewports pull back and open up so the subject still fits (see applyPortrait).
    const narrow = narrowness(camera.aspect) * (framing ? 1 : mix.hero);
    const fov = applyPortrait(position, look, mix.fov, narrow, framing ? 0 : mix.bias, scratch, scratch2);

    if (reducedMotion || !settled.current) {
      settled.current = true;
      camera.position.copy(position);
      smoothLook.copy(look);
    } else {
      // A second, lighter damp on top of the path parameter: the needle settling on the record.
      const ease = framing ? 0.7 : 0.22;
      damp3(camera.position, position, ease, delta);
      damp3(smoothLook, look, framing ? 0.7 : 0.3, delta);
    }

    camera.lookAt(smoothLook);

    journeyState.index = eased.current.v;
    journeyState.u = clamp01(eased.current.v / LAST);
    journeyState.indoors = mix.indoors;
    journeyState.dusk = mix.dusk;
    journeyState.exposure = mix.exposure;
    journeyState.focusDistance = Math.max(0.6, camera.position.distanceTo(smoothLook));
    journeyState.eye.copy(camera.position);
    journeyState.focus.copy(smoothLook);

    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
