/**
 * One world, one walk. The vista, the trail, the cabin and the porch are all the same continuous
 * space: the visitor walks south (into -Z), in through the front door, around the room, and out
 * of the back door onto the porch. Every module measures itself from these numbers, and the
 * camera waypoints in ./journey.ts are quoted in the same metres.
 *
 * Scale is human and deliberately tight: the room is 10.8 m by 11.4 m *outside* the logs, with a
 * 2.7 m ceiling at the eaves. A cabin, not a hall — you should be able to reach the mantel from
 * the armchair.
 */

export const GROUND_Y = 0;
export const EYE = 1.62;

export const CABIN = {
  halfWidth: 5.6,
  zFront: -95,
  zBack: -106.4,
  /** Top of the wall plate. With floorY that is a 2.71 m ceiling inside. */
  wallHeight: 3.05,
  ridgeHeight: 6.3,
  /** Interior floor sits one course above the ground. */
  floorY: 0.34,
  /** Inner faces of the log walls. */
  innerHalfWidth: 5.4,
  innerFront: -95.2,
  innerBack: -106.2,
  /** Front door (the way in) and back door (the way out to the porch). */
  frontDoorX: 0,
  backDoorX: 3.0,
  doorWidth: 1.6,
  doorHeight: 2.05,
  /** Stone chimney, outside the left wall, over the hearth. */
  chimneyX: -7.1,
  chimneyZ: -103.1,
} as const;

/** Sill and head of every window, measured from the ground. */
export const WINDOW = { bottom: 1.55, top: 2.62 } as const;

/** Where each thing in the room lives, and which way it faces. */
export const CORNERS = {
  /** Left wall, first thing past the door. Records face into the room (+X). */
  vinyl: { x: -5.0, y: CABIN.floorY, z: -98.4, yaw: Math.PI / 2 },
  /** Turntable on a low cabinet, immediately next to the rack. */
  turntable: { x: -4.55, y: CABIN.floorY, z: -100.6, yaw: Math.PI / 2 },
  /** Hearth further down the same wall — its light reaches the whole room. */
  hearth: { x: -5.05, y: CABIN.floorY, z: -103.1, yaw: Math.PI / 2 },
  /** Back wall, left of centre. Prints hang on a line strung across it. */
  photos: { x: -2.1, y: CABIN.floorY, z: -106.1, yaw: 0 },
  /** Right wall. Spines face into the room (-X). */
  books: { x: 5.05, y: CABIN.floorY, z: -101.0, yaw: -Math.PI / 2 },
  /** Back wall, right of centre, beside the door out. */
  desk: { x: 1.2, y: CABIN.floorY, z: -105.6, yaw: 0 },
  /** Reading lamp on a side table by the armchair. */
  lamp: { x: -1.5, y: CABIN.floorY, z: -100.9, yaw: 0 },
  /** Armchair, turned toward the fire. */
  chair: { x: -2.7, y: CABIN.floorY, z: -102.0, yaw: -1.9 },
} as const;

export const PORCH = {
  zFront: CABIN.zBack,
  zEdge: -112,
  halfWidth: 4.6,
  deckY: CABIN.floorY,
  postHeight: 2.85,
  railHeight: 1.0,
  steps: 3,
} as const;

/** The trail's spine, north to south, as control points in the XZ plane. */
export const TRAIL_POINTS: [number, number][] = [
  [0, 46],
  [1.8, 30],
  [-1.6, 12],
  [1.4, -8],
  [-1.8, -30],
  [1.1, -50],
  [-0.8, -70],
  [0.2, -84],
  [0, CABIN.zFront - 3.2],
];

/** Low and to the left, so the shadows lie long across the meadow. */
export const SUN_DIRECTION: [number, number, number] = [-96, 42, -210];

/* ------------------------------------------------------------------ object slots */

export interface Slot {
  position: [number, number, number];
  /** Yaw only: everything in the room stands upright. */
  yaw: number;
}

