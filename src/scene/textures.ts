/**
 * Procedural surfaces. Everything is drawn once into a 2D canvas and cached by key, so a
 * texture is generated at most once per page load however many meshes ask for it, and the whole
 * cache is disposed when the island unmounts. No files, no network, nothing to download.
 *
 * A "surface" is the Eevee-ish trio: a colour map, a normal map and a roughness map, all three
 * derived from the *same* height field, so the grain you see, the grain that catches the light
 * and the grain that scatters it are the same grain.
 */
import * as THREE from 'three';
import { fbm, mulberry32, noise2 } from './noise';
import { PALETTE, SURFACE } from './palette';

const cache = new Map<string, THREE.Texture>();
/** Labels are redrawn once the webfonts land; keep their draw calls around for that. */
const redraws = new Set<() => void>();
let fontsWatched = false;

function watchFonts() {
  if (fontsWatched || typeof document === 'undefined' || !('fonts' in document)) return;
  fontsWatched = true;
  document.fonts.ready.then(() => redraws.forEach((redraw) => redraw())).catch(() => {});
}

function canvasOf(width: number, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function finish(canvas: HTMLCanvasElement, srgb: boolean, repeat: number, anisotropy = 8): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(repeat);
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------------------------------------------- height → maps */

/** Sobel the height field into a tangent-space normal map. */
function normalFromHeight(height: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) - (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz / len) * 0.5 * 255 + 127.5;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Roughness from the same height field: the low, worn places are smoother than the ridges. */
function roughFromHeight(height: Float32Array, size: number, base: number, range: number): HTMLCanvasElement {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let i = 0; i < height.length; i++) {
    const v = Math.max(0, Math.min(1, base + (height[i] - 0.5) * range));
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v * 255;
    data[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export interface Surface {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalScale: THREE.Vector2;
}

interface SurfaceOptions {
  size?: number;
  normalStrength?: number;
  roughBase?: number;
  roughRange?: number;
  normalScale?: number;
}

/**
 * Build (or fetch from cache) a colour/normal/roughness trio. `repeat` produces a cheap clone
 * that shares the same GPU upload, so the same wood can tile at three scales for free.
 */
function buildSurface(
  draw: (ctx: CanvasRenderingContext2D, height: Float32Array, size: number) => void,
  options: SurfaceOptions = {},
): { map: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement } {
  const size = options.size ?? 512;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d')!;
  const height = new Float32Array(size * size).fill(0.5);
  draw(ctx, height, size);
  return {
    map: canvas,
    normal: normalFromHeight(height, size, options.normalStrength ?? 2.2),
    rough: roughFromHeight(height, size, options.roughBase ?? 0.8, options.roughRange ?? 0.3),
  };
}

function surface(key: string, repeat: number, build: () => ReturnType<typeof buildSurface>, normalScale = 1): Surface {
  const hit = cache.get(`${key}|${repeat}|s`);
  if (hit) {
    return {
      map: hit,
      normalMap: cache.get(`${key}|${repeat}|n`)!,
      roughnessMap: cache.get(`${key}|${repeat}|r`)!,
      normalScale: new THREE.Vector2(normalScale, normalScale),
    };
  }
  const built = build();
  const map = finish(built.map, true, repeat);
  const normalMap = finish(built.normal, false, repeat);
  const roughnessMap = finish(built.rough, false, repeat);
  cache.set(`${key}|${repeat}|s`, map);
  cache.set(`${key}|${repeat}|n`, normalMap);
  cache.set(`${key}|${repeat}|r`, roughnessMap);
  return { map, normalMap, roughnessMap, normalScale: new THREE.Vector2(normalScale, normalScale) };
}

/* -------------------------------------------------------------------------- wood */

type WoodVariant = 'floor' | 'shelf' | 'wall' | 'desk' | 'plank';

const WOOD_BASE: Record<WoodVariant, string> = {
  floor: SURFACE.woodFloor,
  shelf: SURFACE.woodMid,
  wall: SURFACE.woodDark,
  desk: SURFACE.woodLight,
  plank: '#6B5138',
};

/** Sawn plank: long grain wandering along x, board seams, knots that pull the grain round. */
export function woodSurface(variant: WoodVariant = 'shelf', repeat = 1, boards = 5): Surface {
  return surface(
    `wood-${variant}-${boards}`,
    repeat,
    () =>
      buildSurface(
        (ctx, height, size) => {
          const random = mulberry32(variant.length * 7919 + boards * 131 + 11);
          ctx.fillStyle = WOOD_BASE[variant];
          ctx.fillRect(0, 0, size, size);

          // Knot centres pull the grain lines around them.
          const knots = Array.from({ length: 4 }, () => ({ x: random() * size, y: random() * size, r: 8 + random() * 16 }));
          const warp = (x: number, y: number) => {
            let dy = 0;
            for (const knot of knots) {
              const dx = x - knot.x;
              const d = Math.hypot(dx, y - knot.y);
              if (d < knot.r * 5) dy += (knot.y - y) * Math.exp(-(d * d) / (knot.r * knot.r * 6)) * 0.9;
            }
            return dy;
          };

          for (let i = 0; i < 340; i++) {
            const y0 = random() * size;
            const light = random() > 0.52;
            const strength = 0.04 + random() * 0.11;
            ctx.strokeStyle = light ? `rgba(255,226,182,${strength})` : `rgba(26,15,7,${strength * 1.2})`;
            ctx.lineWidth = 0.5 + random() * 2.4;
            ctx.beginPath();
            let first = true;
            for (let x = -8; x <= size + 8; x += 8) {
              const y = y0 + Math.sin(x * 0.017 + i) * 2.6 + (noise2(x * 0.012, i * 0.7) - 0.5) * 7 + warp(x, y0);
              if (first) {
                ctx.moveTo(x, y);
                first = false;
              } else ctx.lineTo(x, y);
              const px = Math.max(0, Math.min(size - 1, Math.round(x)));
              const py = ((Math.round(y) % size) + size) % size;
              height[py * size + px] += light ? 0.05 : -0.06;
            }
            ctx.stroke();
          }

          // Board seams: a dark line plus a shadowed lip either side.
          ctx.lineCap = 'butt';
          for (let b = 1; b < boards; b++) {
            const y = Math.round((size / boards) * b);
            ctx.fillStyle = 'rgba(14,8,3,0.55)';
            ctx.fillRect(0, y - 1, size, 2.5);
            ctx.fillStyle = 'rgba(255,232,196,0.06)';
            ctx.fillRect(0, y + 2, size, 2);
            for (let x = 0; x < size; x++) {
              for (let d = -2; d <= 2; d++) {
                const py = ((y + d) % size + size) % size;
                height[py * size + x] = 0.5 - 0.42 * (1 - Math.abs(d) / 3);
              }
            }
          }

          // Knot rings.
          for (const knot of knots) {
            for (let r = knot.r; r > 0; r -= 1.6) {
              ctx.strokeStyle = `rgba(24,13,5,${0.06 + (knot.r - r) * 0.012})`;
              ctx.lineWidth = 1.1;
              ctx.beginPath();
              ctx.ellipse(knot.x, knot.y, r * 1.7, r, 0.2, 0, Math.PI * 2);
              ctx.stroke();
            }
            const cx = Math.round(knot.x);
            const cy = Math.round(knot.y);
            for (let y = -12; y <= 12; y++) {
              for (let x = -18; x <= 18; x++) {
                const px = ((cx + x) % size + size) % size;
                const py = ((cy + y) % size + size) % size;
                const d = Math.hypot(x / 1.6, y);
                if (d < 12) height[py * size + px] -= (1 - d / 12) * 0.3;
              }
            }
          }
        },
        { size: 512, normalStrength: 1.7, roughBase: 0.72, roughRange: 0.34 },
      ),
    0.9,
  );
}

/* -------------------------------------------------------------------------- bark */

export function barkSurface(repeat = 1): Surface {
  return surface(
    'bark',
    repeat,
    () =>
      buildSurface(
        (ctx, height, size) => {
          ctx.fillStyle = SURFACE.bark;
          ctx.fillRect(0, 0, size, size);
          const random = mulberry32(777);
          for (let i = 0; i < 320; i++) {
            const x0 = random() * size;
            const dark = random() > 0.45;
            ctx.strokeStyle = dark ? `rgba(24,15,8,${0.16 + random() * 0.3})` : `rgba(158,124,86,${0.06 + random() * 0.14})`;
            ctx.lineWidth = 0.7 + random() * 2.6;
            ctx.beginPath();
            for (let y = -6; y <= size + 6; y += 10) {
              const x = x0 + Math.sin(y * 0.045 + i) * 3.1 + (noise2(i * 0.4, y * 0.02) - 0.5) * 6;
              if (y < 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              const px = ((Math.round(x) % size) + size) % size;
              const py = Math.max(0, Math.min(size - 1, Math.round(y)));
              height[py * size + px] += dark ? -0.14 : 0.09;
            }
            ctx.stroke();
          }
        },
        { size: 256, normalStrength: 3.2, roughBase: 0.92, roughRange: 0.16 },
      ),
    1.3,
  );
}

/* ------------------------------------------------------------------------- paper */

/** Kraft paper: fibre speckle over a warm ground. Record sleeves, print mounts, panels. */
export function kraftSurface(repeat = 1, tint: string = PALETTE.kraft, key = 'kraft'): Surface {
  return surface(
    `${key}-${tint}`,
    repeat,
    () =>
      buildSurface(
        (ctx, height, size) => {
          ctx.fillStyle = tint;
          ctx.fillRect(0, 0, size, size);
          const image = ctx.getImageData(0, 0, size, size);
          const data = image.data;
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const n = fbm(x * 0.09, y * 0.09, 3) - 0.5;
              const i = (y * size + x) * 4;
              const shift = n * 24;
              data[i] = Math.max(0, Math.min(255, data[i] + shift));
              data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + shift * 0.9));
              data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + shift * 0.7));
              height[y * size + x] = 0.5 + n * 0.5;
            }
          }
          ctx.putImageData(image, 0, 0);
          const random = mulberry32(4242);
          for (let f = 0; f < 700; f++) {
            ctx.strokeStyle = `rgba(120,95,60,${0.03 + random() * 0.06})`;
            ctx.lineWidth = 0.6;
            const x = random() * size;
            const y = random() * size;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (random() - 0.5) * 12, y + (random() - 0.5) * 12);
            ctx.stroke();
          }
        },
        { size: 256, normalStrength: 1.1, roughBase: 0.88, roughRange: 0.14 },
      ),
    0.55,
  );
}

