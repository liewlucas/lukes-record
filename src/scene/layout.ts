/**
 * One world, one walk. The vista, the trail, the cabin and the porch are all the same continuous
 * space: the visitor walks south (into -Z), in through the front door, around the room, and out
 * of the back door onto the porch. Every module measures itself from these numbers.
 */

export const GROUND_Y = 0;

export const CABIN = {
  /** Outer shell. */
  halfWidth: 7,
  zFront: -96,
  zBack: -112,
  wallHeight: 4.2,
  ridgeHeight: 6.6,
  floorY: 0.16,
  /** Inner faces. */
  innerHalfWidth: 6.4,
  innerFront: -96.7,
  innerBack: -111.3,
  /** Front door (the way in) and back door (the way out to the porch). */
  frontDoorX: 0,
  backDoorX: 4.6,
  doorWidth: 1.7,
  doorHeight: 2.5,
} as const;

/** Where each interactive corner lives inside the room. */
export const CORNERS = {
  vinyl: { x: -6.3, z: -100.6, yaw: Math.PI / 2 },
  photos: { x: -2.0, z: -111.1, yaw: 0 },
  books: { x: 6.3, z: -105.6, yaw: -Math.PI / 2 },
  desk: { x: 2.7, z: -109.6, yaw: 0 },
} as const;

export const PORCH = {
  zFront: -112,
  zRail: -118.4,
  halfWidth: 5.2,
  deckY: 0.16,
  roofY: 3.5,
} as const;

/** The trail's spine, north to south, as a set of control points in the XZ plane. */
export const TRAIL_POINTS: [number, number][] = [
  [0, 34],
  [1.6, 20],
  [-1.4, 4],
  [1.2, -14],
  [-1.6, -34],
  [0.9, -54],
  [-0.6, -72],
  [0, -88],
  [0, CABIN.zFront - 2],
];

export const SUN_DIRECTION: [number, number, number] = [88, 46, -230];