/** Records stand face out on three rails against the left wall. */
export const RACK = {
  /** Sleeve edge length and thickness. */
  size: 0.3,
  thickness: 0.018,
  /** Centre-to-centre spacing along the rail: sleeves stand shoulder to shoulder. */
  pitch: 0.325,
  /** Y of each tier's sleeve centre, above the floor. */
  tiers: [1.79, 1.26, 0.73] as const,
  perTier: 7,
  /** Distance from the wall face to the sleeve face. */
  standoff: 0.19,
};

/**
 * Column 0 sits at the far (deeper) end of the rail, which is the side the camera frames from
 * the doorway — so the published records land in the right of the shot, clear of the HTML panel.
 */
export function recordSlot(index: number): Slot {
  const tier = Math.min(RACK.tiers.length - 1, Math.floor(index / RACK.perTier));
  const column = index - tier * RACK.perTier;
  const span = (RACK.perTier - 1) * RACK.pitch;
  const z = CORNERS.vinyl.z - span / 2 + column * RACK.pitch;
  return {
    position: [CORNERS.vinyl.x + RACK.standoff, CABIN.floorY + RACK.tiers[tier], z],
    yaw: CORNERS.vinyl.yaw,
  };
}

/** Prints hang from a line strung across the back wall. */
export const LINE = {
  y: 2.06,
  sag: 0.18,
  fromX: -3.9,
  toX: -0.35,
  z: CABIN.zBack + 0.3,
  printWidth: 0.56,
};

/** The point on the line a print hangs from; the print itself drops below it by its own height. */
export function printSlot(index: number, total: number): Slot & { sag: number } {
  const t = total <= 1 ? 0.5 : 0.08 + (index / (total - 1)) * 0.84;
  const x = LINE.fromX + (LINE.toX - LINE.fromX) * t;
  const sag = Math.sin(Math.PI * t) * LINE.sag;
  return {
    position: [x, CABIN.floorY + LINE.y - sag, LINE.z],
    yaw: 0,
    sag,
  };
}

/** Where a print of this height hangs so its pegs reach the line. */
export const PEG_DROP = 0.052;

/** Books lean on three shelves of the right-hand bookcase, nearest the door first. */
export const SHELF = {
  tiers: [0.55, 1.02, 1.49] as const,
  perTier: 26,
  pitch: 0.056,
  standoff: 0.13,
};

export function bookSlot(index: number): Slot {
  const tier = Math.min(SHELF.tiers.length - 1, Math.floor(index / SHELF.perTier));
  const column = index - tier * SHELF.perTier;
  const span = (SHELF.perTier - 1) * SHELF.pitch;
  const z = CORNERS.books.z - span / 2 + column * SHELF.pitch;
  return {
    position: [CORNERS.books.x - SHELF.standoff, CABIN.floorY + SHELF.tiers[tier], z],
    yaw: CORNERS.books.yaw,
  };
}

/** Stand back from a slot along its own facing, for deep-link framing. */
export function framingFor(slot: Slot, distance: number, rise = 0): { position: [number, number, number]; lookAt: [number, number, number] } {
  const [x, y, z] = slot.position;
  const nx = Math.sin(slot.yaw);
  const nz = Math.cos(slot.yaw);
  return {
    position: [x + nx * distance, y + rise, z + nz * distance],
    lookAt: [x, y, z],
  };
}

/* --------------------------------------------------------------- slot prominence */

/** 0, 1, 2 ... reordered so the middle comes first and the ends last. */
function centreOutwards(count: number): number[] {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
}

/**
 * Slot indices ordered by how well they are framed, best first.
 *
 * Published records and books take the front of this list and the kraft fillers take the rest,
 * so the real content always sits in the middle of the shot — surrounded by the collection
 * rather than pushed to an end of it, which is what happens if you simply fill left to right and
 * then crop the shot for a phone.
 */
export function rackSlotOrder(): number[] {
  const order: number[] = [];
  // Middle rail is at eye level, then the top, then the bottom.
  for (const tier of [1, 0, 2]) for (const column of centreOutwards(RACK.perTier)) order.push(tier * RACK.perTier + column);
  return order;
}

export function shelfSlotOrder(): number[] {
  const order: number[] = [];
  for (const tier of [1, 2, 0]) for (const column of centreOutwards(SHELF.perTier)) order.push(tier * SHELF.perTier + column);
  return order;
}