/* ---------------------------------------------------------------------- shingles */

/** Overlapping cedar shakes, each one its own weathered shade. */
export function shingleSurface(repeat = 1): Surface {
  return surface(
    'shingle',
    repeat,
    () =>
      buildSurface(
        (ctx, height, size) => {
          ctx.fillStyle = '#2A1F16';
          ctx.fillRect(0, 0, size, size);
          const random = mulberry32(90210);
          const rows = 10;
          const cols = 7;
          const h = size / rows;
          const w = size / cols;
          for (let r = 0; r < rows; r++) {
            const offset = (r % 2) * (w / 2);
            for (let c = -1; c <= cols; c++) {
              const x = offset + c * w;
              const y = r * h;
              const shade = 0.7 + random() * 0.5;
              const jitter = (random() - 0.5) * 3;
              ctx.fillStyle = `rgb(${Math.round(74 * shade)},${Math.round(56 * shade)},${Math.round(40 * shade)})`;
              ctx.beginPath();
              ctx.roundRect(x + 1, y + 1 + jitter, w - 2, h * 1.55, 2);
              ctx.fill();
              // Split lines down each shake.
              ctx.strokeStyle = 'rgba(18,11,6,0.45)';
              ctx.lineWidth = 0.8;
              for (let s = 0; s < 3; s++) {
                const sx = x + 3 + random() * (w - 6);
                ctx.beginPath();
                ctx.moveTo(sx, y + 2 + jitter);
                ctx.lineTo(sx + (random() - 0.5) * 3, y + h * 1.5);
                ctx.stroke();
              }
              // Height: each course steps up, with a hard shadow at its butt edge.
              for (let py = 0; py < h * 1.55; py++) {
                const gy = ((Math.round(y + py + jitter) % size) + size) % size;
                const level = py < 3 ? 0.15 : 0.5 + (py / (h * 1.55)) * 0.4;
                for (let px = 1; px < w - 1; px++) {
                  const gx = ((Math.round(x + px) % size) + size) % size;
                  height[gy * size + gx] = level * shade;
                }
              }
            }
          }
        },
        { size: 512, normalStrength: 2.6, roughBase: 0.9, roughRange: 0.18 },
      ),
    1.4,
  );
}

