/**
 * Procedural textures. Everything is drawn once into a 2D canvas and cached by key, so a
 * texture is generated at most once per page load however many meshes ask for it, and the whole
 * cache is disposed when the island unmounts. No files, no network, nothing to download.
 */
import * as THREE from 'three';
import { fbm, mulberry32, noise2 } from './noise';
import { PALETTE } from './palette';

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(repeat);
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}

/** Sawn plank: long grain lines wandering along x, knots here and there. */
export function woodTexture(variant: 'floor' | 'shelf' | 'wall' | 'desk' = 'shelf'): THREE.CanvasTexture {
  const base = { floor: '#4A3628', shelf: '#5C4633', wall: '#3E2E22', desk: '#6A5136' }[variant];
  return make(`wood-${variant}`, 512, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const random = mulberry32(variant.length * 7919 + 11);

    // Grain: long, gently wandering strokes.
    for (let i = 0; i < 220; i++) {
      const y = random() * size;
      const light = random() > 0.55;
      ctx.strokeStyle = light ? `rgba(255,226,180,${0.03 + random() * 0.07})` : `rgba(24,14,6,${0.05 + random() * 0.1})`;
      ctx.lineWidth = 0.5 + random() * 2.2;
      ctx.beginPath();
      ctx.moveTo(-4, y);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.4 + (noise2(x * 0.01, i) - 0.5) * 6);
      }
      ctx.stroke();
    }

    // Board seams.
    ctx.strokeStyle = 'rgba(16,9,4,0.5)';
    ctx.lineWidth = 2;
    for (let b = 1; b < 5; b++) {
      const y = (size / 5) * b;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    // Knots.
    for (let k = 0; k < 5; k++) {
      const cx = random() * size;
      const cy = random() * size;
      for (let r = 12; r > 0; r -= 2) {
        ctx.strokeStyle = `rgba(20,11,5,${0.05 + r * 0.012})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 1.6, r, random() * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });
}

/** Kraft paper: fibre speckle over a warm ground. Record sleeves, print mounts, panels. */
export function kraftTexture(): THREE.CanvasTexture {
  return make('kraft', 256, (ctx, size) => {
    ctx.fillStyle = PALETTE.kraft;
    ctx.fillRect(0, 0, size, size);
    const image = ctx.getImageData(0, 0, size, size);
    const data = image.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x * 0.08, y * 0.08, 3) - 0.5;
        const i = (y * size + x) * 4;
        const shift = n * 26;
        data[i] = Math.max(0, Math.min(255, data[i] + shift));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + shift * 0.9));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + shift * 0.7));
      }
    }
    ctx.putImageData(image, 0, 0);
    const random = mulberry32(4242);
    for (let f = 0; f < 900; f++) {
      ctx.strokeStyle = `rgba(120,95,60,${0.03 + random() * 0.06})`;
      ctx.lineWidth = 0.6;
      const x = random() * size;
      const y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 12, y + (random() - 0.5) * 12);
      ctx.stroke();
    }
  });
}

/** Overlapping shingle courses for the roof. */
export function shingleTexture(): THREE.CanvasTexture {
  return make('shingle', 512, (ctx, size) => {
    ctx.fillStyle = '#33251A';
    ctx.fillRect(0, 0, size, size);
    const random = mulberry32(90210);
    const rows = 12;
    const h = size / rows;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (size / 16);
      for (let c = -1; c < 8; c++) {
        const x = offset + c * (size / 8);
        const y = r * h;
        const shade = 0.72 + random() * 0.42;
        ctx.fillStyle = `rgb(${Math.round(62 * shade)}, ${Math.round(46 * shade)}, ${Math.round(33 * shade)})`;
        ctx.fillRect(x + 1, y + 1, size / 8 - 2, h - 1);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x, y + h - 3, size / 8, 3);
      }
    }
  });
}

/** Rough plaster/stone for the chimney. */
export function stoneTexture(): THREE.CanvasTexture {
  return make('stone', 256, (ctx, size) => {
    ctx.fillStyle = '#5A5049';
    ctx.fillRect(0, 0, size, size);
    const random = mulberry32(31337);
    for (let i = 0; i < 90; i++) {
      const x = random() * size;
      const y = random() * size;
      const w = 18 + random() * 34;
      const h = 12 + random() * 18;
      const shade = 0.7 + random() * 0.55;
      ctx.fillStyle = `rgb(${Math.round(96 * shade)}, ${Math.round(86 * shade)}, ${Math.round(78 * shade)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, h / 2, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Soft radial falloff for sun glow, lamp bloom and mist. */
export function glowTexture(inner = 'rgba(255,242,214,0.95)', outer = 'rgba(217,164,65,0.4)', key = 'glow'): THREE.CanvasTexture {
  return make(key, 256, (ctx, size) => {
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.42, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
}

/** A wisp of cloud/mist with soft edges all round. */
export function mistTexture(): THREE.CanvasTexture {
  return make('mist', 256, (ctx, size) => {
    const image = ctx.createImageData(size, size);
    const data = image.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const edge = Math.sin(Math.PI * nx) ** 1.4 * Math.sin(Math.PI * ny) ** 2.2;
        const n = fbm(nx * 4, ny * 4, 4);
        const alpha = Math.max(0, edge * (n * 1.5 - 0.35));
        const i = (y * size + x) * 4;
        data[i] = 250;
        data[i + 1] = 244;
        data[i + 2] = 232;
        data[i + 3] = Math.min(255, alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  });
}

/** Bark: vertical fibres, for the near trunks. */
export function barkTexture(): THREE.CanvasTexture {
  return make('bark', 256, (ctx, size) => {
    ctx.fillStyle = '#4B3626';
    ctx.fillRect(0, 0, size, size);
    const random = mulberry32(777);
    for (let i = 0; i < 260; i++) {
      const x = random() * size;
      ctx.strokeStyle = random() > 0.5 ? `rgba(28,18,10,${0.15 + random() * 0.25})` : `rgba(150,116,80,${0.06 + random() * 0.12})`;
      ctx.lineWidth = 0.6 + random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, -4);
      for (let y = 0; y <= size; y += 12) ctx.lineTo(x + Math.sin(y * 0.05 + i) * 2.5, y);
      ctx.stroke();
    }
  });
}

/**
 * The desk screen: a faux terminal that scrolls. Returned live (not cached) because it owns an
 * update loop; the caller disposes it.
 */
export function terminalTexture(): { texture: THREE.CanvasTexture; update: (frame: number) => void; dispose: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const random = mulberry32(20260910);
  const glyphs = '01∙·-=+*/[]{}()<>#$%&x';
  const rows = 11;
  const lines: string[] = Array.from({ length: rows }, () => {
    const width = 6 + Math.floor(random() * 26);
    let out = '';
    for (let i = 0; i < width; i++) out += glyphs[Math.floor(random() * glyphs.length)];
    return out;
  });

  const update = (frame: number) => {
    if (!ctx) return;
    if (frame % 2 === 0) {
      lines.shift();
      const width = 6 + Math.floor(random() * 26);
      let out = '';
      for (let i = 0; i < width; i++) out += glyphs[Math.floor(random() * glyphs.length)];
      lines.push(out);
    }
    ctx.fillStyle = '#17150F';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === lines.length - 1 ? '#F0C46B' : `rgba(217,164,65,${0.35 + i * 0.05})`;
      ctx.fillText(line, 10, 6 + i * 13);
    });
    ctx.fillStyle = frame % 8 < 4 ? '#F0C46B' : 'rgba(217,164,65,0.2)';
    ctx.fillRect(10 + lines[lines.length - 1].length * 6.2, 6 + (rows - 1) * 13, 6, 11);
    texture.needsUpdate = true;
  };

  update(0);
  return { texture, update, dispose: () => texture.dispose() };
}

/** Called when the island unmounts. */
export function disposeTextures() {
  cache.forEach((texture) => texture.dispose());
  cache.clear();
}