/* ------------------------------------------------------------------------- stone */

/** Field stone laid up with mortar: rounded cobbles, deep joints. */
export function stoneSurface(repeat = 1): Surface {
  return surface(
    'stone',
    repeat,
    () =>
      buildSurface(
        (ctx, height, size) => {
          ctx.fillStyle = '#3B342E';
          ctx.fillRect(0, 0, size, size);
          for (let i = 0; i < height.length; i++) height[i] = 0.16;
          const random = mulberry32(31337);
          for (let i = 0; i < 70; i++) {
            const cx = random() * size;
            const cy = random() * size;
            const rx = 16 + random() * 26;
            const ry = 11 + random() * 16;
            const rot = random() * Math.PI;
            const shade = 0.68 + random() * 0.5;
            const grad = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 1, cx, cy, rx);
            grad.addColorStop(0, `rgb(${Math.round(126 * shade)},${Math.round(116 * shade)},${Math.round(104 * shade)})`);
            grad.addColorStop(1, `rgb(${Math.round(78 * shade)},${Math.round(70 * shade)},${Math.round(62 * shade)})`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
            ctx.fill();
            const cos = Math.cos(-rot);
            const sin = Math.sin(-rot);
            for (let y = -Math.ceil(rx); y <= rx; y++) {
              for (let x = -Math.ceil(rx); x <= rx; x++) {
                const lx = (x * cos - y * sin) / rx;
                const ly = (x * sin + y * cos) / ry;
                const d = lx * lx + ly * ly;
                if (d > 1) continue;
                const px = ((Math.round(cx + x) % size) + size) % size;
                const py = ((Math.round(cy + y) % size) + size) % size;
                height[py * size + px] = 0.45 + Math.sqrt(1 - d) * 0.5;
              }
            }
          }
          // Lichen and soot speckle.
          for (let i = 0; i < 400; i++) {
            const x = random() * size;
            const y = random() * size;
            ctx.fillStyle = random() > 0.6 ? 'rgba(107,125,92,0.12)' : 'rgba(28,22,18,0.16)';
            ctx.beginPath();
            ctx.arc(x, y, 1 + random() * 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        },
        { size: 512, normalStrength: 2.4, roughBase: 0.94, roughRange: 0.12 },
      ),
    1.2,
  );
}

/* ------------------------------------------------------------------ cloth & rugs */

/** A flat weave: warp and weft crossing, with a stripe pattern in the palette. */
export function rugSurface(repeat = 1): Surface {
  return surface(
    'rug',
    repeat,
    () =>
      buildSurface(
        (ctx, height, size) => {
          const bands = ['#7E4A33', '#6E5540', '#A2937A', PALETTE.moss, '#63432F', PALETTE.pineShadow];
          const bandHeight = size / 9;
          for (let b = 0; b * bandHeight < size; b++) {
            ctx.fillStyle = bands[b % bands.length];
            ctx.fillRect(0, b * bandHeight, size, bandHeight);
          }
          // Weave: alternating light and dark threads both ways.
          const thread = 3;
          for (let y = 0; y < size; y += thread) {
            for (let x = 0; x < size; x += thread) {
              const over = ((x / thread + y / thread) | 0) % 2 === 0;
              ctx.fillStyle = over ? 'rgba(255,240,215,0.055)' : 'rgba(20,12,6,0.085)';
              ctx.fillRect(x, y, thread, thread);
              for (let py = 0; py < thread; py++)
                for (let px = 0; px < thread; px++) {
                  const gx = (x + px) % size;
                  const gy = (y + py) % size;
                  height[gy * size + gx] = over ? 0.72 : 0.3;
                }
            }
          }
          // A few worn patches.
          const random = mulberry32(5150);
          for (let i = 0; i < 26; i++) {
            const grad = ctx.createRadialGradient(random() * size, random() * size, 1, random() * size, random() * size, 30 + random() * 60);
            grad.addColorStop(0, 'rgba(233,220,197,0.14)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
          }
        },
        { size: 512, normalStrength: 1.6, roughBase: 0.95, roughRange: 0.1 },
      ),
    0.7,
  );
}

/** Lampshade linen: a loose slub weave, warm and slightly translucent-looking. */
export function linenSurface(repeat = 1): Surface {
  return surface(
    'linen',
    repeat,
    () =>
      buildSurface(
        (ctx, height, size) => {
          ctx.fillStyle = '#E4CFA4';
          ctx.fillRect(0, 0, size, size);
          const random = mulberry32(8181);
          for (let i = 0; i < 2600; i++) {
            const horizontal = random() > 0.5;
            const x = random() * size;
            const y = random() * size;
            const len = 6 + random() * 22;
            ctx.strokeStyle = random() > 0.5 ? 'rgba(255,246,224,0.3)' : 'rgba(140,112,72,0.22)';
            ctx.lineWidth = 0.8 + random() * 1.4;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(horizontal ? x + len : x, horizontal ? y : y + len);
            ctx.stroke();
            const px = Math.min(size - 1, Math.round(x));
            const py = Math.min(size - 1, Math.round(y));
            height[py * size + px] += 0.12;
          }
        },
        { size: 256, normalStrength: 1.2, roughBase: 0.96, roughRange: 0.08 },
      ),
    0.6,
  );
}

/* ------------------------------------------------------------------------ ground */

/**
 * Meadow detail. Tiled small and multiplied by the terrain's vertex colours, so the same mesh
 * reads as grass underfoot and as haze-blue rock two hundred metres away.
 */
export function groundSurface(repeat = 1): Surface {
  return surface(
    'ground',
    repeat,
    () =>
      buildSurface(
        (ctx, height, size) => {
          ctx.fillStyle = '#8E9670';
          ctx.fillRect(0, 0, size, size);
          const random = mulberry32(60613);
          // Clumps of tone, then individual blades.
          for (let i = 0; i < 260; i++) {
            const grad = ctx.createRadialGradient(random() * size, random() * size, 1, random() * size, random() * size, 12 + random() * 40);
            grad.addColorStop(0, random() > 0.5 ? 'rgba(124,138,95,0.4)' : 'rgba(88,98,68,0.4)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
          }
          for (let i = 0; i < 5200; i++) {
            const x = random() * size;
            const y = random() * size;
            const len = 2 + random() * 6;
            const lean = (random() - 0.5) * 3;
            ctx.strokeStyle = random() > 0.45 ? `rgba(150,166,110,${0.14 + random() * 0.3})` : `rgba(58,70,46,${0.12 + random() * 0.28})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + lean, y - len);
            ctx.stroke();
            const px = Math.min(size - 1, Math.round(x));
            const py = Math.min(size - 1, Math.round(y));
            height[py * size + px] += 0.16;
          }
        },
        { size: 256, normalStrength: 1.3, roughBase: 0.96, roughRange: 0.08 },
      ),
    0.7,
  );
}

/* ----------------------------------------------------------- flat helper textures */

function flat(key: string, size: number, srgb: boolean, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, size);
  const texture = finish(canvas, srgb, repeat, 4);
  cache.set(key, texture);
  return texture;
}

/** Soft radial falloff for sun glow, lamp bloom and mist. */
export function glowTexture(inner = 'rgba(255,242,214,0.95)', outer = 'rgba(217,164,65,0.4)', key = 'glow'): THREE.Texture {
  return flat(key, 256, true, (ctx, size) => {
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.4, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
}

/** A wisp of cloud/mist, soft on every edge so banks never show a seam. */
export function mistTexture(): THREE.Texture {
  return flat('mist', 256, true, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    const data = image.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const edge = Math.sin(Math.PI * nx) ** 1.5 * Math.sin(Math.PI * ny) ** 2.4;
        const n = fbm(nx * 3.4, ny * 3.4, 4);
        const alpha = Math.max(0, edge * (n * 1.6 - 0.36));
        const i = (y * size + x) * 4;
        data[i] = 252;
        data[i + 1] = 243;
        data[i + 2] = 228;
        data[i + 3] = Math.min(255, alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

/** A single soft round particle: smoke, dust motes, embers. */
export function puffTexture(): THREE.Texture {
  return flat('puff', 64, true, (ctx, size) => {
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
}

/** The worn dirt path: pale in the middle, dark and feathered at the edges. */
export function pathSurface(): { map: THREE.Texture; alphaMap: THREE.Texture; normalMap: THREE.Texture } {
  const key = 'path';
  if (!cache.has(`${key}|map`)) {
    const size = 256;
    const canvas = canvasOf(size);
    const ctx = canvas.getContext('2d')!;
    const alpha = canvasOf(size);
    const actx = alpha.getContext('2d')!;
    const height = new Float32Array(size * size);
    const image = ctx.createImageData(size, size);
    const amask = actx.createImageData(size, size);
    const light = new THREE.Color(SURFACE.dirt);
    const dark = new THREE.Color(SURFACE.dirtDark);
    const mix = new THREE.Color();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1);
        // u runs across the path; 0 and 1 are the verges.
        const centre = 1 - Math.abs(u - 0.5) * 2;
        const grit = fbm(x * 0.14, y * 0.14, 4);
        const wear = Math.min(1, centre * 1.35) * (0.65 + grit * 0.5);
        mix.copy(dark).lerp(light, Math.max(0, Math.min(1, wear)));
        const i = (y * size + x) * 4;
        image.data[i] = mix.r * 255;
        image.data[i + 1] = mix.g * 255;
        image.data[i + 2] = mix.b * 255;
        image.data[i + 3] = 255;
        const edge = Math.max(0, Math.min(1, (centre - 0.06) * 3.6)) * (0.55 + grit * 0.7);
        const a = Math.max(0, Math.min(1, edge));
        amask.data[i] = amask.data[i + 1] = amask.data[i + 2] = a * 255;
        amask.data[i + 3] = 255;
        height[y * size + x] = 0.5 + (grit - 0.5) * 0.7 - centre * 0.12;
      }
    }
    ctx.putImageData(image, 0, 0);
    actx.putImageData(amask, 0, 0);
    const map = finish(canvas, true, 1);
    map.wrapS = THREE.ClampToEdgeWrapping;
    const alphaMap = finish(alpha, false, 1);
    alphaMap.wrapS = THREE.ClampToEdgeWrapping;
    const normalMap = finish(normalFromHeight(height, size, 1.6), false, 1);
    normalMap.wrapS = THREE.ClampToEdgeWrapping;
    cache.set(`${key}|map`, map);
    cache.set(`${key}|alpha`, alphaMap);
    cache.set(`${key}|normal`, normalMap);
  }
  return {
    map: cache.get(`${key}|map`)!,
    alphaMap: cache.get(`${key}|alpha`)!,
    normalMap: cache.get(`${key}|normal`)!,
  };
}

/* ------------------------------------------------------------------------ labels */

export interface LabelOptions {
  /** CSS font shorthand. Fraunces / Karla / IBM Plex Mono are already loaded by the page. */
  font?: string;
  colour?: string;
  background?: string;
  width?: number;
  height?: number;
  align?: 'left' | 'center';
  rotate?: boolean;
  letterSpacing?: string;
}

/**
 * Text drawn with the page's own webfonts, straight into a canvas. Cheaper than an SDF text
 * engine and it needs no font file of its own — the stylesheet in the document head already
 * paid for Fraunces and IBM Plex Mono.
 */
export function labelTexture(text: string, options: LabelOptions = {}): THREE.Texture {
  const {
    font = "500 42px Fraunces, Georgia, 'Times New Roman', serif",
    colour = '#F5EFE2',
    background = 'transparent',
    width = 512,
    height = 128,
    align = 'center',
    rotate = false,
    letterSpacing = '0px',
  } = options;
  const key = `label|${text}|${font}|${colour}|${background}|${width}x${height}|${align}|${rotate}|${letterSpacing}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    if (background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.save();
    if (rotate) {
      ctx.translate(width / 2, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.translate(-height / 2, -width / 2);
    }
    const w = rotate ? height : width;
    const h = rotate ? width : height;
    ctx.font = font;
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = letterSpacing;
    ctx.fillStyle = colour;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align === 'center' ? 'center' : 'left';
    // Shrink to fit rather than clip: a long album title still reads.
    let size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '42');
    const pad = h * 0.16;
    while (ctx.measureText(text).width > w - pad * 2 && size > 8) {
      size -= 1;
      ctx.font = font.replace(/(\d+(?:\.\d+)?)px/, `${size}px`);
    }
    ctx.fillText(text, align === 'center' ? w / 2 : pad, h / 2);
    ctx.restore();
    texture.needsUpdate = true;
  };

  draw();
  redraws.add(draw);
  watchFonts();
  cache.set(key, texture);
  return texture;
}

/* ----------------------------------------------------------------- record labels */

/** The paper label at the centre of a record, and the sleeve front when there is no cover. */
export function sleeveTexture(title: string, year: string | undefined, band: string): THREE.Texture {
  const key = `sleeve|${title}|${year ?? ''}|${band}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 512;
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const draw = () => {
    // Kraft ground with fibre.
    ctx.fillStyle = PALETTE.kraft;
    ctx.fillRect(0, 0, size, size);
    const random = mulberry32(title.length * 977 + 13);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(122,96,62,${0.02 + random() * 0.05})`;
      ctx.fillRect(random() * size, random() * size, 1 + random() * 3, 1);
    }
    // The colour band across the lower third — the thing you recognise from across the room.
    ctx.fillStyle = band;
    ctx.fillRect(0, size * 0.62, size, size * 0.2);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, size * 0.62, size, 4);
    // Debossed circle where the record sits.
    ctx.strokeStyle = 'rgba(92,70,51,0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size * 0.38, size * 0.27, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#2B2018';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = 46;
    ctx.font = `600 ${fontSize}px Fraunces, Georgia, serif`;
    while (ctx.measureText(title).width > size - 64 && fontSize > 14) {
      fontSize -= 2;
      ctx.font = `600 ${fontSize}px Fraunces, Georgia, serif`;
    }
    ctx.fillText(title, size / 2, size * 0.72);
    if (year) {
      ctx.font = "400 24px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.fillStyle = 'rgba(43,32,24,0.72)';
      ctx.fillText(year, size / 2, size * 0.88);
    }
    texture.needsUpdate = true;
  };

  draw();
  redraws.add(draw);
  watchFonts();
  cache.set(key, texture);
  return texture;
}

/* --------------------------------------------------------------------- terminal */

/**
 * The desk screen: a faux terminal that scrolls. Returned live (not cached) because it owns an
 * update loop; the caller disposes it.
 */
export function terminalTexture(name: string): { texture: THREE.CanvasTexture; update: () => void; dispose: () => void } {
  const canvas = canvasOf(320, 200);
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const random = mulberry32(20260911);
  const glyphs = '01∙·-=+*/[]{}()<>#$%&x';
  const rows = 12;
  const line = () => {
    const width = 5 + Math.floor(random() * 30);
    let out = '';
    for (let i = 0; i < width; i++) out += glyphs[Math.floor(random() * glyphs.length)];
    return out;
  };
  const lines: string[] = Array.from({ length: rows }, line);
  let frame = 0;

  const update = () => {
    if (!ctx) return;
    frame++;
    if (frame % 2 === 0) {
      lines.shift();
      lines.push(line());
    }
    ctx.fillStyle = '#14120D';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "500 13px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(217,164,65,0.55)';
    ctx.fillText(`${name.toLowerCase().replace(/\s+/g, '-') || 'cabin'}:~$`, 12, 8);
    lines.forEach((text, i) => {
      ctx.fillStyle = i === lines.length - 1 ? '#F2CE8A' : `rgba(217,164,65,${0.22 + i * 0.045})`;
      ctx.fillText(text, 12, 28 + i * 14);
    });
    const last = lines[lines.length - 1];
    ctx.fillStyle = frame % 6 < 3 ? '#F2CE8A' : 'rgba(217,164,65,0.2)';
    ctx.fillRect(12 + last.length * 7.4, 28 + (rows - 1) * 14, 7, 12);
    texture.needsUpdate = true;
  };

  update();
  return { texture, update, dispose: () => texture.dispose() };
}

/* -------------------------------------------------------------------- cover art */

const covers = new Map<string, THREE.Texture>();

/**
 * A record cover or a print from the CMS.
 *
 * Content images arrive as same-origin paths (`/img/f/...`, served by the proxy route the page
 * layer owns) so WebGL can actually sample them; absolute URLs still work for anything else.
 * Loaded imperatively rather than through `useTexture` so a missing or blocked image degrades to
 * the kraft sleeve instead of suspending the tree forever.
 */
export function loadCover(url: string, onReady: (texture: THREE.Texture) => void, width = 512): () => void {
  // Ask the proxy for the size the scene actually samples, not the full-resolution original.
  const src = url.startsWith('/img/') && !url.includes('?') ? `${url}?w=${width}` : url;
  const hit = covers.get(src);
  if (hit) {
    onReady(hit);
    return () => {};
  }
  let cancelled = false;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(
    src,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      covers.set(src, texture);
      if (!cancelled) onReady(texture);
    },
    undefined,
    () => {},
  );
  return () => {
    cancelled = true;
  };
}

/** Called when the island unmounts. */
export function disposeTextures() {
  cache.forEach((texture) => texture.dispose());
  cache.clear();
  covers.forEach((texture) => texture.dispose());
  covers.clear();
  redraws.clear();
}
